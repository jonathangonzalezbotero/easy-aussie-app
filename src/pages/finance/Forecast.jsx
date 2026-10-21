import { useMemo, useState } from 'react';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { addMonths, categoryLabel, money0, monthKey, monthLabel, monthStart } from '../../finance/categories';
import { generateForecast } from '../../finance/forecast';
import { formatDate, todayStr } from '../../utils/dates';
import { StatCard, Toast } from './bits';

export default function Forecast({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const [today] = useState(() => todayStr());
  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(monthKey(today), i)), [today]);
  const [incomeMode, setIncomeMode] = useState('active');
  const [edit, setEdit] = useState(null);   // { category, month, value, note }
  const [toast, setToast] = useState(null);
  const live = useMemo(() => fin.transactions.filter(t => t.matchStatus !== 'ignored'), [fin.transactions]);
  const fc = useMemo(() => generateForecast({ months, rentals: data.rentals, vehicles: data.vehicles, recurring: fin.recurring, regoRenewals: fin.regoRenewals, transactions: live, overrides: fin.overrides, settings: fin.settings, todayStr: today }), [months, data.rentals, data.vehicles, fin.recurring, fin.regoRenewals, live, fin.overrides, fin.settings, today]);

  const income = (m) => incomeMode === 'active' ? fc.income.active[m] : fc.income.target[m];
  const totIncome = months.reduce((s, m) => s + income(m), 0);
  const totActive = months.reduce((s, m) => s + fc.income.active[m], 0);
  const totTarget = months.reduce((s, m) => s + fc.income.target[m], 0);
  const expenses = (m) => fc.totals[m].operating;
  const capital = (m) => fc.totals[m].capital;
  const opNet = (m) => income(m) - expenses(m);
  const cashNet = (m) => opNet(m) - capital(m);
  const totExp = months.reduce((s, m) => s + expenses(m), 0);
  const totCap = months.reduce((s, m) => s + capital(m), 0);
  const tightest = months.reduce((best, m) => cashNet(m) < cashNet(best) ? m : best, months[0]);
  const maxBar = Math.max(1, ...months.map(m => Math.max(fc.income.active[m], fc.income.target[m])));
  let cumulative = 0;

  const active = data.rentals.filter(r => r.status === 'active');
  const weekly = active.reduce((s, r) => s + (r.billingPeriod !== 'fixed' ? Number(r.price) || 0 : 0), 0);
  const ending = active.filter(r => r.endDate && r.endDate >= today).sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const missing = data.vehicles.filter(v => !['stolen', 'sold'].includes(v.status) && v.type !== 'ebike' && !v.regoExpiry); // e-bikes need no rego in QLD

  const saveOverride = async () => {
    try { await fin.setOverride(monthStart(edit.month), edit.category, edit.value === '' ? null : Number(edit.value), edit.note); setToast({ message: edit.value === '' ? 'Reset to generated value' : 'Override saved' }); setEdit(null); }
    catch (e) { setToast({ message: e.message }); }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Forecast for the next 12 months · generated from rentals, rego dates, services and recurring expenses</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><span className="text-sm text-muted">Generated live from today's data</span><button className="btn btn-secondary btn-sm" onClick={() => go('settings')}>Fleet target and recurring</button></div>
      </div>

      <div className="grid-4 mb-20">
        <StatCard color="var(--accent)" value={money0(totActive)} label="Expected income" sub="12 months · from active rentals" />
        <StatCard color="var(--blue)" value={money0(totTarget - totActive)} label="Gap to fleet target" sub={`${Math.round(fin.settings.targetOccupancy * 100)}% occupancy · ${fc.target.scooters + fc.target.ebikes} vehicles`} />
        <StatCard color="var(--text)" value={money0(months.reduce((s, m) => s + (fc.income.active[m] - expenses(m) - capital(m)), 0))} label="Expected cash net" sub={`After ${money0(totCap)} capital / loan repayments`} />
        <StatCard color="var(--amber)" value={monthLabel(tightest)} label="Tightest month" sub={`cash net ${money0(cashNet(tightest))}`} />
      </div>

      {missing.length > 0 && <div className="fin-alert mb-16" style={{ background: 'var(--red-bg)' }}><span style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--red)', marginTop: 6 }} /><div><div className="fw-600" style={{ fontSize: 14, color: 'var(--red)' }}>Forecast is incomplete</div><div className="text-sm text-muted">{missing.map(v => v.plate).join(', ')} {missing.length > 1 ? 'have' : 'has'} no rego expiry, so {missing.length > 1 ? 'their' : 'its'} rego cost is left out.</div></div></div>}

      <div className="card mb-20">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}><div><span className="card-title">Income two ways</span><div className="text-sm text-muted">What current rentals will pay, against what the fleet could earn at your target</div></div>
          <span className="text-sm text-muted" style={{ display: 'flex', gap: 12 }}><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />From active rentals</span><span><span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px dashed var(--blue)', background: 'var(--blue-bg)', borderRadius: 2, marginRight: 4 }} />Fleet target</span></span></div>
        <div style={{ padding: '8px 16px 0' }}>
          <div className="fin-chart" style={{ height: 150 }}>
            {months.map(m => (
              <div key={m} className="bar-group"><div className="bars" style={{ height: 120 }}>
                <div className="bar income" style={{ height: `${100 * fc.income.active[m] / maxBar}%` }} />
                <div className="bar target" style={{ height: `${100 * fc.income.target[m] / maxBar}%` }} />
              </div><div className="month">{monthLabel(m, { short: true })}</div></div>))}
          </div>
        </div>
        <div className="table-wrap"><table className="fin-grid">
          <thead><tr><th></th>{months.map(m => <th key={m}>{monthLabel(m, { short: true })}</th>)}<th>Total</th></tr></thead>
          <tbody>
            <tr><td>From active rentals</td>{months.map(m => <td key={m}>{money0(fc.income.active[m])}</td>)}<td style={{ fontWeight: 700 }}>{money0(totActive)}</td></tr>
            <tr><td>Fleet target</td>{months.map(m => <td key={m} style={{ color: 'var(--blue)' }}>{money0(fc.income.target[m])}</td>)}<td style={{ fontWeight: 700, color: 'var(--blue)' }}>{money0(totTarget)}</td></tr>
            <tr className="total"><td>Gap</td>{months.map(m => <td key={m}>{money0(fc.income.target[m] - fc.income.active[m])}</td>)}<td>{money0(totTarget - totActive)}</td></tr>
          </tbody>
        </table></div>
        <div className="text-sm text-muted" style={{ padding: '10px 16px' }}>Active rentals: {active.length} paying {money0(weekly)} a week{ending ? `. ${data.customers.find(c => c.id === ending.customerId)?.name || 'A rental'}'s rental ends ${formatDate(ending.endDate)}` : ''}. Fleet target: {fc.target.scooters} scooters × ${fin.settings.scooterWeeklyRate} + {fc.target.ebikes} e-bikes × ${fin.settings.ebikeWeeklyRate}, at {Math.round(fin.settings.targetOccupancy * 100)}% occupancy = {money0(fc.target.weekly)} a week.</div>
      </div>

      <div className="card">
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}><div><span className="card-title">Forecast by category</span><div className="text-sm text-muted">Hover a cell to see where it came from. Click to override.</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="text-sm text-muted">Income row uses</span><div className="tabs" style={{ padding: 3 }}><button className={`tab${incomeMode === 'active' ? ' active' : ''}`} onClick={() => setIncomeMode('active')}>Active rentals</button><button className={`tab${incomeMode === 'target' ? ' active' : ''}`} onClick={() => setIncomeMode('target')}>Fleet target</button></div></div></div>
        <div className="table-wrap"><table className="fin-grid">
          <thead><tr><th>Category</th>{months.map(m => <th key={m}>{monthLabel(m, { short: true })}</th>)}<th>12 months</th></tr></thead>
          <tbody>
            <tr className="group"><td>Income</td><td colSpan={months.length + 1} /></tr>
            <tr><td>Rental income</td>{months.map(m => <td key={m}>{money0(income(m))}</td>)}<td style={{ fontWeight: 700 }}>{money0(totIncome)}</td></tr>
            {[['operating', 'Operating expenses'], ['capital', 'Capital']].map(([type, label]) => (
              <GroupRows key={type} label={label} rows={fc.rows.filter(r => r.type === type)} months={months} onEdit={(category, m, c) => setEdit({ category, month: m, value: c.override ? String(c.value) : '', generated: c.generated, origin: c.origin, note: c.note || '' })} />))}
            <tr className="total"><td>Expected income</td>{months.map(m => <td key={m}>{money0(income(m))}</td>)}<td>{money0(totIncome)}</td></tr>
            <tr className="total"><td>Expected expenses</td>{months.map(m => <td key={m}>{money0(expenses(m))}</td>)}<td>{money0(totExp)}</td></tr>
            <tr className="total"><td>Expected operating net</td>{months.map(m => <td key={m} className={opNet(m) < 0 ? 'fin-neg' : ''}>{money0(opNet(m))}</td>)}<td className={totIncome - totExp < 0 ? 'fin-neg' : ''}>{money0(totIncome - totExp)}</td></tr>
            <tr className="total"><td>Expected cash net</td>{months.map(m => <td key={m} className={cashNet(m) < 0 ? 'fin-neg' : ''}>{money0(cashNet(m))}</td>)}<td className={totIncome - totExp - totCap < 0 ? 'fin-neg' : ''}>{money0(totIncome - totExp - totCap)}</td></tr>
            <tr className="total"><td>Cumulative cash net</td>{months.map(m => { cumulative += cashNet(m); return <td key={m} className={cumulative < 0 ? 'fin-neg' : ''}>{money0(cumulative)}</td>; })}<td className={totIncome - totExp - totCap < 0 ? 'fin-neg' : ''}>{money0(totIncome - totExp - totCap)}</td></tr>
          </tbody>
        </table></div>
      </div>

      {edit && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setEdit(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header"><h2 style={{ fontSize: 16, fontWeight: 700 }}>{categoryLabel(edit.category)} · {monthLabel(edit.month)}</h2><button className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>×</button></div>
            <div className="modal-body">
              <input className="input" type="number" autoFocus value={edit.value} placeholder={String(Math.round(edit.generated))} onChange={e => setEdit({ ...edit, value: e.target.value })} style={{ textAlign: 'right', fontSize: 18 }} />
              <div className="text-sm text-muted">Generated value {money0(edit.generated)}: {edit.origin}</div>
              <input className="input" value={edit.note} placeholder="Note (optional)" onChange={e => setEdit({ ...edit, note: e.target.value })} />
            </div>
            <div className="modal-footer"><button className="btn btn-secondary" onClick={() => { setEdit({ ...edit, value: '' }); }}>Reset to generated</button><button className="btn btn-primary" onClick={saveOverride}>Save</button></div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function GroupRows({ label, rows, months, onEdit }) {
  if (!rows.length) return null;
  return (
    <>
      <tr className="group"><td>{label}</td><td colSpan={months.length + 1} /></tr>
      {rows.map(r => (
        <tr key={r.category}><td>{categoryLabel(r.category)}</td>
          {months.map(m => { const c = r.cells[m]; return <td key={m} className={`editable${c.override ? ' override' : ''}`} title={`${c.override ? `Override (generated ${money0(c.generated)}). ` : 'Generated · '}${c.origin}${c.note ? ` · ${c.note}` : ''}`} onClick={() => onEdit(r.category, m, c)}>{c.value ? money0(c.value) : '—'}</td>; })}
          <td style={{ fontWeight: 700 }}>{money0(months.reduce((s, m) => s + r.cells[m].value, 0))}</td></tr>))}
    </>
  );
}
