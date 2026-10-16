import { useEffect, useMemo, useState } from 'react';
import Badge from '../../components/shared/Badge';
import EmptyState from '../../components/shared/EmptyState';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { useSuggestions } from '../../finance/useSuggestions';
import { buildConfirm } from '../../finance/confirm';
import { bondsHeld } from '../../finance/reports';
import { entriesForTransaction, MAINTENANCE_CATEGORIES } from '../../finance/maintenanceLink';
import { categoryLabel, categoryTypeNote, money } from '../../finance/categories';
import { useNavigate } from 'react-router-dom';
import { formatDate, formatTimestamp } from '../../utils/dates';
import { BOND_RETAIN_REASONS } from '../../utils/bond';
import { AmountCell, AccountBadge, SideEffectNote, StatusBadge, Toast } from './bits';
import TransactionDrawer from './TransactionDrawer';

const Kbd = ({ k }) => <span className="fin-kbd">{k}</span>;

export default function Reconcile({ go }) {
  const fin = useFinance();
  const navigate = useNavigate();
  const { data, refresh: refreshStore, update: updateStore } = useStore();
  const suggestions = useSuggestions();
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState([]);          // ids confirmed in this session (shown greyed in the list)
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refundMode, setRefundMode] = useState('retain');
  const [retainReason, setRetainReason] = useState(BOND_RETAIN_REASONS[0]);

  const queue = useMemo(() => fin.transactions.filter(t => t.matchStatus === 'unreviewed' || t.matchStatus === 'suggested').sort((a, b) => a.date.localeCompare(b.date)), [fin.transactions]);
  const sessionList = useMemo(() => {
    const doneTx = done.map(id => fin.transactions.find(t => t.id === id)).filter(Boolean);
    return [...doneTx, ...queue.filter(t => !done.includes(t.id))];
  }, [queue, done, fin.transactions]);
  const open = useMemo(() => queue.filter(t => !done.includes(t.id)), [queue, done]);
  const current = open[Math.min(idx, open.length - 1)] || null;
  const sug = current ? suggestions[current.id] : null;
  const account = current ? fin.accounts.find(a => a.id === current.accountId) : null;
  const rental = sug?.rentalId ? data.rentals.find(r => r.id === sug.rentalId) : null;
  const customer = (sug?.customerId || rental?.customerId) ? data.customers.find(c => c.id === (sug?.customerId || rental?.customerId)) : null;
  const vehicle = rental ? data.vehicles.find(v => v.id === rental.vehicleId) : sug?.vehicleId ? data.vehicles.find(v => v.id === sug.vehicleId) : null;
  const held = bondsHeld(data.rentals);

  useEffect(() => { setRefundMode('retain'); setRetainReason(BOND_RETAIN_REASONS[0]); }, [current?.id]);

  const payload = useMemo(() => {
    if (!current) return null;
    const useSplits = sug?.splits && !(sug.kind === 'bond_refund' && refundMode === 'pending');
    const form = { category: sug?.category || current.category, splits: useSplits ? sug.splits : [], customerId: sug?.customerId || current.customerId, rentalId: sug?.rentalId || current.rentalId, vehicleId: sug?.vehicleId || current.vehicleId, payeeId: sug?.payeeId || current.payeeId, linkedTransactionId: sug?.linkedTransactionId || current.linkedTransactionId, notes: current.notes, refundMode, retainReason };
    return buildConfirm(current, form, { rentals: data.rentals });
  }, [current, sug, refundMode, retainReason, data.rentals]);

  // Service-log entry to link on confirm: only when exactly one unlinked entry has the same amount nearby.
  const jobMatch = useMemo(() => {
    if (!current || !payload) return null;
    if (payload.splits.length || !MAINTENANCE_CATEGORIES.includes(payload.updates.category)) return null;
    const exact = entriesForTransaction({ ...current, vehicleId: payload.updates.vehicleId || current.vehicleId }, data.maintenance, data.rentals, { days: 21 }).filter(e => e.exact);
    return exact.length === 1 ? exact[0].entry : null;
  }, [current, payload, data.maintenance, data.rentals]);

  const effects = useMemo(() => {
    if (!payload) return [];
    const out = [...payload.effects];
    if (jobMatch) { const v = data.vehicles.find(x => x.id === jobMatch.vehicleId); out.push(`Service log: marks "${(jobMatch.description || jobMatch.type).slice(0, 40)}" on ${v?.plate || 'vehicle'} (${formatDate(jobMatch.date)}) as paid by this line`); }
    if (payload.rentalUpdates?.status && rental) {
      const after = payload.rentalUpdates.status === 'held' ? held.total + (rental.bond.status === 'held' ? 0 : Number(payload.rentalUpdates.amount || rental.bond.amount)) : held.total - Number(rental.bond.amount || 0);
      const n = payload.rentalUpdates.status === 'held' ? held.count + (rental.bond.status === 'held' ? 0 : 1) : held.count - 1;
      out.push(`Bonds held: ${money(held.total, { decimals: 0 })} (${held.count}) → ${money(after, { decimals: 0 })} (${n})`);
    }
    if (payload.splits.length) out.push(`This line becomes ${payload.splits.length} splits: ${payload.splits.map(s => `${categoryLabel(s.category)} ${money(s.amount)}`).join(' and ')}`);
    return out;
  }, [payload, rental, held, jobMatch, data.vehicles]);

  const canConfirm = current && payload && (payload.updates.category || payload.splits.length) && !busy;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      const finalPayload = jobMatch && !payload.updates.vehicleId && !payload.splits.length ? { ...payload, updates: { ...payload.updates, vehicleId: jobMatch.vehicleId } } : payload;
      await fin.confirmTransaction(finalPayload);
      if (jobMatch) await updateStore('maintenance', jobMatch.id, { transactionId: current.id, splitId: null });
      if (payload.rentalId) await refreshStore();
      setDone(d => [...d, current.id]);
      setToast({ message: effects[0] || `${categoryLabel(payload.updates.category)} confirmed`, undo: current.id });
    } catch (e) { setToast({ message: `Could not confirm: ${e.message}` }); } finally { setBusy(false); }
  };
  const ignore = async () => {
    if (!current) return;
    setBusy(true);
    try { await fin.updateTransaction(current.id, { matchStatus: 'ignored' }); setDone(d => [...d, current.id]); setToast({ message: 'Ignored' }); }
    catch (e) { setToast({ message: e.message }); } finally { setBusy(false); }
  };
  const undo = async () => {
    if (!toast?.undo) return;
    try { await fin.undoTransaction(toast.undo); await refreshStore(); setDone(d => d.filter(x => x !== toast.undo)); setToast({ message: 'Undone' }); }
    catch (e) { setToast({ message: e.message }); }
  };
  const skip = () => setIdx(i => (open.length ? (i + 1) % open.length : 0));
  const prev = () => setIdx(i => (open.length ? (i - 1 + open.length) % open.length : 0));

  useEffect(() => {
    const onKey = (e) => {
      if (editing || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'j' || e.key === 'J') skip();
      else if (e.key === 'k' || e.key === 'K') prev();
      else if (e.key === 'Enter') confirm();
      else if (e.key === 'c' || e.key === 'C' || e.key === 's' || e.key === 'S') setEditing(current);
      else if (e.key === 'i' || e.key === 'I') ignore();
      else if (e.key === 'u' || e.key === 'U') undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const kindLabel = { bond_deposit: 'Bond deposit', bond_refund: 'Bond refund', payout: 'Stripe payout', reimbursement: 'Reimbursement', rule: 'Rule', vehicle: 'Vehicle expense', customer: 'Customer payment' }[sug?.kind] || (sug ? categoryLabel(sug.category) : 'No suggestion');

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Confirm what each bank line is. Bond matches update the rental automatically.</div></div>
        <div className="text-sm text-muted col-hide-mobile" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span><Kbd k="J" /><Kbd k="K" />next / previous</span><span><Kbd k="↵" />confirm</span><span><Kbd k="C" />choose different</span><span><Kbd k="S" />split</span><span><Kbd k="I" />ignore</span><span><Kbd k="U" />undo</span>
        </div>
      </div>

      {queue.length === 0 && done.length === 0 ? (
        <div className="card"><EmptyState icon="✓" message="All caught up. New items arrive when you import a CSV or Stripe syncs." action={<button className="btn btn-primary" onClick={() => go('overview')}>Back to overview</button>} /></div>
      ) : (
        <div className="fin-queue">
          <div className="card">
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><span className="card-title">Queue</span><span className="text-sm text-muted">{done.length} of {sessionList.length} done</span></div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, margin: '10px 0' }}><div style={{ height: 6, width: `${sessionList.length ? 100 * done.length / sessionList.length : 0}%`, background: 'var(--accent)', borderRadius: 3, transition: 'width 0.2s' }} /></div>
              <div style={{ display: 'flex', gap: 6 }}><Badge variant="amber">Unreviewed {open.filter(t => !suggestions[t.id]).length}</Badge><Badge variant="blue">Suggested {open.filter(t => suggestions[t.id]).length}</Badge></div>
            </div>
            <div className="fin-queue-list">
              {sessionList.map(t => {
                const s = suggestions[t.id]; const isDone = done.includes(t.id);
                return (
                  <div key={t.id} className={`fin-queue-item${current?.id === t.id ? ' active' : ''}${isDone ? ' done' : ''}`} onClick={() => !isDone && setIdx(open.findIndex(x => x.id === t.id))}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="text-sm text-muted">{formatDate(t.date).replace(/ \d{4}$/, '')} · {fin.accounts.find(a => a.id === t.accountId)?.name}</span><AmountCell value={t.amount} /></div>
                    <div className="fin-mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: '2px 0' }}>{t.description}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
                      {isDone ? <Badge variant={t.matchStatus === 'ignored' ? 'gray' : 'green'}>{t.matchStatus === 'ignored' ? 'Ignored' : 'Confirmed'}</Badge> : <StatusBadge status={s ? 'suggested' : 'unreviewed'} />}
                      <span className="text-muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isDone ? (t.splits.length ? t.splits.map(x => categoryLabel(x.category)).join(' + ') : categoryLabel(t.category)) : s ? `${categoryLabel(s.category)} · ${s.reason}` : 'No rule or match'}</span>
                    </div>
                  </div>);
              })}
            </div>
          </div>

          <div className="card">
            {!current ? (
              <EmptyState icon="✓" message={<span><strong>All caught up</strong><br />{done.length} transactions handled this session.</span>} action={<div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}><button className="btn btn-primary" onClick={() => go('overview')}>Back to overview</button><button className="btn btn-secondary" onClick={() => go('transactions')}>View transactions</button></div>} />
            ) : (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><StatusBadge status={sug ? 'suggested' : 'unreviewed'} /><span className="fw-600">{kindLabel} · item {Math.min(idx, open.length - 1) + 1} of {open.length}</span></div>
                  <div><button className="btn btn-ghost btn-sm" onClick={prev}>‹ Prev</button><button className="btn btn-ghost btn-sm" onClick={skip}>Next ›</button></div>
                </div>
                <div>
                  <div className="label">Bank line</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div><div className="fin-mono" style={{ fontSize: 16, fontWeight: 600 }}>{current.description}</div><div className="text-sm text-muted">{formatDate(current.date)} · <AccountBadge account={account} /> · {current.source === 'bank_csv' ? 'Bank CSV' : current.source}{current.createdAt ? ` imported ${formatTimestamp(current.createdAt)}` : ''}</div></div>
                    <div style={{ fontSize: 30, fontWeight: 700 }}><AmountCell value={current.amount} /></div>
                  </div>
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                    <span className="label">{sug ? 'Suggested match' : 'No match yet'}</span>
                    {sug && <span className="text-sm text-muted">Why: {sug.reason}</span>}
                  </div>
                  {!sug && <div className="text-sm text-muted">No rule or customer matched this line. Choose a category, or add a rule in Settings so next time it is categorised for you.</div>}
                  {sug && (customer || rental) && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 40, height: 40, borderRadius: 20, background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13 }}>{(customer?.name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}</div>
                        <div><div className="fw-600">{customer?.name || '—'}{rental ? ` · Rental ${rental.contractNumber || ''}` : ''}</div>
                          <div className="text-sm text-muted">{vehicle ? `${vehicle.plate}${vehicle.name ? ` · ${vehicle.name}` : ''} · ` : ''}{rental ? `${formatDate(rental.startDate)}${rental.endDate ? ` – ${formatDate(rental.endDate)}` : ''}` : ''}{rental?.bond?.method ? ` · bond paid by ${rental.bond.method === 'payid' ? 'bank transfer (PayID)' : rental.bond.method}` : ''}</div></div>
                      </div>
                      <Badge variant="gray">{categoryLabel(sug.category)}</Badge>
                    </div>
                  )}
                  {sug && !customer && !rental && <div className="fw-600">{categoryLabel(sug.category)} <span className="text-sm text-muted">· {categoryTypeNote(sug.category)}</span></div>}

                  {sug?.bondCheck && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                      <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}><div className="text-sm text-muted">Bond on rental</div><div style={{ fontSize: 20, fontWeight: 700 }}>{money(sug.bondCheck.bond)}</div></div>
                      <div style={{ border: `1.5px solid ${sug.bondCheck.match === 'equal' ? 'var(--accent)' : 'var(--border)'}`, background: sug.bondCheck.match === 'equal' ? 'var(--accent-light)' : 'white', borderRadius: 10, padding: 12 }}><div className="text-sm text-muted">{sug.kind === 'bond_refund' ? 'This refund' : 'Received'}</div><div style={{ fontSize: 20, fontWeight: 700 }}>{money(sug.kind === 'bond_refund' ? sug.bondCheck.refunded : sug.bondCheck.received)} {sug.bondCheck.match === 'equal' && '✓'}</div></div>
                      <div style={{ border: '1px solid var(--border)', background: sug.bondCheck.match === 'equal' ? 'white' : 'var(--amber-bg)', borderRadius: 10, padding: 12 }}><div className="text-sm text-muted">Difference</div><div style={{ fontSize: 20, fontWeight: 700, color: sug.bondCheck.match === 'equal' ? 'var(--muted)' : 'var(--amber)' }}>{sug.bondCheck.match === 'equal' ? 'none' : sug.bondCheck.match === 'under' ? `${money(sug.bondCheck.kept ?? sug.bondCheck.short)} ${sug.kind === 'bond_refund' ? 'kept' : 'short'}` : `${money(sug.bondCheck.extra)} extra`}</div></div>
                    </div>
                  )}

                  {sug?.kind === 'bond_refund' && sug.bondCheck?.match === 'under' && (
                    <div style={{ marginTop: 12 }}>
                      <div className="label" style={{ marginBottom: 8 }}>How should the {money(sug.bondCheck.kept)} be recorded?</div>
                      <label className={`fin-option${refundMode === 'retain' ? ' active' : ''}`}><input type="radio" checked={refundMode === 'retain'} onChange={() => setRefundMode('retain')} /> <strong>Retain {money(sug.bondCheck.kept)} as Bond retained (income)</strong>
                        {refundMode === 'retain' && <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}><span className="text-sm text-muted">Reason</span><select className="select" style={{ width: 'auto' }} value={retainReason} onChange={e => setRetainReason(e.target.value)}>{BOND_RETAIN_REASONS.map(x => <option key={x}>{x}</option>)}</select>{rental?.bond?.retainReason && <span className="text-sm text-muted">Rental says: {rental.bond.retainReason}</span>}</div>}</label>
                      <label className={`fin-option${refundMode === 'pending' ? ' active' : ''}`}><input type="radio" checked={refundMode === 'pending'} onChange={() => setRefundMode('pending')} /> <strong>Partial refund, the rest is still to be paid back</strong><div className="text-sm text-muted">Bond stays Held with {money(sug.bondCheck.kept)} outstanding</div></label>
                      <label className="fin-option" onClick={() => navigate('/rentals')}><strong>The bond amount on the rental is wrong</strong><div className="text-sm text-muted">Open Rentals to correct it, then come back here</div></label>
                    </div>
                  )}
                  {sug?.kind === 'bond_deposit' && sug.bondCheck?.match === 'over' && <div className="text-sm" style={{ marginTop: 10, background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>{money(sug.bondCheck.extra)} more than the bond. Confirming splits it into Bond deposit {money(sug.bondCheck.bond)} and Rental income {money(sug.bondCheck.extra)}. Use Split manually if that is not right.</div>}
                  {sug?.kind === 'bond_deposit' && sug.bondCheck?.match === 'under' && <div className="text-sm" style={{ marginTop: 10, background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px' }}>{money(sug.bondCheck.short)} short of the bond. Confirming sets the rental bond to Held {money(sug.bondCheck.received)}; change it in Choose different if the rest is still coming.</div>}
                  {sug?.kind === 'payout' && sug.payoutMatch && (
                    <div style={{ marginTop: 12, fontSize: 13 }}>
                      <div className="fw-600">{sug.payoutMatch.charges.length} Stripe charges {money(sug.payoutMatch.gross)} − fees {money(Math.abs(sug.payoutMatch.fees_total))} = {money(sug.payoutMatch.net)} {sug.payoutMatch.exact ? '✓' : <span className="text-muted">(does not match exactly; Stripe may not be synced for these days)</span>}</div>
                      {sug.payoutMatch.charges.slice(0, 6).map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}><span className="text-muted">{c.description} · {formatDate(c.date).replace(/ \d{4}$/, '')}</span><span>{money(c.amount)}</span></div>)}
                      <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', marginTop: 8 }}>A payout is a Transfer. The charges are already counted as income.</div>
                    </div>
                  )}
                  {sug?.kind === 'reimbursement' && (() => { const l = fin.transactions.find(t => t.id === sug.linkedTransactionId); return l ? <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 10, padding: 12, fontSize: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="fw-600">{l.description}</span><AmountCell value={l.amount} /></div><div className="text-muted">{formatDate(l.date)} · Personal card · {categoryLabel(l.category)}</div><div style={{ color: 'var(--accent)', marginTop: 4 }}>Amounts match · expense stays on {formatDate(l.date)}, this payment only settles it</div></div> : null; })()}
                </div>

                <SideEffectNote items={effects} />

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={confirm} disabled={!canConfirm}>{busy ? 'Saving…' : sug ? 'Confirm and next' : 'Choose category'} <Kbd k="↵" /></button>
                  <button className="btn btn-secondary" onClick={() => setEditing(current)}>Choose different <Kbd k="C" /></button>
                  <button className="btn btn-secondary" onClick={() => setEditing(current)}>Split manually <Kbd k="S" /></button>
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost" onClick={skip}>Skip <Kbd k="J" /></button>
                  <button className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={ignore} disabled={busy}>Ignore <Kbd k="I" /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <TransactionDrawer open={!!editing} tx={editing} onClose={() => setEditing(null)} onSaved={async (tx, eff) => { if (tx && editing) { setDone(d => [...d, editing.id]); if (eff?.length) await refreshStore(); } setToast({ message: eff?.[0] || 'Saved', undo: tx?.hasUndo ? tx.id : null }); }} />
      <Toast toast={toast} onUndo={undo} onClose={() => setToast(null)} />
    </div>
  );
}
