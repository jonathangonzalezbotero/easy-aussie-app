import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/shared/Modal';
import Badge from '../../components/shared/Badge';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { parseCsv, parseDate, parseAmount, dedupeKey } from '../../finance/csv';
import { applyRules } from '../../finance/matching';
import { money } from '../../finance/categories';
import { formatDate } from '../../utils/dates';
import { AmountCell, CategorySelect } from './bits';

// Keyword guess for historical lines. The spreadsheet's colour coding cannot be read from the
// file, so text and sign decide, and every line can be changed before import.
function guessCategory(item, amount, rules) {
  const t = (item || '').toLowerCase();
  const rule = applyRules(rules, { description: item });
  if (/refund/.test(t) && /bond|deposit/.test(t)) return amount < 0 ? 'bond_refund' : 'bond_retained';
  if (/bond|deposit/.test(t)) return amount > 0 ? 'bond_deposit' : 'bond_refund';
  if (/shopify|stripe payout|payout/.test(t)) return amount > 0 ? (/payout/.test(t) ? 'stripe_payout' : 'rental_income') : 'software_fees';
  if (/transfer|savings/.test(t)) return 'internal_transfer';
  if (/reimb/.test(t)) return 'reimbursement';
  if (/loan|director/.test(t)) return amount < 0 ? 'director_loan_repayment' : 'director_loan_in';
  if (/personal|drawing/.test(t)) return 'drawings';
  if (/insurance claim|claim/.test(t)) return 'insurance_claim';
  if (/scooter purchase|bike purchase|purchase|longjia|kymco|valk/.test(t) && amount < -400) return 'vehicle_purchase';
  if (rule) return rule.category;
  if (/rent|payment|week|hire/.test(t) && amount > 0) return 'rental_income';
  if (/fine|infring/.test(t)) return 'fines';
  if (/rego|tmr|registration/.test(t)) return 'rego';
  if (/youi|insurance/.test(t)) return 'insurance';
  if (/fuel|petrol|ampol|coles express|bp /.test(t)) return 'fuel';
  if (/google|ads|facebook|meta|marketing|flyer/.test(t)) return 'marketing';
  if (/garage|storage/.test(t)) return 'garage_fee';
  if (/accountant|tax/.test(t)) return 'accountant';
  if (/supercheap|repco|tyre|brake|oil|part|repair|service|mechanic/.test(t)) return 'maintenance';
  if (/software|subscription|bitwarden|domain|hosting|fee/.test(t)) return 'software_fees';
  if (amount > 0) return 'rental_income';
  return 'other_expense';
}

async function readWorkbook(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return [{ name: file.name.replace(/\.[^.]+$/, ''), rows: parseCsv(await file.text()) }];
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  return wb.SheetNames.map(n => ({ name: n, rows: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }));
}

// Each sheet is one month with repeated blocks of date / item / value columns.
function extractLines(sheets) {
  const out = [];
  for (const sh of sheets) {
    const rows = sh.rows;
    if (!rows.length) continue;
    // Find header cells named date/item/value (or similar) to locate the blocks; fall back to A/B/C.
    let blocks = [];
    for (let r = 0; r < Math.min(rows.length, 10) && !blocks.length; r++) {
      const row = rows[r].map(c => String(c ?? '').trim().toLowerCase());
      row.forEach((c, i) => { if (/^(date|fecha)$/.test(c)) { const itemCol = row.findIndex((x, j) => j > i && /item|desc|detail|concepto/.test(x)); const valCol = row.findIndex((x, j) => j > i && /value|amount|valor|\$/.test(x)); if (itemCol >= 0 && valCol >= 0) blocks.push({ date: i, item: itemCol, value: valCol, start: r + 1 }); } });
    }
    if (!blocks.length) blocks = [{ date: 0, item: 1, value: 2, start: 0 }];
    for (const b of blocks) {
      for (let r = b.start; r < rows.length; r++) {
        const row = rows[r];
        const date = parseDate(row[b.date]); const amount = parseAmount(row[b.value]); const item = String(row[b.item] ?? '').trim();
        if (!date || amount == null || amount === 0) continue;
        out.push({ sheet: sh.name, date, amount, description: item, raw: { sheet: sh.name, row: r + 1, date: row[b.date], item, value: row[b.value] } });
      }
    }
  }
  return out;
}

export default function SpreadsheetImportModal({ open, onClose, onDone }) {
  const fin = useFinance();
  const { data } = useStore();
  const [accountId, setAccountId] = useState('');
  const [lines, setLines] = useState([]);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => { if (open) { setLines([]); setErr(''); setFileName(''); setFilter('all'); setAccountId(fin.accounts.find(a => a.name === 'NAB Business')?.id || fin.accounts[0]?.id || ''); } }, [open, fin.accounts]);

  const existing = useMemo(() => new Set(fin.transactions.filter(t => t.accountId === accountId).map(t => dedupeKey(accountId, t))), [fin.transactions, accountId]);

  const load = async (f) => {
    setErr('');
    try {
      const sheets = await readWorkbook(f);
      const raw = extractLines(sheets);
      if (!raw.length) throw new Error('No date / item / value rows were found. Each month tab should have a date column, an item column and a value column.');
      setFileName(f.name);
      setLines(raw.map((l, i) => {
        const customer = data.customers.find(c => { const last = c.name.toLowerCase().split(' ').pop(); return last.length > 2 && l.description.toLowerCase().includes(last); });
        const rental = customer ? data.rentals.filter(r => r.customerId === customer.id).sort((a, b) => Math.abs(new Date(a.startDate) - new Date(l.date)) - Math.abs(new Date(b.startDate) - new Date(l.date)))[0] : null;
        return { ...l, id: i, category: guessCategory(l.description, l.amount, fin.rules), customerId: customer?.id || null, rentalId: rental?.id || null, vehicleId: rental?.vehicleId || null, duplicate: existing.has(dedupeKey(accountId, { ...l, balance: null })) };
      }));
    } catch (e) { setErr(e.message); }
  };

  const setCat = (id, category) => setLines(ls => ls.map(l => l.id === id ? { ...l, category } : l));
  const toImport = lines.filter(l => !l.duplicate);
  const needReview = toImport.filter(l => !l.category);
  const shown = lines.filter(l => filter === 'all' || (filter === 'dup' ? l.duplicate : !l.category));
  const range = useMemo(() => { const ds = toImport.map(l => l.date).sort(); return ds.length ? [ds[0], ds[ds.length - 1]] : null; }, [toImport]);

  const doImport = async () => {
    setBusy(true); setErr('');
    try {
      const items = toImport.map(l => ({ accountId, date: l.date, amount: l.amount, description: l.description, balance: null, source: 'spreadsheet', raw: l.raw, category: l.category || '', matchStatus: l.category ? 'confirmed' : 'unreviewed', customerId: l.customerId, rentalId: l.rentalId, vehicleId: l.vehicleId }));
      const inserted = items.length ? await fin.insertTransactions(items) : [];
      await fin.addImport({ accountId, kind: 'spreadsheet', fileName, lineCount: lines.length, newCount: inserted.length, skippedCount: lines.length - inserted.length, fromDate: range?.[0], toDate: range?.[1] });
      if (!fin.settings.cutoverDate && range) await fin.updateSettings({ cutoverDate: range[1] });
      onDone?.(inserted.length);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import history from your spreadsheet" width={760}
      footer={<>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        {needReview.length > 0 && <button className="btn btn-secondary" onClick={() => setFilter(f => f === 'review' ? 'all' : 'review')}>Review the {needReview.length}</button>}
        <button className="btn btn-primary" disabled={!toImport.length || busy} onClick={doImport}>{busy ? 'Importing…' : `Import ${toImport.length} now`}</button>
      </>}>
      <div className="text-sm text-muted" style={{ marginTop: -8 }}>Up to the cut-over{fin.settings.cutoverDate ? ` (${formatDate(fin.settings.cutoverDate)})` : ''} · one tab per month with date, item and value columns. Excel (.xlsx) or CSV.</div>
      <div className="grid-2">
        <div className="field"><label className="label">Lines go to account</label>
          <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>{fin.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <div className="field"><label className="label">File</label><input className="input" type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && load(e.target.files[0])} /></div>
      </div>
      {err && <div style={{ background: 'var(--red-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--red)' }}>{err}</div>}
      {lines.length > 0 && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
            <Badge variant="green">Read OK</Badge>
            <span>{fileName} · {lines.length} lines{range ? ` · ${formatDate(range[0])} – ${formatDate(range[1])}` : ''}</span>
            {lines.some(l => l.duplicate) && <button className="btn btn-ghost btn-sm" onClick={() => setFilter(f => f === 'dup' ? 'all' : 'dup')}>{lines.filter(l => l.duplicate).length} already imported</button>}
          </div>
          <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>Colours in the spreadsheet cannot be read from the file, so each line's category is guessed from its text and sign. Check the "Will be" column and change any that are wrong before importing.</div>
          <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}><table className="table">
            <thead><tr><th>Date</th><th>Item</th><th style={{ textAlign: 'right' }}>Value</th><th>Will be</th></tr></thead>
            <tbody>{shown.map(l => (
              <tr key={l.id} style={{ cursor: 'default', opacity: l.duplicate ? 0.5 : 1 }}>
                <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(l.date).replace(/ \d{4}$/, '')}</td>
                <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}<div className="text-sm text-muted">{l.sheet}{l.customerId ? ` · ${data.customers.find(c => c.id === l.customerId)?.name}` : ''}</div></td>
                <td style={{ textAlign: 'right' }}><AmountCell value={l.amount} bold={false} /></td>
                <td>{l.duplicate ? <Badge variant="gray">Already imported</Badge> : <CategorySelect value={l.category} onChange={v => setCat(l.id, v)} style={{ padding: '5px 8px', fontSize: 13 }} />}</td>
              </tr>))}</tbody>
          </table></div>
          <div className="text-sm text-muted">{toImport.length} lines will be imported as confirmed history{needReview.length ? `, ${needReview.length} without a category will arrive as Unreviewed` : ''}. Total in {money(toImport.filter(l => l.amount > 0).reduce((s, l) => s + l.amount, 0))}, out {money(toImport.filter(l => l.amount < 0).reduce((s, l) => s + l.amount, 0))}. {!fin.settings.cutoverDate && range ? `The cut-over date will be set to ${formatDate(range[1])}.` : ''}</div>
        </>
      )}
    </Modal>
  );
}
