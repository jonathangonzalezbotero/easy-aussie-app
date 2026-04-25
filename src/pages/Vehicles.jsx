import { useState, useRef, useEffect } from 'react';
import { useStore } from '../context/StoreContext';
import { supabase } from '../lib/supabase';
import Modal from '../components/shared/Modal';
import Drawer from '../components/shared/Drawer';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysUntil, todayStr } from '../utils/dates';

const EF = {
  plate: '', name: '', make: '', model: '', year: '', colour: '', engineCapacity: '',
  type: 'scooter', fleetGroup: 'business', purchaseDate: '', purchasePrice: '', status: 'available',
  nextServiceDate: '', conditionNotes: '', notes: '',
};

export default function Vehicles() {
  const { data, add, update, remove } = useStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editV, setEditV] = useState(null);
  const [detailV, setDetailV] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sort, setSort] = useState({ col: 'plate', dir: 'asc' });
  const [form, setForm] = useState(EF);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleSort = (col) =>
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const SortTh = ({ col, children }) => {
    const active = sort.col === col;
    return (
      <th onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
        {children}
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3, fontSize: 11 }}>
          {active && sort.dir === 'desc' ? '▼' : '▲'}
        </span>
      </th>
    );
  };
  const fileInputRef = useRef(null);

  const RF = { renewalDate: todayStr(), expiryDate: '', duration: '1 year', cost: '', notes: '' };
  const [renewals, setRenewals] = useState([]);
  const [showAddRenewal, setShowAddRenewal] = useState(false);
  const [editRenewal, setEditRenewal] = useState(null);
  const [renewalForm, setRenewalForm] = useState(RF);
  const [savingRenewal, setSavingRenewal] = useState(false);
  const srf = (k, v) => setRenewalForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!detailV) { setRenewals([]); return; }
    supabase
      .from('rego_renewals')
      .select('*')
      .eq('vehicle_id', detailV.id)
      .order('renewal_date', { ascending: false })
      .then(({ data: rows }) => setRenewals(rows || []));
  }, [detailV?.id]);

  const openAddRenewal = () => { setEditRenewal(null); setRenewalForm(RF); setShowAddRenewal(true); };
  const openEditRenewal = (r) => {
    setEditRenewal(r);
    setRenewalForm({
      renewalDate: r.renewal_date,
      expiryDate: r.expiry_date,
      duration: r.duration,
      cost: r.cost != null ? String(r.cost) : '',
      notes: r.notes || '',
    });
    setShowAddRenewal(true);
  };

  const saveRenewal = async () => {
    if (!renewalForm.expiryDate) { alert('New expiry date is required'); return; }
    setSavingRenewal(true);
    try {
      const payload = {
        renewal_date: renewalForm.renewalDate,
        expiry_date: renewalForm.expiryDate,
        duration: renewalForm.duration,
        cost: renewalForm.cost ? Number(renewalForm.cost) : null,
        notes: renewalForm.notes || null,
      };
      if (editRenewal) {
        const { data: row, error } = await supabase.from('rego_renewals').update(payload).eq('id', editRenewal.id).select().single();
        if (error) throw error;
        setRenewals(prev => prev.map(r => r.id === editRenewal.id ? row : r));
      } else {
        const { data: row, error } = await supabase.from('rego_renewals').insert({ vehicle_id: selected.id, ...payload }).select().single();
        if (error) throw error;
        setRenewals(prev => [row, ...prev]);
      }
      // Keep vehicle's regoExpiry in sync with the most recent expiry date
      const allExpiries = editRenewal
        ? renewals.map(r => r.id === editRenewal.id ? renewalForm.expiryDate : r.expiry_date)
        : [...renewals.map(r => r.expiry_date), renewalForm.expiryDate];
      const latest = allExpiries.reduce((max, d) => d > max ? d : max, '');
      await update('vehicles', selected.id, { regoExpiry: latest });
      setShowAddRenewal(false);
      setRenewalForm(RF);
      setEditRenewal(null);
    } catch (err) {
      alert('Failed to save renewal: ' + err.message);
    } finally {
      setSavingRenewal(false);
    }
  };

  const vehicles = [...data.vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchQ = !q || v.plate.toLowerCase().includes(q) || (v.name || '').toLowerCase().includes(q) || (v.make || '').toLowerCase().includes(q) || (v.model || '').toLowerCase().includes(q);
    const matchF = filter === 'all' || v.status === filter;
    return matchQ && matchF;
  })].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'plate') return a.plate.localeCompare(b.plate) * mul;
    if (sort.col === 'make') return ([a.make, a.model].filter(Boolean).join(' ')).localeCompare([b.make, b.model].filter(Boolean).join(' ')) * mul;
    if (sort.col === 'colour') return (a.colour || '').localeCompare(b.colour || '') * mul;
    if (sort.col === 'fleetGroup') return (a.fleetGroup || '').localeCompare(b.fleetGroup || '') * mul;
    if (sort.col === 'status') return (a.status || '').localeCompare(b.status || '') * mul;
    if (sort.col === 'purchaseDate') return (a.purchaseDate || '').localeCompare(b.purchaseDate || '') * mul;
    if (sort.col === 'regoExpiry') return (a.regoExpiry || '').localeCompare(b.regoExpiry || '') * mul;
    return 0;
  });

  const counts = { all: data.vehicles.length, available: 0, rented: 0, maintenance: 0, stolen: 0, sold: 0 };
  data.vehicles.forEach(v => { if (counts[v.status] !== undefined) counts[v.status]++; });

  const openAdd = () => { setForm(EF); setShowAdd(true); };
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
    const v = data.vehicles.find(x => x.id === deleteId);
    if (v?.status === 'rented') {
      alert('This vehicle is currently rented and cannot be deleted. End the rental first.');
      setDeleteId(null);
      return;
    }
    if (v?.regoDocPath) {
      await supabase.storage.from('vehicle-docs').remove([v.regoDocPath]);
    }
    await remove('vehicles', deleteId);
    if (detailV?.id === deleteId) setDetailV(null);
    setDeleteId(null);
  };

  const uploadRego = async (vehicleId, file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    const path = `${vehicleId}/rego.${ext}`;
    setUploading(true);
    try {
      const { error } = await supabase.storage.from('vehicle-docs').upload(path, file, { upsert: true });
      if (error) throw error;
      await update('vehicles', vehicleId, { regoDocPath: path });
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const downloadRego = async (path) => {
    const { data: urlData, error } = await supabase.storage.from('vehicle-docs').createSignedUrl(path, 120);
    if (error) { alert('Could not generate download link: ' + error.message); return; }
    window.open(urlData.signedUrl, '_blank');
  };

  const removeRego = async (vehicleId, path) => {
    if (!window.confirm('Remove the registration certificate?')) return;
    await supabase.storage.from('vehicle-docs').remove([path]);
    await update('vehicles', vehicleId, { regoDocPath: null });
  };

  const statusBadge = (s) => {
    if (s === 'available') return <Badge variant="green">Available</Badge>;
    if (s === 'rented') return <Badge variant="blue">Rented</Badge>;
    if (s === 'maintenance') return <Badge variant="amber">Maintenance</Badge>;
    if (s === 'stolen') return <Badge variant="red">Stolen</Badge>;
    if (s === 'sold') return <Badge variant="black">Sold</Badge>;
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
        {form.type !== 'ebike' && (
          <div className="field"><label className="label">Model</label><input className="input" value={form.model} onChange={e => sf('model', e.target.value)} placeholder="e.g. RIVIERA X" /></div>
        )}
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Year</label><input className="input" value={form.year} onChange={e => sf('year', e.target.value)} placeholder="e.g. 2025" /></div>
        <div className="field"><label className="label">Colour</label><input className="input" value={form.colour} onChange={e => sf('colour', e.target.value)} placeholder="e.g. WHITE" /></div>
      </div>
      <div className="grid-2">
        {form.type !== 'ebike' && (
          <div className="field"><label className="label">Engine Capacity</label><input className="input" value={form.engineCapacity} onChange={e => sf('engineCapacity', e.target.value)} placeholder="e.g. 50cc" /></div>
        )}
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
            <option value="available">Available</option>
            <option value="rented">Rented</option>
            <option value="maintenance">Maintenance</option>
            <option value="stolen">Stolen</option>
            <option value="sold">Sold</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Purchase Date</label><input className="input" type="date" value={form.purchaseDate} onChange={e => sf('purchaseDate', e.target.value)} /></div>
        <div className="field"><label className="label">Purchase Price ($)</label><input className="input" type="number" min="0" value={form.purchasePrice} onChange={e => sf('purchasePrice', e.target.value)} placeholder="e.g. 3500" /></div>
      </div>
      <div className="field"><label className="label">Next Service Date</label><input className="input" type="date" value={form.nextServiceDate} onChange={e => sf('nextServiceDate', e.target.value)} /></div>
      <div className="form-divider"><span>Condition</span></div>
      <div className="field"><label className="label">Condition / Existing Damage Notes</label><textarea className="textarea" rows={3} value={form.conditionNotes} onChange={e => sf('conditionNotes', e.target.value)} placeholder="e.g. Front panel cracked, minor scratch on left side." /></div>
      <div className="field"><label className="label">Internal Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} /></div>
    </>
  );

  const selected = detailV ? data.vehicles.find(v => v.id === detailV.id) : null;
  const vRentals = selected ? data.rentals.filter(r => r.vehicleId === selected.id) : [];
  const vMaint = selected ? [...data.maintenance].filter(m => m.vehicleId === selected.id).sort((a, b) => new Date(b.date) - new Date(a.date)) : [];

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
          { label: 'Stolen', value: 'stolen', count: counts.stolen },
          { label: 'Sold', value: 'sold', count: counts.sold },
        ]} active={filter} onChange={setFilter} />
        <input className="input" style={{ width: 220 }} placeholder="Search plate, name, make…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {vehicles.length === 0
          ? <EmptyState message={data.vehicles.length === 0 ? 'No vehicles yet — add your first one' : 'No vehicles match your filter'}
            action={data.vehicles.length === 0 ? <button className="btn btn-primary btn-sm" onClick={openAdd}>Add vehicle</button> : null} />
          : <table className="table">
            <thead><tr>
              <SortTh col="plate">Plate</SortTh>
              <SortTh col="make">Make / Model</SortTh>
              <SortTh col="colour">Colour</SortTh>
              <SortTh col="fleetGroup">Fleet</SortTh>
              <SortTh col="status">Status</SortTh>
              <SortTh col="purchaseDate">Purchase Date</SortTh>
              <SortTh col="regoExpiry">Rego Expiry (latest)</SortTh>
              <th></th>
            </tr></thead>
            <tbody>
              {vehicles.map(v => {
                const rd = v.regoExpiry ? daysUntil(v.regoExpiry) : null;
                const regoWarn = rd !== null && rd <= 30;
                const makeModel = [v.make, v.model].filter(Boolean).join(' ') || v.name || '—';
                return (
                  <tr key={v.id} onClick={() => setDetailV(v)}>
                    <td>
                      <div className="fw-600">{v.plate}</div>
                      {v.name && <div className="text-sm text-muted">{v.name}</div>}
                    </td>
                    <td>
                      <div className="fw-500">{makeModel}</div>
                      <div className="text-sm text-muted">{v.year || ''} · <span style={{ textTransform: 'capitalize' }}>{v.type}</span></div>
                    </td>
                    <td className="text-muted">{v.colour || '—'}</td>
                    <td><Badge variant="gray">{v.fleetGroup}</Badge></td>
                    <td>{statusBadge(v.status)}</td>
                    <td>{v.purchaseDate ? formatDate(v.purchaseDate) : '—'}</td>
                    <td style={{ color: regoWarn ? (rd < 0 ? 'var(--red)' : 'var(--amber)') : 'inherit' }}>
                      {(v.status === 'stolen' || v.status === 'sold')
                        ? <span className="text-muted">—</span>
                        : <>{v.regoExpiry ? formatDate(v.regoExpiry) : '—'}{regoWarn && <span className="text-sm" style={{ marginLeft: 5 }}>({rd < 0 ? `${Math.abs(rd)}d over` : `${rd}d`})</span>}</>
                      }
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-secondary btn-sm" onClick={e => openEdit(v, e)}>Edit</button>
                        <button className="btn btn-danger btn-sm" disabled={v.status === 'rented'} title={v.status === 'rented' ? 'End the rental before deleting' : undefined} onClick={e => { e.stopPropagation(); setDeleteId(v.id); }}>Delete</button>
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
              {selected.purchaseDate && <div><div className="label">Purchase Date</div><div style={{ marginTop: 3 }}>{formatDate(selected.purchaseDate)}</div></div>}
              {selected.purchasePrice && <div><div className="label">Purchase Price</div><div style={{ marginTop: 3 }}>${Number(selected.purchasePrice).toLocaleString()}</div></div>}
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
            <div className="drawer-section-title">Registration Certificate</div>
            <div style={{ marginBottom: 20 }}>
              {selected.regoDocPath ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary btn-sm" onClick={() => downloadRego(selected.regoDocPath)}>
                    ↓ Download
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? 'Uploading…' : 'Replace'}
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => removeRego(selected.id, selected.regoDocPath)}>
                    Remove
                  </button>
                </div>
              ) : (
                <button className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? 'Uploading…' : '+ Upload Certificate'}
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadRego(selected.id, f); }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div className="drawer-section-title" style={{ marginBottom: 0 }}>Rego Renewals ({renewals.length})</div>
              <button className="btn btn-secondary btn-sm" onClick={openAddRenewal}>+ Add</button>
            </div>
            {renewals.length === 0
              ? <p className="text-sm text-muted mb-20">No renewals recorded</p>
              : <div className="mb-20">
                {renewals.map(r => (
                  <div key={r.id} className="history-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="fw-500" style={{ fontSize: 14 }}>{r.duration}</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div className="text-sm text-muted">{formatDate(r.renewal_date)}</div>
                        <button className="btn btn-secondary btn-sm" onClick={() => openEditRenewal(r)}>Edit</button>
                      </div>
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 3 }}>
                      Expires {formatDate(r.expiry_date)}
                      {r.cost ? ` · $${Number(r.cost).toLocaleString()}` : ''}
                    </div>
                    {r.notes && <div className="text-sm text-muted" style={{ marginTop: 4, fontStyle: 'italic' }}>{r.notes}</div>}
                  </div>
                ))}
              </div>
            }

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

      <Modal open={showAddRenewal} onClose={() => { setShowAddRenewal(false); setEditRenewal(null); }} title={editRenewal ? 'Edit Rego Renewal' : 'Add Rego Renewal'} width={480}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowAddRenewal(false); setEditRenewal(null); }}>Cancel</button>
            <button className="btn btn-primary" onClick={saveRenewal} disabled={savingRenewal}>{savingRenewal ? 'Saving…' : editRenewal ? 'Save Changes' : 'Save Renewal'}</button>
          </>
        }>
        <div className="grid-2">
          <div className="field">
            <label className="label">Renewal Date *</label>
            <input className="input" type="date" value={renewalForm.renewalDate} onChange={e => srf('renewalDate', e.target.value)} />
          </div>
          <div className="field">
            <label className="label">New Expiry Date *</label>
            <input className="input" type="date" value={renewalForm.expiryDate} onChange={e => srf('expiryDate', e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label className="label">Duration</label>
            <select className="select" value={renewalForm.duration} onChange={e => srf('duration', e.target.value)}>
              <option value="1 month">1 month</option>
              <option value="3 months">3 months</option>
              <option value="6 months">6 months</option>
              <option value="1 year">1 year</option>
            </select>
          </div>
          <div className="field">
            <label className="label">Cost ($)</label>
            <input className="input" type="number" min="0" value={renewalForm.cost} onChange={e => srf('cost', e.target.value)} placeholder="Optional" />
          </div>
        </div>
        <div className="field">
          <label className="label">Notes</label>
          <textarea className="textarea" rows={2} value={renewalForm.notes} onChange={e => srf('notes', e.target.value)} placeholder="Optional" />
        </div>
      </Modal>
    </div>
  );
}
