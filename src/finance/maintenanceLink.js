// Matching between service-log entries (maintenance table) and the finance transactions that paid
// for them. A link never moves money: Finance totals come from transactions only, and the service
// log's cost is used to find the payment and to flag jobs that never reached Finance.
import { effectiveLines, toCents } from './categories';

export const MAINTENANCE_CATEGORIES = ['maintenance', 'contractor'];
const DAY = 86400000;
const daysApart = (a, b) => Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / DAY);

// Does this transaction have a line that could be a vehicle job?
export const isMaintenanceTx = (tx) => tx.matchStatus !== 'ignored' && tx.amount < 0 && effectiveLines(tx).some(l => MAINTENANCE_CATEGORIES.includes(l.category));

// Transactions already claimed by a service-log entry.
export const linkedTransactionIds = (maintenance) => new Set(maintenance.map(m => m.transactionId).filter(Boolean));

// Service-log entries that could be paid by this transaction: unlinked, with a cost, within `days`.
// Sorted: exact amount first, then same vehicle, then nearest date.
export function entriesForTransaction(tx, maintenance, rentals, { days = 21 } = {}) {
  const amount = Math.abs(toCents(tx.amount));
  const txVehicle = tx.vehicleId || rentals.find(r => r.id === tx.rentalId)?.vehicleId || null;
  return maintenance
    .filter(m => !m.transactionId && m.cost && m.date && daysApart(m.date, tx.date) <= days)
    .map(m => ({ entry: m, exact: toCents(m.cost) === amount, sameVehicle: !!txVehicle && m.vehicleId === txVehicle, gap: daysApart(m.date, tx.date) }))
    .sort((a, b) => (b.exact - a.exact) || (b.sameVehicle - a.sameVehicle) || (a.gap - b.gap));
}

// Transactions that could have paid this entry: maintenance or contractor lines, not linked to another
// entry, within `days`. Sorted: exact amount, same vehicle, nearest date.
export function transactionsForEntry(entry, transactions, maintenance, rentals, { days = 30 } = {}) {
  const cost = toCents(entry.cost);
  const taken = linkedTransactionIds(maintenance.filter(m => m.id !== entry.id));
  return transactions
    .filter(t => isMaintenanceTx(t) && !taken.has(t.id) && entry.date && daysApart(t.date, entry.date) <= days)
    .map(t => { const v = t.vehicleId || rentals.find(r => r.id === t.rentalId)?.vehicleId || null; return { tx: t, exact: !!cost && Math.abs(toCents(t.amount)) === cost, sameVehicle: !!v && v === entry.vehicleId, otherVehicle: !!v && v !== entry.vehicleId, gap: daysApart(t.date, entry.date) }; })
    .sort((a, b) => (b.exact - a.exact) || (b.sameVehicle - a.sameVehicle) || (a.gap - b.gap));
}

// Safe automatic pairs: exact amount, within 14 days, and the pairing is unique in both directions.
export function autoMatches(maintenance, transactions, rentals) {
  const pairs = [];
  const usedTx = linkedTransactionIds(maintenance);
  for (const m of maintenance) {
    if (m.transactionId || !m.cost || !m.vehicleId || !m.date) continue;
    const cands = transactionsForEntry(m, transactions, maintenance, rentals, { days: 14 }).filter(c => c.exact && !c.otherVehicle && !usedTx.has(c.tx.id));
    if (cands.length !== 1) continue;
    const tx = cands[0].tx;
    // the transaction must not fit another unlinked entry equally well
    const rivals = entriesForTransaction(tx, maintenance, rentals, { days: 14 }).filter(e => e.exact && e.entry.id !== m.id);
    if (rivals.length) continue;
    usedTx.add(tx.id);
    pairs.push({ entry: m, tx });
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
