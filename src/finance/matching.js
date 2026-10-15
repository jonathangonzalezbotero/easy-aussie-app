// Rules and match suggestions. Pure functions over app-shaped data.
import { categoryType, toCents } from './categories';

const norm = (s) => (s || '').toLowerCase();

// First active rule whose pattern (A | B | C) is contained in the description or merchant.
export function applyRules(rules, { description, merchant, accountId }) {
  const text = norm(description) + ' ' + norm(merchant);
  for (const r of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (r.active === false) continue;
    if (r.accountId && accountId && r.accountId !== accountId) continue;
    const parts = r.pattern.split('|').map(p => norm(p).trim()).filter(Boolean);
    if (parts.some(p => text.includes(p))) return r;
  }
  return null;
}

// Rules that match a description, in priority order, for overlap checks.
export const rulesMatching = (rules, description, accountId) =>
  rules.filter(r => applyRules([r], { description, accountId }));

const nameTokens = (name) => norm(name).split(/[^a-z0-9]+/).filter(t => t.length >= 2);

// Does a bank description mention this person? Accepts "L MILLAN", "LUIS MILLAN", "MILLAN L".
function mentionsCustomer(description, customer) {
  const d = norm(description);
  const toks = nameTokens(customer.name);
  if (!toks.length) return false;
  const last = toks[toks.length - 1];
  if (last.length < 3 || !d.includes(last)) return false;
  // surname plus either first name or first initial
  const first = toks[0];
  if (toks.length === 1) return true;
  return d.includes(first) || new RegExp(`(^|[^a-z])${first[0]}[\\s.]*${last}`).test(d) || new RegExp(`${last}[\\s.,]*${first[0]}([^a-z]|$)`).test(d);
}

function daysApart(a, b) { return Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000); }

// Build a suggestion for one transaction. Returns { category, customerId, rentalId, vehicleId,
// linkedTransactionId, reason, kind, bondCheck } or null.
export function suggestFor(tx, { rules, customers, rentals, vehicles, transactions, accounts }) {
  const account = accounts.find(a => a.id === tx.accountId);
  const desc = tx.description || '';
  const d = norm(desc);
  const amt = Number(tx.amount) || 0;
  const cents = toCents(amt);

  // 1. Explicit contract reference in the description (EB-033, SC-047)
  const ref = desc.match(/\b(EB|SC|CA)[-\s]?(\d{2,4})\b/i);
  if (ref) {
    const code = `${ref[1].toUpperCase()}-${ref[2].padStart(3, '0')}`;
    const rental = rentals.find(r => (r.contractNumber || '').toUpperCase().replace(/\s/g, '') === code.replace(/\s/g, '') || (r.contractNumber || '').toUpperCase() === `${ref[1].toUpperCase()}-${ref[2]}`);
    if (rental && amt > 0) {
      return bondDepositSuggestion(rental, tx, `reference ${code} found in description`, { customers, vehicles });
    }
    if (rental && amt < 0) return bondRefundSuggestion(rental, tx, `reference ${code} found in description`);
  }

  // 2. Stripe payout landing in the bank
  if (amt > 0 && /stripe/.test(d) && account?.kind === 'bank') {
    return { kind: 'payout', category: 'stripe_payout', reason: 'Stripe payout: the charges are already counted as income from Stripe', payoutMatch: findPayoutCharges(tx, transactions, accounts) };
  }

  // 3. Rules
  const rule = applyRules(rules, { description: desc, merchant: tx.raw?.['Merchant Name'] || tx.raw?.merchant, accountId: tx.accountId });

  // 4. Customer name in a bank line: bond deposit (money in) or bond refund (money out)
  if (account?.kind === 'bank' && !/stripe|payout/.test(d)) {
    const hits = customers.filter(c => mentionsCustomer(desc, c));
    for (const c of hits) {
      const theirs = rentals.filter(r => r.customerId === c.id).sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
      if (amt > 0) {
        const open = theirs.find(r => r.bond?.amount && (r.bond.status === 'awaiting' || r.bond.status === 'held') && daysApart(r.startDate || tx.date, tx.date) <= 45)
          || theirs.find(r => r.bond?.amount && daysApart(r.startDate || tx.date, tx.date) <= 45);
        if (open) return bondDepositSuggestion(open, tx, `payee "${desc.slice(0, 30)}" matches customer ${c.name}`, { customers, vehicles });
        // No rental with a bond nearby: still link the customer and suggest rent paid by transfer
        return { kind: 'customer', category: rule?.category || 'rental_income', customerId: c.id, rentalId: theirs[0]?.id || null, vehicleId: theirs[0]?.vehicleId || null, reason: `matches customer ${c.name}, no bond expected around this date` };
      }
      if (amt < 0) {
        const r = theirs.find(r => r.bond?.amount && r.bond.status === 'held') || theirs[0];
        if (r) return bondRefundSuggestion(r, tx, `payee "${desc.slice(0, 30)}" matches customer ${c.name}${r.endDate ? `, rental ended ${r.endDate}` : ''}`);
      }
    }
  }

  // 5. Reimbursement: outgoing bank transfer equal to an unpaid personal-card expense
  if (amt < 0 && account?.kind === 'bank' && /reimb|transfer to/.test(d)) {
    const personal = accounts.filter(a => a.kind === 'personal').map(a => a.id);
    const candidate = transactions.find(t => personal.includes(t.accountId) && t.id !== tx.id && toCents(t.amount) === cents && !t.linkedTransactionId && daysApart(t.date, tx.date) <= 60);
    if (candidate) return { kind: 'reimbursement', category: 'reimbursement', linkedTransactionId: candidate.id, reason: `amount matches ${candidate.description} paid on a personal card on ${candidate.date}` };
  }

  if (rule) {
    const vehicle = vehicles.find(v => v.plate && d.includes(norm(v.plate)));
    return { kind: 'rule', category: rule.category, vehicleId: vehicle?.id || null, reason: `rule "${rule.pattern}"`, ruleId: rule.id };
  }

  // 6. Plate in the description → maintenance on that vehicle
  const vehicle = vehicles.find(v => v.plate && v.plate.length >= 4 && d.includes(norm(v.plate)));
  if (vehicle && amt < 0) return { kind: 'vehicle', category: 'maintenance', vehicleId: vehicle.id, reason: `plate ${vehicle.plate} in description` };

  return null;
}

function bondDepositSuggestion(rental, tx, reason, { customers, vehicles }) {
  const bond = toCents(rental.bond?.amount);
  const amt = toCents(tx.amount);
  const customer = customers.find(c => c.id === rental.customerId);
  const vehicle = vehicles.find(v => v.id === rental.vehicleId);
  const base = { kind: 'bond_deposit', customerId: rental.customerId, rentalId: rental.id, vehicleId: rental.vehicleId, reason, bondCheck: { bond: bond / 100, received: amt / 100 } };
  if (!bond || amt === bond) return { ...base, category: 'bond_deposit', bondCheck: { ...base.bondCheck, match: 'equal' } };
  if (amt > bond) {
    // Bond plus something else (rent for a day or two): suggest a split
    return { ...base, category: 'bond_deposit', bondCheck: { ...base.bondCheck, match: 'over', extra: (amt - bond) / 100 },
      splits: [{ category: 'bond_deposit', amount: bond / 100, rentalId: rental.id, customerId: rental.customerId }, { category: 'rental_income', amount: (amt - bond) / 100, rentalId: rental.id, customerId: rental.customerId, vehicleId: rental.vehicleId }],
      reason: `${reason} · ${customer?.name || ''} bond is $${bond / 100}, the extra looks like rent${vehicle ? ` for ${vehicle.plate}` : ''}` };
  }
  return { ...base, category: 'bond_deposit', bondCheck: { ...base.bondCheck, match: 'under', short: (bond - amt) / 100 } };
}

function bondRefundSuggestion(rental, tx, reason) {
  const bond = toCents(rental.bond?.amount);
  const planned = rental.bond?.refundedAmount !== '' && rental.bond?.refundedAmount != null ? toCents(rental.bond.refundedAmount) : null;
  const out = Math.abs(toCents(tx.amount));
  const base = { kind: 'bond_refund', category: 'bond_refund', customerId: rental.customerId, rentalId: rental.id, vehicleId: rental.vehicleId, reason, bondCheck: { bond: bond / 100, refunded: out / 100, planned: planned == null ? null : planned / 100 } };
  if (out === bond) return { ...base, bondCheck: { ...base.bondCheck, match: 'equal' } };
  if (out < bond) {
    const kept = (bond - out) / 100;
    return { ...base, bondCheck: { ...base.bondCheck, match: 'under', kept, plannedMatch: planned === out },
      splits: [{ category: 'bond_refund', amount: -bond / 100, rentalId: rental.id, customerId: rental.customerId }, { category: 'bond_retained', amount: kept, rentalId: rental.id, customerId: rental.customerId, vehicleId: rental.vehicleId }] };
  }
  return { ...base, bondCheck: { ...base.bondCheck, match: 'over', extra: (out - bond) / 100 } };
}

// Stripe charges and fees that add up to a payout amount (looks at the 10 days before the payout).
function findPayoutCharges(tx, transactions, accounts) {
  const stripeIds = accounts.filter(a => a.kind === 'processor').map(a => a.id);
  const window = transactions.filter(t => stripeIds.includes(t.accountId) && daysApart(t.date, tx.date) <= 10 && t.date <= tx.date);
  const charges = window.filter(t => t.amount > 0);
  const fees = window.filter(t => t.amount < 0);
  const gross = charges.reduce((s, t) => s + toCents(t.amount), 0);
  const feeTotal = fees.reduce((s, t) => s + toCents(t.amount), 0);
  return { charges, fees, gross: gross / 100, fees_total: feeTotal / 100, net: (gross + feeTotal) / 100, exact: gross + feeTotal === toCents(tx.amount) };
}

// What confirming a suggestion changes outside Finance, for the side-effect note.
export function describeSideEffects(tx, sug, { rentals, customers }) {
  const out = [];
  if (!sug) return out;
  const rental = rentals.find(r => r.id === sug.rentalId);
  const customer = customers.find(c => c.id === (sug.customerId || rental?.customerId));
  const label = rental ? `Rental ${rental.contractNumber || rental.id.slice(0, 6)}` : null;
  if (sug.kind === 'bond_deposit' && rental) {
    const received = sug.bondCheck?.match === 'over' ? sug.bondCheck.bond : sug.bondCheck?.received;
    out.push(`${label} bond: ${rental.bond.status === 'held' ? 'Held' : 'Awaiting payment'} → Held $${received}${customer ? ` (${customer.name})` : ''}`);
  }
  if (sug.kind === 'bond_refund' && rental) {
    const kept = sug.bondCheck?.kept || 0;
    out.push(`${label} bond: Held $${sug.bondCheck.bond} → ${kept > 0 ? `Part refunded $${sug.bondCheck.refunded} · $${kept} retained` : `Refunded $${sug.bondCheck.refunded}`}`);
    if (kept > 0) out.push(`Income: +$${kept} under Bond retained`);
  }
  if (sug.kind === 'reimbursement') out.push('Pairs with the personal-card expense; the expense keeps its original date');
  if (sug.kind === 'payout') out.push('Transfer only: nothing is added to income');
  return out;
}

export const isPnl = (category) => ['income', 'operating'].includes(categoryType(category));
