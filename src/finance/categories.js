// Category vocabulary for the Finance module. Category ids are stored on
// finance_transactions.category and finance_splits.category.

export const CATEGORY_TYPES = {
  income:    { label: 'Income',            note: 'Income' },
  operating: { label: 'Operating expense', note: 'Operating expense' },
  capital:   { label: 'Capital',           note: 'Capital · not operating' },
  bond:      { label: 'Bond',              note: 'Bond · not profit or loss' },
  transfer:  { label: 'Transfer',          note: 'Transfer · not profit or loss' },
};

export const CATEGORIES = [
  { id: 'rental_income',   label: 'Rental income',          type: 'income' },
  { id: 'rental_refund',   label: 'Rental refund (money back to a customer, reduces income)', type: 'income' },
  { id: 'bond_retained',   label: 'Bond retained',          type: 'income' },
  { id: 'insurance_claim', label: 'Insurance claim',        type: 'income' },
  { id: 'other_income',    label: 'Other income',           type: 'income' },

  { id: 'maintenance',     label: 'Maintenance and parts',  type: 'operating' },
  { id: 'insurance',       label: 'Insurance (YOUI)',       type: 'operating' },
  { id: 'fuel',            label: 'Fuel',                   type: 'operating' },
  { id: 'marketing',       label: 'Marketing',              type: 'operating' },
  { id: 'garage_fee',      label: 'Garage fee',             type: 'operating' },
  { id: 'rego',            label: 'Rego',                   type: 'operating' },
  { id: 'software_fees',   label: 'Software and fees',      type: 'operating' },
  { id: 'contractor',      label: 'Contractor and labour',  type: 'operating' },
  { id: 'accountant',      label: 'Accountant',             type: 'operating' },
  { id: 'fines',           label: 'Fines',                  type: 'operating' },
  { id: 'entertainment',   label: 'Entertainment (meals, thank-yous · accountant checks deductibility)', type: 'operating' },
  { id: 'other_expense',   label: 'Other',                  type: 'operating' },

  { id: 'director_loan_repayment', label: 'Director loan repayment', type: 'capital' },
  { id: 'director_loan_in',        label: 'Director loan (money in)', type: 'capital' },
  { id: 'vehicle_purchase',        label: 'Vehicle purchase',         type: 'capital' },
  { id: 'drawings',                label: 'Personal / drawings (business paid something personal)', type: 'capital' },

  { id: 'bond_deposit',    label: 'Bond deposit',           type: 'bond' },
  { id: 'bond_refund',     label: 'Bond refund',            type: 'bond' },

  { id: 'stripe_payout',     label: 'Stripe payout',              type: 'transfer' },
  { id: 'reimbursement',     label: 'Reimbursement (business pays you back)', type: 'transfer' },
  { id: 'drawings_repaid',   label: 'Personal expense paid back (you pay the business)', type: 'transfer' },
  { id: 'internal_transfer', label: 'Transfer between accounts',  type: 'transfer' },
];

const BY_ID = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const categoryLabel = (id) => BY_ID[id]?.label || (id ? id : 'Uncategorised');
export const categoryType  = (id) => BY_ID[id]?.type || null;
export const categoryTypeNote = (id) => { const t = categoryType(id); return t ? CATEGORY_TYPES[t].note : 'Needs a category'; };
export const categoriesOfType = (type) => CATEGORIES.filter(c => c.type === type);

export const MATCH_STATUS = {
  unreviewed: { label: 'Unreviewed', variant: 'amber' },
  suggested:  { label: 'Suggested',  variant: 'blue' },
  confirmed:  { label: 'Confirmed',  variant: 'green' },
  ignored:    { label: 'Ignored',    variant: 'gray' },
};

// What to call a transaction in lists: the user's label when set, else the bank text.
export const txName = (t) => (t?.label || t?.description || '');

export const SOURCE_LABEL = { bank_csv: 'Bank CSV', stripe: 'Stripe', spreadsheet: 'Spreadsheet', manual: 'Manual' };

// Account tone for the AccountBadge.
export const accountVariant = (account) => {
  if (!account) return 'gray';
  if (account.kind === 'processor') return 'blue';
  if (account.kind === 'personal') return 'amber';
  if (account.kind === 'cash') return 'green';
  return 'gray';
};

// ── Money helpers (cents for arithmetic, strings for display) ────────────────
export const toCents = (v) => Math.round((Number(v) || 0) * 100);
export const fromCents = (c) => c / 100;

export const money = (v, { sign = false, decimals = 2 } = {}) => {
  const n = Number(v) || 0;
  const abs = Math.abs(n).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  if (n < 0) return `−$${abs}`;
  return (sign && n > 0 ? '+' : '') + `$${abs}`;
};
export const money0 = (v, opts) => money(v, { ...opts, decimals: 0 });

// Lines that take part in P&L: a transaction with splits contributes its splits,
// otherwise its own category and amount. Ignored transactions contribute nothing.
export const effectiveLines = (tx) => {
  if (tx.matchStatus === 'ignored') return [];
  if (tx.splits && tx.splits.length) return tx.splits.map(s => ({ ...s, transactionId: tx.id, date: tx.date, accountId: tx.accountId, source: tx.source }));
  return [{ category: tx.category, amount: Number(tx.amount) || 0, rentalId: tx.rentalId, customerId: tx.customerId, vehicleId: tx.vehicleId, transactionId: tx.id, date: tx.date, accountId: tx.accountId, source: tx.source }];
};

// Totals by category type for a list of transactions.
export const summarise = (txs) => {
  const byCategory = {};
  let income = 0, operating = 0, capitalOut = 0, capitalIn = 0, bondsIn = 0, bondsOut = 0;
  for (const tx of txs) for (const l of effectiveLines(tx)) {
    const amt = Number(l.amount) || 0;
    const type = categoryType(l.category);
    byCategory[l.category] = (byCategory[l.category] || 0) + amt;
    if (type === 'income') income += amt;
    else if (type === 'operating') operating += -amt;
    else if (type === 'capital') { if (amt < 0) capitalOut += -amt; else capitalIn += amt; }
    else if (type === 'bond') { if (amt > 0) bondsIn += amt; else bondsOut += -amt; }
  }
  return {
    income, operating, capitalOut, capitalIn, bondsIn, bondsOut, byCategory,
    operatingNet: income - operating,
    cashNet: income - operating - capitalOut + capitalIn,
  };
};

// ── Period helpers ───────────────────────────────────────────────────────────
export const monthKey = (dateStr) => (dateStr || '').slice(0, 7);          // YYYY-MM
export const monthStart = (key) => `${key}-01`;
export const addMonths = (key, n) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
export const monthLabel = (key, { short = false } = {}) => {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleDateString('en-AU', { month: 'short', year: short ? '2-digit' : 'numeric', timeZone: 'UTC' });
};
// Australian financial year: Jul–Jun. fyOf('2026-10-15') = 2027 (FY 2026–27 ends June 2027).
export const fyOf = (dateStr) => { const [y, m] = dateStr.split('-').map(Number); return m >= 7 ? y + 1 : y; };
export const fyLabel = (fy) => `FY ${fy - 1}–${String(fy).slice(2)}`;
export const fyRange = (fy) => ({ from: `${fy - 1}-07-01`, to: `${fy}-06-30` });
export const fyMonths = (fy) => Array.from({ length: 12 }, (_, i) => addMonths(`${fy - 1}-07`, i));
