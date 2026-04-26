import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import { formatDate, daysUntil } from '../utils/dates';

export default function Dashboard() {
  const { data } = useStore();
  const navigate = useNavigate();
  const [sort, setSort] = useState({ col: 'startDate', dir: 'desc' });

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
    if (sort.col === 'bond')      return ((Number(a.bond?.amount) || 0) - (Number(b.bond?.amount) || 0)) * mul;
    if (sort.col === 'price')     return ((Number(a.price) || 0) - (Number(b.price) || 0)) * mul;
    if (sort.col === 'payDay') {
      const day = (d) => { if (!d) return -1; const [y,m,dd] = d.split('-').map(Number); return new Date(y,m-1,dd).getDay(); };
      return (day(a.startDate) - day(b.startDate)) * mul;
    }
    return 0;
  });
  const availableVehicles = data.vehicles.filter(v => v.status === 'available');
  const heldBonds         = data.rentals.filter(r => r.bond?.status === 'held');
  const totalBondHeld     = heldBonds.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);

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
    { label: 'Vehicles',      value: data.vehicles.length,  sub: `${availableVehicles.length} available`,                                          color: 'var(--accent)', to: '/vehicles' },
    { label: 'Active Rentals', value: activeRentals.length,  sub: `${data.rentals.filter(r => r.status === 'completed').length} completed total`,   color: 'var(--blue)',   to: '/rentals' },
    { label: 'Bonds Held',    value: `$${totalBondHeld.toLocaleString()}`, sub: `${heldBonds.length} outstanding`,                                  color: 'var(--amber)',  to: '/bonds' },
    { label: 'Alerts',        value: alerts.length,          sub: alerts.length ? 'Needs attention' : 'All clear', color: alerts.length ? 'var(--red)' : 'var(--accent)', to: '/' },
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
                <SortTh col="price">Price/wk</SortTh>
                <SortTh col="bond">Bond</SortTh>
              </tr></thead>
              <tbody>
                {activeRentals.map(r => {
                  const c = data.customers.find(x => x.id === r.customerId);
                  const v = data.vehicles.find(x => x.id === r.vehicleId);
                  const payDay = r.startDate ? (() => { const [y,m,d] = r.startDate.split('-').map(Number); return new Date(y,m-1,d).toLocaleDateString('en-AU', { weekday: 'long' }); })() : '—';
                  return (
                    <tr key={r.id} onClick={() => navigate('/rentals')}>
                      <td className="fw-500">{c?.name || '—'}</td>
                      <td>{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
                      <td className="text-muted col-hide-mobile">{formatDate(r.startDate)}</td>
                      <td className="text-muted">{payDay}</td>
                      <td className="text-muted">{r.price ? `$${Number(r.price).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}` : '—'}</td>
                      <td>
                        {r.bond?.amount
                          ? <Badge variant={r.bond.status === 'held' ? 'amber' : 'green'}>{r.bond.status === 'held' ? `Held $${r.bond.amount}` : 'Returned'}</Badge>
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
