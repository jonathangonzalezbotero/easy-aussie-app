import { useMemo } from 'react';
import { useFinance } from './FinanceContext';
import { useStore } from '../context/StoreContext';
import { suggestFor } from './matching';

// Live suggestions for every open (unreviewed/suggested) transaction, keyed by id.
export function useSuggestions() {
  const fin = useFinance();
  const { data } = useStore();
  return useMemo(() => {
    const ctx = { rules: fin.rules, customers: data.customers, rentals: data.rentals, vehicles: data.vehicles, transactions: fin.transactions, accounts: fin.accounts };
    const out = {};
    for (const tx of fin.transactions) {
      if (tx.matchStatus === 'unreviewed' || tx.matchStatus === 'suggested') out[tx.id] = suggestFor(tx, ctx);
    }
    return out;
  }, [fin.transactions, fin.rules, fin.accounts, data.customers, data.rentals, data.vehicles]);
}
