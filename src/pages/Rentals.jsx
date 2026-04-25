import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import Modal from '../components/shared/Modal';
import Drawer from '../components/shared/Drawer';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysBetween, todayStr } from '../utils/dates';

const EF = {
  customerId: '', vehicleId: '', startDate: todayStr(), endDate: '', shopifyRef: '', contractRef: '', notes: '',
  bond: { amount: '', method: 'cash', status: 'held' },
};

export default function Rentals() {
  const { data, add, update } = useStore();
  const navigate = useNavigate();
  const [tab, setTab]             = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editR, setEditR]         = useState(null);
  const [detailR, setDetailR]     = useState(null);
  const [endR, setEndR]           = useState(null);
  const [retainedAmount, setRetainedAmount] = useState('');
  const [retainedNote, setRetainedNote]     = useState('');
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState(EF);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sb = (k, v) => setForm(f => ({ ...f, bond: { ...f.bond, [k]: v } }));

  const active    = data.rentals.filter(r => r.status === 'active');
  const past      = data.rentals.filter(r => r.status === 'completed');
  const available = data.vehicles.filter(v => v.status === 'available');

  const activeCustomerIds = new Set(active.map(r => r.customerId));
  const availableCustomers = (currentCustomerId) =>
    data.customers.filter(c => !activeCustomerIds.has(c.id) || c.id === currentCustomerId);

  const openEdit = (r, e) => {
    e?.stopPropagation();
    setEditR(r);
    setForm({
      customerId: r.customerId || '',
      vehicleId:  r.vehicleId  || '',
      startDate:  r.startDate  || '',
      endDate:    r.endDate    || '',
      shopifyRef: r.shopifyRef || '',
      contractRef: r.contractRef || '',
      notes:      r.notes      || '',
      bond: { amount: r.bond?.amount || '', method: r.bond?.method || 'cash', status: r.bond?.status || 'held' },
    });
  };

  const createRental = async () => {
    if (!form.customerId) { alert('Please select a customer'); return; }
    if (!form.vehicleId)  { alert('Please select a vehicle'); return; }
    if (!form.startDate)  { alert('Start date is required'); return; }
    const bondAmount = form.bond.amount || data.settings?.defaultBond || '300';
    setSaving(true);
    try {
      const rental = await add('rentals', { ...form, bond: { ...form.bond, amount: bondAmount }, status: 'active' });
      await update('vehicles', form.vehicleId, { status: 'rented' });
      setShowCreate(false);
      setForm(EF);
      if (window.confirm('Rental created! Generate contract now?')) {
        navigate('/contract', { state: { rentalId: rental.id } });
      }
    } finally { setSaving(false); }
  };

  const saveRental = async () => {
    if (!form.customerId) { alert('Please select a customer'); return; }
    if (!form.vehicleId)  { alert('Please select a vehicle'); return; }
    if (!form.startDate)  { alert('Start date is required'); return; }
    setSaving(true);
    try {
      // If vehicle changed on an active rental, update both vehicle statuses
      if (editR.status === 'active' && editR.vehicleId !== form.vehicleId) {
        await update('vehicles', editR.vehicleId, { status: 'available' });
        await update('vehicles', form.vehicleId,  { status: 'rented' });
      }
      await update('rentals', editR.id, { ...form });
      // Refresh the detail drawer if it's open for this rental
      if (detailR?.id === editR.id) setDetailR({ ...detailR, ...form });
      setEditR(null);
      setForm(EF);
    } finally { setSaving(false); }
  };

  const endRental = async (mode) => {
    // mode: 'return' | 'partial' | 'keep'
    const r = endR;
    let bondUpdate = r.bond ? { ...r.bond } : r.bond;
    if (r.bond) {
      if (mode === 'return') {
        bondUpdate = { ...r.bond, status: 'returned' };
      } else if (mode === 'partial') {
        const kept = parseFloat(retainedAmount);
        bondUpdate = { ...r.bond, amount: isNaN(kept) ? r.bond.amount : String(kept), status: 'held' };
      }
    }
    const noteAppend = retainedNote.trim()
      ? (r.notes ? `${r.notes}\nBond retained: ${retainedNote.trim()}` : `Bond retained: ${retainedNote.trim()}`)
      : r.notes;
    await update('rentals', r.id, { status: 'completed', endDate: todayStr(), bond: bondUpdate, notes: noteAppend });
    await update('vehicles', r.vehicleId, { status: 'available' });
    setEndR(null);
    setRetainedAmount('');
    setRetainedNote('');
    if (detailR?.id === r.id) setDetailR(null);
  };

  const markBondReturned = async (rental) => {
    await update('rentals', rental.id, { bond: { ...rental.bond, status: 'returned' } });
    setDetailR(r => r ? { ...r, bond: { ...r.bond, status: 'returned' } } : r);
  };

  // Vehicles available for selection in a form; for editing include the currently assigned one
  const vehicleOptions = (currentVehicleId) =>
    data.vehicles.filter(v => v.status === 'available' || v.id === currentVehicleId);

  const renderForm = (opts, customerOpts) => (
    <>
      <div className="grid-2">
        <div className="field">
          <label className="label">Customer *</label>
          <select className="select" value={form.customerId} onChange={e => sf('customerId', e.target.value)}>
            <option value="">Select customer…</option>
            {customerOpts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {data.customers.length === 0 && <span className="field-hint">No customers yet — add one first</span>}
        </div>
        <div className="field">
          <label className="label">Vehicle *</label>
          <select className="select" value={form.vehicleId} onChange={e => sf('vehicleId', e.target.value)}>
            <option value="">Select vehicle…</option>
            {opts.map(v => <option key={v.id} value={v.id}>{v.plate}{v.name ? ' · ' + v.name : ''} ({v.type})</option>)}
          </select>
          {opts.length === 0 && <span className="field-hint" style={{ color: 'var(--amber)' }}>No vehicles available</span>}
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Start Date *</label><input className="input" type="date" value={form.startDate} onChange={e => sf('startDate', e.target.value)} /></div>
        <div className="field"><label className="label">End Date (optional)</label><input className="input" type="date" value={form.endDate} onChange={e => sf('endDate', e.target.value)} /></div>
      </div>
      <div className="form-divider"><span>Bond / Deposit</span></div>
      <div className="grid-2">
        <div className="field">
          <label className="label">Amount ($)</label>
          <input className="input" type="number" min="0" value={form.bond.amount} onChange={e => sb('amount', e.target.value)} placeholder={data.settings?.defaultBond || '300'} />
        </div>
        <div className="field">
          <label className="label">Payment Method</label>
          <select className="select" value={form.bond.method} onChange={e => sb('method', e.target.value)}>
            <option value="cash">Cash</option>
            <option value="payid">Bank Transfer (PayID)</option>
            <option value="card">Card</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="label">Bond Status</label>
          <select className="select" value={form.bond.status} onChange={e => sb('status', e.target.value)}>
            <option value="held">Held</option>
            <option value="returned">Returned</option>
          </select>
        </div>
      </div>
      <div className="form-divider"><span>References</span></div>
      <div className="grid-2">
        <div className="field"><label className="label">Shopify Order #</label><input className="input" value={form.shopifyRef} onChange={e => sf('shopifyRef', e.target.value)} placeholder="Optional" /></div>
        <div className="field"><label className="label">Contract Reference</label><input className="input" value={form.contractRef} onChange={e => sf('contractRef', e.target.value)} placeholder="URL or reference" /></div>
      </div>
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} /></div>
    </>
  );

  const RentalRow = ({ r, showEnd }) => {
    const c   = data.customers.find(x => x.id === r.customerId);
    const v   = data.vehicles.find(x => x.id === r.vehicleId);
    const dur = r.startDate ? daysBetween(r.startDate, r.endDate || todayStr()) : 0;
    return (
      <tr onClick={() => setDetailR(r)}>
        <td className="fw-500">{c?.name || '—'}</td>
        <td>
          <div className="fw-500">{v?.plate || '—'}</div>
          <div className="text-sm text-muted">{v ? (v.name || v.type) : ''}</div>
        </td>
        <td className="text-muted">{formatDate(r.startDate)}</td>
        <td className="text-muted">{r.status === 'active' ? `${dur}d` : formatDate(r.endDate)}</td>
        <td>
          {r.bond?.amount
            ? <div><div style={{ fontSize: 13, fontWeight: 600 }}>${r.bond.amount}</div><Badge variant={r.bond.status === 'held' ? 'amber' : 'green'}>{r.bond.status}</Badge></div>
            : <span className="text-sm text-muted">None</span>}
        </td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/contract', { state: { rentalId: r.id } })}>Contract</button>
            <button className="btn btn-secondary btn-sm" onClick={e => openEdit(r, e)}>Edit</button>
            {showEnd && <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setEndR(r); setRetainedAmount(r.bond?.amount || ''); }}>End</button>}
          </div>
        </td>
      </tr>
    );
  };

  const selected = detailR ? data.rentals.find(r => r.id === detailR.id) : null;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Rentals</h1>
        <button className="btn btn-primary" onClick={() => { setForm(EF); setShowCreate(true); }}>+ Create Rental</button>
      </div>

      <div className="mb-16">
        <Tabs tabs={[{ label: 'Active', value: 'active', count: active.length }, { label: 'Past', value: 'past', count: past.length }]} active={tab} onChange={setTab} />
      </div>

      <div className="card">
        {tab === 'active' && (active.length === 0
          ? <EmptyState message="No active rentals" action={<button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>Create rental</button>} />
          : <table className="table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Started</th><th>Duration</th><th>Bond</th><th></th></tr></thead>
              <tbody>{active.map(r => <RentalRow key={r.id} r={r} showEnd={true} />)}</tbody>
            </table>
        )}
        {tab === 'past' && (past.length === 0
          ? <EmptyState message="No completed rentals yet" />
          : <table className="table">
              <thead><tr><th>Customer</th><th>Vehicle</th><th>Started</th><th>Ended</th><th>Bond</th><th></th></tr></thead>
              <tbody>{past.map(r => <RentalRow key={r.id} r={r} showEnd={false} />)}</tbody>
            </table>
        )}
      </div>

      {/* Create */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Rental" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancel</button><button className="btn btn-primary" onClick={createRental} disabled={saving}>{saving ? 'Creating…' : 'Create Rental'}</button></>}>
        {renderForm(available, availableCustomers(null))}
      </Modal>

      {/* Edit */}
      <Modal open={!!editR} onClose={() => { setEditR(null); setForm(EF); }} title="Edit Rental" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => { setEditR(null); setForm(EF); }}>Cancel</button><button className="btn btn-primary" onClick={saveRental} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></>}>
        {editR && renderForm(vehicleOptions(editR.vehicleId), availableCustomers(editR.customerId))}
      </Modal>

      {/* End rental */}
      <Modal open={!!endR} onClose={() => { setEndR(null); setRetainedAmount(''); setRetainedNote(''); }} title="End Rental"
        footer={endR && (
          <>
            <button className="btn btn-secondary" onClick={() => { setEndR(null); setRetainedAmount(''); setRetainedNote(''); }}>Cancel</button>
            {endR.bond?.amount && endR.bond.status === 'held' && (
              <button className="btn btn-secondary" onClick={() => endRental('partial')}>End — Keep Partial</button>
            )}
            {endR.bond?.amount && endR.bond.status === 'held' && (
              <button className="btn btn-primary" onClick={() => endRental('return')}>End + Return Bond</button>
            )}
            {(!endR.bond?.amount || endR.bond.status !== 'held') && (
              <button className="btn btn-primary" onClick={() => endRental('keep')}>End Rental</button>
            )}
          </>
        )}>
        {endR && (() => {
          const c = data.customers.find(x => x.id === endR.customerId);
          const v = data.vehicles.find(x => x.id === endR.vehicleId);
          const hasBond = endR.bond?.amount && endR.bond.status === 'held';
          return (
            <div>
              <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--muted)' }}>This will mark the rental as completed and set the vehicle back to available.</p>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: hasBond ? 16 : 0 }}>
                <div className="fw-500" style={{ marginBottom: 4 }}>{c?.name || '—'} · {v?.plate || '—'}{v?.name ? ' · ' + v.name : ''}</div>
                <div className="text-sm text-muted">Started {formatDate(endR.startDate)} · {daysBetween(endR.startDate, todayStr())}d</div>
              </div>
              {hasBond && (
                <div style={{ padding: '14px 16px', background: 'var(--amber-bg)', borderRadius: 10 }}>
                  <div className="fw-600" style={{ fontSize: 13, marginBottom: 10 }}>Bond — ${endR.bond.amount} via {endR.bond.method}</div>
                  <div className="field">
                    <label className="label">Amount retained ($)</label>
                    <input
                      className="input"
                      type="number"
                      min="0"
                      max={endR.bond.amount}
                      value={retainedAmount}
                      onChange={e => setRetainedAmount(e.target.value)}
                      placeholder={endR.bond.amount}
                    />
                  </div>
                  {retainedAmount !== '' && Number(retainedAmount) < Number(endR.bond.amount) && (
                    <div className="text-sm text-muted" style={{ marginTop: 8 }}>
                      Returning ${(Number(endR.bond.amount) - Number(retainedAmount)).toFixed(2)} to customer
                    </div>
                  )}
                  <div className="field" style={{ marginTop: 12 }}>
                    <label className="label">Reason for retaining (optional)</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      value={retainedNote}
                      onChange={e => setRetainedNote(e.target.value)}
                      placeholder="e.g. Scratch on left panel, mirror replacement…"
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>

      {/* Detail drawer */}
      <Drawer open={!!detailR} onClose={() => setDetailR(null)} title="Rental Details">
        {selected && (() => {
          const c = data.customers.find(x => x.id === selected.customerId);
          const v = data.vehicles.find(x => x.id === selected.vehicleId);
          return (
            <div>
              <div style={{ marginBottom: 20 }}><Badge variant={selected.status === 'active' ? 'blue' : 'gray'}>{selected.status}</Badge></div>
              <div className="grid-2 mb-20">
                <div><div className="label">Customer</div><div className="fw-500" style={{ marginTop: 3 }}>{c?.name || '—'}</div></div>
                <div><div className="label">Vehicle</div><div className="fw-500" style={{ marginTop: 3 }}>{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</div></div>
                <div><div className="label">Start Date</div><div style={{ marginTop: 3 }}>{formatDate(selected.startDate)}</div></div>
                <div><div className="label">End Date</div><div style={{ marginTop: 3 }}>{selected.endDate ? formatDate(selected.endDate) : 'Ongoing'}</div></div>
                {selected.shopifyRef && <div><div className="label">Shopify Order</div><div style={{ marginTop: 3 }}>{selected.shopifyRef}</div></div>}
                {selected.contractRef && (
                  <div><div className="label">Contract Ref</div>
                    <div style={{ marginTop: 3 }}>
                      {selected.contractRef.startsWith('http')
                        ? <a href={selected.contractRef} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>View ↗</a>
                        : selected.contractRef}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ background: selected.bond?.amount ? (selected.bond.status === 'held' ? 'var(--amber-bg)' : 'var(--accent-light)') : 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div className="fw-600" style={{ marginBottom: 10, fontSize: 13 }}>Bond / Deposit</div>
                {selected.bond?.amount ? (
                  <>
                    <div className="grid-2">
                      <div><div className="label">Amount</div><div className="fw-600" style={{ marginTop: 3 }}>${selected.bond.amount}</div></div>
                      <div><div className="label">Method</div><div style={{ marginTop: 3, textTransform: 'capitalize' }}>{selected.bond.method}</div></div>
                      <div><div className="label">Status</div><div style={{ marginTop: 3 }}><Badge variant={selected.bond.status === 'held' ? 'amber' : 'green'}>{selected.bond.status}</Badge></div></div>
                    </div>
                    {selected.bond.status === 'held' && (
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => markBondReturned(selected)}>Mark Bond Returned</button>
                    )}
                  </>
                ) : <div className="text-sm text-muted">No bond recorded</div>}
              </div>
              {selected.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: 'var(--muted)' }}>{selected.notes}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={() => navigate('/contract', { state: { rentalId: selected.id } })}>Generate Contract</button>
                <button className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={() => { setDetailR(null); openEdit(selected, null); }}>Edit Rental</button>
                {selected.status === 'active' && (
                  <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={() => { setDetailR(null); setEndR(selected); setRetainedAmount(selected.bond?.amount || ''); }}>End This Rental</button>
                )}
              </div>
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
}
