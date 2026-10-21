import { useMemo, useState } from 'react';
import Modal from '../../components/shared/Modal';
import Badge from '../../components/shared/Badge';
import EmptyState from '../../components/shared/EmptyState';
import { useFinance } from '../../finance/FinanceContext';
import { matchPayee } from '../../finance/matching';
import { PAYEE_KINDS, payeeSummary } from '../../finance/payees';
import { categoryLabel, fyLabel, fyOf, money, monthLabel, monthKey } from '../../finance/categories';
import { formatDate, todayStr } from '../../utils/dates';
import { CategorySelect, StatCard, Toast } from './bits';

export default function Payees({ go }) {
  const fin = useFinance();
  const [today] = useState(() => todayStr());
  const [edit, setEdit] = useState(null);     // payee or 'new'
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => payeeSummary(fin.transactions, fin.payees, today), [fin.transactions, fin.payees, today]);
  const fy = fyOf(today);
  const totals = rows.reduce((a, r) => ({ fy: a.fy + r.fy, month: a.month + r.month, total: a.total + r.total }), { fy: 0, month: 0, total: 0 });
  const unattributed = useMemo(() => fin.transactions.filter(t => !t.payeeId && t.matchStatus !== 'ignored' && t.amount < 0 && (t.splits.length ? t.splits : [t]).some(l => ['contractor', 'maintenance', 'insurance', 'rego', 'fines', 'accountant', 'garage_fee', 'marketing', 'software_fees', 'fuel', 'other_expense'].includes(l.category))), [fin.transactions]);

  // Attribute existing lines using payee match text and rules that carry a payee.
  const backfill = async () => {
    setBusy(true);
    try {
      const groups = {};
      for (const t of fin.transactions) {
        if (t.payeeId || t.amount >= 0) continue;
        const rule = fin.rules.find(r => r.payeeId && r.active !== false && r.pattern.split('|').some(p => p.trim() && t.description.toLowerCase().includes(p.trim().toLowerCase())));
        const p = rule ? fin.payees.find(x => x.id === rule.payeeId) : matchPayee(fin.payees, t.description);
        if (p) (groups[p.id] ||= []).push(t.id);
      }
      let n = 0;
      for (const [payeeId, ids] of Object.entries(groups)) { await fin.bulkUpdate(ids, { payeeId }); n += ids.length; }
      setToast({ message: n ? `${n} transactions attributed to ${Object.keys(groups).length} payees` : 'Nothing new matched. Add match text to a payee or a rule with a payee.' });
    } catch (e) { setToast({ message: e.message }); } finally { setBusy(false); }
  };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Who you pay: contractors, suppliers, insurers. Totals are money out, net of refunds.</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={backfill} disabled={busy || !fin.payees.length}>{busy ? 'Matching…' : 'Attribute existing lines'}</button>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>+ Add payee</button>
        </div>
      </div>

      <div className="grid-4 fin-3 mb-20">
        <StatCard color="var(--red)" value={money(totals.month, { decimals: 0 })} label={`Paid in ${monthLabel(monthKey(today))}`} sub={`${rows.filter(r => r.month).length} payees`} />
        <StatCard color="var(--red)" value={money(totals.fy, { decimals: 0 })} label={`Paid in ${fyLabel(fy)}`} sub={`${rows.filter(r => r.fy).length} payees`} />
        <StatCard color="var(--amber)" value={unattributed.length} label="Expense lines without a payee" sub="Set one in the transaction drawer, or add match text to a payee" onClick={() => go('transactions', { payee: 'none' })} />
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <EmptyState icon="▦" message="No payees yet. Add the companies you pay for labour, parts, insurance and rego. Each bank line can then be attributed to one, whatever its category." action={<button className="btn btn-primary" onClick={() => setEdit('new')}>Add payee</button>} />
        ) : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Payee</th><th className="col-hide-mobile">Type</th><th style={{ textAlign: 'right' }}>This month</th><th style={{ textAlign: 'right' }}>{fyLabel(fy)}</th><th style={{ textAlign: 'right' }} className="col-hide-mobile">All time</th><th className="col-hide-mobile">Last paid</th><th></th></tr></thead>
            <tbody>
              {rows.map(r => (
                <RowGroup key={r.id} r={r} open={openId === r.id} onToggle={() => setOpenId(openId === r.id ? null : r.id)} onEdit={() => setEdit(r)} onView={() => go('transactions', { payee: r.id })} />
              ))}
            </tbody>
          </table></div>
        )}
      </div>

      <PayeeModal payee={edit} onClose={() => setEdit(null)} fin={fin} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function RowGroup({ r, open, onToggle, onEdit, onView }) {
  const cats = Object.entries(r.byCategory).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <tr onClick={onToggle} style={{ opacity: r.active ? 1 : 0.5 }}>
        <td><div className="fw-600">{r.name}</div>{r.abn && <div className="text-sm text-muted">ABN {r.abn}</div>}{!open && cats.length > 0 && <div className="text-sm text-muted">{cats.slice(0, 3).map(([c, v]) => `${categoryLabel(c)} ${money(v, { decimals: 0 })}`).join(' · ')}</div>}</td>
        <td className="col-hide-mobile"><Badge variant="gray">{PAYEE_KINDS[r.kind] || r.kind}</Badge></td>
        <td style={{ textAlign: 'right' }}>{r.month ? money(r.month) : <span className="text-muted">—</span>}</td>
        <td style={{ textAlign: 'right' }} className="fw-600">{r.fy ? money(r.fy) : <span className="text-muted">—</span>}</td>
        <td style={{ textAlign: 'right' }} className="col-hide-mobile">{r.total ? money(r.total) : <span className="text-muted">—</span>}<div className="text-sm text-muted">{r.count} payment{r.count !== 1 ? 's' : ''}</div></td>
        <td className="col-hide-mobile text-muted">{r.last ? formatDate(r.last) : '—'}</td>
        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }} onClick={e => e.stopPropagation()}>
          <button className="btn btn-ghost btn-sm" onClick={onView}>Transactions</button>
          <button className="btn btn-secondary btn-sm" onClick={onEdit}>Edit</button>
        </td>
      </tr>
      {open && (
        <tr style={{ cursor: 'default' }}><td colSpan={7} style={{ background: 'var(--bg)', padding: '10px 16px 14px' }}>
          <div className="label" style={{ marginBottom: 6 }}>By category · all time</div>
          {cats.length === 0 ? <div className="text-sm text-muted">No payments attributed yet.</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 6 }}>
              {cats.map(([c, v]) => <div key={c} style={{ display: 'flex', justifyContent: 'space-between', background: 'white', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}><span>{categoryLabel(c)}</span><span className="fw-600">{money(v)}</span></div>)}
            </div>
          )}
          {r.matchText && <div className="text-sm text-muted" style={{ marginTop: 8 }}>Attributed when a bank description contains: <span className="fin-mono">{r.matchText}</span></div>}
          {r.notes && <div className="text-sm text-muted" style={{ marginTop: 4 }}>{r.notes}</div>}
        </td></tr>
      )}
    </>
  );
}

function PayeeModal({ payee, onClose, fin }) {
  const isNew = payee === 'new';
  const [f, setF] = useState(null);
  const cur = f || (payee && payee !== 'new' ? payee : { name: '', kind: 'contractor', abn: '', defaultCategory: '', matchText: '', notes: '', active: true });
  const set = (k, v) => setF({ ...cur, [k]: v });
  if (!payee) return null;
  const close = () => { setF(null); onClose(); };
  const save = async () => { const data = { name: cur.name.trim(), kind: cur.kind, abn: cur.abn, defaultCategory: cur.defaultCategory, matchText: cur.matchText, notes: cur.notes, active: cur.active }; if (isNew) await fin.addPayee(data); else await fin.updatePayee(payee.id, data); close(); };
  const del = async () => { if (window.confirm('Delete this payee? Transactions keep their category and lose the attribution.')) { await fin.removePayee(payee.id); close(); } };
  return (
    <Modal open onClose={close} title={isNew ? 'Add payee' : 'Edit payee'}
      footer={<>{!isNew && <button className="btn btn-danger" onClick={del}>Delete</button>}<span style={{ flex: 1 }} /><button className="btn btn-secondary" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={!cur.name.trim()} onClick={save}>Save</button></>}>
      <div className="grid-2">
        <div className="field"><label className="label">Name</label><input className="input" value={cur.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Coastline Scooters" autoFocus /></div>
        <div className="field"><label className="label">Type</label><select className="select" value={cur.kind} onChange={e => set('kind', e.target.value)}>{Object.entries(PAYEE_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        <div className="field"><label className="label">ABN (optional)</label><input className="input" value={cur.abn} onChange={e => set('abn', e.target.value)} /></div>
        <div className="field"><label className="label">Usual category</label><CategorySelect value={cur.defaultCategory} onChange={v => set('defaultCategory', v)} allow={['operating', 'capital']} placeholder="Suggested when matched" /></div>
      </div>
      <div className="field"><label className="label">Bank description contains</label><input className="input fin-mono" value={cur.matchText} onChange={e => set('matchText', e.target.value)} placeholder="COASTLINE | COASTLINE SCOOTERS" /><span className="field-hint">Separate alternatives with |. Leave empty to match on the name. The category still comes from the rule or from you, so labour and parts from the same payee stay separate.</span></div>
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={2} value={cur.notes} onChange={e => set('notes', e.target.value)} /></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={cur.active !== false} onChange={e => set('active', e.target.checked)} /> Active</label>
    </Modal>
  );
}
