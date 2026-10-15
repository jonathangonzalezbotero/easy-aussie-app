// Aggregations used by Overview, FY summary and Forecast.
import { effectiveLines, categoryType, summarise, monthKey, toCents } from './categories';

export const inRange = (txs, from, to) => txs.filter(t => (!from || t.date >= from) && (!to || t.date <= to));

export const monthlySummaries = (txs, months) => {
  const byMonth = {};
  for (const m of months) byMonth[m] = [];
  for (const t of txs) { const k = monthKey(t.date); if (byMonth[k]) byMonth[k].push(t); }
  return Object.fromEntries(months.map(m => [m, summarise(byMonth[m])]));
};

// Category totals per month: { [category]: { [month]: amount } }
export const categoryByMonth = (txs, months) => {
  const out = {};
  const set = new Set(months);
  for (const t of txs) for (const l of effectiveLines(t)) {
    const m = monthKey(l.date); if (!set.has(m)) continue;
    (out[l.category] ||= {})[m] = ((out[l.category] || {})[m] || 0) + (Number(l.amount) || 0);
  }
  return out;
};

// Personal-card expenses that no reimbursement has been linked to yet.
export const unreimbursedExpenses = (fin) => {
  const personal = new Set(fin.accounts.filter(a => a.kind === 'personal').map(a => a.id));
  const linkedIds = new Set(fin.transactions.map(t => t.linkedTransactionId).filter(Boolean));
  return fin.transactions.filter(t => personal.has(t.accountId) && t.amount < 0 && t.matchStatus !== 'ignored' && !linkedIds.has(t.id));
};

// Money the business owes the director: loan balance plus unreimbursed personal-card expenses.
export const directorPosition = (fin) => {
  const s = fin.settings;
  const opening = toCents(s.directorLoanOpening);
  const since = s.directorLoanOpeningDate || '';
  let loan = opening;
  for (const t of fin.transactions) {
    if (since && t.date < since) continue;
    for (const l of effectiveLines(t)) {
      if (l.category === 'director_loan_in') loan += toCents(l.amount);          // money in from the director (+)
      if (l.category === 'director_loan_repayment') loan += toCents(l.amount);   // money out to the director (−)
    }
  }
  const unpaid = unreimbursedExpenses(fin);
  const unpaidTotal = unpaid.reduce((c, t) => c + Math.abs(toCents(t.amount)), 0);
  return { loanBalance: loan / 100, unreimbursed: unpaid, unreimbursedTotal: unpaidTotal / 100, total: (loan + unpaidTotal) / 100 };
};

export const bondsHeld = (rentals) => {
  const held = rentals.filter(r => r.bond?.amount && r.bond.status === 'held');
  return { count: held.length, total: held.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0), rentals: held };
};

// Sum of P&L lines in one category for a list of transactions.
export const categoryTotal = (txs, category) => txs.reduce((s, t) => s + effectiveLines(t).filter(l => l.category === category).reduce((a, l) => a + (Number(l.amount) || 0), 0), 0);

export const isPnlLine = (l) => ['income', 'operating'].includes(categoryType(l.category));
