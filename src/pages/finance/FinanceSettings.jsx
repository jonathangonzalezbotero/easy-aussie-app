import { useMemo, useState } from 'react';
import Modal from '../../components/shared/Modal';
import Badge from '../../components/shared/Badge';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { rulesMatching } from '../../finance/matching';
import { categoryLabel, categoryType, money, money0 } from '../../finance/categories';
import { formatDate, formatTimestamp, daysUntil, todayStr } from '../../utils/dates';
import { CategorySelect, AmountCell, Toast } from './bits';
import ImportCsvModal from './ImportCsvModal';
import SpreadsheetImportModal from './SpreadsheetImportModal';
import TransactionDrawer from './TransactionDrawer';
import { syncStripe } from '../../finance/stripe';

const Section = ({ title, sub, action, children }) => (
  <div className="card mb-20">
    <div className="card-head" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div><div className="card-title">{title}</div>{sub && <div className="text-sm text-muted">{sub}</div>}</div>
      {action}
    </div>
    {children}
  </div>
);

export default function FinanceSettings({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const [importFor, setImportFor] = useState(null);
  const [showSheet, setShowSheet] = useState(false);
  const [addFor, setAddFor] = useState(null);
  const [rule, setRule] = useState(null);        // editing rule or 'new'
  const [rec, setRec] = useState(null);          // editing recurring or 'new'
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [local, setLocal] = useState(null);
  const [now] = useState(() => Date.now());
  const settings = local || fin.settings;
  const setS = (k, v) => setLocal(l => ({ ...(l || fin.settings), [k]: v }));
  const saveSettings = async () => { try { await fin.updateSettings(local); setLocal(null); setToast({ message: 'Settings saved' }); } catch (e) { setToast({ message: e.message }); } };

  const since90 = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString().slice(0, 10); }, []);
  const recent = useMemo(() => fin.transactions.filter(t => t.date >= since90), [fin.transactions, since90]);
  const ruleStats = useMemo(() => fin.rules.map(r => {
    const hits = recent.filter(t => rulesMatching([r], t.description, t.accountId).length);
    const overlaps = new Set();
    for (const t of hits) for (const o of rulesMatching(fin.rules, t.description, t.accountId)) if (o.id !== r.id) overlaps.add(o);
    return { id: r.id, hits: hits.length, overlaps: [...overlaps] };
  }), [fin.rules, recent]);
  const maxHits = Math.max(1, ...ruleStats.map(s => s.hits));

  const lineCount = (accId) => fin.transactions.filter(t => t.accountId === accId).length;
  const pastDue = fin.subscriptions.filter(s => s.status === 'past_due' || s.pastDueSince);
  const activeSubs = fin.subscriptions.filter(s => s.status === 'active' || s.status === 'past_due');

  const doSync = async () => { setSyncing(true); try { const r = await syncStripe(); await fin.refresh(); setToast({ message: `Stripe synced · ${r.inserted ?? 0} new lines` }); } catch (e) { setToast({ message: `Stripe sync failed: ${e.message}` }); } finally { setSyncing(false); } };

  const moveRule = async (r, dir) => {
    const sorted = [...fin.rules].sort((a, b) => a.priority - b.priority);
    const i = sorted.findIndex(x => x.id === r.id); const j = i + dir;
    if (j < 0 || j >= sorted.length) return;
    const other = sorted[j];
    await fin.updateRule(r.id, { priority: other.priority === r.priority ? other.priority + dir : other.priority });
    await fin.updateRule(other.id, { priority: r.priority });
  };

  // Rego rows come from each vehicle's expiry date and last renewal cost.
  const regoRows = data.vehicles.filter(v => v.regoExpiry && !['stolen', 'sold'].includes(v.status)).map(v => {
    const last = [...fin.regoRenewals].filter(r => r.vehicleId === v.id && r.cost).sort((a, b) => b.renewalDate.localeCompare(a.renewalDate))[0];
    return { id: `rego-${v.id}`, name: `Rego ${v.plate}`, category: 'rego', amount: last?.cost ?? null, frequency: 'yearly', nextDue: v.regoExpiry, vehicleId: v.id, fromVehicle: true };
  });
  const recurringRows = [...fin.recurring.map(r => ({ ...r })), ...regoRows].sort((a, b) => (a.nextDue || '9').localeCompare(b.nextDue || '9'));

  const rentable = data.vehicles.filter(v => ['available', 'rented', 'maintenance'].includes(v.status));
  const scooters = rentable.filter(v => v.type !== 'ebike').length;
  const ebikes = rentable.filter(v => v.type === 'ebike').length;
  const weeklyTarget = settings.targetOccupancy * (scooters * settings.scooterWeeklyRate + ebikes * settings.ebikeWeeklyRate);

  const nextSunday = () => { const d = new Date(); d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7)); return d; };

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Accounts, imports, rules and the numbers the forecast uses</div></div>
        {local && <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-secondary" onClick={() => setLocal(null)}>Discard</button><button className="btn btn-primary" onClick={saveSettings}>Save settings</button></div>}
      </div>

      <Section title="Accounts" sub={`Where money moves.${settings.cutoverDate ? ` Bank CSV and Stripe lines are only accepted after ${formatDate(settings.cutoverDate)}.` : ''}`} action={<button className="btn btn-secondary btn-sm" onClick={() => setImportFor(fin.accounts.find(a => a.feed === 'csv')?.id)}>Import bank CSV</button>}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Account</th><th className="col-hide-mobile">Type</th><th>Feed</th><th>Last import or sync</th><th className="col-hide-mobile" style={{ textAlign: 'right' }}>Lines</th><th></th></tr></thead>
          <tbody>{fin.accounts.map(a => {
            const last = a.feed === 'stripe' ? fin.settings.stripeLastSync : a.lastImportAt;
            const age = last ? Math.floor((now - new Date(last)) / 86400000) : null;
            return (
              <tr key={a.id} style={{ cursor: 'default' }}>
                <td className="fw-500">{a.name}{a.accountHint ? <span className="text-sm text-muted"> · ••• {a.accountHint}</span> : ''}</td>
                <td className="col-hide-mobile text-muted">{{ bank: 'Bank account', processor: 'Payment processor', personal: 'Your own card', cash: 'Cash' }[a.kind]}</td>
                <td><Badge variant={a.feed === 'stripe' ? 'blue' : 'gray'}>{a.feed === 'csv' ? 'Bank CSV' : a.feed === 'stripe' ? 'Automatic' : 'Manual'}</Badge></td>
                <td>{last ? <Badge variant={age > 7 && a.feed !== 'manual' ? 'amber' : 'green'}>{formatTimestamp(last)}{age > 7 ? ` · ${age} days ago` : ''}</Badge> : <span className="text-muted">—</span>}</td>
                <td className="col-hide-mobile" style={{ textAlign: 'right' }}>{lineCount(a.id).toLocaleString()}</td>
                <td style={{ textAlign: 'right' }}>
                  {a.feed === 'csv' && <button className="btn btn-secondary btn-sm" onClick={() => setImportFor(a.id)}>Import</button>}
                  {a.feed === 'stripe' && <button className="btn btn-secondary btn-sm" onClick={doSync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync now'}</button>}
                  {a.feed === 'manual' && <button className="btn btn-secondary btn-sm" onClick={() => setAddFor(a.id)}>Add</button>}
                </td>
              </tr>);
          })}</tbody>
        </table></div>
      </Section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Section title="Stripe connection" action={<Badge variant={fin.settings.stripeLastSync ? 'green' : 'gray'}>{fin.settings.stripeLastSync ? 'Connected' : 'Not synced yet'}</Badge>}>
          <div style={{ padding: '14px 20px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">Last sync</span><span>{fin.settings.stripeLastSync ? new Date(fin.settings.stripeLastSync).toLocaleString('en-AU') : '—'}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span className="text-muted">Subscriptions</span><span>{activeSubs.length} active{pastDue.length ? <> · <span style={{ color: 'var(--red)' }}>{pastDue.length} past due</span></> : ''}</span></div>
            <div className="field"><label className="label">Sync charges from</label>
              <input className="input" type="date" value={settings.stripeSyncFrom || ''} onChange={e => setS('stripeSyncFrom', e.target.value)} />
              <span className="field-hint">Usually the day after the cut-over. Charges before this date come from the spreadsheet.</span></div>
            <div className="text-sm text-muted">Sync runs from the <code>stripe-sync</code> edge function with your Stripe secret key, on a schedule and when you press Sync now. Failed subscription payments arrive through the <code>stripe-webhook</code> function.</div>
          </div>
        </Section>

        <Section title="History and cut-over" action={<Badge variant={fin.imports.some(i => i.kind === 'spreadsheet') ? 'green' : 'amber'}>{fin.imports.some(i => i.kind === 'spreadsheet') ? 'Spreadsheet import done' : 'Spreadsheet not imported'}</Badge>}>
          <div style={{ padding: '14px 20px', fontSize: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="field"><label className="label">Cut-over date</label>
              <input className="input" type="date" value={settings.cutoverDate || ''} onChange={e => setS('cutoverDate', e.target.value)} />
              <span className="field-hint">Up to and including this date your history comes from the spreadsheet. Bank CSV lines dated on or before it are blocked on import so nothing is counted twice.</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowSheet(true)}>{fin.imports.some(i => i.kind === 'spreadsheet') ? 'Re-run spreadsheet import' : 'Import spreadsheet'}</button>
            </div>
            {fin.imports.length > 0 && (
              <div><div className="label" style={{ marginBottom: 6 }}>Import log</div>
                {fin.imports.slice(0, 6).map(i => <div key={i.id} className="text-sm" style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--border)' }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{formatTimestamp(i.createdAt)} · {fin.accounts.find(a => a.id === i.accountId)?.name || i.kind} · {i.fileName}</span><span className="text-muted" style={{ whiteSpace: 'nowrap' }}>{i.newCount} new · {i.skippedCount} skipped</span></div>)}</div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Categorisation rules" sub="First matching rule wins. Matches arrive as Unreviewed with the category filled in." action={<button className="btn btn-primary btn-sm" onClick={() => setRule('new')}>+ Add rule</button>}>
        {fin.rules.length === 0 ? <div className="text-sm text-muted" style={{ padding: 20 }}>No rules yet. A rule like <code>GOOGLE *ADS → Marketing</code> categorises every matching bank line automatically.</div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>Description contains</th><th>Category</th><th className="col-hide-mobile">Account</th><th className="col-hide-mobile">Last 90 days</th><th></th></tr></thead>
            <tbody>{[...fin.rules].sort((a, b) => a.priority - b.priority).map((r, i) => {
              const st = ruleStats.find(s => s.id === r.id);
              return (
                <tr key={r.id} style={{ cursor: 'default', opacity: r.active ? 1 : 0.5 }}>
                  <td className="text-muted">{i + 1}</td>
                  <td className="fin-mono">{r.pattern}</td>
                  <td>{categoryLabel(r.category)}{r.payeeId && <div className="text-sm text-muted">→ {fin.payees.find(p => p.id === r.payeeId)?.name}</div>}</td>
                  <td className="col-hide-mobile text-muted">{r.accountId ? fin.accounts.find(a => a.id === r.accountId)?.name : 'Any'}</td>
                  <td className="col-hide-mobile"><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ height: 6, width: Math.max(6, 60 * st.hits / maxHits), background: 'var(--accent)', borderRadius: 3 }} /><span className="text-sm">{st.hits} lines</span>{st.overlaps.length > 0 && <Badge variant="amber">{st.hits ? 'also match' : 'overlaps'} rule {[...fin.rules].sort((a, b) => a.priority - b.priority).findIndex(x => x.id === st.overlaps[0].id) + 1}</Badge>}</div></td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => moveRule(r, -1)} title="Move up">↑</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => moveRule(r, 1)} title="Move down">↓</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setRule(r)}>Edit</button>
                  </td>
                </tr>);
            })}</tbody>
          </table></div>
        )}
      </Section>

      <Section title="Recurring expenses" sub="Feed the forecast. Rego rows come from each vehicle's rego expiry and last renewal, and are edited in Vehicles." action={<button className="btn btn-primary btn-sm" onClick={() => setRec('new')}>+ Add recurring</button>}>
        <div className="table-wrap"><table className="table">
          <thead><tr><th>Name</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th>Frequency</th><th>Next due</th><th className="col-hide-mobile">Vehicle</th><th></th></tr></thead>
          <tbody>{recurringRows.map(r => (
            <tr key={r.id} style={{ cursor: 'default', opacity: r.active === false ? 0.5 : 1 }}>
              <td className="fw-500">{r.name}</td>
              <td>{categoryLabel(r.category)} {categoryType(r.category) === 'capital' && <Badge variant="gray">Capital</Badge>}</td>
              <td style={{ textAlign: 'right' }}>{r.amount == null ? <span className="text-muted">no renewal cost</span> : money(r.amount)}</td>
              <td className="text-muted">{r.frequency}</td>
              <td className={daysUntil(r.nextDue) < 0 ? 'fin-neg' : ''}>{formatDate(r.nextDue)}</td>
              <td className="col-hide-mobile text-muted">{r.vehicleId ? data.vehicles.find(v => v.id === r.vehicleId)?.plate : r.category === 'insurance' ? 'All vehicles' : '—'}</td>
              <td style={{ textAlign: 'right' }}>{r.fromVehicle ? <Badge variant="gray">From vehicle</Badge> : <button className="btn btn-secondary btn-sm" onClick={() => setRec(r)}>Edit</button>}</td>
            </tr>))}</tbody>
        </table></div>
      </Section>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <Section title="Fleet target for the forecast">
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field"><label className="label">Target occupancy · {Math.round(settings.targetOccupancy * 100)}%</label>
              <input type="range" min="0" max="100" step="5" value={Math.round(settings.targetOccupancy * 100)} onChange={e => setS('targetOccupancy', Number(e.target.value) / 100)} />
              <span className="field-hint">Share of each week a rentable vehicle is out on hire.</span></div>
            <table className="table"><thead><tr><th>Vehicle type</th><th>Rentable</th><th>Weekly rate</th><th style={{ textAlign: 'right' }}>At target</th></tr></thead>
              <tbody>
                <tr style={{ cursor: 'default' }}><td>Scooter</td><td>{scooters}</td><td><input className="input" type="number" style={{ width: 90, padding: '5px 8px' }} value={settings.scooterWeeklyRate} onChange={e => setS('scooterWeeklyRate', Number(e.target.value))} /></td><td style={{ textAlign: 'right' }}>{money0(scooters * settings.scooterWeeklyRate * settings.targetOccupancy)}</td></tr>
                <tr style={{ cursor: 'default' }}><td>E-bike</td><td>{ebikes}</td><td><input className="input" type="number" style={{ width: 90, padding: '5px 8px' }} value={settings.ebikeWeeklyRate} onChange={e => setS('ebikeWeeklyRate', Number(e.target.value))} /></td><td style={{ textAlign: 'right' }}>{money0(ebikes * settings.ebikeWeeklyRate * settings.targetOccupancy)}</td></tr>
                <tr style={{ cursor: 'default' }}><td className="fw-600">Fleet target</td><td className="fw-600">{scooters + ebikes}</td><td></td><td className="fw-600" style={{ textAlign: 'right' }}>{money0(weeklyTarget)} / week</td></tr>
              </tbody></table>
            <div className="text-sm text-muted">Rentable = Available, Rented or Maintenance. Stolen and Sold vehicles are excluded. About {money0(weeklyTarget * 52 / 12)} a month.</div>
          </div>
        </Section>

        <div>
          <Section title="Director loan" sub="What the business owes you, before the lines in Finance.">
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="grid-2">
                <div className="field"><label className="label">Opening balance ($)</label><input className="input" type="number" value={settings.directorLoanOpening} onChange={e => setS('directorLoanOpening', e.target.value)} placeholder="e.g. 4700" /></div>
                <div className="field"><label className="label">As at</label><input className="input" type="date" value={settings.directorLoanOpeningDate || ''} onChange={e => setS('directorLoanOpeningDate', e.target.value)} /></div>
              </div>
              <span className="field-hint">Director loan lines dated after this are added on top. Money you put in (Director loan money in) increases it, repayments reduce it.</span>
            </div>
          </Section>
          <Section title="Weekly bank CSV reminder" action={<label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={!!settings.reminderEnabled} onChange={e => setS('reminderEnabled', e.target.checked)} /><span className="text-sm">{settings.reminderEnabled ? 'On' : 'Off'}</span></label>}>
            <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="text-sm text-muted">Email on Sunday at 6 pm, only if no NAB Business CSV was uploaded since Monday.</div>
              <div className="field"><label className="label">Send to</label><input className="input" type="email" value={settings.reminderEmail || ''} onChange={e => setS('reminderEmail', e.target.value)} placeholder="you@example.com" /></div>
              <div className="text-sm text-muted">Next reminder: {nextSunday().toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}, 6:00 pm Brisbane time. Needs the <code>send-csv-reminder</code> function scheduled with pg_cron.</div>
            </div>
          </Section>
        </div>
      </div>

      {local && <div style={{ position: 'sticky', bottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button className="btn btn-secondary" onClick={() => setLocal(null)}>Discard</button><button className="btn btn-primary" onClick={saveSettings}>Save settings</button></div>}

      <RuleModal rule={rule} onClose={() => setRule(null)} fin={fin} recent={recent} />
      <RecurringModal rec={rec} onClose={() => setRec(null)} fin={fin} vehicles={data.vehicles} />
      <ImportCsvModal open={!!importFor} accountId={importFor} onClose={() => setImportFor(null)} onDone={(n) => { setImportFor(null); setToast({ message: `${n} new lines imported` }); if (n > 0) go('reconcile'); }} />
      <SpreadsheetImportModal open={showSheet} onClose={() => setShowSheet(false)} onDone={(n) => { setShowSheet(false); setToast({ message: `${n} lines imported` }); }} />
      <TransactionDrawer open={!!addFor} tx={null} defaultAccountId={addFor} onClose={() => setAddFor(null)} onSaved={() => setToast({ message: 'Transaction added' })} />
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function RuleModal({ rule, onClose, fin, recent }) {
  const isNew = rule === 'new';
  const [f, setF] = useState(null);
  const cur = f || (rule && rule !== 'new' ? rule : { pattern: '', category: '', accountId: '', payeeId: '', priority: (Math.max(0, ...fin.rules.map(r => r.priority)) + 10), active: true });
  const set = (k, v) => setF({ ...cur, [k]: v });
  const matches = cur.pattern ? recent.filter(t => rulesMatching([{ ...cur, id: 'x' }], t.description, t.accountId).length).slice(0, 5) : [];
  if (!rule) return null;
  const save = async () => { if (isNew) await fin.addRule(cur); else await fin.updateRule(rule.id, cur); setF(null); onClose(); };
  const del = async () => { if (window.confirm('Delete this rule?')) { await fin.removeRule(rule.id); setF(null); onClose(); } };
  return (
    <Modal open onClose={() => { setF(null); onClose(); }} title={isNew ? 'Add rule' : 'Edit rule'}
      footer={<>{!isNew && <button className="btn btn-danger" onClick={del}>Delete</button>}<span style={{ flex: 1 }} /><button className="btn btn-secondary" onClick={() => { setF(null); onClose(); }}>Cancel</button><button className="btn btn-primary" disabled={!cur.pattern || !cur.category} onClick={save}>Save rule</button></>}>
      <div className="field"><label className="label">Description contains</label><input className="input fin-mono" value={cur.pattern} onChange={e => set('pattern', e.target.value)} placeholder="SUPERCHEAP | REPCO | COASTLINE" /><span className="field-hint">Separate alternatives with |. Case does not matter.</span></div>
      <div className="grid-2">
        <div className="field"><label className="label">Category</label><CategorySelect value={cur.category} onChange={v => set('category', v)} /></div>
        <div className="field"><label className="label">Account</label><select className="select" value={cur.accountId || ''} onChange={e => set('accountId', e.target.value)}><option value="">Any</option>{fin.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
      </div>
      <div className="field"><label className="label">Paid to (optional)</label><select className="select" value={cur.payeeId || ''} onChange={e => set('payeeId', e.target.value)}><option value="">—</option>{fin.payees.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="field-hint">Matching lines are attributed to this payee as well as categorised.</span></div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={cur.active !== false} onChange={e => set('active', e.target.checked)} /> Active</label>
      {cur.pattern && <div><div className="label" style={{ marginBottom: 6 }}>Would match in the last 90 days · {matches.length}{matches.length === 5 ? '+' : ''}</div>{matches.map(t => <div key={t.id} className="text-sm fin-mono" style={{ padding: '3px 0' }}>{t.description} <span className="text-muted">{money(t.amount)}</span></div>)}{!matches.length && <div className="text-sm text-muted">No recent lines match.</div>}</div>}
    </Modal>
  );
}

function RecurringModal({ rec, onClose, fin, vehicles }) {
  const isNew = rec === 'new';
  const [f, setF] = useState(null);
  const cur = f || (rec && rec !== 'new' ? rec : { name: '', category: '', amount: '', frequency: 'monthly', nextDue: todayStr(), vehicleId: '', active: true });
  const set = (k, v) => setF({ ...cur, [k]: v });
  if (!rec) return null;
  const save = async () => { if (isNew) await fin.addRecurring(cur); else await fin.updateRecurring(rec.id, cur); setF(null); onClose(); };
  const del = async () => { if (window.confirm('Delete this recurring expense?')) { await fin.removeRecurring(rec.id); setF(null); onClose(); } };
  return (
    <Modal open onClose={() => { setF(null); onClose(); }} title={isNew ? 'Add recurring expense' : 'Edit recurring expense'}
      footer={<>{!isNew && <button className="btn btn-danger" onClick={del}>Delete</button>}<span style={{ flex: 1 }} /><button className="btn btn-secondary" onClick={() => { setF(null); onClose(); }}>Cancel</button><button className="btn btn-primary" disabled={!cur.name || !cur.category || cur.amount === ''} onClick={save}>Save</button></>}>
      <div className="field"><label className="label">Name</label><input className="input" value={cur.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Garage Michelle" /></div>
      <div className="grid-2">
        <div className="field"><label className="label">Category</label><CategorySelect value={cur.category} onChange={v => set('category', v)} allow={['operating', 'capital']} /></div>
        <div className="field"><label className="label">Amount ($)</label><input className="input" type="number" step="0.01" value={cur.amount} onChange={e => set('amount', e.target.value)} /></div>
        <div className="field"><label className="label">Frequency</label><select className="select" value={cur.frequency} onChange={e => set('frequency', e.target.value)}><option value="weekly">Weekly</option><option value="fortnightly">Fortnightly</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></div>
        <div className="field"><label className="label">Next due</label><input className="input" type="date" value={cur.nextDue || ''} onChange={e => set('nextDue', e.target.value)} /></div>
        <div className="field"><label className="label">Vehicle (optional)</label><select className="select" value={cur.vehicleId || ''} onChange={e => set('vehicleId', e.target.value)}><option value="">—</option>{vehicles.map(v => <option key={v.id} value={v.id}>{v.plate}</option>)}</select></div>
      </div>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={cur.active !== false} onChange={e => set('active', e.target.checked)} /> Active (included in the forecast)</label>
      <span className="text-sm text-muted">Example: <AmountCell value={-(Number(cur.amount) || 0)} bold={false} /> {cur.frequency}</span>
    </Modal>
  );
}
