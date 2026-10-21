import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Badge from '../components/shared/Badge';
import { bondLabel, bondVariant } from '../utils/bond';
import EmptyState from '../components/shared/EmptyState';
import { formatDate, daysUntil, todayStr } from '../utils/dates';
import { useFinance } from '../finance/FinanceContext';
import { overdueRentals } from '../finance/rent';

export default function Dashboard() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [sort, setSort] = useState({ col: 'payDay', dir: 'asc' });

  const toggleSort = (col) =>
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const SortTh = ({ col, children, className }) => {
    const active = sort.col === col;
    return (
      <th className={className} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
          {active && sort.dir === 'desc' ? '▼' : '▲'}
        </span>
      </th>
    );
  };

  const activeRentals = [...data.rentals.filter(r => r.status === 'active')].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'customer') {
      const ac = data.customers.find(x => x.id === a.customerId)?.name || '';
      const bc = data.customers.find(x => x.id === b.customerId)?.name || '';
      return ac.localeCompare(bc) * mul;
    }
    if (sort.col === 'vehicle') {
      const av = data.vehicles.find(x => x.id === a.vehicleId)?.plate || '';
      const bv = data.vehicles.find(x => x.id === b.vehicleId)?.plate || '';
      return av.localeCompare(bv) * mul;
    }
    if (sort.col === 'startDate') return (a.startDate || '').localeCompare(b.startDate || '') * mul;
    if (sort.col === 'bond') return ((Number(a.bond?.amount) || 0) - (Number(b.bond?.amount) || 0)) * mul;
    if (sort.col === 'price') return ((Number(a.price) || 0) - (Number(b.price) || 0)) * mul;
    if (sort.col === 'payDay') {
      const day = (d) => { if (!d) return -1; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).getDay(); };
      return (day(a.startDate) - day(b.startDate)) * mul;
    }
    return 0;
  });
  const availableVehicles = data.vehicles.filter(v => v.status === 'available');
  const heldBonds = data.rentals.filter(r => r.bond?.status === 'held');
  const totalBondHeld = heldBonds.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);
  // Fixed-price rentals are excluded: their price is a one-off amount for the whole period, not per week.
  const weeklyRentals = activeRentals.filter(r => r.billingPeriod !== 'fixed');
  const fixedCount = activeRentals.length - weeklyRentals.length;
  const weeklyRevenue = weeklyRentals.reduce((s, r) => s + (Number(r.price) || 0), 0);
  const rentalsWithPrice = weeklyRentals.filter(r => r.price).length;

  const fin = useFinance();
  const overdue = fin && !fin.error && !fin.loading ? overdueRentals({ rentals: data.rentals, transactions: fin.transactions, subscriptions: fin.subscriptions, today: todayStr() }) : [];

  const alerts = [];
  data.vehicles.forEach(v => {
    if (v.status === 'stolen' || v.status === 'sold') return;
    if (v.regoExpiry) {
      const d = daysUntil(v.regoExpiry);
      if (d !== null && d <= 30)
        alerts.push({ type: d < 0 ? 'danger' : 'warn', text: `${v.plate}${v.name ? ' · ' + v.name : ''} — rego ${d < 0 ? `expired ${Math.abs(d)}d ago` : `expires in ${d}d`}`, to: '/vehicles' });
    }
    if (v.nextServiceDate) {
      const d = daysUntil(v.nextServiceDate);
      if (d !== null && d <= 14)
        alerts.push({ type: d < 0 ? 'danger' : 'warn', text: `${v.plate}${v.name ? ' · ' + v.name : ''} — service ${d < 0 ? `overdue by ${Math.abs(d)}d` : `due in ${d}d`}`, to: '/maintenance' });
    }
  });

  const stats = [
    { label: 'Vehicles', value: data.vehicles.length, sub: `${availableVehicles.length} available`, color: 'var(--accent)', to: '/vehicles' },
    { label: 'Weekly Revenue', value: `$${weeklyRevenue.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`, sub: `${weeklyRentals.length} weekly · ${rentalsWithPrice} priced${fixedCount ? ` · ${fixedCount} fixed-price excluded` : ''}`, color: 'var(--blue)', to: '/rentals' },
    { label: 'Bonds Held', value: `$${totalBondHeld.toLocaleString()}`, sub: `${heldBonds.length} outstanding`, color: 'var(--amber)', to: '/bonds' },
    { label: 'Alerts', value: alerts.length + overdue.length, sub: overdue.length ? `${overdue.length} rent overdue` : alerts.length ? 'Needs attention' : 'All clear', color: alerts.length + overdue.length ? 'var(--red)' : 'var(--accent)', to: '/' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="text-muted text-sm">{new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
      </div>

      <div className="grid-4 mb-24">
        {stats.map((s, i) => (
          <div key={i} className="stat-card" style={{ borderTopColor: s.color }} onClick={() => navigate(s.to)}>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className="text-sm text-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      {overdue.length > 0 && (
        <div className="card mb-20" style={{ borderColor: 'var(--red)' }}>
          <div className="card-head"><span className="card-title">Rent not received</span><Badge variant="red">{overdue.length}</Badge></div>
          {overdue.map(o => {
            const c = data.customers.find(x => x.id === o.rental.customerId);
            const v = data.vehicles.find(x => x.id === o.rental.vehicleId);
            return (
              <div key={o.rental.id} className="alert-row alert-danger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 10 }}>
                <div style={{ flex: '1 1 240px', fontSize: 14 }}>
                  <div className="fw-600">{c?.name || '—'} · {v?.plate || ''}{o.rental.contractNumber ? ` · ${o.rental.contractNumber}` : ''}</div>
                  <div className="text-sm text-muted">{o.reason}.{o.lastPaid ? ` Last paid ${formatDate(o.lastPaid)}.` : ''}{o.amount ? ` Expected $${o.amount}${o.rental.billingPeriod === 'fixed' ? '' : ' / week'}.` : ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {c?.phone && <a className="btn btn-secondary btn-sm" href={`tel:${c.phone.replace(/\s/g, '')}`} style={{ textDecoration: 'none' }}>Call</a>}
                  {c?.phone && <a className="btn btn-secondary btn-sm" href={`sms:${c.phone.replace(/\s/g, '')}?&body=${encodeURIComponent(`Hi ${(c.name || '').split(' ')[0]}, the weekly rent for the ${v?.name || v?.plate || 'scooter'} hasn't come through this week. Could you check the payment? Thanks, Easy Aussie`)}`} style={{ textDecoration: 'none' }}>Text</a>}
                  {c?.email && <a className="btn btn-secondary btn-sm" href={`mailto:${c.email}`} style={{ textDecoration: 'none' }}>Email</a>}
                  <button className="btn btn-ghost btn-sm" onClick={() => navigate('/rentals')}>Rental</button>
                </div>
              </div>
            );
          })}
          <div className="text-sm text-muted" style={{ padding: '8px 20px' }}>Based on rental income lines in Finance (Stripe syncs daily) with a 2-day grace. A cash or bank payment counts once it is recorded or confirmed against the rental.</div>
        </div>
      )}

      <div className="card mb-20">
        <div className="card-head">
          <span className="card-title">Alerts</span>
          {alerts.length > 0 && <Badge variant="red">{alerts.length}</Badge>}
        </div>
        {alerts.length === 0
          ? <EmptyState message="No alerts — everything is up to date" />
          : <div>
            {alerts.map((a, i) => (
              <div key={i} className={`alert-row alert-${a.type}`} onClick={() => navigate(a.to)}>
                <div style={{ flex: 1, fontSize: 14 }}>{a.text}</div>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>→</span>
              </div>
            ))}
          </div>
        }
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Active Rentals</span>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate('/rentals')}>View all</button>
        </div>
        {activeRentals.length === 0
          ? <EmptyState message="No active rentals" action={
            <button className="btn btn-primary btn-sm" onClick={() => navigate('/rentals')}>Create rental</button>
          } />
          : <div className="table-wrap"><table className="table">
            <thead><tr>
              <SortTh col="customer">Customer</SortTh>
              <SortTh col="vehicle">Vehicle</SortTh>
              <SortTh col="startDate" className="col-hide-mobile">Started</SortTh>
              <SortTh col="payDay">Pay Day</SortTh>
              <SortTh col="price">Price</SortTh>
              <SortTh col="bond">Bond</SortTh>
            </tr></thead>
            <tbody>
              {activeRentals.map(r => {
                const c = data.customers.find(x => x.id === r.customerId);
                const v = data.vehicles.find(x => x.id === r.vehicleId);
                const payDay = r.startDate ? (() => { const [y, m, d] = r.startDate.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long' }); })() : '—';
                return (
                  <tr key={r.id} onClick={() => navigate('/rentals')}>
                    <td className="fw-500">{c?.name || '—'}</td>
                    <td>{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
                    <td className="text-muted col-hide-mobile">{formatDate(r.startDate)}</td>
                    <td className="text-muted">{payDay}</td>
                    <td className="text-muted">{r.price ? `$${Number(r.price).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${r.billingPeriod === 'fixed' ? ' total' : '/wk'}` : '—'}</td>
                    <td>
                      {r.bond?.amount
                        ? <Badge variant={bondVariant(r.bond.status)}>{r.bond.status === 'held' ? `Held $${r.bond.amount}` : bondLabel(r.bond.status)}</Badge>
                        : <span className="text-muted text-sm">None</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        }
      </div>
    </div>
  );
}
