import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../context/StoreContext';
import { useFinance } from '../finance/FinanceContext';
import { bondInFinance, retentionEntry } from '../finance/bondFinance';
import Modal from '../components/shared/Modal';
import Drawer from '../components/shared/Drawer';
import Badge from '../components/shared/Badge';
import EmptyState from '../components/shared/EmptyState';
import Tabs from '../components/shared/Tabs';
import { formatDate, daysBetween, todayStr, ageOn, isYoungRenter } from '../utils/dates';
import { BOND_STATUSES, BOND_RETAIN_REASONS, bondLabel, bondVariant, closedBondStatus } from '../utils/bond';
import { confirmOdometer, latestReading, describeReading } from '../utils/odometer';
import { insuranceOptions, termsAmountsFromSettings, reducedPremiumText } from '../utils/terms';

const EF = {
  customerId: '', vehicleId: '', startDate: todayStr(), endDate: '', contractNumber: '', notes: '', odometer: '', price: '', billingPeriod: 'weekly', insuranceOption: 'standard',
  bond: { amount: '', method: 'cash', status: 'held', refundedAmount: '', retainedAmount: '', retainReason: '', refundMethod: '', refundDate: '' },
};
const EMPTY_BOND = EF.bond;

// Searchable customer combobox: with no query, shows the 5 most-recently-created
// customers (the ones a shared intake link would just have added) instead of
// dumping the entire customer list into a plain <select>.
const RECENT_COUNT = 5;
const MAX_RESULTS = 20;

function CustomerPicker({ customers, value, onChange, startDate }) {
  const [query, setQuery]   = useState('');
  const [open, setOpen]     = useState(false);
  const selected = customers.find(c => c.id === value);

  const recent = [...customers]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, RECENT_COUNT);

  const q = query.trim().toLowerCase();
  const results = q
    ? customers.filter(c =>
        c.name.toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
      ).slice(0, MAX_RESULTS)
    : recent;

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="input"
        placeholder="Search by name, phone or email…"
        value={open ? query : (selected?.name || '')}
        onFocus={() => setQuery('')}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onClick={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div style={{ position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 260, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.1)' }}>
          {!q && <div className="picker-group-label">Recently added</div>}
          {results.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13 }} className="text-muted">No matches</div>}
          {results.map(c => (
            <div key={c.id} className="picker-option" onMouseDown={() => { onChange(c.id); setQuery(''); setOpen(false); }}>
              <div className="fw-500" style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                {c.name}
                {isYoungRenter(c.dateOfBirth, startDate) && <Badge variant="amber">Under 25</Badge>}
              </div>
              <div className="text-sm text-muted">{c.phone || c.email || ''}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Rentals() {
  const { data, add, update, remove, refresh } = useStore();
  const fin = useFinance();
  const financeReady = !!fin && !fin.error && !fin.loading;
  // Offer shown after a bond is kept in full: { rental, amount, reason, deposits }
  const [retainOffer, setRetainOffer] = useState(null);
  const [retainSaving, setRetainSaving] = useState(false);
  const [retainErr, setRetainErr] = useState('');
  const offerRetention = (rental, amount, reason) => {
    if (!financeReady) return;
    const info = bondInFinance({ ...rental, bond: { ...rental.bond, status: 'retained' } }, fin.transactions);
    if (info.needsRetention) { setRetainErr(''); setRetainOffer({ rental, amount, reason, deposits: info.deposits, depositTotal: info.depositTotal }); }
  };
  const recordRetention = async () => {
    const o = retainOffer; if (!o) return;
    setRetainSaving(true); setRetainErr('');
    try {
      const v = data.vehicles.find(x => x.id === o.rental.vehicleId);
      await fin.addTransaction(retentionEntry(o.rental, { amount: o.amount, accountId: o.deposits[0].tx.accountId, date: o.rental.endDate || todayStr(), reason: o.reason, contract: o.rental.contractNumber || v?.plate }));
      setRetainOffer(null);
    } catch (e) { setRetainErr(e.message || String(e)); } finally { setRetainSaving(false); }
  };
  const navigate = useNavigate();
  const [tab, setTab] = useState('active');
  const [showCreate, setShowCreate] = useState(false);
  const [editR, setEditR] = useState(null);
  const [detailR, setDetailR] = useState(null);
  const [endR, setEndR] = useState(null);
  const [deleteR, setDeleteR] = useState(null);
  const [deleting, setDeleting] = useState(false);
  // End-rental bond decision: 'full' | 'partial' | 'keep'
  const [endMode, setEndMode] = useState('full');
  const [retainedAmount, setRetainedAmount] = useState('');
  const [retainReason, setRetainReason] = useState(BOND_RETAIN_REASONS[0]);
  const [retainedNote, setRetainedNote]     = useState('');
  const [refundMethod, setRefundMethod] = useState('bank');
  const [odometerReturn, setOdometerReturn] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EF);
  const [sort, setSort] = useState({ col: 'payDay', dir: 'asc' });
  const [sendingSign, setSendingSign] = useState(false);
  const [signEmailAddr, setSignEmailAddr] = useState('');
  const [signResult, setSignResult] = useState(null); // 'sent' | 'error'
  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sb = (k, v) => setForm(f => {
    const bond = { ...f.bond, [k]: v };
    // A cash bond is in hand straight away; a transfer is awaiting until Finance confirms the bank line.
    if (k === 'method' && showCreate) bond.status = v === 'cash' ? 'held' : 'awaiting';
    return { ...f, bond };
  });

  const getSignReq = (rentalId) =>
    (data.signingRequests || []).filter(s => s.rentalId === rentalId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0] ?? null;

  const sendSigningEmail = async (rental, email) => {
    if (!email?.trim()) return;
    const customer = data.customers.find(c => c.id === rental.customerId);
    setSendingSign(true);
    setSignResult(null);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-signing-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        body: JSON.stringify({ rental_id: rental.id, customer_email: email.trim(), customer_name: customer?.name || '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed');
      setSignResult('sent');
      // Only a fresh signing request changes local state; a signed copy re-uses the existing row.
      if (!json.signed) setTimeout(() => { window.location.reload(); }, 1500);
    } catch {
      setSignResult('error');
    } finally {
      setSendingSign(false);
    }
  };

  // Auto-suggest contract number when vehicle is selected in create form
  useEffect(() => {
    if (!showCreate || !form.vehicleId) return;
    const vehicle = data.vehicles.find(v => v.id === form.vehicleId);
    if (!vehicle) return;
    const prefix = vehicle.type === 'ebike' ? 'EB' : vehicle.type === 'car' ? 'CA' : 'SC';
    const nums = data.rentals
      .map(r => r.contractNumber)
      .filter(n => n && n.startsWith(prefix + '-'))
      .map(n => parseInt(n.slice(prefix.length + 1), 10))
      .filter(n => !isNaN(n));
    const next = Math.max(20, ...nums) + 1;
    setForm(f => ({ ...f, contractNumber: `${prefix}-${String(next).padStart(3, '0')}` }));
  }, [form.vehicleId, showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill start odometer from vehicle's current odometer when creating
  useEffect(() => {
    if (!showCreate || !form.vehicleId) return;
    const vehicle = data.vehicles.find(v => v.id === form.vehicleId);
    if (vehicle?.odometer) setForm(f => ({ ...f, odometer: vehicle.odometer }));
  }, [form.vehicleId, showCreate]); // eslint-disable-line react-hooks/exhaustive-deps


  const active = data.rentals.filter(r => r.status === 'active');
  const past = data.rentals.filter(r => r.status === 'completed');
  const available = data.vehicles.filter(v => v.status === 'available');

  const activeCustomerIds = new Set(active.map(r => r.customerId));
  const availableCustomers = (currentCustomerId) =>
    data.customers.filter(c => !activeCustomerIds.has(c.id) || c.id === currentCustomerId);

  const openEdit = (r, e) => {
    e?.stopPropagation();
    setEditR(r);
    setForm({
      customerId: r.customerId || '',
      vehicleId: r.vehicleId || '',
      startDate: r.startDate || '',
      endDate: r.endDate || '',
      contractNumber: r.contractNumber || '',
      notes: r.notes || '',
      odometer: r.odometer || '',
      price: r.price || '',
      billingPeriod: r.billingPeriod || 'weekly',
      insuranceOption: r.insuranceOption || 'standard',
      bond: { ...EMPTY_BOND, ...(r.bond || {}) },
    });
  };

  const callEdgeFunction = (path, body) =>
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    }).catch(() => {});

  const createRental = async () => {
    if (!form.customerId) { alert('Please select a customer'); return; }
    if (!form.vehicleId) { alert('Please select a vehicle'); return; }
    if (!form.startDate) { alert('Start date is required'); return; }
    const bondAmount = form.bond.amount || (data.vehicles.find(v => v.id === form.vehicleId)?.type === 'ebike' ? data.settings?.ebikeBond || '150' : data.settings?.defaultBond || '300');
    if (form.odometer && !confirmOdometer(data.odometerReadings, form.vehicleId, form.odometer, form.startDate)) return;
    setSaving(true);
    try {
      const rental = await add('rentals', { ...form, bond: { ...form.bond, amount: bondAmount }, status: 'active' });
      await update('vehicles', form.vehicleId, { status: 'rented' });
      await refresh(); // odometer log and vehicle odometer are updated by database triggers
      setShowCreate(false);
      setForm(EF);
      if (window.confirm('Rental created! Generate contract now?')) {
        navigate('/contract', { state: { rentalId: rental.id } });
      }
    } finally { setSaving(false); }
  };

  const saveRental = async () => {
    if (!form.customerId) { alert('Please select a customer'); return; }
    if (!form.vehicleId) { alert('Please select a vehicle'); return; }
    if (!form.startDate) { alert('Start date is required'); return; }
    if (form.odometer && !confirmOdometer(data.odometerReadings, form.vehicleId, form.odometer, form.startDate, editR.id)) return;
    setSaving(true);
    try {
      // If vehicle changed on an active rental, update both vehicle statuses
      if (editR.status === 'active' && editR.vehicleId !== form.vehicleId) {
        await update('vehicles', editR.vehicleId, { status: 'available' });
        await update('vehicles', form.vehicleId, { status: 'rented' });
      }
      await update('rentals', editR.id, { ...form });
      await refresh(); // odometer log and vehicle odometer are updated by database triggers
      // Refresh the detail drawer if it's open for this rental
      if (detailR?.id === editR.id) setDetailR({ ...detailR, ...form });
      setEditR(null);
      setForm(EF);
    } finally { setSaving(false); }
  };

  const resetEnd = () => {
    setEndR(null); setEndMode('full'); setRetainedAmount(''); setRetainReason(BOND_RETAIN_REASONS[0]);
    setRetainedNote(''); setRefundMethod('bank'); setOdometerReturn('');
  };

  const endRental = async () => {
    const r = endR;
    if (odometerReturn.trim() && !confirmOdometer(data.odometerReadings, r.vehicleId, odometerReturn.trim(), todayStr())) return;
    let bondUpdate = r.bond ? { ...r.bond } : r.bond;
    let noteAppend = r.notes;
    if (r.bond?.amount && r.bond.status === 'held') {
      const amount = Number(r.bond.amount) || 0;
      const kept = endMode === 'full' ? 0 : endMode === 'keep' ? amount : Math.min(amount, Math.max(0, Number(retainedAmount) || 0));
      const refunded = amount - kept;
      const reason = kept > 0 ? [retainReason, retainedNote.trim()].filter(Boolean).join(' · ') : '';
      // Cash refunds are final now. A bank transfer stays Held with the planned amounts until
      // the outgoing bank line is confirmed in Finance › Reconcile (or marked manually in Bonds).
      const finalNow = refunded === 0 || refundMethod === 'cash';
      bondUpdate = {
        ...r.bond,
        refundedAmount: String(refunded), retainedAmount: String(kept), retainReason: reason,
        refundMethod: refunded > 0 ? refundMethod : '',
        refundDate: finalNow ? todayStr() : '',
        status: finalNow ? closedBondStatus(amount, refunded) : 'held',
      };
      if (kept > 0) noteAppend = r.notes ? `${r.notes}\nBond retained $${kept}: ${reason}` : `Bond retained $${kept}: ${reason}`;
    }
    const returnKm = odometerReturn.trim();
    await update('rentals', r.id, { status: 'completed', endDate: todayStr(), bond: bondUpdate, notes: noteAppend, odometerReturn: returnKm || null });
    // A vehicle already marked stolen or sold stays that way; otherwise it is free again.
    const endedVehicle = data.vehicles.find(v => v.id === r.vehicleId);
    if (endedVehicle && !['stolen', 'sold'].includes(endedVehicle.status)) await update('vehicles', r.vehicleId, { status: 'available' });
    if (returnKm) await refresh(); // the return reading goes into the odometer log via a trigger
    const endedCustomer = data.customers.find(c => c.id === r.customerId);
    if (endedCustomer?.email) {
      callEdgeFunction('send-review-email', { rental_id: r.id, customer_email: endedCustomer.email, customer_name: endedCustomer.name });
    }
    const keptAll = r.bond?.amount && r.bond.status === 'held' && endMode === 'keep';
    resetEnd();
    if (detailR?.id === r.id) setDetailR(null);
    if (keptAll) offerRetention({ ...r, endDate: todayStr() }, Number(r.bond.amount) || 0, bondUpdate.retainReason);
  };

  // Hard-delete a rental (e.g. customer never showed up). No review email, no completed record.
  const deleteRental = async () => {
    const r = deleteR;
    if (!r) return;
    setDeleting(true);
    try {
      const v = data.vehicles.find(x => x.id === r.vehicleId);
      if (r.status === 'active' && v?.status === 'rented') {
        await update('vehicles', r.vehicleId, { status: 'available' });
      }
      await remove('rentals', r.id);
      setDeleteR(null);
      if (detailR?.id === r.id) setDetailR(null);
    } finally { setDeleting(false); }
  };

  // Manual flip when a refund is final without going through Finance.
  const markBondReturned = async (rental) => {
    const amount = Number(rental.bond.amount) || 0;
    const refunded = rental.bond.refundedAmount === '' ? amount : Number(rental.bond.refundedAmount);
    const bond = { ...rental.bond, refundedAmount: String(refunded), retainedAmount: String(amount - refunded), refundDate: todayStr(), status: closedBondStatus(amount, refunded) };
    await update('rentals', rental.id, { bond });
    setDetailR(r => r ? { ...r, bond } : r);
  };

  // Vehicles available for selection in a form; for editing include the currently assigned one
  const vehicleOptions = (currentVehicleId) =>
    data.vehicles.filter(v => v.status === 'available' || v.id === currentVehicleId);

  const renderForm = (opts, customerOpts) => (
    <>
      <div className="grid-2">
        <div className="field">
          <label className="label">Customer *</label>
          <CustomerPicker customers={customerOpts} value={form.customerId} onChange={id => { const c = data.customers.find(x => x.id === id); setForm(f => ({ ...f, customerId: id, insuranceOption: c?.insuranceOption || f.insuranceOption })); }} startDate={form.startDate} />
          {data.customers.length === 0 && <span className="field-hint">No customers yet — add one first</span>}
          {(() => {
            const c = data.customers.find(x => x.id === form.customerId);
            if (!c || !isYoungRenter(c.dateOfBirth, form.startDate)) return null;
            return (
              <span className="field-hint" style={{ color: 'var(--amber)', fontWeight: 500 }}>
                Under 25 (age {ageOn(c.dateOfBirth, form.startDate)} at start) — let them know prices may vary
              </span>
            );
          })()}
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
      {data.vehicles.find(v => v.id === form.vehicleId)?.type !== 'ebike' && (
        <div className="grid-2">
          <div className="field">
            <label className="label">Odometer (km)</label>
            <input className="input" type="number" min="0" value={form.odometer} onChange={e => sf('odometer', e.target.value)} placeholder="e.g. 4250" />
            {(() => { const l = latestReading(data.odometerReadings, form.vehicleId); return l ? <span className="field-hint">Last reading {describeReading(l)}</span> : null; })()}
          </div>
        </div>
      )}
      <div className="grid-2">
        <div className="field">
          <label className="label">Billing Basis</label>
          <select className="select" value={form.billingPeriod} onChange={e => sf('billingPeriod', e.target.value)}>
            <option value="weekly">Weekly (price per week)</option>
            <option value="fixed">Fixed amount for the rental period</option>
          </select>
          <span className="field-hint">Weekly: the contract says "per week". Fixed: a single amount for the whole period, e.g. $105 for 2 days — the contract says "per rental period"</span>
        </div>
        <div className="field">
          <label className="label">{form.billingPeriod === 'fixed' ? 'Total Price for Rental Period ($)' : 'Weekly Price ($)'}</label>
          <input className="input" type="number" min="0" step="0.01" value={form.price} onChange={e => sf('price', e.target.value)} placeholder={form.billingPeriod === 'fixed' ? 'e.g. 105' : 'e.g. 150'} />
        </div>
      </div>
      {(() => {
        const v = data.vehicles.find(x => x.id === form.vehicleId);
        if (v?.type === 'ebike') return null;
        const a = termsAmountsFromSettings(data.settings);
        const c = data.customers.find(x => x.id === form.customerId);
        return (
          <div className="field">
            <label className="label">Liability Option</label>
            <select className="select" value={form.insuranceOption} onChange={e => sf('insuranceOption', e.target.value)}>
              {insuranceOptions(a).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="field-hint">
              {form.insuranceOption === 'reduced'
                ? `Out-of-pocket capped at $${a.reducedExcess} per incident — include the ${reducedPremiumText(a, form.billingPeriod)} in the price.`
                : `An accident costs the renter $${Number(a.defaultBond) + Number(a.insuranceExcess)} in total (bond kept, balance charged to card).`}
              {c?.insuranceOption && c.insuranceOption !== form.insuranceOption ? ` Customer chose "${insuranceOptions(a).find(o => o.value === c.insuranceOption)?.label}" on the intake form.` : ''}
            </span>
          </div>
        );
      })()}
      <div className="form-divider"><span>Bond / Deposit</span></div>
      <div className="grid-2">
        <div className="field">
          <label className="label">Amount ($)</label>
          <input className="input" type="number" min="0" value={form.bond.amount} onChange={e => sb('amount', e.target.value)} placeholder={data.vehicles.find(v => v.id === form.vehicleId)?.type === 'ebike' ? (data.settings?.ebikeBond || '150') : (data.settings?.defaultBond || '300')} />
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
            {BOND_STATUSES.map(st => <option key={st} value={st}>{bondLabel(st)}</option>)}
          </select>
          <span className="field-hint">Awaiting becomes Held when the deposit is confirmed in Finance › Reconcile. Cash bonds can be set to Held here.</span>
        </div>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="label">Contract Number</label>
          <input className="input" value={form.contractNumber} onChange={e => sf('contractNumber', e.target.value)} placeholder="e.g. SC-021" />
          <span className="field-hint">Auto-suggested from vehicle type — you can edit this</span>
        </div>
      </div>
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} /></div>
    </>
  );

  const toggleSort = (col) =>
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });

  const sortRentals = (list) => {
    const { col, dir } = sort;
    const mul = dir === 'asc' ? 1 : -1;
    return [...list].sort((a, b) => {
      let av, bv;
      if (col === 'customer') {
        av = data.customers.find(x => x.id === a.customerId)?.name || '';
        bv = data.customers.find(x => x.id === b.customerId)?.name || '';
      } else if (col === 'vehicle') {
        av = data.vehicles.find(x => x.id === a.vehicleId)?.plate || '';
        bv = data.vehicles.find(x => x.id === b.vehicleId)?.plate || '';
      } else if (col === 'contractNumber') {
        av = a.contractNumber || '';
        bv = b.contractNumber || '';
      } else if (col === 'startDate') {
        av = a.startDate || '';
        bv = b.startDate || '';
      } else if (col === 'endDate') {
        av = a.endDate || '';
        bv = b.endDate || '';
      } else if (col === 'duration') {
        av = a.startDate ? daysBetween(a.startDate, a.endDate || todayStr()) : 0;
        bv = b.startDate ? daysBetween(b.startDate, b.endDate || todayStr()) : 0;
        return (av - bv) * mul;
      } else if (col === 'payDay') {
        const [ay, am, ad] = (a.startDate || '').split('-').map(Number);
        const [by, bm, bd] = (b.startDate || '').split('-').map(Number);
        av = a.startDate ? new Date(ay, am - 1, ad).getDay() : -1;
        bv = b.startDate ? new Date(by, bm - 1, bd).getDay() : -1;
        return (av - bv) * mul;
      } else if (col === 'price') {
        av = Number(a.price) || 0;
        bv = Number(b.price) || 0;
        return (av - bv) * mul;
      } else if (col === 'bond') {
        av = Number(a.bond?.amount) || 0;
        bv = Number(b.bond?.amount) || 0;
        return (av - bv) * mul;
      } else { return 0; }
      return av.localeCompare(bv) * mul;
    });
  };

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

  const paymentDay = (startDate) => {
    if (!startDate) return '—';
    const [y, m, d] = startDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-AU', { weekday: 'long' });
  };

  const RentalRow = ({ r, showEnd, showPayDay }) => {
    const c = data.customers.find(x => x.id === r.customerId);
    const v = data.vehicles.find(x => x.id === r.vehicleId);
    const dur = r.startDate ? daysBetween(r.startDate, r.endDate || todayStr()) : 0;
    const sigReq = getSignReq(r.id);
    return (
      <tr onClick={() => { setDetailR(r); const cu = data.customers.find(x => x.id === r.customerId); setSignEmailAddr(cu?.email || ''); setSignResult(null); }}>
        <td className="fw-500">{c?.name || '—'}</td>
        <td>
          <div className="fw-500">{v?.plate || '—'}</div>
          <div className="text-sm text-muted">{v ? (v.name || v.type) : ''}</div>
        </td>
        <td className="text-muted col-hide-mobile">{r.contractNumber || '—'}</td>
        <td className="text-muted">{formatDate(r.startDate)}</td>
        {showPayDay && <td className="text-muted">{r.billingPeriod === 'fixed' ? '—' : paymentDay(r.startDate)}</td>}
        <td className="text-muted">{r.status === 'active' ? `${dur}d` : formatDate(r.endDate)}</td>
        <td className="text-muted">{r.price ? `$${Number(r.price).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}${r.billingPeriod === 'fixed' ? ' total' : '/wk'}` : '—'}</td>
        <td>
          {r.bond?.amount
            ? <div><div style={{ fontSize: 13, fontWeight: 600 }}>${r.bond.amount}</div><Badge variant={bondVariant(r.bond.status)}>{bondLabel(r.bond.status)}</Badge></div>
            : <span className="text-sm text-muted">None</span>}
        </td>
        <td>
          {sigReq?.status === 'signed'
            ? <Badge variant="green">Signed</Badge>
            : sigReq
              ? <Badge variant="amber">Awaiting</Badge>
              : null}
        </td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/contract', { state: { rentalId: r.id } })}>Contract</button>
            <button className="btn btn-secondary btn-sm" onClick={e => openEdit(r, e)}>Edit</button>
            {showEnd && <button className="btn btn-secondary btn-sm" onClick={e => { e.stopPropagation(); setEndR(r); setRetainedAmount(r.bond?.amount || ''); }}>End</button>}
            <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); setDeleteR(r); }}>Delete</button>
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
          : <div className="table-wrap"><table className="table">
            <thead><tr>
              <SortTh col="customer">Customer</SortTh>
              <SortTh col="vehicle">Vehicle</SortTh>
              <SortTh col="contractNumber" className="col-hide-mobile">Contract No.</SortTh>
              <SortTh col="startDate">Started</SortTh>
              <SortTh col="payDay">Pay Day</SortTh>
              <SortTh col="duration">Duration</SortTh>
              <SortTh col="price">Price</SortTh>
              <SortTh col="bond">Bond</SortTh>
              <th>Signature</th>
              <th></th>
            </tr></thead>
            <tbody>{sortRentals(active).map(r => <RentalRow key={r.id} r={r} showEnd={true} showPayDay={true} />)}</tbody>
          </table></div>
        )}
        {tab === 'past' && (past.length === 0
          ? <EmptyState message="No completed rentals yet" />
          : <div className="table-wrap"><table className="table">
            <thead><tr>
              <SortTh col="customer">Customer</SortTh>
              <SortTh col="vehicle">Vehicle</SortTh>
              <SortTh col="contractNumber" className="col-hide-mobile">Contract No.</SortTh>
              <SortTh col="startDate">Started</SortTh>
              <SortTh col="endDate">Ended</SortTh>
              <SortTh col="price">Price</SortTh>
              <SortTh col="bond">Bond</SortTh>
              <th>Signature</th>
              <th></th>
            </tr></thead>
            <tbody>{sortRentals(past).map(r => <RentalRow key={r.id} r={r} showEnd={false} />)}</tbody>
          </table></div>
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

      {/* Delete rental */}
      <Modal open={!!deleteR} onClose={() => setDeleteR(null)} title="Delete Rental"
        footer={<><button className="btn btn-secondary" onClick={() => setDeleteR(null)}>Keep Rental</button><button className="btn btn-danger" onClick={deleteRental} disabled={deleting}>{deleting ? 'Deleting…' : 'Delete Rental'}</button></>}>
        {deleteR && (() => {
          const c = data.customers.find(x => x.id === deleteR.customerId);
          const v = data.vehicles.find(x => x.id === deleteR.vehicleId);
          const heldBond = deleteR.bond?.amount && deleteR.bond.status === 'held';
          return (
            <div>
              <p style={{ fontSize: 14, marginBottom: 16 }}>Use this when a booking never went ahead (e.g. the customer did not show up). The rental is removed completely instead of being marked as completed, and no review email is sent.</p>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div className="fw-500" style={{ marginBottom: 4 }}>{c?.name || '—'} · {v?.plate || '—'}{v?.name ? ' · ' + v.name : ''}</div>
                <div className="text-sm text-muted">Started {formatDate(deleteR.startDate)}{deleteR.contractNumber ? ` · Contract ${deleteR.contractNumber}` : ''}</div>
              </div>
              <ul className="text-sm text-muted" style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {deleteR.status === 'active' && v?.status === 'rented' && <li>{v.plate} will be set back to available.</li>}
                {heldBond && <li>The held bond of ${deleteR.bond.amount} will be removed from the Bonds page too.</li>}
                <li>Any signing request for this rental is deleted. This cannot be undone.</li>
              </ul>
            </div>
          );
        })()}
      </Modal>

      {/* Record a kept-in-full bond in Finance */}
      <Modal open={!!retainOffer} onClose={() => setRetainOffer(null)} title="Record the kept bond in Finance?"
        footer={<><button className="btn btn-secondary" onClick={() => setRetainOffer(null)}>Not now</button><button className="btn btn-primary" onClick={recordRetention} disabled={retainSaving}>{retainSaving ? 'Saving…' : 'Record it'}</button></>}>
        {retainOffer && (() => {
          const o = retainOffer; const d = o.deposits[0];
          const acc = fin.accounts.find(a => a.id === d.tx.accountId);
          const c = data.customers.find(x => x.id === o.rental.customerId);
          return (
            <>
              <p style={{ fontSize: 14 }}>You kept <strong>${o.amount}</strong> of {c?.name || 'the customer'}'s bond. The money arrived on {formatDate(d.tx.date)} and is in Finance as a bond deposit{o.deposits.length > 1 ? ` (${o.deposits.length} lines, $${o.depositTotal} in total)` : ''}, so it is not counted as income yet.</p>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                <div className="fw-600" style={{ marginBottom: 4 }}>This adds one entry on {acc?.name || 'the same account'}, dated {formatDate(o.rental.endDate || todayStr())}, amount $0:</div>
                <div>Bond refund −${o.amount} · closes the bond</div>
                <div>Bond retained +${o.amount} · counted as income</div>
                <div className="text-muted" style={{ marginTop: 4 }}>No money moves, so the account balance does not change.</div>
              </div>
              {o.depositTotal && Math.abs(o.depositTotal - o.amount) >= 0.01 && <div className="text-sm" style={{ color: 'var(--amber)' }}>The deposit in Finance (${o.depositTotal}) is different from the bond on the rental (${o.amount}). The entry uses the rental's amount; check the deposit line if that is wrong.</div>}
              {retainErr && <div style={{ color: 'var(--red)', fontSize: 13 }}>{retainErr}</div>}
            </>
          );
        })()}
      </Modal>

      {/* End rental */}
      <Modal open={!!endR} onClose={resetEnd} title="End Rental"
        footer={endR && (
          <>
            <button className="btn btn-secondary" onClick={resetEnd}>Cancel</button>
            <button className="btn btn-primary" onClick={endRental}>End rental</button>
          </>
        )}>
        {endR && (() => {
          const c = data.customers.find(x => x.id === endR.customerId);
          const v = data.vehicles.find(x => x.id === endR.vehicleId);
          const hasBond = endR.bond?.amount && endR.bond.status === 'held';
          return (
            <div>
              <p style={{ fontSize: 14, marginBottom: 16, color: 'var(--muted)' }}>This will mark the rental as completed and set the vehicle back to available.</p>
              <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div className="fw-500" style={{ marginBottom: 4 }}>{c?.name || '—'} · {v?.plate || '—'}{v?.name ? ' · ' + v.name : ''}</div>
                <div className="text-sm text-muted">Started {formatDate(endR.startDate)} · {daysBetween(endR.startDate, todayStr())}d</div>
                {endR.odometer && <div className="text-sm text-muted" style={{ marginTop: 4 }}>Start odometer: {Number(endR.odometer).toLocaleString()} km</div>}
              </div>
              <div className="field" style={{ marginBottom: 16 }}>
                <label className="label">Rental Notes</label>
                {endR.notes
                  ? <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '12px 14px', fontSize: 14, whiteSpace: 'pre-wrap' }}>{endR.notes}</div>
                  : <div className="text-sm text-muted">No notes recorded for this rental.</div>}
              </div>
              {v?.type !== 'ebike' && (
                <div className="field" style={{ marginBottom: 16 }}>
                  <label className="label">Return Odometer (km)</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    value={odometerReturn}
                    onChange={e => setOdometerReturn(e.target.value)}
                    placeholder={endR.odometer ? `e.g. ${Number(endR.odometer) + 100}` : 'e.g. 4350'}
                  />
                  {odometerReturn && endR.odometer && Number(odometerReturn) > Number(endR.odometer) && (
                    <span className="field-hint">{(Number(odometerReturn) - Number(endR.odometer)).toLocaleString()} km this rental · vehicle odometer will be updated</span>
                  )}
                </div>
              )}
              {hasBond && (() => {
                const amount = Number(endR.bond.amount) || 0;
                const kept = endMode === 'full' ? 0 : endMode === 'keep' ? amount : Math.min(amount, Math.max(0, Number(retainedAmount) || 0));
                const refunded = amount - kept;
                const Opt = ({ mode, title, sub, children }) => (
                  <label style={{ display: 'block', border: `1.5px solid ${endMode === mode ? 'var(--accent)' : 'var(--border)'}`, background: endMode === mode ? 'var(--accent-light)' : 'white', borderRadius: 10, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <input type="radio" name="endMode" checked={endMode === mode} onChange={() => setEndMode(mode)} style={{ marginTop: 3 }} />
                      <div style={{ flex: 1 }}>
                        <div className="fw-600" style={{ fontSize: 14 }}>{title}</div>
                        {sub && <div className="text-sm text-muted">{sub}</div>}
                        {endMode === mode && children}
                      </div>
                    </div>
                  </label>
                );
                return (
                  <div>
                    <div className="form-divider"><span>Bond · ${endR.bond.amount} held via {endR.bond.method}</span></div>
                    <Opt mode="full" title={`Refund in full · $${amount}`} />
                    <Opt mode="partial" title="Refund part, keep some">
                      <div className="grid-2" style={{ marginTop: 10 }}>
                        <div className="field"><label className="label">Keep ($)</label>
                          <input className="input" type="number" min="0" max={amount} value={retainedAmount} onChange={e => setRetainedAmount(e.target.value)} placeholder="e.g. 10" /></div>
                        <div className="field"><label className="label">Reason</label>
                          <select className="select" value={retainReason} onChange={e => setRetainReason(e.target.value)}>{BOND_RETAIN_REASONS.map(x => <option key={x}>{x}</option>)}</select></div>
                      </div>
                    </Opt>
                    <Opt mode="keep" title="Keep all of it" sub="For damage or unpaid rent above the bond">
                      <div className="field" style={{ marginTop: 10 }}><label className="label">Reason</label>
                        <select className="select" value={retainReason} onChange={e => setRetainReason(e.target.value)}>{BOND_RETAIN_REASONS.map(x => <option key={x}>{x}</option>)}</select></div>
                    </Opt>
                    {endMode !== 'full' && (
                      <div className="field" style={{ marginBottom: 12 }}><label className="label">Notes on what was kept</label>
                        <textarea className="textarea" rows={2} value={retainedNote} onChange={e => setRetainedNote(e.target.value)} placeholder="e.g. Scratch on left panel, mirror replacement…" /></div>
                    )}
                    {refunded > 0 && (
                      <div className="field" style={{ marginBottom: 12 }}><label className="label">Refund by</label>
                        <select className="select" value={refundMethod} onChange={e => setRefundMethod(e.target.value)}>
                          <option value="bank">Bank transfer</option>
                          <option value="cash">Cash</option>
                        </select></div>
                    )}
                    <div style={{ padding: '10px 12px', background: 'var(--amber-bg)', borderRadius: 10, fontSize: 13 }}>
                      {refunded > 0 && refundMethod === 'bank'
                        ? <>Expect a bank line of <strong>−${refunded.toFixed(2)}</strong>. The bond stays Held until Finance confirms it{kept > 0 && <>, and the <strong>${kept}</strong> kept becomes Bond retained income</>}.</>
                        : refunded > 0
                          ? <>Bond will be marked <strong>{bondLabel(closedBondStatus(amount, refunded))}</strong> now{kept > 0 && <>, ${kept} kept as income</>}.</>
                          : <>Bond will be marked <strong>Retained</strong>: ${amount} kept as income.</>}
                    </div>
                  </div>
                );
              })()}
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
                {selected.contractNumber && <div><div className="label">Contract No.</div><div style={{ marginTop: 3, fontWeight: 600 }}>{selected.contractNumber}</div></div>}
                {selected.odometer && <div><div className="label">Odometer at Start</div><div style={{ marginTop: 3 }}>{Number(selected.odometer).toLocaleString()} km</div></div>}
                {selected.odometerReturn && <div><div className="label">Odometer at Return</div><div style={{ marginTop: 3, fontWeight: 600 }}>{Number(selected.odometerReturn).toLocaleString()} km{selected.odometer ? ` (+${(Number(selected.odometerReturn) - Number(selected.odometer)).toLocaleString()} km)` : ''}</div></div>}
                {selected.insuranceOption && data.vehicles.find(x => x.id === selected.vehicleId)?.type !== 'ebike' && <div><div className="label">Liability Option</div><div style={{ marginTop: 3 }}>{insuranceOptions(termsAmountsFromSettings(data.settings)).find(o => o.value === selected.insuranceOption)?.label || selected.insuranceOption}</div></div>}
                {selected.price && <div><div className="label">{selected.billingPeriod === 'fixed' ? 'Total Price (Rental Period)' : 'Weekly Price'}</div><div style={{ marginTop: 3, fontWeight: 600 }}>${Number(selected.price).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}{selected.billingPeriod === 'fixed' ? ' total' : ' / week'}</div></div>}
              </div>
              <div style={{ background: selected.bond?.amount ? (selected.bond.status === 'held' ? 'var(--amber-bg)' : selected.bond.status === 'awaiting' ? 'var(--blue-bg)' : 'var(--accent-light)') : 'var(--bg)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                <div className="fw-600" style={{ marginBottom: 10, fontSize: 13 }}>Bond / Deposit</div>
                {selected.bond?.amount ? (
                  <>
                    <div className="grid-2">
                      <div><div className="label">Amount</div><div className="fw-600" style={{ marginTop: 3 }}>${selected.bond.amount}</div></div>
                      <div><div className="label">Method</div><div style={{ marginTop: 3, textTransform: 'capitalize' }}>{selected.bond.method}</div></div>
                      <div><div className="label">Status</div><div style={{ marginTop: 3 }}><Badge variant={bondVariant(selected.bond.status)}>{bondLabel(selected.bond.status)}</Badge></div></div>
                      {selected.bond.retainedAmount !== '' && Number(selected.bond.retainedAmount) > 0 && (
                        <div><div className="label">Kept</div><div style={{ marginTop: 3 }}>${selected.bond.retainedAmount}{selected.bond.retainReason ? ` · ${selected.bond.retainReason}` : ''}</div></div>
                      )}
                    </div>
                    {selected.bond.status === 'held' && selected.bond.refundedAmount !== '' && Number(selected.bond.refundedAmount) > 0 && (
                      <div className="text-sm" style={{ marginTop: 10 }}>Refund of ${selected.bond.refundedAmount} by {selected.bond.refundMethod || 'bank'} recorded, waiting for the bank line in Finance.</div>
                    )}
                    {financeReady && bondInFinance(selected, fin.transactions).needsRetention && (
                      <div style={{ marginTop: 12, background: 'white', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                        <div>The bond is in Finance as a deposit, but keeping it is not recorded there yet, so it is not counted as income.</div>
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => offerRetention(selected, Number(selected.bond.retainedAmount || selected.bond.amount) || 0, selected.bond.retainReason)}>Record in Finance</button>
                      </div>
                    )}
                    {selected.bond.status === 'held' && (
                      <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }} onClick={() => markBondReturned(selected)}>
                        {selected.bond.refundedAmount !== '' && Number(selected.bond.refundedAmount) < Number(selected.bond.amount) ? 'Mark refund done' : 'Mark bond refunded'}
                      </button>
                    )}
                  </>
                ) : <div className="text-sm text-muted">No bond recorded</div>}
              </div>
              {selected.notes && <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: 14, color: 'var(--muted)' }}>{selected.notes}</div>}
              {/* E-Signature */}
              {(() => {
                const sigReq = getSignReq(selected.id);
                const customer = data.customers.find(x => x.id === selected.customerId);
                return (
                  <div style={{ background: sigReq?.status === 'signed' ? '#f0fdf4' : '#f7f6f2', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
                    <div className="fw-600" style={{ fontSize: 13, marginBottom: 8 }}>E-Signature</div>
                    {sigReq?.status === 'signed' ? (
                      <div>
                        <Badge variant="green">Signed</Badge>
                        <div className="text-sm text-muted" style={{ marginTop: 6 }}>
                          Signed by <strong>{sigReq.signerName}</strong> on {new Date(sigReq.signedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <button
                          className="btn btn-secondary btn-sm"
                          style={{ marginTop: 10 }}
                          onClick={() => window.open(`/sign/${sigReq.token}`, '_blank')}
                        >
                          View Signed Contract
                        </button>
                      </div>
                    ) : sigReq ? (
                      <div>
                        <Badge variant="amber">Awaiting signature</Badge>
                        <div className="text-sm text-muted" style={{ marginTop: 6 }}>Link sent · expires {new Date(sigReq.expiresAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted">Not sent yet</div>
                    )}
                    <div style={{ marginTop: 12 }}>
                      <div className="label" style={{ marginBottom: 6 }}>
                        {sigReq?.status === 'signed' ? 'Email the signed agreement to' : 'Email a signing link to'}
                      </div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input
                          type="email"
                          placeholder={customer?.email || 'customer@email.com'}
                          value={signEmailAddr}
                          onChange={e => setSignEmailAddr(e.target.value)}
                          style={{ flex: '1 1 160px', minWidth: 0, border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 13, outline: 'none' }}
                        />
                        <button
                          className="btn btn-primary btn-sm"
                          disabled={sendingSign || !signEmailAddr.trim()}
                          onClick={() => sendSigningEmail(selected, signEmailAddr)}
                        >
                          {sendingSign ? 'Sending…' : sigReq?.status === 'signed' ? 'Send Copy' : 'Send'}
                        </button>
                      </div>
                      {signResult === 'sent' && <div className="text-sm" style={{ color: '#166534', marginTop: 6 }}>{sigReq?.status === 'signed' ? 'Signed copy sent!' : 'Signing link sent!'}</div>}
                      {signResult === 'error' && <div className="text-sm" style={{ color: 'var(--red)', marginTop: 6 }}>Failed to send. Try again.</div>}
                    </div>
                  </div>
                );
              })()}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <button className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={() => navigate('/contract', { state: { rentalId: selected.id } })}>Generate Contract</button>
                <button className="btn btn-secondary" style={{ justifyContent: 'center' }} onClick={() => { setDetailR(null); openEdit(selected, null); }}>Edit Rental</button>
                {selected.status === 'active' && (
                  <button className="btn btn-primary" style={{ justifyContent: 'center' }} onClick={() => { setDetailR(null); setEndR(selected); setRetainedAmount(selected.bond?.amount || ''); }}>End This Rental</button>
                )}
                <button className="btn btn-danger" style={{ justifyContent: 'center' }} onClick={() => { setDetailR(null); setDeleteR(selected); }}>Delete Rental</button>
              </div>
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
}
