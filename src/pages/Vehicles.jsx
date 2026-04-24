import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Modal from '../components/shared/Modal';
import Drawer from '../components/shared/Drawer';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysUntil } from '../utils/dates';

const EF = {
  plate: '', name: '', make: '', model: '', year: '', colour: '', engineCapacity: '',
  type: 'scooter', fleetGroup: 'business', purchaseDate: '', status: 'available',
  regoExpiry: '', nextServiceDate: '', conditionNotes: '', notes: '',
};

export default function Vehicles() {
  const { data, add, update, remove } = useStore();
  const [showAdd, setShowAdd]   = useState(false);
  const [editV, setEditV]       = useState(null);
  const [detailV, setDetailV]   = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [filter, setFilter]     = useState('all');
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EF);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const vehicles = data.vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchQ = !q || v.plate.toLowerCase().includes(q) || (v.name || '').toLowerCase().includes(q) || (v.make || '').toLowerCase().includes(q) || (v.model || '').toLowerCase().includes(q);
    const matchF = filter === 'all' || v.status === filter;
    return matchQ && matchF;
  });

  const counts = { all: data.vehicles.length, available: 0, rented: 0, maintenance: 0 };
  data.vehicles.forEach(v => { if (counts[v.status] !== undefined) counts[v.status]++; });

  const openAdd  = () => { setForm(EF); setShowAdd(true); };
  const openEdit = (v, e) => { e?.stopPropagation(); setEditV(v); setForm({ ...EF, ...v }); };

  const saveVehicle = async () => {
    if (!form.plate.trim()) { alert('Plate / ID is required'); return; }
    setSaving(true);
    try {
      if (editV) { await update('vehicles', editV.id, form); setEditV(null); }
      else { await add('vehicles', form); setShowAdd(false); }
      setForm(EF);
    } finally { setSaving(false); }
  };

  const doDelete = async () => {
    await remove('vehicles', deleteId);
    if (detailV?.id === deleteId) setDetailV(null);
    setDeleteId(null);
  };

  const statusBadge = (s) => {
    if (s === 'available')  return <Badge variant="green">Available</Badge>;
    if (s === 'rented')     return <Badge variant="blue">Rented</Badge>;
    if (s === 'maintenance') return <Badge variant="amber">Maintenance</Badge>;
    return <Badge variant="gray">{s}</Badge>;
  };

  const renderForm = () => (
    <>
      <div className="grid-2">
        <div className="field"><label className="label">Plate / ID *</label><input className="input" value={form.plate} onChange={e => sf('plate', e.target.value)} placeholder="e.g. 5DW11" /></div>
        <div className="field"><label className="label">Nickname</label><input className="input" value={form.name} onChange={e => sf('name', e.target.value)} placeholder="e.g. White Vespa" /></div>
      </div>
      <div className="form-divider"><span>Vehicle Specs</span></div>
      <div className="grid-2">
        <div className="field"><label className="label">Make</label><input className="input" value={form.make} onChange={e => sf('make', e.target.value)} placeholder="e.g. LONGJIA" /></div>
        <div className="field"><label className="label">Model</label><input className="input" value={form.model} onChange={e => sf('model', e.target.value)} placeholder="e.g. RIVIERA X" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Year</label><input className="input" value={form.year} onChange={e => sf('year', e.target.value)} placeholder="e.g. 2025" /></div>
        <div className="field"><label className="label">Colour</label><input className="input" value={form.colour} onChange={e => sf('colour', e.target.value)} placeholder="e.g. WHITE" /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Engine Capacity</label><input className="input" value={form.engineCapacity} onChange={e => sf('engineCapacity', e.target.value)} placeholder="e.g. 50cc" /></div>
        <div className="field"><label className="label">Type</label>
          <select className="select" value={form.type} onChange={e => sf('type', e.target.value)}>
            <option value="scooter">Scooter</option><option value="ebike">E-bike</option>
          </select>
        </div>
      </div>
      <div className="form-divider"><span>Fleet &amp; Status</span></div>
      <div className="grid-2">
        <div className="field"><label className="label">Fleet Group</label>
          <select className="select" value={form.fleetGroup} onChange={e => sf('fleetGroup', e.target.value)}>
            <option value="business">Business</option><option value="personal">Personal</option>
          </select>
        </div>
        <div className="field"><label className="label">Status</label>
          <select className="select" value={form.status} onChange={e => sf('status', e.target.value)}>
            <option value="available">Available</option><option value="rented">Rented</option><option value="maintenance">Maintenance</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Purchase Date</label><input className="input" type="date" value={form.purchaseDate} onChange={e => sf('purchaseDate', e.target.value)} /></div>
        <div className="field"><label className="label">Rego Expiry</label><input className="input" type="date" value={form.regoExpiry} onChange={e => sf('regoExpiry', e.target.value)} /></div>
      </div>
      <div className="field"><label className="label">Next Service Date</label><input className="input" type="date" value={form.nextServiceDate} onChange={e => sf('nextServiceDate', e.target.value)} /></div>
      <div className="form-divider"><span>Condition</span></div>
      <div className="field"><label className="label">Condition / Existing Damage Notes</label><textarea className="textarea" rows={3} value={form.conditionNotes} onChange={e => sf('conditionNotes', e.target.value)} placeholder="e.g. Front panel cracked, minor scratch on left side." /></div>
      <div className="field"><label className="label">Internal Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} /></div>
    </>
  );

  const selected  = detailV ? data.vehicles.find(v => v.id === detailV.id) : null;
  const vRentals  = selected ? data.rentals.filter(r => r.vehicleId === selected.id) : [];
  const vMaint    = selected ? [...data.maintenance].filter(m => m.vehicleId === selected.id).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Vehicles</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Add Vehicle</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Tabs tabs={[
          { label: 'All', value: 'all', count: counts.all },
          { label: 'Available', value: 'available', count: counts.available },
          { label: 'Rented', value: 'rented', count: counts.rented },
          { label: 'Maintenance', value: 'maintenance', count: counts.maintenance },
        ]} active={filter} onChange={setFilter} />
        <input className="input" style={{ width: 220 }} placeholder="Search plate, name, make…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {vehicles.length === 0
          ? <EmptyState message={data.vehicles.length === 0 ? 'No vehicles yet — add your first one' : 'No vehicles match your filter'}
              action={data.vehicles.length === 0 ? <button className="btn btn-primary btn-sm" onClick={openAdd}>Add vehicle</button> : null} />
          : <table className="table">
              <thead><tr><th>Plate</th><th>Make / Model</th><th>Colour</th><th>Fleet</th><th>Status</th><th>Rego Expiry</th><th></th></tr></thead>
              <tbody>
                {vehicles.map(v => {
                  const rd = v.regoExpiry ? daysUntil(v.regoExpiry) : null;
                  const regoWarn = rd !== null && rd <= 30;
                  const makeModel = [v.make, v.model].filter(Boolean).join(' ') || v.name || '—';
                  return (
                    <tr key={v.id} onClick={() => setDetailV(v)}>
                      <td className="fw-600">{v.plate}</td>
                      <td>
                        <div className="fw-500">{makeModel}</div>
                        <div className="text-sm text-muted">{v.year || ''} · <span style={{ textTransform: 'capitalize' }}>{v.type}</span></div>
                      </td>
                      <td className="text-muted">{v.colour || '—'}</td>
                      <td><Badge variant="gray">{v.fleetGroup}</Badge></td>
                      <td>{statusBadge(v.status)}</td>
                      <td style={{ color: regoWarn ? (rd < 0 ? 'var(--red)' : 'var(--amber)') : 'inherit' }}>
                        {v.regoExpiry ? formatDate(v.regoExpiry) : '—'}
                        {regoWarn && <span className="text-sm" style={{ marginLeft: 5 }}>({rd < 0 ? `${Math.abs(rd)}d over` : `${rd}d`})</span>}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={e => openEdit(v, e)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); setDeleteId(v.id); }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Vehicle" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={saveVehicle} disabled={saving}>{saving ? 'Saving…' : 'Add Vehicle'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!editV} onClose={() => setEditV(null)} title="Edit Vehicle" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => setEditV(null)}>Cancel</button><button className="btn btn-primary" onClick={saveVehicle} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Vehicle"
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button><button className="btn btn-danger" onClick={doDelete}>Delete</button></>}>
        <p style={{ fontSize: 14 }}>Are you sure you want to delete this vehicle? This cannot be undone.</p>
      </Modal>

      <Drawer open={!!detailV} onClose={() => setDetailV(null)} title={selected ? selected.plate + (selected.name ? ' · ' + selected.name : '') : ''}>
        {selected && (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
              {statusBadge(selected.status)}
              <Badge variant="gray">{selected.type}</Badge>
              <Badge variant="gray">{selected.fleetGroup}</Badge>
            </div>
            <div className="grid-2 mb-20">
              {selected.make && <div><div className="label">Make</div><div style={{ marginTop: 3 }}>{selected.make}</div></div>}
              {selected.model && <div><div className="label">Model</div><div style={{ marginTop: 3 }}>{selected.model}</div></div>}
              {selected.year && <div><div className="label">Year</div><div style={{ marginTop: 3 }}>{selected.year}</div></div>}
              {selected.colour && <div><div className="label">Colour</div><div style={{ marginTop: 3 }}>{selected.colour}</div></div>}
              {selected.engineCapacity && <div><div className="label">Engine</div><div style={{ marginTop: 3 }}>{selected.engineCapacity}</div></div>}
              <div><div className="label">Purchase Date</div><div style={{ marginTop: 3 }}>{formatDate(selected.purchaseDate)}</div></div>
              <div>
                <div className="label">Rego Expiry</div>
                <div style={{ marginTop: 3, color: selected.regoExpiry && daysUntil(selected.regoExpiry) <= 30 ? 'var(--red)' : 'inherit' }}>{formatDate(selected.regoExpiry)}</div>
              </div>
              {selected.nextServiceDate && (
                <div>
                  <div className="label">Next Service</div>
                  <div style={{ marginTop: 3, color: daysUntil(selected.nextServiceDate) <= 14 ? 'var(--amber)' : 'inherit' }}>{formatDate(selected.nextServiceDate)}</div>
                </div>
              )}
            </div>
            {selected.conditionNotes && (
              <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div className="label" style={{ marginBottom: 5 }}>Condition / Existing Damage</div>
                <div style={{ fontSize: 14 }}>{selected.conditionNotes}</div>
              </div>
            )}
            {selected.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 14, color: 'var(--muted)' }}>{selected.notes}</div>}
            <div className="drawer-section-title">Rental History ({vRentals.length})</div>
            {vRentals.length === 0 ? <p className="text-sm text-muted mb-20">No rentals recorded</p> : (
              <div className="mb-20">
                {vRentals.map(r => {
                  const c = data.customers.find(x => x.id === r.customerId);
                  return (
                    <div key={r.id} className="history-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div className="fw-500" style={{ fontSize: 14 }}>{c?.name || 'Unknown customer'}</div>
                        <Badge variant={r.status === 'active' ? 'blue' : 'gray'}>{r.status}</Badge>
                      </div>
                      <div className="text-sm text-muted" style={{ marginTop: 3 }}>{formatDate(r.startDate)} — {r.endDate ? formatDate(r.endDate) : 'Ongoing'}</div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="drawer-section-title">Maintenance History ({vMaint.length})</div>
            {vMaint.length === 0 ? <p className="text-sm text-muted">No maintenance records</p> : (
              vMaint.map(m => (
                <div key={m.id} className="history-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="fw-500" style={{ fontSize: 14, textTransform: 'capitalize' }}>{m.type}</div>
                    <div className="text-sm text-muted">{formatDate(m.date)}</div>
                  </div>
                  {m.description && <div className="text-sm text-muted" style={{ marginTop: 3 }}>{m.description}</div>}
                </div>
              ))
            )}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setDetailV(null); openEdit(selected, null); }}>Edit vehicle</button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
