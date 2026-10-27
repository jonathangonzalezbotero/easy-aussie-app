// What Finance knows about one rental's bond: the deposit lines received for it and any
// "bond retained" income already recorded. Used to offer recording a kept-in-full bond as income.
import { effectiveLines, toCents } from './categories';

export function bondInFinance(rental, transactions) {
  const deposits = [], retained = [];
  for (const t of transactions || []) {
    if (t.matchStatus === 'ignored') continue;
    for (const l of effectiveLines(t)) {
      if ((l.rentalId || t.rentalId) !== rental.id) continue;
      if (l.category === 'bond_deposit') deposits.push({ tx: t, amount: Number(l.amount) || 0 });
      if (l.category === 'bond_retained') retained.push({ tx: t, amount: Number(l.amount) || 0 });
    }
  }
  const depositTotal = deposits.reduce((s, d) => s + toCents(d.amount), 0) / 100;
  const retainedTotal = retained.reduce((s, d) => s + toCents(d.amount), 0) / 100;
  return {
    deposits, depositTotal, retainedTotal,
    // Kept in full, the deposit is in Finance, and nothing has turned it into income yet.
    needsRetention: rental.bond?.status === 'retained' && deposits.length > 0 && retainedTotal === 0,
  };
}

// The $0 entry that closes the bond and records the kept amount as income: one split line takes
// the bond out (bond refund −amount), the other books it as income (bond retained +amount).
export function retentionEntry(rental, { amount, accountId, date, reason, contract }) {
  const link = { rentalId: rental.id, customerId: rental.customerId || null, vehicleId: rental.vehicleId || null };
  return {
    accountId, date, amount: 0, source: 'manual', category: 'split', matchStatus: 'confirmed',
    description: `Bond kept in full · ${contract || 'rental'}`,
    notes: reason || '', ...link,
    splits: [
      { category: 'bond_refund', amount: -amount, ...link, notes: 'Bond closed, nothing paid back' },
      { category: 'bond_retained', amount, ...link, notes: reason || '' },
    ],
  };
}
