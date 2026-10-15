// CSV parsing and NAB export mapping.

// RFC-4180-ish parser: quoted fields, embedded commas/newlines, CRLF.
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let inQuotes = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') { if (src[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some(f => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some(f => f.trim() !== '')) rows.push(row);
  return rows;
}

export const COLUMN_ROLES = [
  { id: 'date',        label: 'date' },
  { id: 'amount',      label: 'amount' },
  { id: 'debit',       label: 'debit (money out)' },
  { id: 'credit',      label: 'credit (money in)' },
  { id: 'description', label: 'description' },
  { id: 'description2',label: 'description (extra)' },
  { id: 'balance',     label: 'balance (duplicate check)' },
  { id: 'account',     label: 'account check' },
  { id: 'merchant',    label: 'merchant (for rules)' },
  { id: 'raw',         label: 'keep in raw data' },
  { id: 'ignore',      label: 'ignore' },
];

// Guess a role for each header. NAB's export has: Date, Amount, Account Number, (blank),
// Transaction Type, Transaction Details, Balance, Category, Merchant Name.
export function guessMapping(headers) {
  return headers.map(h => {
    const k = (h || '').trim().toLowerCase();
    if (!k) return 'ignore';
    if (k === 'date' || k.includes('date')) return 'date';
    if (k === 'amount' || k === 'value') return 'amount';
    if (k.includes('debit') || k === 'withdrawal') return 'debit';
    if (k.includes('credit') || k === 'deposit') return 'credit';
    if (k.includes('account')) return 'account';
    if (k.includes('details') || k === 'description' || k === 'narrative' || k === 'item') return 'description';
    if (k.includes('type')) return 'raw';
    if (k.includes('balance')) return 'balance';
    if (k.includes('merchant')) return 'merchant';
    if (k.includes('category')) return 'ignore';
    return 'raw';
  });
}

// Does the first row look like a header? NAB files start with a header row.
export function looksLikeHeader(row) {
  return row.some(c => /date|amount|balance|detail|narrative|description/i.test(c)) && !row.some(c => /^\d{1,2}[\s/-]/.test(c.trim()));
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

// Accepts "13 Oct 26", "13 Oct 2026", "13/10/2026", "13/10/26", "2026-10-13", "13-10-2026". Returns YYYY-MM-DD or null.
export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/))) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  if ((m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/))) {
    const mo = MONTHS[m[2].toLowerCase()]; if (!mo) return null;
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return `${y}-${String(mo).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  // Excel serial number
  if (/^\d{5}$/.test(s)) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return d.toISOString().slice(0, 10); }
  return null;
}

export function parseAmount(v) {
  if (v == null) return null;
  let s = String(v).trim(); if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const n = Number(s);
  if (Number.isNaN(n)) return null;
  return neg ? -n : n;
}

// Apply a mapping to the rows. Returns { lines, problems }. Each line:
// { date, amount, description, balance, accountNumber, merchant, raw, rowIndex }.
export function mapRows(rows, headers, mapping) {
  const lines = []; const problems = [];
  rows.forEach((row, rowIndex) => {
    const get = (role) => mapping.map((r, i) => r === role ? row[i] : null).filter(v => v != null && String(v).trim() !== '');
    const date = parseDate(get('date')[0]);
    let amount = parseAmount(get('amount')[0]);
    if (amount == null) {
      const debit = parseAmount(get('debit')[0]); const credit = parseAmount(get('credit')[0]);
      if (debit != null || credit != null) amount = (credit || 0) - Math.abs(debit || 0);
    }
    const description = [...get('description'), ...get('description2')].join(' · ').replace(/\s+/g, ' ').trim();
    const balance = parseAmount(get('balance')[0]);
    const accountNumber = get('account')[0] || '';
    const merchant = get('merchant')[0] || '';
    const raw = {}; headers.forEach((h, i) => { if (row[i] != null && String(row[i]).trim() !== '') raw[h || `col${i + 1}`] = row[i]; });
    if (!date || amount == null) { problems.push({ rowIndex, reason: !date ? 'no date' : 'no amount', row }); return; }
    lines.push({ date, amount, description, balance, accountNumber, merchant, raw, rowIndex });
  });
  return { lines, problems };
}

// Same key as the database's dedupe_key generated column.
export const dedupeKey = (accountId, l) =>
  `${accountId || ''}|${l.date}|${Number(l.amount)}|${(l.description || '').trim().toLowerCase()}|${l.balance == null ? '' : Number(l.balance)}`;

export const last4 = (s) => (String(s || '').replace(/\D/g, '').slice(-4));
