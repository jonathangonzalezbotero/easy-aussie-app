import { useEffect, useMemo, useState } from 'react';
import Drawer from '../../components/shared/Drawer';
import Badge from '../../components/shared/Badge';
import SearchSelect from '../../components/shared/SearchSelect';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { useSuggestions } from '../../finance/useSuggestions';
import { categoryLabel, categoryTypeNote, money, SOURCE_LABEL, toCents } from '../../finance/categories';
import { buildConfirm, splitRemainder } from '../../finance/confirm';
import { unreimbursedExpenses, directorPosition } from '../../finance/reports';
import { entriesForTransaction, MAINTENANCE_CATEGORIES } from '../../finance/maintenanceLink';
import { formatDate, todayStr } from '../../utils/dates';
import { BOND_RETAIN_REASONS } from '../../utils/bond';
import { AmountCell, AccountBadge, CategorySelect, SideEffectNote, StatusBadge } from './bits';

const blankSplit = () => ({ category: '', amount: '', rentalId: '', customerId: '', vehicleId: '', payeeId: '', notes: '' });

// Edit any transaction, or create a manual one (tx = null). Imported lines keep date, amount and
// description locked; only category, links, splits and notes change.
export default function TransactionDrawer({ tx, open, onClose, onSaved, defaultAccountId }) {
  const fin = useFinance();
  const { data, update: updateStore } = useStore();
  const suggestions = useSuggestions();
  const isNew = !tx;
  const locked = !!tx && tx.source !== 'manual';
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setErr('');
    if (tx) {
      setForm({
        accountId: tx.accountId, date: tx.date, amount: String(tx.amount), description: tx.description,
        category: tx.category === 'split' ? '' : tx.category, splitOn: tx.splits.length > 0,
        splits: tx.splits.length ? tx.splits.map(s => ({ ...s, amount: String(s.amount) })) : [blankSplit(), blankSplit()],
        customerId: tx.customerId || '', rentalId: tx.rentalId || '', vehicleId: tx.vehicleId || '', payeeId: tx.payeeId || '',
        linkedTransactionId: tx.linkedTransactionId || '', notes: tx.notes || '', refundMode: 'retain', retainReason: BOND_RETAIN_REASONS[0],
        maintenanceId: data.maintenance.find(m => m.transactionId === tx.id)?.id || '',
      });
    } else {
      const manualAccounts = fin.accounts.filter(a => a.feed === 'manual');
      setForm({ accountId: defaultAccountId || manualAccounts[0]?.id || fin.accounts[0]?.id || '', date: todayStr(), amount: '', description: '', category: '', splitOn: false, splits: [blankSplit(), blankSplit()], customerId: '', rentalId: '', vehicleId: '', payeeId: '', linkedTransactionId: '', notes: '', refundMode: 'retain', retainReason: BOND_RETAIN_REASONS[0], maintenanceId: '' });
    }
  }, [open, tx, defaultAccountId, fin.accounts, data.maintenance]);

  const sug = tx ? suggestions[tx.id] : null;
  const account = fin.accounts.find(a => a.id === form?.accountId);
  const unpaid = useMemo(() => unreimbursedExpenses(fin).filter(t => t.id !== tx?.id), [fin, tx]);
  const director = useMemo(() => directorPosition(fin), [fin]);

  if (!form) return <Drawer open={open} onClose={onClose} title="Transaction" />;

  const sf = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setSplit = (i, k, v) => setForm(f => ({ ...f, splits: f.splits.map((s, j) => j === i ? { ...s, [k]: v } : s) }));

  const amountNum = Number(form.amount) || 0;
  const pseudoTx = { ...(tx || {}), id: tx?.id, amount: amountNum, date: form.date };
  const activeSplits = form.splitOn ? form.splits.filter(s => s.category || s.amount !== '') : [];
  const remainder = form.splitOn ? splitRemainder(pseudoTx, activeSplits) : 0;
  const splitsValid = !form.splitOn || (activeSplits.length >= 2 && remainder === 0 && activeSplits.every(s => s.category));
  const confirmPayload = buildConfirm(pseudoTx, { ...form, splits: form.splitOn ? activeSplits.map(s => ({ ...s, amount: Number(s.amount) })) : [] }, { rentals: data.rentals });
  const linkedExpense = form.linkedTransactionId ? fin.transactions.find(t => t.id === form.linkedTransactionId) : null;
  const canSave = form.accountId && form.date && form.amount !== '' && (form.splitOn ? splitsValid : !!form.category) && !saving;
  const isJob = form.splitOn ? activeSplits.some(s => MAINTENANCE_CATEGORIES.includes(s.category)) : MAINTENANCE_CATEGORIES.includes(form.category);
  const currentlyLinked = tx ? data.maintenance.find(m => m.transactionId === tx.id) : null;
  const jobMatches = isJob && amountNum < 0 ? entriesForTransaction({ ...pseudoTx, vehicleId: form.vehicleId, rentalId: form.rentalId }, data.maintenance, data.rentals, { days: 30 }).slice(0, 6) : [];
  const pickJob = (m) => setForm(f => ({ ...f, maintenanceId: m ? m.id : '', vehicleId: m?.vehicleId || f.vehicleId }));

  const applySuggestion = () => {
    if (!sug) return;
    setForm(f => ({
      ...f, category: sug.category || f.category, customerId: sug.customerId || f.customerId, rentalId: sug.rentalId || f.rentalId,
      vehicleId: sug.vehicleId || f.vehicleId, payeeId: sug.payeeId || f.payeeId, linkedTransactionId: sug.linkedTransactionId || f.linkedTransactionId,
      splitOn: !!sug.splits, splits: sug.splits ? sug.splits.map(s => ({ ...blankSplit(), ...s, amount: String(s.amount) })) : f.splits,
    }));
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const splits = form.splitOn ? activeSplits.map(s => ({ category: s.category, amount: Number(s.amount), rentalId: s.rentalId || null, customerId: s.customerId || null, vehicleId: s.vehicleId || null, payeeId: s.payeeId || null, notes: s.notes || '' })) : [];
      let saved;
      if (isNew) {
        saved = await fin.addTransaction({ accountId: form.accountId, date: form.date, amount: amountNum, description: form.description.trim() || categoryLabel(form.category), source: 'manual', category: splits.length ? 'split' : form.category, matchStatus: 'confirmed', customerId: form.customerId || null, rentalId: form.rentalId || null, vehicleId: form.vehicleId || null, payeeId: form.payeeId || null, linkedTransactionId: form.linkedTransactionId || null, notes: form.notes, splits });
        if (confirmPayload.rentalId) await fin.confirmTransaction({ ...confirmPayload, id: saved.id, splits });
      } else {
        if (!locked) await fin.updateTransaction(tx.id, { accountId: form.accountId, date: form.date, amount: amountNum, description: form.description.trim() });
        saved = await fin.confirmTransaction({ ...confirmPayload, splits });
      }
      // Service-log link: one entry per payment. Clearing the pick unlinks a previously linked entry.
      if (form.maintenanceId && form.maintenanceId !== currentlyLinked?.id) await updateStore('maintenance', form.maintenanceId, { transactionId: saved.id });
      if (currentlyLinked && form.maintenanceId !== currentlyLinked.id) await updateStore('maintenance', currentlyLinked.id, { transactionId: null });
      onSaved?.(saved, confirmPayload.effects);
      onClose();
    } catch (e) { setErr(e.message || String(e)); } finally { setSaving(false); }
  };

  const ignore = async () => {
    setSaving(true);
    try { await fin.updateTransaction(tx.id, { matchStatus: 'ignored' }); onSaved?.({ ...tx, matchStatus: 'ignored' }, []); onClose(); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const del = async () => {
    if (!window.confirm('Delete this manual transaction?')) return;
    setSaving(true);
    try { await fin.removeTransaction(tx.id); onSaved?.(null, []); onClose(); }
    catch (e) { setErr(e.message); } finally { setSaving(false); }
  };

  // Plain render function (not a component) so the selects keep their identity between renders.
  const customerOptions = data.customers.map(c => ({ value: c.id, label: c.name, sub: c.phone || c.email || '' }));
  const rentalOptions = (customerId) => data.rentals.filter(r => !customerId || r.customerId === customerId)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
    .map(r => { const v = data.vehicles.find(x => x.id === r.vehicleId); const c = data.customers.find(x => x.id === r.customerId); return { value: r.id, label: `${r.contractNumber || formatDate(r.startDate)} · ${v?.plate || ''}`, sub: `${c?.name || ''}${r.bond?.amount ? ` · bond $${r.bond.amount}` : ''} · ${r.status}` }; });
  const vehicleOptions = data.vehicles.map(v => ({ value: v.id, label: v.plate, sub: v.name || v.type }));
  const payeeOptions = fin.payees.filter(p => p.active !== false).map(p => ({ value: p.id, label: p.name, sub: p.kind }));
  const createPayee = async (name, apply) => { try { const p = await fin.addPayee({ name, kind: 'contractor' }); apply(p.id); } catch (e) { setErr(e.message); } };
  const linkFields = (value, onChange) => (
    <div className="grid-2" style={{ gap: 10 }}>
      <div className="field"><label className="label">Customer</label>
        <SearchSelect options={customerOptions} value={value.customerId || ''} placeholder="Search customers…" onChange={id => onChange({ customerId: id, rentalId: '' })} /></div>
      <div className="field"><label className="label">Rental</label>
        <SearchSelect options={rentalOptions(value.customerId)} value={value.rentalId || ''} placeholder="Search rentals…" onChange={id => { const r = data.rentals.find(x => x.id === id); onChange({ rentalId: id, customerId: r?.customerId || value.customerId, vehicleId: r?.vehicleId || value.vehicleId }); }} /></div>
      <div className="field"><label className="label">Vehicle</label>
        <SearchSelect options={vehicleOptions} value={value.vehicleId || ''} placeholder="Search plates…" onChange={id => onChange({ vehicleId: id })} /></div>
      <div className="field"><label className="label">Paid to</label>
        <SearchSelect options={payeeOptions} value={value.payeeId || ''} placeholder="Contractor or supplier…" onChange={id => onChange({ payeeId: id })} onCreate={name => createPayee(name, id => onChange({ payeeId: id }))} createLabel="Add payee" /></div>
    </div>
  );

  return (
    <Drawer open={open} onClose={onClose} title={isNew ? 'Add manual transaction' : 'Transaction'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tx && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div className="text-sm text-muted">{formatDate(tx.date)} · <AccountBadge account={account} /> · {SOURCE_LABEL[tx.source]}</div>
            <StatusBadge status={tx.matchStatus} />
          </div>
        )}
        {tx && <div style={{ fontSize: 26, fontWeight: 700 }}><AmountCell value={tx.amount} /></div>}
        {tx && <div className="fin-mono" style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px' }}>{tx.description || '—'}</div>}

        {(isNew || !locked) && (
          <>
            <div className="grid-2" style={{ gap: 10 }}>
              <div className="field"><label className="label">Account</label>
                <select className="select" value={form.accountId} onChange={e => sf('accountId', e.target.value)}>{fin.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
              <div className="field"><label className="label">Date</label><input className="input" type="date" value={form.date} onChange={e => sf('date', e.target.value)} /></div>
            </div>
            <div className="grid-2" style={{ gap: 10 }}>
              <div className="field"><label className="label">Amount ($)</label>
                <input className="input" type="number" step="0.01" value={form.amount} onChange={e => sf('amount', e.target.value)} placeholder="−50 for money out" />
                <span className="field-hint">Money in positive, money out negative.</span></div>
              <div className="field"><label className="label">Description</label><input className="input" value={form.description} onChange={e => sf('description', e.target.value)} placeholder="e.g. Cash · Yann one day" /></div>
            </div>
          </>
        )}

        {sug && tx.matchStatus !== 'confirmed' && (
          <div style={{ background: 'var(--blue-bg)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div><div className="label" style={{ color: 'var(--blue)' }}>Suggested</div>
                <div className="fw-600" style={{ fontSize: 14 }}>{categoryLabel(sug.category)}{sug.splits ? ' + split' : ''}</div>
                <div className="text-sm text-muted">Why: {sug.reason}</div></div>
              <button className="btn btn-secondary btn-sm" style={{ background: 'white' }} onClick={applySuggestion}>Use</button>
            </div>
          </div>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.splitOn} onChange={e => sf('splitOn', e.target.checked)} />
          <span className="fw-600" style={{ fontSize: 14 }}>Split this transaction</span>
          {form.splitOn && <span className="text-sm text-muted">{activeSplits.length} lines</span>}
        </label>

        {!form.splitOn ? (
          <div className="field"><label className="label">Category</label>
            <CategorySelect value={form.category} onChange={v => sf('category', v)} />
            <span className="field-hint">{categoryTypeNote(form.category)}</span></div>
        ) : (
          <div>
            {form.splits.map((s, i) => (
              <div key={i} className="fin-split-line">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px auto', gap: 8, alignItems: 'end' }}>
                  <div className="field"><label className="label">Line {i + 1} · category</label><CategorySelect value={s.category} onChange={v => setSplit(i, 'category', v)} /></div>
                  <div className="field"><label className="label">Amount</label><input className="input" type="number" step="0.01" value={s.amount} onChange={e => setSplit(i, 'amount', e.target.value)} /></div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, splits: f.splits.filter((_, j) => j !== i) }))} disabled={form.splits.length <= 2}>×</button>
                </div>
                {s.category && <div className="text-sm text-muted" style={{ marginTop: 6 }}>{categoryTypeNote(s.category)}{s.rentalId ? ` · ${data.rentals.find(r => r.id === s.rentalId)?.contractNumber || 'rental'}` : ''}</div>}
                {s.category && (
                  <div style={{ marginTop: 8 }}>{linkFields(s, p => setForm(f => ({ ...f, splits: f.splits.map((x, j) => j === i ? { ...x, ...p } : x) })))}</div>
                )}
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setForm(f => ({ ...f, splits: [...f.splits, blankSplit()] }))}>+ Add split line</button>
              <div style={{ background: remainder === 0 ? 'var(--accent-light)' : 'var(--amber-bg)', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 600 }}>Left to allocate {money(remainder / 100)}</div>
            </div>
          </div>
        )}

        {!form.splitOn && (
          <>
            <div className="label">Linked records</div>
            {linkFields(form, p => setForm(f => ({ ...f, ...p })))}
            {form.category === 'bond_refund' && form.rentalId && (() => {
              const r = data.rentals.find(x => x.id === form.rentalId); const bond = toCents(r?.bond?.amount); const out = Math.abs(toCents(amountNum));
              if (!bond || out >= bond) return null;
              return (
                <div style={{ background: 'var(--amber-bg)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                  <div className="fw-600" style={{ marginBottom: 6 }}>Refund is {money((bond - out) / 100)} less than the bond. How should that be recorded?</div>
                  <label style={{ display: 'block', marginBottom: 4 }}><input type="radio" checked={form.refundMode === 'retain'} onChange={() => sf('refundMode', 'retain')} /> Keep it as Bond retained income
                    {form.refundMode === 'retain' && <select className="select" style={{ marginTop: 6 }} value={form.retainReason} onChange={e => sf('retainReason', e.target.value)}>{BOND_RETAIN_REASONS.map(x => <option key={x}>{x}</option>)}</select>}</label>
                  <label style={{ display: 'block' }}><input type="radio" checked={form.refundMode === 'pending'} onChange={() => sf('refundMode', 'pending')} /> Partial refund, the rest is still to be paid back</label>
                </div>
              );
            })()}
          </>
        )}

        {(form.category === 'reimbursement' || form.linkedTransactionId) && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Linked transaction</div>
            {linkedExpense ? (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="fw-600">{linkedExpense.description}</span><AmountCell value={linkedExpense.amount} /></div>
                <div className="text-sm text-muted">{formatDate(linkedExpense.date)} · <AccountBadge account={fin.accounts.find(a => a.id === linkedExpense.accountId)} /> · {categoryLabel(linkedExpense.category)}</div>
                <div className="text-sm" style={{ color: toCents(linkedExpense.amount) === -toCents(amountNum) ? 'var(--accent)' : 'var(--amber)', marginTop: 4 }}>
                  {toCents(linkedExpense.amount) === -toCents(amountNum) ? 'Amounts match · expense stays on its date, this payment only settles it' : 'Amounts differ'}</div>
                <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={() => sf('linkedTransactionId', '')}>Unlink</button>
              </div>
            ) : (
              <select className="select" value="" onChange={e => sf('linkedTransactionId', e.target.value)}>
                <option value="">Choose an unpaid personal-card expense…</option>
                {unpaid.map(t => <option key={t.id} value={t.id}>{formatDate(t.date)} · {t.description} · {money(t.amount)}</option>)}
              </select>
            )}
            {linkedExpense && <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, marginTop: 8 }}>Owed to you by the business: {money(director.total)} → {money(director.total - Math.abs(Number(linkedExpense.amount)))} after this reimbursement.</div>}
          </div>
        )}

        {(isJob || currentlyLinked) && (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Service log</div>
            {(() => {
              const picked = form.maintenanceId ? data.maintenance.find(m => m.id === form.maintenanceId) : null;
              if (picked) {
                const v = data.vehicles.find(x => x.id === picked.vehicleId);
                return (
                  <div style={{ border: '1.5px solid var(--accent)', background: 'var(--accent-light)', borderRadius: 10, padding: '10px 12px', fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="fw-600">{v?.plate || '—'} · {picked.type} · {formatDate(picked.date)}</span><span className="fw-600">{picked.cost ? `$${picked.cost}` : 'no cost'}</span></div>
                    <div className="text-muted">{picked.description || 'No description'}</div>
                    {picked.cost && toCents(picked.cost) !== Math.abs(toCents(amountNum)) && <div style={{ color: 'var(--amber)', marginTop: 4 }}>Logged cost differs from this payment. Finance counts the payment.</div>}
                    <button className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => pickJob(null)}>Unlink</button>
                  </div>
                );
              }
              if (!jobMatches.length) return <div className="text-sm text-muted">No unlinked service-log entry with a cost within 30 days. Log the job in Maintenance and link it from there.</div>;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {jobMatches.map(({ entry: m, exact, sameVehicle }) => { const v = data.vehicles.find(x => x.id === m.vehicleId); return (
                    <div key={m.id} style={{ border: `1.5px solid ${exact ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <div style={{ minWidth: 0 }}><div className="fw-600">{v?.plate || '—'} · {m.type} · {formatDate(m.date).replace(/ \d{4}$/, '')}{sameVehicle ? '' : ''}</div><div className="text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.description || 'No description'}</div></div>
                      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}><div className="fw-600">${m.cost}{exact ? ' ✓' : ''}</div><button className="btn btn-secondary btn-sm" onClick={() => pickJob(m)}>Link</button></div>
                    </div>); })}
                  <div className="text-sm text-muted">Linking sets the vehicle and marks the job as paid. It does not add anything to Finance.</div>
                </div>
              );
            })()}
          </div>
        )}

        <SideEffectNote title="On save" items={confirmPayload.effects} />

        <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={form.notes} onChange={e => sf('notes', e.target.value)} placeholder="Add a note" /></div>
        {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', paddingTop: 6, borderTop: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {tx && tx.matchStatus !== 'ignored' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={ignore} disabled={saving}>Mark as ignored</button>}
            {tx && tx.source === 'manual' && <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={del} disabled={saving}>Delete</button>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={save} disabled={!canSave}>{saving ? 'Saving…' : 'Save and confirm'}</button>
          </div>
        </div>
        {locked && <div className="text-sm text-muted">Date, amount and description come from {SOURCE_LABEL[tx.source]} and stay as they are. <Badge variant="gray">locked</Badge></div>}
      </div>
    </Drawer>
  );
}
