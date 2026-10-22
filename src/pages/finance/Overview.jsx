import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { useSuggestions } from '../../finance/useSuggestions';
import { addMonths, categoryLabel, categoryShort, categoriesOfType, fyLabel, fyMonths, fyOf, money, money0, monthKey, monthLabel, summarise } from '../../finance/categories';
import { inRange, monthlySummaries, categoryByMonth, bondsHeld, cashPosition } from '../../finance/reports';
import { generateForecast } from '../../finance/forecast';
import { formatDate, todayStr } from '../../utils/dates';
import { AlertStrip, PeriodSwitch, StatCard } from './bits';

export default function Overview({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const navigate = useNavigate();
  const suggestions = useSuggestions();
  const [today] = useState(() => todayStr());
  const [now] = useState(() => Date.now());
  const [mode, setMode] = useState('month');
  const [month, setMonth] = useState(monthKey(today));
  const [fy, setFy] = useState(fyOf(today));

  const live = useMemo(() => fin.transactions.filter(t => t.matchStatus !== 'ignored'), [fin.transactions]);
  const range = mode === 'month' ? { from: `${month}-01`, to: `${month}-31` } : { from: `${fy - 1}-07-01`, to: `${fy}-06-30` };
  const periodTx = useMemo(() => inRange(live, range.from, range.to), [live, range.from, range.to]);
  const sum = useMemo(() => summarise(periodTx), [periodTx]);
  const bySource = useMemo(() => {
    const out = {};
    for (const t of periodTx) { const a = fin.accounts.find(x => x.id === t.accountId); const key = a?.kind === 'processor' ? 'Stripe' : a?.kind === 'cash' ? 'Cash' : 'Bank'; for (const l of (t.splits.length ? t.splits : [t])) { if (['rental_income', 'rental_refund', 'bond_retained', 'insurance_claim', 'other_income'].includes(l.category)) out[key] = (out[key] || 0) + Number(l.amount); } }
    return out;
  }, [periodTx, fin.accounts]);
  const opCount = periodTx.filter(t => (t.splits.length ? t.splits : [t]).some(l => categoriesOfType('operating').some(c => c.id === l.category))).length;
  const capitalLabel = sum.capitalOut ? `After ${money0(sum.capitalOut)} director loan / capital` : 'No capital movements';
  const held = bondsHeld(data.rentals);
  const cash = useMemo(() => cashPosition(fin, data.rentals), [fin, data.rentals]);
  const pendingRefunds = data.rentals.filter(r => r.bond?.status === 'held' && r.bond.refundedAmount !== '' && Number(r.bond.refundedAmount) > 0).length;

  // Alerts
  const pastDue = fin.subscriptions.filter(s => s.status === 'past_due' || s.pastDueSince);
  const nab = fin.accounts.find(a => a.name === 'NAB Business') || fin.accounts.find(a => a.feed === 'csv');
  const nabAge = nab?.lastImportAt ? Math.floor((now - new Date(nab.lastImportAt)) / 86400000) : null;
  const queue = fin.transactions.filter(t => t.matchStatus === 'unreviewed' || t.matchStatus === 'suggested');
  const queueKinds = (() => { const k = { bond_deposit: 0, bond_refund: 0, payout: 0 }; for (const t of queue) { const s = suggestions[t.id]; if (s && k[s.kind] != null) k[s.kind]++; } const parts = []; if (k.bond_deposit) parts.push(`${k.bond_deposit} bond deposit${k.bond_deposit > 1 ? 's' : ''}`); if (k.bond_refund) parts.push(`${k.bond_refund} bond refund${k.bond_refund > 1 ? 's' : ''}`); if (k.payout) parts.push(`${k.payout} payout${k.payout > 1 ? 's' : ''}`); const other = queue.length - k.bond_deposit - k.bond_refund - k.payout; if (other) parts.push(`${other} other`); return parts.join(' · '); })();

  // Chart: last 12 months
  const months12 = useMemo(() => Array.from({ length: 12 }, (_, i) => addMonths(monthKey(today), i - 11)), [today]);
  const monthly = useMemo(() => monthlySummaries(live, months12), [live, months12]);
  const maxBar = Math.max(1, ...months12.flatMap(m => [monthly[m].income, monthly[m].operating]));

  // FY grid: actuals for past months, MTD + forecast for the current month, forecast after
  const fyM = fyMonths(fy);
  const cur = monthKey(today);
  const actual = useMemo(() => categoryByMonth(live, fyM), [live, fyM]);
  const forecast = useMemo(() => generateForecast({ months: fyM.filter(m => m >= cur), rentals: data.rentals, vehicles: data.vehicles, recurring: fin.recurring, regoRenewals: fin.regoRenewals, transactions: live, overrides: fin.overrides, settings: fin.settings, todayStr: today }), [fyM, cur, data.rentals, data.vehicles, fin.recurring, fin.regoRenewals, live, fin.overrides, fin.settings, today]);
  const gridRows = useMemo(() => {
    const cats = { income: new Set(), operating: new Set(), capital: new Set() };
    for (const c of Object.keys(actual)) { const t = categoriesOfType('income').some(x => x.id === c) ? 'income' : categoriesOfType('operating').some(x => x.id === c) ? 'operating' : categoriesOfType('capital').some(x => x.id === c) ? 'capital' : null; if (t) cats[t].add(c); }
    for (const r of forecast.rows) if (cats[r.type]) cats[r.type].add(r.category);
    cats.income.add('rental_income');
    const cell = (cat, m, type) => {
      const past = m < cur, isCur = m === cur;
      const act = actual[cat]?.[m] || 0;
      const fc = forecast.rows.find(r => r.category === cat)?.cells[m];
      const fcValue = type === 'income' ? (cat === 'rental_income' ? (forecast.income.active[m] || 0) : 0) : (fc?.value || 0);
      const actualAbs = type === 'income' ? act : -act;
      if (past) return { value: actualAbs, kind: 'actual' };
      if (isCur) {
        // month to date plus the remaining share of the forecast
        const [y, mo] = m.split('-').map(Number); const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate(); const day = Number(today.slice(8)); const share = Math.max(0, (dim - day) / dim);
        return { value: actualAbs + fcValue * share, kind: 'current', mtd: actualAbs };
      }
      return { value: fcValue, kind: 'forecast', override: fc?.override, origin: fc?.origin };
    };
    const build = (type) => [...cats[type]].map(cat => ({ category: cat, type, cells: Object.fromEntries(fyM.map(m => [m, cell(cat, m, type)])) })).filter(r => fyM.some(m => r.cells[m].value)).sort((a, b) => fyM.reduce((s, m) => s + b.cells[m].value, 0) - fyM.reduce((s, m) => s + a.cells[m].value, 0));
    return { income: build('income'), operating: build('operating'), capital: build('capital') };
  }, [actual, forecast, fyM, cur, today]);
  const colTotal = (rows, m) => rows.reduce((s, r) => s + r.cells[m].value, 0);
  const fmtCell = (v) => v ? money0(v) : '—';

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">{data.settings.ownerCompany} · cash basis · not registered for GST</div></div>
        <PeriodSwitch mode={mode} onMode={setMode} label={mode === 'month' ? monthLabel(month) : fyLabel(fy)}
          onPrev={() => mode === 'month' ? setMonth(addMonths(month, -1)) : setFy(fy - 1)}
          onNext={() => mode === 'month' ? setMonth(addMonths(month, 1)) : setFy(fy + 1)}
          nextDisabled={mode === 'month' ? month >= monthKey(today) : fy >= fyOf(today)} />
      </div>

      {(pastDue.length > 0 || nabAge === null || nabAge > 7 || queue.length > 0) && (
        <div className="fin-alerts">
          {pastDue.length > 0 && <AlertStrip tone="red" title={`${pastDue.length} Stripe subscription${pastDue.length > 1 ? 's' : ''} past due`} detail={pastDue.map(s => [s.customerName || s.customerEmail, s.lastFailedAmount ? money0(s.lastFailedAmount) : null, s.lastFailureReason || 'reason not synced yet'].filter(Boolean).join(' · ')).join(' — ')} action="View rentals" onAction={() => navigate('/rentals')} />}
          {(nabAge === null || nabAge > 7) && <AlertStrip tone="amber" title={nabAge === null ? 'No bank CSV imported yet' : 'No bank CSV this week'} detail={nab ? `${nab.name}${nab.lastImportAt ? ` last imported ${formatDate(nab.lastImportAt.slice(0, 10))}` : ''}` : ''} action="Import CSV" onAction={() => go('settings')} />}
          {queue.length > 0 && <AlertStrip tone="blue" title={`${queue.length} transaction${queue.length > 1 ? 's' : ''} to reconcile`} detail={queueKinds} action="Open queue" onAction={() => go('reconcile')} />}
        </div>
      )}

      <div className="label" style={{ marginBottom: 8 }}>Cash position · today, from the whole history</div>
      <div className="grid-4 mb-20">
        <StatCard color="var(--text)" value={money0(cash.business)} label="In the business accounts" sub={cash.rows.filter(r => r.actual != null).map(r => `${r.account.name} ${money0(r.actual)}`).join(' · ') || 'No balances known yet'} />
        <StatCard color="var(--amber)" value={money0(cash.bonds)} label="Of which customers' bonds" sub={`${held.count} bond${held.count !== 1 ? 's' : ''} you must be able to give back`} onClick={() => navigate('/bonds')} />
        <StatCard color={cash.free < 0 ? 'var(--red)' : 'var(--accent)'} value={money0(cash.free)} label="Your money" sub={cash.free < 0 ? `${money0(-cash.free)} short of covering the bonds` : 'After the bonds are set aside'} />
        <StatCard color={cash.afterDirector < 0 ? 'var(--red)' : 'var(--blue)'} value={money0(cash.afterDirector)} label="After paying yourself" sub={`Business owes you ${money0(cash.director.total)}`} onClick={() => go('fy')} />
      </div>
      <div className="card mb-20">
        <div className="card-head"><div><span className="card-title">Ledger vs bank, per account</span><div className="text-sm text-muted">A gap means money moved that is not in the ledger: a missed CSV, a line marked ignored, or an opening balance that is wrong.</div></div><button className="btn btn-secondary btn-sm" onClick={() => go('settings')}>Opening balances</button></div>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Account</th><th style={{ textAlign: 'right' }}>Ledger says</th><th style={{ textAlign: 'right' }}>Bank says</th><th className="col-hide-mobile">As at</th><th style={{ textAlign: 'right' }}>Gap</th></tr></thead>
          <tbody>{cash.rows.map(r => (
            <tr key={r.account.id} style={{ cursor: 'default' }}>
              <td className="fw-500">{r.account.name}{!r.hasOpening && r.account.kind !== 'cash' && <div className="text-sm text-muted">No opening balance set</div>}</td>
              <td style={{ textAlign: 'right' }}>{money0(r.ledger)}</td>
              <td style={{ textAlign: 'right' }}>{r.actual == null ? <span className="text-muted">—</span> : money0(r.actual)}</td>
              <td className="col-hide-mobile text-muted">{r.actualAt ? `${formatDate(r.actualAt)} · ${r.actualNote}` : r.actualNote || '—'}</td>
              <td style={{ textAlign: 'right', fontWeight: 600, color: r.gap == null ? 'var(--muted)' : Math.abs(r.gap) < 1 ? 'var(--accent)' : 'var(--red)' }}>{r.gap == null ? '—' : Math.abs(r.gap) < 1 ? '✓' : money0(r.gap)}</td>
            </tr>))}</tbody>
        </table></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 3fr) minmax(0, 1fr)', gap: 14, alignItems: 'start' }} className="fin-overview-grid">
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Profit and loss · {mode === 'month' ? `${monthLabel(month)}${month === cur ? ' to date' : ''}` : fyLabel(fy)}</div>
          <div className="grid-4">
            <StatCard color="var(--accent)" value={money0(sum.income)} label="Income" sub={Object.entries(bySource).map(([k, v]) => `${k} ${money0(v)}`).join(' · ') || 'No income yet'} onClick={() => go('transactions')} />
            <StatCard color="var(--red)" value={money0(sum.operating)} label="Operating expenses" sub={`${opCount} transactions`} onClick={() => go('transactions')} />
            <StatCard color="var(--blue)" value={money0(sum.operatingNet)} label="Operating net" sub="Income − operating expenses" />
            <StatCard color="var(--text)" value={money0(sum.cashNet)} label="Cash net" sub={capitalLabel} />
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 8 }}>Held for customers</div>
          <StatCard color="var(--amber)" soft value={money0(held.total)} label="Bonds held · not income" sub={`${held.count} bond${held.count !== 1 ? 's' : ''}${pendingRefunds ? ` · ${pendingRefunds} refund${pendingRefunds > 1 ? 's' : ''} waiting to be reconciled` : ''}`} onClick={() => navigate('/bonds')} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head"><span className="card-title">Income vs operating expenses · last 12 months</span>
          <span className="text-sm text-muted" style={{ display: 'flex', gap: 12 }}><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent)', borderRadius: 2, marginRight: 4 }} />Income</span><span><span style={{ display: 'inline-block', width: 10, height: 10, background: 'oklch(0.70 0.14 25)', borderRadius: 2, marginRight: 4 }} />Operating expenses</span><span className="col-hide-mobile">Striped = month to date</span></span></div>
        <div style={{ padding: '8px 16px 12px' }}>
          <div className="fin-chart">
            {months12.map(m => { const s = monthly[m]; const isCur = m === cur; return (
              <div key={m} className="bar-group" title={`${monthLabel(m)}: income ${money0(s.income)}, expenses ${money0(s.operating)}`}>
                <div className="bars">
                  <div className={`bar ${isCur ? 'mtd' : 'income'}`} style={{ height: `${100 * s.income / maxBar}%` }} />
                  <div className={`bar ${isCur ? 'mtd-expense' : 'expense'}`} style={{ height: `${100 * s.operating / maxBar}%` }} />
                </div>
                <div className="month">{monthLabel(m).slice(0, 3)}</div>
                <div className="net" style={{ color: s.operatingNet < 0 ? 'var(--red)' : 'var(--text)' }}>{money0(s.operatingNet)}</div>
              </div>); })}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div><span className="card-title">{fyLabel(fy)} · actuals and forecast</span><div className="text-sm text-muted">Past months are reconciled actuals. The current month is month-to-date plus forecast. Future months come from the forecast.</div></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="text-sm text-muted col-hide-mobile"><span style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--accent-light)', marginRight: 4 }} />Current month <span style={{ display: 'inline-block', width: 10, height: 10, background: 'oklch(0.975 0.008 80)', border: '1px solid var(--border)', margin: '0 4px 0 8px' }} />Forecast <span style={{ display: 'inline-block', width: 0, height: 0, borderStyle: 'solid', borderWidth: '0 8px 8px 0', borderColor: 'transparent var(--amber) transparent transparent', margin: '0 4px 0 8px' }} />Manual override</span>
            <button className="btn btn-secondary btn-sm" onClick={() => go('forecast')}>Open forecast</button>
          </div>
        </div>
        <div className="table-wrap"><table className="fin-grid">
          <thead><tr><th>Category</th>{fyM.map(m => <th key={m}>{monthLabel(m, { short: true })}<div style={{ fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{m < cur ? 'Actual' : m === cur ? 'MTD + fcst' : 'Forecast'}</div></th>)}<th>FY total</th></tr></thead>
          <tbody>
            {[['income', 'Income', gridRows.income], ['operating', 'Operating expenses', gridRows.operating], ['capital', 'Capital', gridRows.capital]].map(([type, label, rows]) => rows.length ? (
              <GridGroup key={type} label={label} rows={rows} months={fyM} fmt={fmtCell} />
            ) : null)}
            <tr className="total"><td>Total income</td>{fyM.map(m => <td key={m} className={m === cur ? 'current' : m > cur ? 'forecast' : ''}>{fmtCell(colTotal(gridRows.income, m))}</td>)}<td>{money0(fyM.reduce((s, m) => s + colTotal(gridRows.income, m), 0))}</td></tr>
            <tr className="total"><td>Total operating expenses</td>{fyM.map(m => <td key={m} className={m === cur ? 'current' : m > cur ? 'forecast' : ''}>{fmtCell(colTotal(gridRows.operating, m))}</td>)}<td>{money0(fyM.reduce((s, m) => s + colTotal(gridRows.operating, m), 0))}</td></tr>
            <tr className="total"><td>Operating net</td>{fyM.map(m => { const v = colTotal(gridRows.income, m) - colTotal(gridRows.operating, m); return <td key={m} className={`${m === cur ? 'current' : m > cur ? 'forecast' : ''} ${v < 0 ? 'fin-neg' : ''}`}>{money0(v)}</td>; })}<td className={fyM.reduce((s, m) => s + colTotal(gridRows.income, m) - colTotal(gridRows.operating, m), 0) < 0 ? 'fin-neg' : ''}>{money0(fyM.reduce((s, m) => s + colTotal(gridRows.income, m) - colTotal(gridRows.operating, m), 0))}</td></tr>
            <tr className="total"><td>Total capital</td>{fyM.map(m => <td key={m} className={m === cur ? 'current' : m > cur ? 'forecast' : ''}>{fmtCell(colTotal(gridRows.capital, m))}</td>)}<td>{money0(fyM.reduce((s, m) => s + colTotal(gridRows.capital, m), 0))}</td></tr>
            <tr className="total"><td>Cash net</td>{fyM.map(m => { const v = colTotal(gridRows.income, m) - colTotal(gridRows.operating, m) - colTotal(gridRows.capital, m); return <td key={m} className={`${m === cur ? 'current' : m > cur ? 'forecast' : ''} ${v < 0 ? 'fin-neg' : ''}`}>{money0(v)}</td>; })}<td className={fyM.reduce((s, m) => s + colTotal(gridRows.income, m) - colTotal(gridRows.operating, m) - colTotal(gridRows.capital, m), 0) < 0 ? 'fin-neg' : ''}>{money0(fyM.reduce((s, m) => s + colTotal(gridRows.income, m) - colTotal(gridRows.operating, m) - colTotal(gridRows.capital, m), 0))}</td></tr>
          </tbody>
        </table></div>
      </div>
    </div>
  );
}

function GridGroup({ label, rows, months, fmt }) {
  return (
    <>
      <tr className="group"><td>{label}</td><td colSpan={months.length + 1} /></tr>
      {rows.map(r => (
        <tr key={r.category}>
          <td title={categoryLabel(r.category)}>{categoryShort(r.category)}</td>
          {months.map(m => { const c = r.cells[m]; return <td key={m} className={`${c.kind === 'current' ? 'current' : c.kind === 'forecast' ? 'forecast' : ''}${c.override ? ' override' : ''}`} title={c.origin || (c.kind === 'current' ? `Month to date ${money(c.mtd)}` : '')}>{fmt(c.value)}</td>; })}
          <td style={{ fontWeight: 700 }}>{money0(months.reduce((s, m) => s + r.cells[m].value, 0))}</td>
        </tr>
      ))}
    </>
  );
}
