// Payee aggregations: how much has gone to each contractor or supplier, by category and period.
import { effectiveLines, fyOf, monthKey, toCents } from './categories';

export const PAYEE_KINDS = { contractor: 'Contractor', supplier: 'Supplier', insurer: 'Insurer', government: 'Government', other: 'Other' };

// Lines attributed to a payee: the split's payee wins, else the transaction's payee.
export function payeeLines(transactions) {
  const out = [];
  for (const t of transactions) {
    if (t.matchStatus === 'ignored') continue;
    for (const l of effectiveLines(t)) {
      const payeeId = l.payeeId || t.payeeId;
      if (payeeId) out.push({ ...l, payeeId, description: t.description, matchStatus: t.matchStatus });
    }
  }
  return out;
}

export function payeeSummary(transactions, payees, today) {
  const lines = payeeLines(transactions);
  const month = monthKey(today), fy = fyOf(today);
  const by = {};
  for (const l of lines) {
    const p = (by[l.payeeId] ||= { total: 0, month: 0, fy: 0, count: 0, last: null, byCategory: {} });
    const out = -toCents(l.amount);   // money paid out as a positive number (refunds reduce it)
    p.total += out; p.count++;
    if (monthKey(l.date) === month) p.month += out;
    if (fyOf(l.date) === fy) p.fy += out;
    if (!p.last || l.date > p.last) p.last = l.date;
    p.byCategory[l.category] = (p.byCategory[l.category] || 0) + out;
  }
  return payees.map(p => { const s = by[p.id] || { total: 0, month: 0, fy: 0, count: 0, last: null, byCategory: {} }; return { ...p, total: s.total / 100, month: s.month / 100, fy: s.fy / 100, count: s.count, last: s.last, byCategory: Object.fromEntries(Object.entries(s.byCategory).map(([k, v]) => [k, v / 100])) }; })
    .sort((a, b) => b.fy - a.fy || b.total - a.total);
}
