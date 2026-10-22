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

// Cash position from history: what each business account should hold according to the ledger
// (opening balance + every line since), what the bank says it holds (last CSV closing balance,
// Stripe's live balance), and how much of that is customers' bonds rather than your money.
export const cashPosition = (fin, rentals) => {
  const accounts = fin.accounts.filter(a => a.kind !== 'personal');
  const rows = accounts.map(a => {
    const from = a.openingDate || '';
    const lines = fin.transactions.filter(t => t.accountId === a.id && t.matchStatus !== 'ignored' && (!from || t.date >= from));
    const ledger = toCents(a.openingBalance) + lines.reduce((s, t) => s + toCents(t.amount), 0);
    const lastImport = fin.imports.filter(i => i.accountId === a.id && i.closingBalance != null).sort((x, y) => (y.toDate || '').localeCompare(x.toDate || ''))[0];
    let actual = null, actualAt = null, actualNote = '';
    if (a.feed === 'csv' && lastImport) { actual = toCents(lastImport.closingBalance); actualAt = lastImport.toDate; actualNote = 'closing balance of the last CSV'; }
    else if (a.feed === 'stripe' && fin.settings.stripeBalance != null) { actual = toCents(fin.settings.stripeBalance); actualAt = (fin.settings.stripeBalanceAt || '').slice(0, 10); actualNote = 'Stripe balance at last sync (available + pending)'; }
    else if (a.kind === 'cash') { actual = ledger; actualAt = null; actualNote = 'cash is only what you record'; }
    // Ledger up to the date the bank balance refers to, so timing differences do not look like gaps.
    const ledgerAt = actualAt ? toCents(a.openingBalance) + lines.filter(t => t.date <= actualAt).reduce((s, t) => s + toCents(t.amount), 0) : ledger;
    const gap = actual == null ? null : actual - ledgerAt;
    return { account: a, ledger: ledger / 100, actual: actual == null ? null : actual / 100, actualAt, actualNote, gap: gap == null ? null : gap / 100, hasOpening: !!a.openingDate };
  });
  const known = rows.filter(r => r.actual != null);
  const business = known.reduce((s, r) => s + toCents(r.actual), 0) / 100;
  const ledgerTotal = rows.reduce((s, r) => s + toCents(r.ledger), 0) / 100;
  const bonds = bondsHeld(rentals).total;
  const director = directorPosition(fin);
  return { rows, business, ledgerTotal, bonds, free: business - bonds, afterDirector: business - bonds - director.total, director, unknown: rows.filter(r => r.actual == null && r.account.kind !== 'cash') };
};

export const bondsHeld = (rentals) => {
  const held = rentals.filter(r => r.bond?.amount && r.bond.status === 'held');
  return { count: held.length, total: held.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0), rentals: held };
};

// Sum of P&L lines in one category for a list of transactions.
export const categoryTotal = (txs, category) => txs.reduce((s, t) => s + effectiveLines(t).filter(l => l.category === category).reduce((a, l) => a + (Number(l.amount) || 0), 0), 0);

export const isPnlLine = (l) => ['income', 'operating'].includes(categoryType(l.category));
