import { useState } from 'react';
import { useStore } from '../context/StoreContext';
import Modal from '../components/shared/Modal';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysUntil, todayStr } from '../utils/dates';
import { useFinance } from '../finance/FinanceContext';
import { autoMatches, linkedLine } from '../finance/maintenanceLink';
import { money } from '../finance/categories';
import MaintenanceLinkModal from '../components/MaintenanceLinkModal';
import { CHECKLIST_TEMPLATES, templateFor, buildChecklist, checklistProgress, templateGroups } from '../utils/serviceChecklist';

const EF = { vehicleId: '', type: 'service', description: '', date: todayStr(), nextServiceDate: '', cost: '', odometer: '', checklist: null };

export default function Maintenance() {
  const { data, add, update, remove } = useStore();
  const fin = useFinance();
  const [tab, setTab] = useState('log');
  const [linkFor, setLinkFor] = useState(null);
  const [matching, setMatching] = useState(false);
  const [notice, setNotice] = useState('');
  const financeReady = !!fin && !fin.error && !fin.loading;
  const unpaid = data.maintenance.filter(m => m.cost && !m.transactionId).length;
  const matchAll = async () => {
    setMatching(true);
    try {
      const pairs = autoMatches(data.maintenance, fin.transactions, data.rentals);
      for (const { entry, line } of pairs) {
        await update('maintenance', entry.id, { transactionId: line.tx.id, splitId: line.split?.id || null });
        if (entry.vehicleId && !line.vehicleId) {
          if (line.split) await fin.updateTransaction(line.tx.id, { splits: line.tx.splits.map(s => s.id === line.split.id ? { ...s, vehicleId: entry.vehicleId } : s) });
          else await fin.updateTransaction(line.tx.id, { vehicleId: entry.vehicleId });
        }
      }
      setNotice(pairs.length ? `${pairs.length} job${pairs.length > 1 ? 's' : ''} linked to their payments. The rest need a manual pick.` : 'No safe matches: nothing with the same amount within 14 days that is not already linked.');
    } finally { setMatching(false); }
  };
  const [showAdd, setShowAdd] = useState(false);
  const [editM, setEditM] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState({ col: 'vehicle', dir: 'desc' });
  const [form, setForm] = useState(EF);
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));

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

  const openEdit = (m) => {
    setEditM(m);
    setForm({
      vehicleId: m.vehicleId || '',
      type: m.type || 'service',
      description: m.description || '',
      date: m.date || todayStr(),
      nextServiceDate: m.nextServiceDate || '',
      cost: m.cost || '',
      odometer: m.odometer || '',
      checklist: m.checklist || null,
    });
  };

  // Checklist helpers for the form
  const formVehicle = data.vehicles.find(v => v.id === form.vehicleId);
  const hadFirstService = !!formVehicle && data.maintenance.some(m => m.vehicleId === formVehicle.id && m.type === 'service' && (!editM || m.id !== editM.id));
  const suggestedTemplate = templateFor(formVehicle, form.type, { odometer: form.odometer, hadFirstService });
  const [newItem, setNewItem] = useState('');
  const startChecklist = (key) => sf('checklist', buildChecklist(key));
  const toggleItem = (i) => sf('checklist', form.checklist.map((it, j) => j === i ? { ...it, done: !it.done } : it));
  const removeItem = (i) => sf('checklist', form.checklist.filter((_, j) => j !== i));
  const addItem = () => { const t = newItem.trim(); if (!t) return; sf('checklist', [...(form.checklist || []), { item: t, done: false }]); setNewItem(''); };
  const setAll = (done) => sf('checklist', form.checklist.map(it => ({ ...it, done })));

  const records = [...data.maintenance].sort((a, b) => {
    const mul = sort.dir === 'asc' ? 1 : -1;
    if (sort.col === 'vehicle') {
      const av = data.vehicles.find(x => x.id === a.vehicleId)?.plate || '';
      const bv = data.vehicles.find(x => x.id === b.vehicleId)?.plate || '';
      return av.localeCompare(bv) * mul;
    }
    if (sort.col === 'type') return (a.type || '').localeCompare(b.type || '') * mul;
    if (sort.col === 'date') return (a.date || '').localeCompare(b.date || '') * mul;
    if (sort.col === 'odometer') return ((Number(a.odometer) || 0) - (Number(b.odometer) || 0)) * mul;
    if (sort.col === 'cost') return ((Number(a.cost) || 0) - (Number(b.cost) || 0)) * mul;
    return 0;
  });
  const upcoming = data.vehicles
    .filter(v => v.nextServiceDate && v.status !== 'stolen' && v.status !== 'sold')
    .map(v => ({ ...v, days: daysUntil(v.nextServiceDate) }))
    .filter(v => v.days !== null && v.days <= 30)
    .sort((a, b) => a.days - b.days);

  const save = async () => {
    if (!form.vehicleId) { alert('Please select a vehicle'); return; }
    if (!form.date) { alert('Date is required'); return; }
    setSaving(true);
    try {
      await add('maintenance', { ...form });
      const vehicleUpdate = {};
      if (form.nextServiceDate) vehicleUpdate.nextServiceDate = form.nextServiceDate;
      if (form.odometer) vehicleUpdate.odometer = form.odometer;
      if (Object.keys(vehicleUpdate).length) await update('vehicles', form.vehicleId, vehicleUpdate);
      setShowAdd(false);
      setForm(EF);
    } finally { setSaving(false); }
  };

  const saveEdit = async () => {
    if (!form.vehicleId) { alert('Please select a vehicle'); return; }
    if (!form.date) { alert('Date is required'); return; }
    setSaving(true);
    try {
      await update('maintenance', editM.id, { ...form });
      const vehicleUpdate = {};
      if (form.nextServiceDate) vehicleUpdate.nextServiceDate = form.nextServiceDate;
      if (form.odometer) vehicleUpdate.odometer = form.odometer;
      if (Object.keys(vehicleUpdate).length) await update('vehicles', form.vehicleId, vehicleUpdate);
      setEditM(null);
      setForm(EF);
    } finally { setSaving(false); }
  };

  const vehicleOptions = data.vehicles.filter(v => (v.status !== 'stolen' && v.status !== 'sold') || v.id === form.vehicleId);

  const renderForm = () => (
    <>
      <div className="grid-2">
        <div className="field"><label className="label">Vehicle *</label>
          <select className="select" value={form.vehicleId} onChange={e => sf('vehicleId', e.target.value)}>
            <option value="">Select vehicle…</option>
            {vehicleOptions.map(v => <option key={v.id} value={v.id}>{v.plate}{v.name ? ' · ' + v.name : ''}</option>)}
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
      {(form.type === 'service' || form.type === 'inspection' || form.checklist) && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          {!form.checklist ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div><div className="fw-600" style={{ fontSize: 14 }}>Service checklist</div><div className="text-sm text-muted">{suggestedTemplate ? `Suggested: ${CHECKLIST_TEMPLATES[suggestedTemplate].label}${formVehicle ? ` for ${formVehicle.plate}` : ''}${suggestedTemplate.startsWith('zoot') ? ` · from the odometer (${Number(form.odometer || formVehicle?.odometer || 0).toLocaleString()} km)` : ''}` : 'Tick off each step as you go'}</div></div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {suggestedTemplate && <button type="button" className="btn btn-primary btn-sm" onClick={() => startChecklist(suggestedTemplate)}>Start {CHECKLIST_TEMPLATES[suggestedTemplate].label}</button>}
                <select className="select" style={{ width: 'auto', padding: '6px 10px' }} value="" onChange={e => e.target.value && startChecklist(e.target.value)}>
                  <option value="">Other template…</option>
                  {Object.entries(templateGroups()).map(([g, list]) => <optgroup key={g} label={g}>{list.map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}</optgroup>)}
                  <option value="blank">Blank list</option>
                </select>
              </div>
            </div>
          ) : (() => {
            const p = checklistProgress(form.checklist);
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div className="fw-600" style={{ fontSize: 14 }}>Checklist · {p.done} of {p.total} done</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(true)}>Tick all</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(false)}>Clear</button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => sf('checklist', null)}>Remove list</button>
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginBottom: 10 }}><div style={{ height: 6, width: `${p.pct * 100}%`, background: p.pct === 1 ? 'var(--accent)' : 'var(--amber)', borderRadius: 3, transition: 'width 0.2s' }} /></div>
                <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {form.checklist.map((it, i) => (
                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: it.done ? 'var(--accent-light)' : 'transparent', cursor: 'pointer', fontSize: 14 }}>
                      <input type="checkbox" checked={!!it.done} onChange={() => toggleItem(i)} style={{ width: 18, height: 18 }} />
                      <span style={{ flex: 1, textDecoration: it.done ? 'line-through' : 'none', color: it.done ? 'var(--muted)' : 'inherit' }}>{it.item}{it.hint && <div className="text-sm text-muted" style={{ textDecoration: 'none' }}>{it.hint}</div>}</span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={e => { e.preventDefault(); removeItem(i); }} style={{ fontSize: 14, lineHeight: 1 }}>×</button>
                    </label>))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                  <input className="input" value={newItem} placeholder="Add a step…" onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }} />
                  <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>Add</button>
                </div>
              </>
            );
          })()}
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label className="label">Odometer (km)</label>
          <input className="input" type="number" min="0" value={form.odometer} onChange={e => sf('odometer', e.target.value)} placeholder="e.g. 4250" />
        </div>
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {financeReady && unpaid > 0 && <button className="btn btn-secondary" onClick={matchAll} disabled={matching}>{matching ? 'Matching…' : `Match ${unpaid} with Finance`}</button>}
          <button className="btn btn-primary" onClick={() => { setForm(EF); setShowAdd(true); }}>+ Log Service</button>
        </div>
      </div>
      {notice && <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}><span>{notice}</span><button className="btn btn-ghost btn-sm" onClick={() => setNotice('')}>×</button></div>}

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
            : <div className="table-wrap"><table className="table">
              <thead><tr>
                <SortTh col="vehicle">Vehicle</SortTh>
                <SortTh col="type">Type</SortTh>
                <SortTh col="date">Date</SortTh>
                <SortTh col="odometer" className="col-hide-mobile">Odometer</SortTh>
                <th className="col-hide-mobile">Description</th>
                <th>Checklist</th>
                <SortTh col="cost">Cost</SortTh>
                {financeReady && <th>Paid</th>}
                <th></th>
              </tr></thead>
              <tbody>
                {records.map(m => {
                  const v = data.vehicles.find(x => x.id === m.vehicleId);
                  return (
                    <tr key={m.id}>
                      <td className="fw-500">{v ? v.plate + (v.name ? ' · ' + v.name : '') : '—'}</td>
                      <td><Badge variant={m.type === 'repair' ? 'red' : m.type === 'inspection' ? 'blue' : 'gray'}>{m.type}</Badge></td>
                      <td className="text-muted">{formatDate(m.date)}</td>
                      <td className="text-muted col-hide-mobile">{m.odometer ? Number(m.odometer).toLocaleString() + ' km' : '—'}</td>
                      <td className="text-muted col-hide-mobile" style={{ maxWidth: 220 }}>{m.description || '—'}</td>
                      <td onClick={() => openEdit(m)} style={{ cursor: 'pointer' }}>{(() => { if (!m.checklist?.length) return <span className="text-sm text-muted">—</span>; const p = checklistProgress(m.checklist); return <div style={{ minWidth: 90 }}><div className="text-sm" style={{ color: p.pct === 1 ? 'var(--accent)' : 'var(--amber)', fontWeight: 600 }}>{p.done}/{p.total}{p.pct === 1 ? ' ✓' : ''}</div><div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}><div style={{ height: 4, width: `${p.pct * 100}%`, background: p.pct === 1 ? 'var(--accent)' : 'var(--amber)', borderRadius: 2 }} /></div></div>; })()}</td>
                      <td>{m.cost ? '$' + m.cost : '—'}</td>
                      {financeReady && (() => {
                        const ll = linkedLine(m, fin.transactions);
                        const mismatch = ll && m.cost && ll.amount !== Math.round(Number(m.cost) * 100);
                        return (
                          <td onClick={() => setLinkFor(m)} style={{ cursor: 'pointer' }}>
                            {ll ? <div><Badge variant={mismatch ? 'amber' : 'green'}>{mismatch ? 'Paid · check' : 'Paid'}</Badge><div className="text-sm text-muted">{formatDate(ll.tx.date).replace(/ \d{4}$/, '')} · {fin.accounts.find(a => a.id === ll.tx.accountId)?.name}{ll.split ? ` · line ${ll.tx.splits.indexOf(ll.split) + 1}` : ''}{mismatch ? ` · ${money(-ll.amount / 100)}` : ''}</div></div>
                              : m.cost ? <Badge variant="amber">Not in Finance</Badge> : <span className="text-sm text-muted">No cost</span>}
                          </td>);
                      })()}
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(m)}>Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteId(m.id)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          }
        </div>
      )}

      {tab === 'upcoming' && (
        <div className="card">
          {upcoming.length === 0
            ? <EmptyState message="No upcoming services — all vehicles are up to date" />
            : <div className="table-wrap"><table className="table">
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
            </table></div>
          }
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Log Service / Repair"
        footer={<><button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button></>}>
        {renderForm()}
      </Modal>

      <Modal open={!!editM} onClose={() => { setEditM(null); setForm(EF); }} title="Edit Service Record"
        footer={<><button className="btn btn-secondary" onClick={() => { setEditM(null); setForm(EF); }}>Cancel</button><button className="btn btn-primary" onClick={saveEdit} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></>}>
        {renderForm()}
      </Modal>

      {linkFor && <MaintenanceLinkModal entry={data.maintenance.find(m => m.id === linkFor.id) || linkFor} onClose={() => setLinkFor(null)} onDone={msg => setNotice(msg)} />}

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Delete Record"
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button><button className="btn btn-danger" onClick={async () => { await remove('maintenance', deleteId); setDeleteId(null); }}>Delete</button></>}>
        <p style={{ fontSize: 14 }}>Delete this maintenance record? This cannot be undone.</p>
      </Modal>
    </div>
  );
}
