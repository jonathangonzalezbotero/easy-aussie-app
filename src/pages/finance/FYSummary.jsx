import { useMemo, useRef, useState } from 'react';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { useSuggestions } from '../../finance/useSuggestions';
import { CATEGORIES, categoriesOfType, categoryLabel, fyLabel, fyMonths, fyOf, fyRange, money, money0, monthLabel, summarise } from '../../finance/categories';
import { inRange, categoryByMonth, directorPosition } from '../../finance/reports';
import { formatDate, todayStr } from '../../utils/dates';
import { AlertStrip, AmountCell, StatCard, Toast } from './bits';

export default function FYSummary({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const suggestions = useSuggestions();
  const [today] = useState(() => todayStr());
  const currentFy = fyOf(today);
  const years = useMemo(() => { const set = new Set(fin.transactions.map(t => fyOf(t.date))); set.add(currentFy); return [...set].sort((a, b) => b - a); }, [fin.transactions, currentFy]);
  const [fy, setFy] = useState(years.includes(currentFy - 1) && today.slice(5) < '10' ? currentFy - 1 : currentFy);
  const [toast, setToast] = useState(null);
  const [exporting, setExporting] = useState(false);
  const ref = useRef(null);

  const { from, to } = fyRange(fy);
  const months = fyMonths(fy);
  const all = useMemo(() => inRange(fin.transactions, from, to), [fin.transactions, from, to]);
  const live = all.filter(t => t.matchStatus !== 'ignored');
  const open = all.filter(t => t.matchStatus === 'unreviewed' || t.matchStatus === 'suggested');
  const sum = useMemo(() => summarise(live), [live]);
  const byMonth = useMemo(() => categoryByMonth(live, months), [live, months]);
  const inProgress = fy === currentFy;
  const closingDate = inProgress ? today : to;

  const incomeRows = categoriesOfType('income').filter(c => byMonth[c.id]).map(c => ({ ...c, sign: 1 }));
  const opRows = categoriesOfType('operating').filter(c => byMonth[c.id]).map(c => ({ ...c, sign: -1 }));
  const capitalLines = useMemo(() => live.flatMap(t => (t.splits.length ? t.splits : [t]).filter(l => categoriesOfType('capital').some(c => c.id === l.category)).map(l => ({ date: t.date, description: t.description, category: l.category, amount: Number(l.amount), vehicleId: l.vehicleId || t.vehicleId }))).sort((a, b) => a.date.localeCompare(b.date)), [live]);
  const capitalTotal = capitalLines.reduce((s, l) => s + Math.abs(l.amount), 0);
  // Bonds held at the end of the FY: held now, or refunded after the FY end
  const bondsAtClose = data.rentals.filter(r => r.bond?.amount && (r.startDate || '') <= closingDate && (r.bond.status === 'held' || (['refunded', 'partially_refunded', 'retained'].includes(r.bond.status) && r.bond.refundDate && r.bond.refundDate > closingDate)));
  const bondsTotal = bondsAtClose.reduce((s, r) => s + Number(r.bond.amount), 0);
  const director = useMemo(() => directorPosition(fin), [fin]);
  const rowTotal = (cat) => months.reduce((s, m) => s + (byMonth[cat]?.[m] || 0), 0);
  const cell = (v) => v ? money0(Math.abs(v)) : '—';
  const monthIncome = (m) => incomeRows.reduce((s, c) => s + (byMonth[c.id]?.[m] || 0), 0);
  const monthOp = (m) => opRows.reduce((s, c) => s + -(byMonth[c.id]?.[m] || 0), 0);
  const sources = [...new Set(live.map(t => t.source))];
  const sourceNote = sources.length === 1 && sources[0] === 'spreadsheet' ? 'All months come from the spreadsheet import' : fin.settings.cutoverDate && from <= fin.settings.cutoverDate ? `Up to ${formatDate(fin.settings.cutoverDate)} from the spreadsheet import, then bank CSV and Stripe` : 'Bank CSV, Stripe and manual lines';
  const whyOpen = (t) => { const s = suggestions[t.id]; if (s?.kind === 'bond_deposit' && s.bondCheck?.match === 'over') return `Needs a split: bond $${s.bondCheck.bond} + ${money0(s.bondCheck.extra)}`; if (s) return `${categoryLabel(s.category)} suggested · ${s.reason}`; if (t.amount < 0 && /infring|fine/i.test(t.description)) return 'Fine: recharge to a customer, or business expense?'; return t.amount > 0 ? 'Money in: income, bond or reimbursement?' : 'No category yet'; };

  const exportCsv = () => {
    const rows = [['Date', 'Account', 'Description', 'Amount', 'Category', 'Category type', 'Customer', 'Vehicle', 'Match status', 'Source', 'Notes']];
    for (const t of all) {
      const acc = fin.accounts.find(a => a.id === t.accountId)?.name || '';
      const lines = t.splits.length ? t.splits : [{ ...t }];
      for (const l of lines) rows.push([t.date, acc, t.description, Number(l.amount).toFixed(2), categoryLabel(l.category), CATEGORIES.find(c => c.id === l.category)?.type || '', data.customers.find(c => c.id === (l.customerId || t.customerId))?.name || '', data.vehicles.find(v => v.id === (l.vehicleId || t.vehicleId))?.plate || '', t.matchStatus, t.source, t.notes || '']);
    }
    const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `easy-aussie-${fyLabel(fy).replace(/\s/g, '-').replace('–', '-')}.csv`; a.click();
    setToast({ message: `${rows.length - 1} lines exported` });
  };

  const exportPdf = async () => {
    setExporting(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf().set({ margin: 8, filename: `easy-aussie-${fyLabel(fy).replace(/\s/g, '-').replace('–', '-')}${inProgress ? '-draft' : ''}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['avoid-all', 'css'] } }).from(ref.current).save();
      setToast({ message: 'PDF saved' });
    } catch (e) { setToast({ message: `PDF export failed: ${e.message}. Your data is safe; try again or export the CSV.` }); } finally { setExporting(false); }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Accountant pack · cash basis · {data.settings.ownerCompany} · ABN {data.settings.ownerABN}</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="text-sm text-muted">Financial year</span>
          <select className="select" style={{ width: 'auto' }} value={fy} onChange={e => setFy(Number(e.target.value))}>{years.map(y => <option key={y} value={y}>{fyLabel(y)} · {formatDate(fyRange(y).from)} – {formatDate(fyRange(y).to)}</option>)}</select>
          <button className="btn btn-secondary" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-primary" onClick={exportPdf} disabled={exporting}>{exporting ? 'Building PDF…' : inProgress ? 'Export draft PDF' : 'Export PDF'}</button>
        </div>
      </div>

      {open.length > 0 && <div className="mb-16"><AlertStrip tone="amber" title={`${open.length} transaction${open.length > 1 ? 's' : ''} in this year ${open.length > 1 ? 'are' : 'is'} still unreconciled.`} detail="You can export now; the PDF lists them on its last page as open items." action={`Review the ${open.length}`} onAction={() => go('reconcile')} /></div>}
      {inProgress && <div className="mb-16"><AlertStrip tone="amber" title={`${fyLabel(fy)} is in progress`} detail={`Figures run to ${formatDate(today)}. The year closes on ${formatDate(to)}; export now only as a draft.`} /></div>}
      {live.length === 0 && <div className="card mb-16" style={{ padding: 40, textAlign: 'center' }} ><div className="fw-600">No data for {fyLabel(fy)}</div><div className="text-sm text-muted">Your history starts {fin.transactions.length ? formatDate([...fin.transactions].map(t => t.date).sort()[0]) : 'when you import it'}.</div></div>}

      <div ref={ref} style={{ background: 'var(--bg)' }}>
        <div style={{ display: 'none' }} className="pdf-only">{data.settings.ownerCompany} · {fyLabel(fy)}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }} className="fin-overview-grid">
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Profit and loss · {fyLabel(fy)}{inProgress ? ' to date' : ''}</div>
            <div className="grid-4">
              <StatCard color="var(--accent)" value={money0(sum.income)} label="Income" sub={incomeRows.map(c => c.label.toLowerCase()).join(', ') || '—'} />
              <StatCard color="var(--red)" value={money0(sum.operating)} label="Operating expenses" sub={`${opRows.length} categories`} />
              <StatCard color="var(--blue)" value={money0(sum.operatingNet)} label="Operating net" sub="Before capital" />
              <StatCard color="var(--text)" value={money(capitalTotal)} label="Capital items" sub="Vehicles, loan repayments" />
            </div>
          </div>
          <div>
            <div className="label" style={{ marginBottom: 8 }}>Balances at {formatDate(closingDate)}</div>
            <div className="grid-2">
              <StatCard color="var(--amber)" soft value={money0(bondsTotal)} label="Bonds held" sub={`${bondsAtClose.length} bond${bondsAtClose.length !== 1 ? 's' : ''} · liability`} />
              <StatCard color="var(--amber)" soft value={fin.settings.directorLoanOpeningDate ? money0(director.total) : '—'} label="Owed to director" sub={fin.settings.directorLoanOpeningDate ? `Loan ${money0(director.loanBalance)} + unreimbursed ${money0(director.unreimbursedTotal)}` : 'Set the opening balance in Settings'} />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 20 }}>
          <div className="card-head"><div><span className="card-title">Income and operating expenses by month</span><div className="text-sm text-muted">{sourceNote}</div></div></div>
          <div className="table-wrap"><table className="fin-grid">
            <thead><tr><th>Category</th>{months.map(m => <th key={m}>{monthLabel(m).slice(0, 3)}</th>)}<th>Total</th></tr></thead>
            <tbody>
              <tr className="group"><td colSpan={14}>Income</td></tr>
              {incomeRows.map(c => <tr key={c.id}><td>{c.label}</td>{months.map(m => <td key={m}>{cell(byMonth[c.id]?.[m])}</td>)}<td style={{ fontWeight: 700 }}>{money0(rowTotal(c.id))}</td></tr>)}
              <tr className="group"><td colSpan={14}>Operating expenses</td></tr>
              {opRows.map(c => <tr key={c.id}><td>{c.label}</td>{months.map(m => <td key={m}>{cell(byMonth[c.id]?.[m])}</td>)}<td style={{ fontWeight: 700 }}>{money0(-rowTotal(c.id))}</td></tr>)}
              <tr className="total"><td>Total income</td>{months.map(m => <td key={m}>{cell(monthIncome(m))}</td>)}<td>{money0(sum.income)}</td></tr>
              <tr className="total"><td>Total operating expenses</td>{months.map(m => <td key={m}>{cell(monthOp(m))}</td>)}<td>{money0(sum.operating)}</td></tr>
              <tr className="total"><td>Operating net</td>{months.map(m => { const v = monthIncome(m) - monthOp(m); return <td key={m} className={v < 0 ? 'fin-neg' : ''}>{v ? money0(v) : '—'}</td>; })}<td className={sum.operatingNet < 0 ? 'fin-neg' : ''}>{money0(sum.operatingNet)}</td></tr>
            </tbody>
          </table></div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 14, marginTop: 20, alignItems: 'start' }} className="fin-overview-grid">
          <div className="card">
            <div className="card-head"><span className="card-title">Capital items</span><span className="text-sm text-muted">Depreciation is left to your accountant</span></div>
            {capitalLines.length === 0 ? <div className="text-sm text-muted" style={{ padding: 20 }}>No capital items this year.</div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Date</th><th>Item</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>{capitalLines.map((l, i) => <tr key={i} style={{ cursor: 'default' }}><td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(l.date)}</td><td>{l.description}{l.vehicleId ? <span className="text-muted"> · {data.vehicles.find(v => v.id === l.vehicleId)?.plate}</span> : ''}</td><td>{categoryLabel(l.category)}</td><td style={{ textAlign: 'right' }}><AmountCell value={l.amount} bold={false} /></td></tr>)}
                  <tr style={{ cursor: 'default' }}><td colSpan={3} className="fw-600">Total capital</td><td className="fw-600" style={{ textAlign: 'right' }}>{money(capitalTotal)}</td></tr></tbody>
              </table></div>)}
          </div>
          <div className="card">
            <div className="card-head"><span className="card-title">Bonds held at {formatDate(closingDate)}</span></div>
            {bondsAtClose.length === 0 ? <div className="text-sm text-muted" style={{ padding: 20 }}>No bonds held.</div> : (
              <div className="table-wrap"><table className="table">
                <thead><tr><th>Customer</th><th>Rental</th><th style={{ textAlign: 'right' }}>Bond</th></tr></thead>
                <tbody>{bondsAtClose.map(r => <tr key={r.id} style={{ cursor: 'default' }}><td>{data.customers.find(c => c.id === r.customerId)?.name || '—'}</td><td className="text-muted">{r.contractNumber || ''} · since {formatDate(r.startDate).replace(/ \d{4}$/, '')}</td><td style={{ textAlign: 'right' }}>{money(r.bond.amount)}</td></tr>)}
                  <tr style={{ cursor: 'default' }}><td colSpan={2} className="fw-600">Total liability</td><td className="fw-600" style={{ textAlign: 'right' }}>{money(bondsTotal)}</td></tr></tbody>
              </table></div>)}
          </div>
        </div>

        {open.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-head"><span className="card-title">Still unreconciled in {fyLabel(fy)}</span><button className="btn btn-secondary btn-sm" onClick={() => go('reconcile')}>Open in queue</button></div>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>Date</th><th>Description</th><th className="col-hide-mobile">Account</th><th style={{ textAlign: 'right' }}>Amount</th><th>Why it is open</th></tr></thead>
              <tbody>{open.map(t => <tr key={t.id} style={{ cursor: 'default' }}><td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</td><td className="fin-mono">{t.description}</td><td className="col-hide-mobile">{fin.accounts.find(a => a.id === t.accountId)?.name}</td><td style={{ textAlign: 'right' }}><AmountCell value={t.amount} bold={false} /></td><td className="text-sm">{whyOpen(t)}</td></tr>)}</tbody>
            </table></div>
          </div>
        )}
      </div>
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
