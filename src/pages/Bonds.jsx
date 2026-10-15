import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, todayStr } from '../utils/dates';
import { bondLabel, bondVariant, closedBondStatus, isBondClosed } from '../utils/bond';

export default function Bonds() {
  const { data, update } = useStore();
  const [tab, setTab]   = useState('held');
  const [sort, setSort] = useState({ col: 'amount', dir: 'desc' });

  const toggleSort = (col) =>
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const sortTh = (col, children, className) => {
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
  const awaiting   = withBond.filter(r => r.bond.status === 'awaiting');
  const closed     = withBond.filter(r => isBondClosed(r.bond));
  const totalHeld     = held.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);
  const totalAwaiting = awaiting.reduce((s, r) => s + (Number(r.bond.amount) || 0), 0);
  const totalRetained = closed.reduce((s, r) => s + (Number(r.bond.retainedAmount) || 0), 0);

  // Manual flip when a refund is final without going through Finance › Reconcile.
  const markRefunded = (r) => {
    const amount = Number(r.bond.amount) || 0;
    const refunded = r.bond.refundedAmount === '' ? amount : Number(r.bond.refundedAmount);
    return update('rentals', r.id, { bond: { ...r.bond, refundedAmount: String(refunded), retainedAmount: String(amount - refunded), refundDate: todayStr(), status: closedBondStatus(amount, refunded) } });
  };
  const markHeld = (r) => update('rentals', r.id, { bond: { ...r.bond, status: 'held' } });

  const bondRow = (r) => {
    const c = data.customers.find(x => x.id === r.customerId);
    const v = data.vehicles.find(x => x.id === r.vehicleId);
    const refundPending = r.bond.status === 'held' && r.bond.refundedAmount !== '' && Number(r.bond.refundedAmount) > 0;
    return (
      <tr key={r.id}>
        <td className="fw-500">{c?.name || '—'}</td>
        <td>{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
        <td><span className="fw-600">${r.bond.amount}</span></td>
        <td className="col-hide-mobile" style={{ textTransform: 'capitalize' }}>{r.bond.method}</td>
        <td>
          <Badge variant={bondVariant(r.bond.status)}>{bondLabel(r.bond.status)}</Badge>
          {refundPending && <div className="text-sm text-muted" style={{ marginTop: 4 }}>Refund ${r.bond.refundedAmount} pending</div>}
          {isBondClosed(r.bond) && Number(r.bond.retainedAmount) > 0 && <div className="text-sm text-muted" style={{ marginTop: 4 }}>Kept ${r.bond.retainedAmount}{r.bond.retainReason ? ` · ${r.bond.retainReason}` : ''}</div>}
          {isBondClosed(r.bond) && r.bond.refundDate && <div className="text-sm text-muted">{formatDate(r.bond.refundDate)}</div>}
        </td>
        <td><Badge variant={r.status === 'active' ? 'blue' : 'gray'}>{r.status}</Badge></td>
        <td>
          {r.bond.status === 'held' && <button className="btn btn-secondary btn-sm" onClick={() => markRefunded(r)}>{refundPending ? 'Refund done' : 'Mark refunded'}</button>}
          {r.bond.status === 'awaiting' && <button className="btn btn-secondary btn-sm" onClick={() => markHeld(r)}>Received</button>}
        </td>
      </tr>
    );
  };

  const table = (rows, empty) => rows.length === 0
    ? <EmptyState message={empty} />
    : <div className="table-wrap"><table className="table">
        <thead><tr>
          {sortTh('customer', 'Customer')}
          {sortTh('vehicle', 'Vehicle')}
          {sortTh('amount', 'Amount')}
          {sortTh('method', 'Method', 'col-hide-mobile')}
          <th>Bond</th>
          {sortTh('rental', 'Rental')}
          <th></th>
        </tr></thead>
        <tbody>{sortBonds(rows).map(bondRow)}</tbody>
      </table></div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Bonds</h1>
      </div>

      <div className="grid-4 mb-24" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="stat-card" style={{ borderTopColor: 'var(--amber)', cursor: 'default' }}>
          <div className="stat-value" style={{ color: 'var(--amber)' }}>${totalHeld.toLocaleString()}</div>
          <div className="stat-label">Currently held</div>
          <div className="text-sm text-muted">{held.length} bond{held.length !== 1 ? 's' : ''} · owed back to customers</div>
        </div>
        <div className="stat-card" style={{ borderTopColor: 'var(--blue)', cursor: 'default' }}>
          <div className="stat-value" style={{ color: 'var(--blue)' }}>${totalAwaiting.toLocaleString()}</div>
          <div className="stat-label">Awaiting payment</div>
          <div className="text-sm text-muted">{awaiting.length} not received yet</div>
        </div>
        <div className="stat-card" style={{ borderTopColor: 'var(--accent)', cursor: 'default' }}>
          <div className="stat-value" style={{ color: 'var(--accent)' }}>${totalRetained.toLocaleString()}</div>
          <div className="stat-label">Retained as income</div>
          <div className="text-sm text-muted">{closed.length} bond{closed.length !== 1 ? 's' : ''} closed</div>
        </div>
      </div>

      <div className="mb-16">
        <Tabs tabs={[
          { label: 'Held', value: 'held', count: held.length },
          { label: 'Awaiting', value: 'awaiting', count: awaiting.length },
          { label: 'Closed', value: 'closed', count: closed.length },
        ]} active={tab} onChange={setTab} />
      </div>

      <div className="card">
        {tab === 'held' && table(held, 'No bonds currently held')}
        {tab === 'awaiting' && table(awaiting, 'No bonds waiting to be paid')}
        {tab === 'closed' && table(closed, 'No bonds refunded or retained yet')}
      </div>
    </div>
  );
}
