// Matching between service-log entries (maintenance table) and the finance payment lines that paid
// for them. A "payment line" is a whole transaction, or one split line of a split transaction, so a
// single workshop bill can pay for a repair on one bike plus parts for another. A link never moves
// money: Finance totals come from transactions only; the service log's cost is used to find the
// payment and to flag jobs that never reached Finance.
import { effectiveLines, toCents } from './categories';

export const MAINTENANCE_CATEGORIES = ['maintenance', 'contractor'];
const DAY = 86400000;
const daysApart = (a, b) => Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / DAY);

// Every maintenance/contractor payment line across the ledger: { key, tx, split|null, amount(cents, positive), vehicleId, category }.
export function paymentLines(transactions, rentals) {
  const out = [];
  for (const tx of transactions) {
    if (tx.matchStatus === 'ignored' || tx.amount >= 0) continue;
    const txVehicle = tx.vehicleId || rentals.find(r => r.id === tx.rentalId)?.vehicleId || null;
    if (tx.splits.length) {
      for (const sp of tx.splits) {
        if (!MAINTENANCE_CATEGORIES.includes(sp.category) || sp.amount >= 0) continue;
        out.push({ key: `${tx.id}:${sp.id}`, tx, split: sp, amount: Math.abs(toCents(sp.amount)), vehicleId: sp.vehicleId || rentals.find(r => r.id === sp.rentalId)?.vehicleId || txVehicle, category: sp.category });
      }
    } else if (MAINTENANCE_CATEGORIES.includes(tx.category)) {
      out.push({ key: tx.id, tx, split: null, amount: Math.abs(toCents(tx.amount)), vehicleId: txVehicle, category: tx.category });
    }
  }
  return out;
}

export const lineKey = (m) => m.transactionId ? (m.splitId ? `${m.transactionId}:${m.splitId}` : m.transactionId) : null;
export const isMaintenanceTx = (tx) => tx.matchStatus !== 'ignored' && tx.amount < 0 && effectiveLines(tx).some(l => MAINTENANCE_CATEGORIES.includes(l.category));

// The payment line a service entry is linked to, if any. Falls back to the whole transaction when the
// split it pointed at no longer exists.
export function linkedLine(entry, transactions) {
  if (!entry?.transactionId) return null;
  const tx = transactions.find(t => t.id === entry.transactionId);
  if (!tx) return null;
  const split = entry.splitId ? tx.splits.find(s => s.id === entry.splitId) : null;
  return { tx, split, amount: Math.abs(toCents(split ? split.amount : tx.amount)), stale: !!entry.splitId && !split };
}

// Keys already claimed by other service-log entries. A whole-transaction link claims every line of it.
export function claimedKeys(maintenance, exceptId) {
  const set = new Set();
  for (const m of maintenance) { if (m.id === exceptId || !m.transactionId) continue; set.add(lineKey(m)); if (!m.splitId) set.add(m.transactionId); }
  return set;
}
const isClaimed = (claimed, line) => claimed.has(line.key) || claimed.has(line.tx.id);

// Service-log entries that could be paid by this line: unlinked, with a cost, within `days`.
export function entriesForTransaction(txOrLine, maintenance, rentals, { days = 21 } = {}) {
  const line = txOrLine.tx ? txOrLine : { tx: txOrLine, amount: Math.abs(toCents(txOrLine.amount)), vehicleId: txOrLine.vehicleId || rentals.find(r => r.id === txOrLine.rentalId)?.vehicleId || null };
  return maintenance
    .filter(m => !m.transactionId && m.cost && m.date && daysApart(m.date, line.tx.date) <= days)
    .map(m => ({ entry: m, exact: toCents(m.cost) === line.amount, sameVehicle: !!line.vehicleId && m.vehicleId === line.vehicleId, gap: daysApart(m.date, line.tx.date) }))
    .sort((a, b) => (b.exact - a.exact) || (b.sameVehicle - a.sameVehicle) || (a.gap - b.gap));
}

// Payment lines that could have paid this entry. Sorted: exact amount, same vehicle, nearest date.
export function transactionsForEntry(entry, transactions, maintenance, rentals, { days = 30 } = {}) {
  const cost = toCents(entry.cost);
  const claimed = claimedKeys(maintenance, entry.id);
  return paymentLines(transactions, rentals)
    .filter(l => !isClaimed(claimed, l) && entry.date && daysApart(l.tx.date, entry.date) <= days)
    .map(l => ({ ...l, exact: !!cost && l.amount === cost, sameVehicle: !!l.vehicleId && l.vehicleId === entry.vehicleId, otherVehicle: !!l.vehicleId && l.vehicleId !== entry.vehicleId, gap: daysApart(l.tx.date, entry.date), bigger: !!cost && l.amount > cost }))
    .sort((a, b) => (b.exact - a.exact) || (b.sameVehicle - a.sameVehicle) || (a.gap - b.gap));
}

// Safe automatic pairs: exact amount, within 14 days, unique in both directions, vehicle agrees or unset.
export function autoMatches(maintenance, transactions, rentals) {
  const pairs = [];
  const claimed = claimedKeys(maintenance, null);
  for (const m of maintenance) {
    if (m.transactionId || !m.cost || !m.vehicleId || !m.date) continue;
    const cands = transactionsForEntry(m, transactions, maintenance, rentals, { days: 14 }).filter(c => c.exact && !c.otherVehicle && !isClaimed(claimed, c));
    if (cands.length !== 1) continue;
    const line = cands[0];
    const rivals = entriesForTransaction(line, maintenance, rentals, { days: 14 }).filter(e => e.exact && e.entry.id !== m.id);
    if (rivals.length) continue;
    claimed.add(line.key); if (!line.split) claimed.add(line.tx.id);
    pairs.push({ entry: m, line });
  }
  return pairs;
}

// Per-vehicle service-log totals, to show next to Finance figures (never added to them).
export function serviceLogByVehicle(maintenance) {
  const out = {};
  for (const m of maintenance) {
    if (!m.vehicleId || !m.cost) continue;
    const v = (out[m.vehicleId] ||= { logged: 0, notInFinance: 0, unlinked: 0 });
    const c = toCents(m.cost);
    v.logged += c;
    if (!m.transactionId) { v.notInFinance += c; v.unlinked++; }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { logged: v.logged / 100, notInFinance: v.notInFinance / 100, unlinked: v.unlinked }]));
}
