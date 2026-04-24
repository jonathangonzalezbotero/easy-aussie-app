import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Modal from '../components/shared/Modal';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysUntil, todayStr } from '../utils/dates';

const EF = { vehicleId: '', type: 'service', description: '', date: todayStr(), nextServiceDate: '', cost: '' };

export default function Maintenance() {
  const { data, add, update, remove } = useStore();
  const [tab, setTab]           = useState('log');
  const [showAdd, setShowAdd]   = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving]     = useState(false);
  const [form, setForm]         = useState(EF);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const records  = [...data.maintenance].sort((a, b) => new Date(b.date) - new Date(a.date));
  const upcoming = data.vehicles
    .filter(v => v.nextServiceDate)
    .map(v => ({ ...v, days: daysUntil(v.nextServiceDate) }))
    .filter(v => v.days !== null && v.days <= 30)
    .sort((a, b) => a.days - b.days);

  const save = async () => {
    if (!form.vehicleId) { alert('Please select a vehicle'); return; }
    if (!form.date) { alert('Date is required'); return; }
    setSaving(true);
    try {
      await add('maintenance', { ...form });
      if (form.nextServiceDate) await update('vehicles', form.vehicleId, { nextServiceDate: form.nextServiceDate });
      setShowAdd(false);
      setForm(EF);
    } finally { setSaving(false); }
  };

  const renderForm = () => (
    <>
      <div className="grid-2">
        <div className="field"><label className="label">Vehicle *</label>
          <select className="select" value={form.vehicleId} onChange={e => sf('vehicleId', e.target.value)}>
            <option value="">Select vehicle…</option>
            {data.vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}{v.name ? ' · ' + v.name : ''}</option>)}
          </select>
        </div>
        <div className="field"><label className="label">Type</label>
          <select className="select" value={form.type} onChange={e => sf('type', e.target.value)}>
            <option value="service">Service</option>
            <option value="repair">Repair</option>
            <option value="inspection">Inspection</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="grid-2">
        <div className="field"><label className="label">Date *</label><input className="input" type="date" value={form.date} onChange={e => sf('date', e.target.value)} /></div>
        <div className="field"><label className="label">Cost ($)</label><input className="input" type="number" min="0" value={form.cost} onChange={e => sf('cost', e.target.value)} placeholder="Optional" /></div>
      </div>
      <div className="field"><label className="label">Description</label><textarea className="textarea" rows={3} value={form.description} onChange={e => sf('description', e.target.value)} placeholder="What was done?" /></div>
      <div className="field"><label className="label">Next Service Date</label>
        <input className="input" type="date" value={form.nextServiceDate} onChange={e => sf('nextServiceDate', e.target.value)} />
        <span className="field-hint">Updates the vehicle's next service date</span>
      </div>
    </>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Maintenance</h1>
        <button className="btn btn-primary" onClick={() => { setForm(EF); setShowAdd(true); }}>+ Log Service</button>
      </div>

      <div className="mb-16">
        <Tabs tabs={[
          { label: 'Service Log', value: 'log', count: records.length },
          { label: 'Upcoming', value: 'upcoming', count: upcoming.length },
        ]} active={tab} onChange={setTab} />
      </div>

      {tab === 'log' && (
        <div className="card">
          {records.length === 0
            ? <EmptyState message="No maintenance records yet" action={<button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>Log service</button>} />
            : <table className="table">
                <thead><tr><th>Vehicle</th><th>Type</th><th>Date</th><th>Description</th><th>Cost</th><th></th></tr></thead>
                <tbody>
                  {records.map(m => {
                    const v = data.vehicles.find(x => x.id === m.vehicleId);
                    return (
                      <tr key={m.id}>
                        <td className="fw-500">{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
                        <td><Badge variant={m.type === 'repair' ? 'red' : m.type === 'inspection' ? 'blue' : 'gray'}>{m.type}</Badge></td>
                        <td className="text-muted">{formatDate(m.date)}</td>
                        <td className="text-muted" style={{ maxWidth: 220 }}>{m.description || '—'}</td>
                        <td>{m.cost ? '$' + m.cost : '—'}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => setDeleteId(m.id)}>Delete</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
          }
        </div>
      )}

      {tab === 'upcoming' && (
        <div className="card">
          {upcoming.length === 0
            ? <EmptyState message="No upcoming services — all vehicles are up to date" />
            : <table className="table">
                <thead><tr><th>Vehicle</th><th>Type</th><th>Next Service</th><th>Status</th></tr></thead>
                <tbody>
                  {upcoming.map(v => (
                    <tr key={v.id}>
                      <td className="fw-500">{v.plate}{v.name ? ' · ' + v.name : ''}</td>
                      <td><Badge variant="gray">{v.type}</Badge></td>
                      <td>{formatDate(v.nextServiceDate)}</td>
                      <td>
                        {v.days < 0 ? <Badge variant="red">Overdue {Math.abs(v.days)}d</Badge>
                          : v.days === 0 ? <Badge variant="red">Due today</Badge>
                          : <Badge variant="amber">In {v.days}d</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          }
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Service / Repair"
        footer={<><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Record"
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button><button className="btn btn-danger" onClick={async () => { await remove('maintenance', deleteId); setDeleteId(null); }}>Delete</button></>}>
        <p style={{ fontSize: 14 }}>Delete this maintenance record? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
