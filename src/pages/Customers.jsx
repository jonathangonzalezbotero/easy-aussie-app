import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Modal from '../components/shared/Modal';
import Drawer from '../components/shared/Drawer';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import { formatDate } from '../utils/dates';

const EF = { name: '', dateOfBirth: '', phone: '', email: '', address: '', occupation: '', emergencyContact: '', emergencyPhone: '', hotelAddress: '', licenseRef: '', licencePhoto: '', notes: '' };

export default function Customers() {
  const { data, add, update, remove } = useStore();
  const [showAdd, setShowAdd]   = useState(false);
  const [editC, setEditC]       = useState(null);
  const [detailC, setDetailC]   = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [search, setSearch]     = useState('');
  const [saving, setSaving]     = useState(false);
  const [sort, setSort]         = useState({ col: 'name', dir: 'asc' });
  const [form, setForm]         = useState(EF);
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

  const filtered = data.customers.filter(c => {
    const q = search.toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
  });

  const customers = [...filtered].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'name')    return a.name.localeCompare(b.name) * mul;
    if (sort.col === 'phone')   return (a.phone || '').localeCompare(b.phone || '') * mul;
    if (sort.col === 'email')   return (a.email || '').localeCompare(b.email || '') * mul;
    if (sort.col === 'rentals') {
      const ar = data.rentals.filter(r => r.customerId === a.id && r.status === 'active').length;
      const br = data.rentals.filter(r => r.customerId === b.id && r.status === 'active').length;
      return (ar - br) * mul;
    }
    return 0;
  });

  const openEdit = (c, e) => { e?.stopPropagation(); setEditC(c); setForm({ ...EF, ...c }); };

  const save = async () => {
    if (!form.name.trim()) { alert('Name is required'); return; }
    setSaving(true);
    try {
      if (editC) { await update('customers', editC.id, form); setEditC(null); }
      else { await add('customers', form); setShowAdd(false); }
      setForm(EF);
    } finally { setSaving(false); }
  };

  const renderForm = () => (
    <>
      <div className="grid-2">
        <div className="field"><label className="label">Full Name *</label><input className="input" value={form.name} onChange={e => sf('name', e.target.value)} /></div>
        <div className="field"><label className="label">Date of Birth</label><input className="input" type="date" value={form.dateOfBirth} onChange={e => sf('dateOfBirth', e.target.value)} /></div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Phone</label><input className="input" type="tel" value={form.phone} onChange={e => sf('phone', e.target.value)} /></div>
        <div className="field"><label className="label">Email</label><input className="input" type="email" value={form.email} onChange={e => sf('email', e.target.value)} /></div>
      </div>
      <div className="field"><label className="label">Residential Address</label><input className="input" value={form.address} onChange={e => sf('address', e.target.value)} /></div>
      <div className="grid-2">
        <div className="field"><label className="label">Occupation</label><input className="input" value={form.occupation} onChange={e => sf('occupation', e.target.value)} /></div>
        <div className="field"><label className="label">Hotel / Airbnb Address</label><input className="input" value={form.hotelAddress} onChange={e => sf('hotelAddress', e.target.value)} placeholder="If staying locally" /></div>
      </div>
      <div className="form-divider"><span>Emergency Contact</span></div>
      <div className="grid-2">
        <div className="field"><label className="label">Emergency Contact Name</label><input className="input" value={form.emergencyContact} onChange={e => sf('emergencyContact', e.target.value)} /></div>
        <div className="field"><label className="label">Emergency Contact Phone</label><input className="input" type="tel" value={form.emergencyPhone} onChange={e => sf('emergencyPhone', e.target.value)} /></div>
      </div>
      <div className="form-divider"><span>Driver's Licence</span></div>
      <div className="field"><label className="label">Licence Number / Reference</label><input className="input" value={form.licenseRef} onChange={e => sf('licenseRef', e.target.value)} /></div>
      {form.licencePhoto && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Licence Photo</div>
          <img src={form.licencePhoto} alt="Licence" style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--border)' }} />
          <div style={{ marginTop: 6 }}><button className="btn btn-danger btn-sm" onClick={() => sf('licencePhoto', '')}>Remove photo</button></div>
        </div>
      )}
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} /></div>
    </>
  );

  const selected  = detailC ? data.customers.find(c => c.id === detailC.id) : null;
  const cRentals  = selected ? data.rentals.filter(r => r.customerId === selected.id) : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Customers</h1>
        <button className="btn btn-primary" onClick={() => { setForm(EF); setShowAdd(true); }}>+ Add Customer</button>
      </div>

      <div className="mb-16">
        <input className="input" style={{ maxWidth: 320 }} placeholder="Search by name, email or phone…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="card">
        {customers.length === 0
          ? <EmptyState message={data.customers.length === 0 ? 'No customers yet' : 'No customers match'} action={data.customers.length === 0 ? <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>Add customer</button> : null} />
          : <table className="table">
              <thead><tr>
                <SortTh col="name">Name</SortTh>
                <SortTh col="phone">Phone</SortTh>
                <SortTh col="email">Email</SortTh>
                <SortTh col="rentals">Rentals</SortTh>
                <th></th>
              </tr></thead>
              <tbody>
                {customers.map(c => {
                  const active = data.rentals.filter(r => r.customerId === c.id && r.status === 'active').length;
                  const total  = data.rentals.filter(r => r.customerId === c.id).length;
                  return (
                    <tr key={c.id} onClick={() => setDetailC(c)}>
                      <td className="fw-500">{c.name}</td>
                      <td className="text-muted">{c.phone || '—'}</td>
                      <td className="text-muted">{c.email || '—'}</td>
                      <td>{active > 0 ? <Badge variant="blue">{active} active</Badge> : <span className="text-sm text-muted">{total} total</span>}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={e => openEdit(c, e)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); setDeleteId(c.id); }}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
        }
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Customer" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Add Customer'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!editC} onClose={() => setEditC(null)} title="Edit Customer" width={560}
        footer={<><button className="btn btn-secondary" onClick={() => setEditC(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Customer"
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button><button className="btn btn-danger" onClick={async () => { await remove('customers', deleteId); setDeleteId(null); if (detailC?.id === deleteId) setDetailC(null); }}>Delete</button></>}>
        <p style={{ fontSize: 14 }}>Delete this customer? Associated rentals will not be deleted.</p>
      </Modal>

      <Drawer open={!!detailC} onClose={() => setDetailC(null)} title={selected?.name || ''}>
        {selected && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 20 }}>
              {[['Date of Birth', selected.dateOfBirth], ['Phone', selected.phone], ['Email', selected.email], ['Occupation', selected.occupation]].map(([l, v]) =>
                v ? <div key={l}><div className="label">{l}</div><div style={{ marginTop: 3, fontSize: 14 }}>{l === 'Date of Birth' ? formatDate(v) : v}</div></div> : null
              )}
              {selected.address && <div style={{ gridColumn: '1/-1' }}><div className="label">Address</div><div style={{ marginTop: 3, fontSize: 14 }}>{selected.address}</div></div>}
              {selected.hotelAddress && <div style={{ gridColumn: '1/-1' }}><div className="label">Hotel / Airbnb</div><div style={{ marginTop: 3, fontSize: 14 }}>{selected.hotelAddress}</div></div>}
              {(selected.emergencyContact || selected.emergencyPhone) && (
                <div style={{ gridColumn: '1/-1' }}>
                  <div className="label">Emergency Contact</div>
                  <div style={{ marginTop: 3, fontSize: 14 }}>{selected.emergencyContact}{selected.emergencyPhone ? ' · ' + selected.emergencyPhone : ''}</div>
                </div>
              )}
            </div>
            {(selected.licenseRef || selected.licencePhoto) && (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
                <div className="label" style={{ marginBottom: 8 }}>Driver's Licence</div>
                {selected.licenseRef && <div style={{ fontSize: 14, marginBottom: selected.licencePhoto ? 10 : 0 }}>{selected.licenseRef}</div>}
                {selected.licencePhoto && <img src={selected.licencePhoto} alt="Licence" style={{ maxWidth: 200, borderRadius: 8, border: '1px solid var(--border)' }} />}
              </div>
            )}
            {selected.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 20, fontSize: 14, color: 'var(--muted)' }}>{selected.notes}</div>}
            <div className="drawer-section-title">Rental History ({cRentals.length})</div>
            {cRentals.length === 0 ? <p className="text-sm text-muted">No rentals yet</p> : (
              cRentals.map(r => {
                const v = data.vehicles.find(x => x.id === r.vehicleId);
                return (
                  <div key={r.id} className="history-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="fw-500" style={{ fontSize: 14 }}>{v ? v.plate + (v.name ? ' · ' + v.name : '') : 'Unknown vehicle'}</div>
                      <Badge variant={r.status === 'active' ? 'blue' : 'gray'}>{r.status}</Badge>
                    </div>
                    <div className="text-sm text-muted" style={{ marginTop: 3 }}>{formatDate(r.startDate)} — {r.endDate ? formatDate(r.endDate) : 'Ongoing'}</div>
                    {r.bond?.amount && <div className="text-sm" style={{ marginTop: 3 }}>Bond ${r.bond.amount} · <Badge variant={r.bond.status === 'held' ? 'amber' : 'green'}>{r.bond.status}</Badge></div>}
                  </div>
                );
              })
            )}
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => { setDetailC(null); openEdit(selected, null); }}>Edit customer</button>
            </div>
          </>
        )}
      </Drawer>
    </div>
  );
}
