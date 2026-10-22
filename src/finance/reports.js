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

// How much of each personal-card expense has been paid back: several reimbursements can point at one
// expense, and a reimbursement can be for part of it. Returns a map id -> cents reimbursed.
export const reimbursedByExpense = (transactions) => {
  const out = {};
  for (const t of transactions) {
    if (!t.linkedTransactionId || t.matchStatus === 'ignored' || t.amount >= 0) continue;
    out[t.linkedTransactionId] = (out[t.linkedTransactionId] || 0) + Math.abs(toCents(t.amount));
  }
  return out;
};

// Personal-card expenses not fully paid back yet. Each carries `remaining` (cents) still owed.
export const unreimbursedExpenses = (fin) => {
  const personal = new Set(fin.accounts.filter(a => a.kind === 'personal').map(a => a.id));
  const paid = reimbursedByExpense(fin.transactions);
  return fin.transactions
    .filter(t => personal.has(t.accountId) && t.amount < 0 && t.matchStatus !== 'ignored')
    .map(t => ({ ...t, remaining: Math.abs(toCents(t.amount)) - (paid[t.id] || 0) }))
    .filter(t => t.remaining > 0);
};

// Drawings (business paid something personal) not yet paid back. Each carries `remaining` (cents).
export const outstandingDrawings = (fin) => {
  const paid = {};
  for (const t of fin.transactions) if (t.linkedTransactionId && t.matchStatus !== 'ignored' && t.amount > 0 && effectiveLines(t).some(l => l.category === 'drawings_repaid')) paid[t.linkedTransactionId] = (paid[t.linkedTransactionId] || 0) + toCents(t.amount);
  return fin.transactions
    .filter(t => t.matchStatus !== 'ignored' && t.amount < 0 && effectiveLines(t).some(l => l.category === 'drawings'))
    .map(t => ({ ...t, remaining: effectiveLines(t).filter(l => l.category === 'drawings').reduce((s, l) => s + Math.abs(toCents(l.amount)), 0) - (paid[t.id] || 0) }))
    .filter(t => t.remaining > 0);
};

// Money the business owes the director: loan balance plus unreimbursed personal-card expenses,
// minus drawings the director has not paid back yet.
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
  const unpaidTotal = unpaid.reduce((c, t) => c + t.remaining, 0);
  const drawings = outstandingDrawings(fin);
  const drawingsTotal = drawings.reduce((c, t) => c + t.remaining, 0);
  return { loanBalance: loan / 100, unreimbursed: unpaid, unreimbursedTotal: unpaidTotal / 100, drawings, drawingsTotal: drawingsTotal / 100, total: (loan + unpaidTotal - drawingsTotal) / 100 };
};

// Cash position: balances you typed in (or the last CSV closing balance / Stripe sync), minus
// customers' bonds, minus what the business owes you.
export const cashPosition = (fin, rentals) => {
  const rows = fin.accounts.filter(a => a.kind !== 'personal').map(a => {
    let balance = a.balance, at = a.balanceAt || '', note = a.balanceAt ? 'entered' : '';
    if (a.feed === 'stripe' && fin.settings.stripeBalance != null && (!at || (fin.settings.stripeBalanceAt || '').slice(0, 10) >= at)) { balance = fin.settings.stripeBalance; at = (fin.settings.stripeBalanceAt || '').slice(0, 10); note = 'from Stripe'; }
    if (a.kind === 'cash' && balance == null) { balance = fin.transactions.filter(t => t.accountId === a.id && t.matchStatus !== 'ignored').reduce((s, t) => s + toCents(t.amount), 0) / 100; note = 'what you recorded'; }
    return { account: a, balance, at, note };
  });
  const known = rows.filter(r => r.balance != null);
  const total = known.reduce((s, r) => s + toCents(r.balance), 0) / 100;
  const bonds = bondsHeld(rentals).total;
  const director = directorPosition(fin);
  const oldest = known.filter(r => r.at).map(r => r.at).sort()[0] || null;
  return { rows, total, bonds, free: total - bonds, director, afterDirector: total - bonds - director.total, missing: rows.filter(r => r.balance == null), oldest };
};

export const bondsHeld = (rentals) => {
  const held = rentals.filter(r => r.bond?.amount && r.bond.status === 'held');
  return { count: held.length, total: held.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0), rentals: held };
};

// Sum of P&L lines in one category for a list of transactions.
export const categoryTotal = (txs, category) => txs.reduce((s, t) => s + effectiveLines(t).filter(l => l.category === category).reduce((a, l) => a + (Number(l.amount) || 0), 0), 0);

export const isPnlLine = (l) => ['income', 'operating'].includes(categoryType(l.category));
