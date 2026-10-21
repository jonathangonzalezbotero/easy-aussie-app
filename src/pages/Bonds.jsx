import { useState } from 'react';
import Modal from '../components/shared/Modal';
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

  // Move a held bond to another rental of the same customer. The source closes as "transferred"
  // (nothing refunded, nothing retained); the target's bond grows by the amount and becomes held.
  const [moveR, setMoveR] = useState(null);
  const [moveTo, setMoveTo] = useState('');
  const moveTargets = moveR ? data.rentals.filter(r => r.id !== moveR.id && r.customerId === moveR.customerId && r.status === 'active') : [];
  const doMove = async () => {
    const target = data.rentals.find(r => r.id === moveTo);
    if (!target) return;
    const amount = Number(moveR.bond.amount) || 0;
    const tv = data.vehicles.find(v => v.id === target.vehicleId);
    const sv = data.vehicles.find(v => v.id === moveR.vehicleId);
    await update('rentals', target.id, { bond: { ...target.bond, amount: String((Number(target.bond?.amount) || 0) + amount), status: 'held', method: target.bond?.method || moveR.bond.method },
      notes: [target.notes, `Bond $${amount} moved in from ${moveR.contractNumber || sv?.plate || 'previous rental'} on ${todayStr()}`].filter(Boolean).join('\n') });
    await update('rentals', moveR.id, { bond: { ...moveR.bond, status: 'transferred', refundedAmount: '0', retainedAmount: '0', refundDate: todayStr(), retainReason: `Moved to ${target.contractNumber || tv?.plate || 'another rental'}` } });
    setMoveR(null); setMoveTo('');
  };

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
          {r.bond.status === 'transferred' && r.bond.retainReason && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{r.bond.retainReason}</div>}
          {isBondClosed(r.bond) && r.bond.refundDate && <div className="text-sm text-muted">{formatDate(r.bond.refundDate)}</div>}
        </td>
        <td><Badge variant={r.status === 'active' ? 'blue' : 'gray'}>{r.status}</Badge></td>
        <td>
          {r.bond.status === 'held' && <button className="btn btn-secondary btn-sm" onClick={() => markRefunded(r)}>{refundPending ? 'Refund done' : 'Mark refunded'}</button>}
          {r.bond.status === 'held' && <button className="btn btn-ghost btn-sm" onClick={() => { setMoveR(r); setMoveTo(''); }} title="Move this bond to another rental of the same customer">Move</button>}
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

      <div className="grid-4 fin-3 mb-24">
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

      <Modal open={!!moveR} onClose={() => setMoveR(null)} title="Move bond to another rental"
        footer={<><button className="btn btn-secondary" onClick={() => setMoveR(null)}>Cancel</button><button className="btn btn-primary" disabled={!moveTo} onClick={doMove}>Move bond</button></>}>
        {moveR && (
          <>
            <p style={{ fontSize: 14 }}>${moveR.bond.amount} held for <strong>{data.customers.find(c => c.id === moveR.customerId)?.name}</strong> on {moveR.contractNumber || 'this rental'} will be added to the bond of the rental you pick. This rental's bond closes as "moved", with nothing refunded and nothing kept as income.</p>
            {moveTargets.length === 0 ? <div className="text-sm text-muted">This customer has no other active rental. Create the new rental first.</div> : (
              <div className="field"><label className="label">Move to</label>
                <select className="select" value={moveTo} onChange={e => setMoveTo(e.target.value)}>
                  <option value="">Choose rental…</option>
                  {moveTargets.map(r => { const v = data.vehicles.find(x => x.id === r.vehicleId); return <option key={r.id} value={r.id}>{r.contractNumber || formatDate(r.startDate)} · {v?.plate}{r.bond?.amount ? ` · bond now $${r.bond.amount} (${r.bond.status})` : ' · no bond yet'}</option>; })}
                </select></div>
            )}
            <div className="text-sm text-muted">Nothing changes in Finance: the deposits already received stay as bond deposits, and the total held matches the money in the bank.</div>
          </>
        )}
      </Modal>
    </div>
  );
}
