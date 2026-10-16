import { useMemo, useState } from 'react';
import Modal from './shared/Modal';
import Badge from './shared/Badge';
import { useStore } from '../context/StoreContext';
import { useFinance } from '../finance/FinanceContext';
import { transactionsForEntry, linkedLine } from '../finance/maintenanceLink';
import { categoryLabel, money, toCents } from '../finance/categories';
import { formatDate } from '../utils/dates';
import TransactionDrawer from '../pages/finance/TransactionDrawer';

// Link a service-log entry to the payment line that covered it, split a bigger payment first,
// or record a cash payment for it.
export default function MaintenanceLinkModal({ entry, onClose, onDone }) {
  const { data, update } = useStore();
  const fin = useFinance();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [accountId, setAccountId] = useState(() => fin?.accounts.find(a => a.kind === 'cash')?.id || fin?.accounts.find(a => a.feed === 'manual')?.id || '');
  const [showAll, setShowAll] = useState(false);
  const [splitting, setSplitting] = useState(null);   // transaction being split in the drawer
  // Stable preset for the drawer: this job's share on this vehicle, the remainder as a second line.
  const presetSplits = useMemo(() => {
    if (!splitting || !entry) return null;
    const share = Math.abs(Number(entry.cost) || 0);
    return [
      { category: 'maintenance', amount: String(-share), vehicleId: entry.vehicleId || '', notes: (entry.description || '').slice(0, 60) },
      { category: '', amount: String(Number((splitting.amount + share).toFixed(2))), notes: '' },
    ];
  }, [splitting, entry]);
  const vehicle = data.vehicles.find(v => v.id === entry?.vehicleId);
  const linked = useMemo(() => entry && fin ? linkedLine(entry, fin.transactions) : null, [entry, fin]);
  const candidates = useMemo(() => entry && fin ? transactionsForEntry(entry, fin.transactions, data.maintenance, data.rentals, { days: showAll ? 365 : 30 }) : [], [entry, fin, data.maintenance, data.rentals, showAll]);
  if (!entry || !fin) return null;
  const cost = toCents(entry.cost);
  const exactExists = candidates.some(c => c.exact);
  const accountName = (id) => fin.accounts.find(a => a.id === id)?.name;

  const link = async (line) => {
    setBusy(true); setErr('');
    try {
      await update('maintenance', entry.id, { transactionId: line.tx.id, splitId: line.split?.id || null });
      // Make sure the line carries the vehicle so the Vehicles view counts it.
      if (entry.vehicleId && !line.vehicleId) {
        if (line.split) await fin.updateTransaction(line.tx.id, { splits: line.tx.splits.map(s => s.id === line.split.id ? { ...s, vehicleId: entry.vehicleId } : s) });
        else await fin.updateTransaction(line.tx.id, { vehicleId: entry.vehicleId });
      }
      onDone?.(`Linked to ${line.tx.description.slice(0, 30)} · ${money(-line.amount / 100)}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const unlink = async () => {
    setBusy(true); setErr('');
    try { await update('maintenance', entry.id, { transactionId: null, splitId: null }); onDone?.('Unlinked'); onClose(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const recordCash = async () => {
    if (!entry.cost || !accountId) return;
    if (exactExists && !window.confirm('A payment with the same amount already exists in Finance. Record a separate cash payment anyway?')) return;
    setBusy(true); setErr('');
    try {
      const tx = await fin.addTransaction({ accountId, date: entry.date, amount: -Math.abs(Number(entry.cost)), description: `${entry.type === 'repair' ? 'Repair' : 'Service'} · ${vehicle?.plate || ''} · ${(entry.description || '').slice(0, 60)}`.trim(), source: 'manual', category: 'maintenance', matchStatus: 'confirmed', vehicleId: entry.vehicleId || null, notes: 'Created from the service log' });
      await update('maintenance', entry.id, { transactionId: tx.id, splitId: null });
      onDone?.(`Recorded ${money(tx.amount)} on ${accountName(accountId)}`); onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // Open the drawer with the payment pre-split: this job's cost on this vehicle, the remainder as a second line.
  const splitPayment = (line) => setSplitting(line.tx);

  const LineCard = ({ l }) => {
    const v = l.vehicleId ? data.vehicles.find(x => x.id === l.vehicleId) : null;
    return (
      <div style={{ border: `1.5px solid ${l.exact ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="fw-600" style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.tx.description}{l.split ? <span className="text-muted"> · line {l.tx.splits.indexOf(l.split) + 1} of {l.tx.splits.length}</span> : ''}</div>
          <div className="text-sm text-muted">{formatDate(l.tx.date)} · {accountName(l.tx.accountId)} · {categoryLabel(l.category)}{l.sameVehicle ? ` · ${vehicle?.plate}` : l.otherVehicle ? ` · on ${v?.plate || 'another vehicle'}` : ' · no vehicle set'}</div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
          <div className="fw-600" style={{ color: 'var(--red)' }}>{money(-l.amount / 100)} {l.exact && <Badge variant="green">same amount</Badge>}</div>
          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', marginTop: 4 }}>
            {l.bigger && !l.split && <button className="btn btn-secondary btn-sm" onClick={() => splitPayment(l)} disabled={busy} title="This payment covered more than this job">Split first</button>}
            <button className={`btn btn-sm ${l.exact ? 'btn-primary' : 'btn-secondary'}`} onClick={() => link(l)} disabled={busy}>Link</button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal open={!splitting} onClose={onClose} title="Payment for this job" width={620}
        footer={<><button className="btn btn-secondary" onClick={onClose}>Close</button></>}>
        <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
          <div className="fw-600">{vehicle?.plate || '—'}{vehicle?.name ? ` · ${vehicle.name}` : ''} · {formatDate(entry.date)} · <span style={{ textTransform: 'capitalize' }}>{entry.type}</span></div>
          <div className="text-sm text-muted">{entry.description || 'No description'} · {entry.cost ? `cost $${entry.cost}` : 'no cost recorded'}</div>
        </div>

        {linked ? (
          <div style={{ border: `1.5px solid ${linked.amount === cost ? 'var(--accent)' : 'var(--amber)'}`, background: linked.amount === cost ? 'var(--accent-light)' : 'var(--amber-bg)', borderRadius: 10, padding: '10px 12px', fontSize: 14 }}>
            <div className="label" style={{ color: linked.amount === cost ? 'var(--accent)' : 'var(--amber)' }}>Paid · linked{linked.split ? ` to line ${linked.tx.splits.indexOf(linked.split) + 1} of ${linked.tx.splits.length}` : linked.tx.splits.length ? ' to the whole payment' : ''}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span className="fw-600">{linked.tx.description}</span><span className="fw-600">{money(-linked.amount / 100)}</span></div>
            <div className="text-sm text-muted">{formatDate(linked.tx.date)} · {accountName(linked.tx.accountId)} · {linked.split ? categoryLabel(linked.split.category) : linked.tx.splits.length ? 'split' : categoryLabel(linked.tx.category)}</div>
            {linked.stale && <div className="text-sm" style={{ color: 'var(--amber)', marginTop: 4 }}>The split line this job pointed at was changed. Re-link it below.</div>}
            {cost && linked.amount !== cost && !linked.stale && (
              <div className="text-sm" style={{ marginTop: 6 }}>
                <div style={{ color: 'var(--amber)' }}>The payment is {money(-linked.amount / 100)} but this job cost ${entry.cost}. {linked.amount > cost ? 'If the bill also covered other things, split it so only this job\'s share sits on this vehicle.' : 'Finance counts the payment, not the log.'}</div>
                {linked.amount > cost && !linked.split && <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={() => splitPayment({ tx: linked.tx })}>Split this payment</button>}
              </div>
            )}
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }} onClick={unlink} disabled={busy}>Unlink</button>
          </div>
        ) : (
          <>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Payments in Finance that could be this job</div>
              {candidates.length === 0 ? <div className="text-sm text-muted">No unlinked maintenance or contractor payment within {showAll ? 'a year' : '30 days'}.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 300, overflowY: 'auto' }}>{candidates.slice(0, 12).map(l => <LineCard key={l.key} l={l} />)}</div>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show 30 days' : 'Search a whole year'}</button>
              {candidates.some(c => c.bigger) && <div className="text-sm text-muted">A bigger payment than the job usually means one bill covered several things. "Split first" opens it with this job's share on {vehicle?.plate || 'this vehicle'} and the rest as a second line you can categorise.</div>}
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

      {splitting && (
        <TransactionDrawer open tx={splitting} onClose={() => setSplitting(null)}
          presetSplits={presetSplits}
          presetMaintenanceId={entry.id}
          onSaved={() => { setSplitting(null); onDone?.('Payment split and job linked'); onClose(); }} />
      )}
    </>
  );
}
