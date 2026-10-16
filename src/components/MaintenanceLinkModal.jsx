import { useMemo, useState } from 'react';
import Modal from './shared/Modal';
import Badge from './shared/Badge';
import { useStore } from '../context/StoreContext';
import { useFinance } from '../finance/FinanceContext';
import { transactionsForEntry } from '../finance/maintenanceLink';
import { categoryLabel, money } from '../finance/categories';
import { formatDate } from '../utils/dates';

// Link a service-log entry to the payment that covered it, or record a cash payment for it.
export default function MaintenanceLinkModal({ entry, onClose, onDone }) {
  const { data, update } = useStore();
  const fin = useFinance();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [accountId, setAccountId] = useState(() => fin?.accounts.find(a => a.kind === 'cash')?.id || fin?.accounts.find(a => a.feed === 'manual')?.id || '');
  const [showAll, setShowAll] = useState(false);
  const vehicle = data.vehicles.find(v => v.id === entry?.vehicleId);
  const linked = entry?.transactionId ? fin?.transactions.find(t => t.id === entry.transactionId) : null;
  const candidates = useMemo(() => entry && fin ? transactionsForEntry(entry, fin.transactions, data.maintenance, data.rentals, { days: showAll ? 365 : 30 }) : [], [entry, fin, data.maintenance, data.rentals, showAll]);
  if (!entry || !fin) return null;
  const exactExists = candidates.some(c => c.exact);

  const link = async (tx) => {
    setBusy(true); setErr('');
    try {
      await update('maintenance', entry.id, { transactionId: tx.id });
      // Make sure the payment carries the vehicle so the Vehicles view counts it.
      if (!tx.vehicleId && entry.vehicleId && !tx.splits.length) await fin.updateTransaction(tx.id, { vehicleId: entry.vehicleId, matchStatus: tx.matchStatus === 'confirmed' ? 'confirmed' : tx.matchStatus });
      onDone?.(`Linked to ${tx.description.slice(0, 30)} · ${money(tx.amount)}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const unlink = async () => {
    setBusy(true); setErr('');
    try { await update('maintenance', entry.id, { transactionId: null }); onDone?.('Unlinked'); onClose(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const recordCash = async () => {
    if (!entry.cost || !accountId) return;
    if (exactExists && !window.confirm('A payment with the same amount already exists in Finance. Record a separate cash payment anyway?')) return;
    setBusy(true); setErr('');
    try {
      const tx = await fin.addTransaction({ accountId, date: entry.date, amount: -Math.abs(Number(entry.cost)), description: `${entry.type === 'repair' ? 'Repair' : 'Service'} · ${vehicle?.plate || ''} · ${(entry.description || '').slice(0, 60)}`.trim(), source: 'manual', category: entry.type === 'repair' || entry.type === 'service' ? 'maintenance' : 'maintenance', matchStatus: 'confirmed', vehicleId: entry.vehicleId || null, notes: 'Created from the service log' });
      await update('maintenance', entry.id, { transactionId: tx.id });
      onDone?.(`Recorded ${money(tx.amount)} on ${fin.accounts.find(a => a.id === accountId)?.name}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title="Payment for this job" width={600}
      footer={<><button className="btn btn-secondary" onClick={onClose}>Close</button></>}>
      <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
        <div className="fw-600">{vehicle?.plate || '—'}{vehicle?.name ? ` · ${vehicle.name}` : ''} · {formatDate(entry.date)} · <span style={{ textTransform: 'capitalize' }}>{entry.type}</span></div>
        <div className="text-sm text-muted">{entry.description || 'No description'} · {entry.cost ? `cost $${entry.cost}` : 'no cost recorded'}</div>
      </div>

      {linked ? (
        <div style={{ border: '1.5px solid var(--accent)', background: 'var(--accent-light)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
          <div className="label" style={{ color: 'var(--accent)' }}>Paid · linked</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="fw-600">{linked.description}</span><span className="fw-600">{money(linked.amount)}</span></div>
          <div className="text-sm text-muted">{formatDate(linked.date)} · {fin.accounts.find(a => a.id === linked.accountId)?.name} · {linked.splits.length ? 'split' : categoryLabel(linked.category)}</div>
          {entry.cost && Math.abs(Number(linked.amount)) !== Number(entry.cost) && <div className="text-sm" style={{ color: 'var(--amber)', marginTop: 4 }}>Amount differs from the logged cost (${entry.cost}). Finance counts the payment, not the log.</div>}
          <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={unlink} disabled={busy}>Unlink</button>
        </div>
      ) : (
        <>
          <div>
            <div className="label" style={{ marginBottom: 6 }}>Payments in Finance that could be this job</div>
            {candidates.length === 0 ? <div className="text-sm text-muted">No unlinked maintenance or contractor payment within {showAll ? 'a year' : '30 days'}.</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {candidates.slice(0, 12).map(({ tx, exact, sameVehicle, otherVehicle }) => (
                  <div key={tx.id} style={{ border: `1.5px solid ${exact ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-600" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                      <div className="text-sm text-muted">{formatDate(tx.date)} · {fin.accounts.find(a => a.id === tx.accountId)?.name} · {tx.splits.length ? 'split' : categoryLabel(tx.category)}{sameVehicle ? ` · ${vehicle?.plate}` : otherVehicle ? ` · on ${data.vehicles.find(v => v.id === tx.vehicleId)?.plate || 'another vehicle'}` : ' · no vehicle set'}</div>
                    </div>
                    <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div className="fw-600" style={{ color: 'var(--red)' }}>{money(tx.amount)} {exact && <Badge variant="green">same amount</Badge>}</div>
                      <button className="btn btn-primary btn-sm" style={{ marginTop: 4 }} onClick={() => link(tx)} disabled={busy}>Link</button>
                    </div>
                  </div>))}
              </div>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show 30 days' : 'Search a whole year'}</button>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>Paid in cash, or from an account not in Finance?</div>
            {!entry.cost ? <div className="text-sm text-muted">Add a cost to this entry first.</div> : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="select" style={{ width: 'auto' }} value={accountId} onChange={e => setAccountId(e.target.value)}>{fin.accounts.filter(a => a.feed === 'manual').map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <button className="btn btn-secondary" onClick={recordCash} disabled={busy || !accountId}>Record {money(-Math.abs(Number(entry.cost)))} as a payment</button>
              </div>
            )}
            <div className="text-sm text-muted" style={{ marginTop: 6 }}>Creates one transaction in Finance and links it here. Do not use this for jobs paid from the bank account; those arrive with the CSV and should be linked above.</div>
          </div>
        </>
      )}
      {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
    </Modal>
  );
}
