// Transfers between your own accounts. The bank line on the "from" account is categorised
// internal_transfer with a "to" account; a mirror line (+amount) is created on the "to" account so
// its balance in the ledger is right before its own CSV arrives. When that CSV comes in, a line of
// the same amount within 3 days replaces the mirror and keeps the pairing.
import { toCents } from './categories';

export const isMirror = (t) => !!t?.raw?.mirror_of;
export const mirrorOf = (transactions, id) => transactions.find(t => t.raw?.mirror_of === id);

export function mirrorFor(tx, toAccount, fromAccount) {
  return {
    accountId: toAccount.id, date: tx.date, amount: -Number(tx.amount), description: `Transfer from ${fromAccount?.name || 'another account'}`,
    source: 'manual', raw: { mirror_of: tx.id }, category: 'internal_transfer', matchStatus: 'confirmed', linkedTransactionId: tx.id,
    label: `Transfer from ${fromAccount?.name || ''}`.trim(), notes: 'Created automatically from the other side of the transfer. Replaced by the bank line when this account\'s CSV is imported.',
  };
}

const days = (a, b) => Math.abs((new Date(a + 'T00:00:00') - new Date(b + 'T00:00:00')) / 86400000);

// For an imported line, the mirror on the same account it should replace, if any.
export function mirrorMatching(line, accountId, transactions) {
  return transactions.find(t => t.accountId === accountId && isMirror(t) && toCents(t.amount) === toCents(line.amount) && days(t.date, line.date) <= 3) || null;
}
