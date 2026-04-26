import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';

export default function Bonds() {
  const { data, update } = useStore();
  const [tab, setTab]   = useState('held');
  const [sort, setSort] = useState({ col: 'amount', dir: 'desc' });

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

  const sortBonds = (list) => [...list].sort((a, b) => {
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
    if (sort.col === 'amount') return ((Number(a.bond?.amount) || 0) - (Number(b.bond?.amount) || 0)) * mul;
    if (sort.col === 'method') return (a.bond?.method || '').localeCompare(b.bond?.method || '') * mul;
    if (sort.col === 'rental') return (a.status || '').localeCompare(b.status || '') * mul;
    return 0;
  });

  const withBond   = data.rentals.filter(r => r.bond?.amount);
  const held       = withBond.filter(r => r.bond.status === 'held');
  const returned   = withBond.filter(r => r.bond.status === 'returned');
  const totalHeld     = held.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);
  const totalReturned = returned.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);

  const markReturned = (r) => update('rentals', r.id, { bond: { ...r.bond, status: 'returned' } });

  const BondRow = ({ r }) => {
    const c = data.customers.find(x => x.id === r.customerId);
    const v = data.vehicles.find(x => x.id === r.vehicleId);
    return (
      <tr>
        <td className="fw-500">{c?.name || '—'}</td>
        <td>{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
        <td><span className="fw-600">${r.bond.amount}</span></td>
        <td className="col-hide-mobile" style={{ textTransform: 'capitalize' }}>{r.bond.method}</td>
        <td><Badge variant={r.bond.status === 'held' ? 'amber' : 'green'}>{r.bond.status}</Badge></td>
        <td><Badge variant={r.status === 'active' ? 'blue' : 'gray'}>{r.status}</Badge></td>
        <td>{r.bond.status === 'held' && <button className="btn btn-secondary btn-sm" onClick={() => markReturned(r)}>Mark Returned</button>}</td>
      </tr>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bonds</h1>
      </div>

      <div className="grid-2 mb-24">
        <div className="stat-card" style={{ borderTopColor: 'var(--amber)', cursor: 'default' }}>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>${totalHeld.toLocaleString()}</div>
          <div className="stat-label">Currently Held</div>
          <div className="text-sm text-muted">{held.length} bond{held.length !== 1 ? 's' : ''} outstanding</div>
        </div>
        <div className="stat-card" style={{ borderTopColor: 'var(--accent)', cursor: 'default' }}>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>${totalReturned.toLocaleString()}</div>
          <div className="stat-label">Total Returned</div>
          <div className="text-sm text-muted">{returned.length} bond{returned.length !== 1 ? 's' : ''} returned</div>
        </div>
      </div>

      <div className="mb-16">
        <Tabs tabs={[{ label: 'Held', value: 'held', count: held.length }, { label: 'Returned', value: 'returned', count: returned.length }]} active={tab} onChange={setTab} />
      </div>

      <div className="card">
        {tab === 'held' && (held.length === 0
          ? <EmptyState message="No bonds currently held" />
          : <div className="table-wrap"><table className="table">
              <thead><tr>
                <SortTh col="customer">Customer</SortTh>
                <SortTh col="vehicle">Vehicle</SortTh>
                <SortTh col="amount">Amount</SortTh>
                <SortTh col="method" className="col-hide-mobile">Method</SortTh>
                <th>Bond</th>
                <SortTh col="rental">Rental</SortTh>
                <th></th>
              </tr></thead>
              <tbody>{sortBonds(held).map(r => <BondRow key={r.id} r={r} />)}</tbody>
            </table></div>
        )}
        {tab === 'returned' && (returned.length === 0
          ? <EmptyState message="No bonds returned yet" />
          : <div className="table-wrap"><table className="table">
              <thead><tr>
                <SortTh col="customer">Customer</SortTh>
                <SortTh col="vehicle">Vehicle</SortTh>
                <SortTh col="amount">Amount</SortTh>
                <SortTh col="method" className="col-hide-mobile">Method</SortTh>
                <th>Bond</th>
                <SortTh col="rental">Rental</SortTh>
                <th></th>
              </tr></thead>
              <tbody>{sortBonds(returned).map(r => <BondRow key={r.id} r={r} />)}</tbody>
            </table></div>
        )}
      </div>
    </div>
  );
}
