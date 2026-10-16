import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Badge from '../../components/shared/Badge';
import EmptyState from '../../components/shared/EmptyState';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { vehicleSummary } from '../../finance/vehicles';
import { serviceLogByVehicle } from '../../finance/maintenanceLink';
import { categoryLabel, fyLabel, fyOf, money, money0 } from '../../finance/categories';
import { formatDate, todayStr } from '../../utils/dates';
import { StatCard } from './bits';

export default function VehiclesFinance({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const navigate = useNavigate();
  const [today] = useState(() => todayStr());
  const [period, setPeriod] = useState('all');
  const [openId, setOpenId] = useState(null);
  const fy = fyOf(today);
  const { rows, unattributed } = useMemo(() => vehicleSummary(fin.transactions, data.rentals, data.vehicles, today), [fin.transactions, data.rentals, data.vehicles, today]);
  const log = useMemo(() => serviceLogByVehicle(data.maintenance), [data.maintenance]);
  const logGap = Object.values(log).reduce((s, l) => s + l.notInFinance, 0);
  const logUnlinked = Object.values(log).reduce((s, l) => s + l.unlinked, 0);
  const inc = (r) => period === 'fy' ? r.incomeFy : r.income;
  const exp = (r) => period === 'fy' ? r.expensesFy : r.expenses;
  const sorted = [...rows].sort((a, b) => (inc(b) - exp(b)) - (inc(a) - exp(a)));
  const totals = rows.reduce((a, r) => ({ income: a.income + inc(r), expenses: a.expenses + exp(r), price: a.price + r.purchasePrice }), { income: 0, expenses: 0, price: 0 });
  const best = sorted[0];
  const worst = [...sorted].reverse().find(r => inc(r) || exp(r));

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">What each vehicle has earned against what it has cost. Income follows the rental on the line; expenses need the vehicle set.</div></div>
        <div className="tabs" style={{ padding: 3 }}><button className={`tab${period === 'fy' ? ' active' : ''}`} onClick={() => setPeriod('fy')}>{fyLabel(fy)}</button><button className={`tab${period === 'all' ? ' active' : ''}`} onClick={() => setPeriod('all')}>All time</button></div>
      </div>

      <div className="grid-4 mb-20">
        <StatCard color="var(--accent)" value={money0(totals.income)} label="Income attributed to vehicles" sub={unattributed.income ? `${money0(unattributed.income)} more income has no vehicle yet` : 'All income has a vehicle'} />
        <StatCard color="var(--red)" value={money0(totals.expenses)} label="Expenses charged to vehicles" sub={unattributed.expenses ? `${money0(unattributed.expenses)} is fleet-wide or unassigned` : 'All expenses have a vehicle'} />
        <StatCard color={logGap ? 'var(--amber)' : 'var(--blue)'} value={logGap ? money0(logGap) : (best ? best.vehicle.plate : '—')} label={logGap ? 'Service log not in Finance' : 'Best earner'} sub={logGap ? `${logUnlinked} job${logUnlinked > 1 ? 's' : ''} with a cost but no payment linked` : (best ? `net ${money0(inc(best) - exp(best))}` : '')} onClick={logGap ? () => navigate('/maintenance') : undefined} />
        <StatCard color="var(--amber)" value={worst ? worst.vehicle.plate : '—'} label="Lowest net" sub={worst ? `net ${money0(inc(worst) - exp(worst))}` : ''} />
      </div>

      <div className="card">
        {rows.length === 0 ? <EmptyState icon="▦" message="No vehicles yet." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Vehicle</th><th className="col-hide-mobile">Status</th><th style={{ textAlign: 'right' }}>Income</th><th style={{ textAlign: 'right' }}>Expenses</th><th style={{ textAlign: 'right' }}>Net</th><th className="col-hide-mobile" style={{ textAlign: 'right' }}>Purchase</th><th className="col-hide-mobile">Recovered</th><th></th></tr></thead>
            <tbody>
              {sorted.map(r => {
                const net = inc(r) - exp(r);
                const rec = r.purchasePrice ? Math.max(0, r.net) / r.purchasePrice : null;
                const cats = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]);
                return (
                  <VehicleRow key={r.vehicle.id} r={r} net={net} rec={rec} cats={cats} inc={inc(r)} exp={exp(r)} open={openId === r.vehicle.id} log={log[r.vehicle.id]}
                    onToggle={() => setOpenId(openId === r.vehicle.id ? null : r.vehicle.id)}
                    onView={() => go('transactions', { vehicle: r.vehicle.id })} onOpen={() => navigate('/vehicles')} />
                );
              })}
              <tr style={{ cursor: 'default' }}><td className="fw-600">Fleet</td><td className="col-hide-mobile"></td><td style={{ textAlign: 'right' }} className="fw-600">{money0(totals.income)}</td><td style={{ textAlign: 'right' }} className="fw-600">{money0(totals.expenses)}</td><td style={{ textAlign: 'right' }} className="fw-600">{money0(totals.income - totals.expenses)}</td><td className="col-hide-mobile" style={{ textAlign: 'right' }}>{money0(totals.price)}</td><td className="col-hide-mobile"></td><td></td></tr>
            </tbody>
          </table></div>
        )}
      </div>
      <div className="text-sm text-muted" style={{ marginTop: 10 }}>Recovered = all-time net ÷ purchase price. Fleet-wide costs such as insurance for all vehicles, marketing and software are not spread across vehicles here.</div>
    </div>
  );
}

function VehicleRow({ r, net, rec, cats, inc, exp, open, onToggle, onView, onOpen, log }) {
  const v = r.vehicle;
  return (
    <>
      <tr onClick={onToggle} style={{ opacity: ['sold', 'stolen'].includes(v.status) ? 0.6 : 1 }}>
        <td><div className="fw-600">{v.plate}</div><div className="text-sm text-muted">{v.name || v.type}{r.rentals ? ` · ${r.rentals} rental${r.rentals > 1 ? 's' : ''} · ${r.daysRented} days` : ' · never rented'}</div></td>
        <td className="col-hide-mobile"><Badge variant={v.status === 'rented' ? 'blue' : v.status === 'available' ? 'green' : 'gray'}>{v.status}</Badge></td>
        <td style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 600 }}>{inc ? money(inc) : <span className="text-muted">—</span>}</td>
        <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 600 }}>{exp ? money(exp) : <span className="text-muted">—</span>}</td>
        <td style={{ textAlign: 'right', fontWeight: 700, color: net < 0 ? 'var(--red)' : 'inherit' }}>{inc || exp ? money(net) : <span className="text-muted">—</span>}</td>
        <td className="col-hide-mobile" style={{ textAlign: 'right' }}>{r.purchasePrice ? money0(r.purchasePrice) : <span className="text-muted">—</span>}</td>
        <td className="col-hide-mobile">{rec == null ? <span className="text-muted">no price</span> : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div style={{ width: 70, height: 6, background: 'var(--border)', borderRadius: 3 }}><div style={{ width: `${Math.min(100, rec * 100)}%`, height: 6, background: rec >= 1 ? 'var(--accent)' : 'var(--amber)', borderRadius: 3 }} /></div><span className="text-sm">{Math.round(rec * 100)}%</span></div>)}</td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}><button className="btn btn-ghost btn-sm" onClick={onView}>Transactions</button><button className="btn btn-secondary btn-sm" onClick={onOpen}>Vehicle</button></td>
      </tr>
      {open && (
        <tr style={{ cursor: 'default' }}><td colSpan={8} style={{ background: 'var(--bg)', padding: '10px 16px 14px' }}>
          <div className="label" style={{ marginBottom: 6 }}>Expenses by category · all time</div>
          {cats.length === 0 ? <div className="text-sm text-muted">No expenses attributed to this vehicle yet. Set the vehicle on a transaction, or add a rule with the plate.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {cats.map(([c, val]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between', background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}><span>{categoryLabel(c)}</span><span className="fw-600">{money(val)}</span></div>)}
            </div>)}
          {log && <div className="text-sm" style={{ marginTop: 8, color: log.notInFinance ? 'var(--amber)' : 'var(--muted)' }}>Service log: {money(log.logged)} of jobs recorded{log.notInFinance ? `, ${money(log.notInFinance)} across ${log.unlinked} job${log.unlinked > 1 ? 's' : ''} has no payment linked and is not counted above` : ', all linked to payments'}.</div>}
          <div className="text-sm text-muted" style={{ marginTop: 8 }}>All time: income {money(r.income)} · expenses {money(r.expenses)} · net {money(r.net)}{r.last ? ` · last line ${formatDate(r.last)}` : ''}{v.purchaseDate ? ` · bought ${formatDate(v.purchaseDate)}` : ''}</div>
        </td></tr>
      )}
    </>
  );
}
