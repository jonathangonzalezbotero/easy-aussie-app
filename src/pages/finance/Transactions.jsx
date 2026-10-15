import { useMemo, useState } from 'react';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { useSuggestions } from '../../finance/useSuggestions';
import { CATEGORY_TYPES, MATCH_STATUS, SOURCE_LABEL, categoryLabel, categoryType, categoryTypeNote, money, monthKey, monthLabel } from '../../finance/categories';
import { formatDate, formatTimestamp } from '../../utils/dates';
import EmptyState from '../../components/shared/EmptyState';
import { AmountCell, AccountBadge, CategorySelect, StatusBadge, Toast } from './bits';
import TransactionDrawer from './TransactionDrawer';
import ImportCsvModal from './ImportCsvModal';
import SpreadsheetImportModal from './SpreadsheetImportModal';
import { syncStripe } from '../../finance/stripe';

export default function Transactions({ go }) {
  const fin = useFinance();
  const { data } = useStore();
  const suggestions = useSuggestions();
  const [filters, setFilters] = useState({ period: monthKey(new Date().toISOString()), account: '', source: '', category: '', type: '', status: '', q: '' });
  const [sort, setSort] = useState({ col: 'date', dir: 'desc' });
  const [selected, setSelected] = useState([]);
  const [bulkCat, setBulkCat] = useState('');
  const [editing, setEditing] = useState(null);   // tx or 'new'
  const [showImport, setShowImport] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const sfl = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const months = useMemo(() => {
    const set = new Set(fin.transactions.map(t => monthKey(t.date)));
    set.add(monthKey(new Date().toISOString()));
    return [...set].sort().reverse();
  }, [fin.transactions]);

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const custName = (id) => data.customers.find(c => c.id === id)?.name || '';
    const plate = (id) => data.vehicles.find(v => v.id === id)?.plate || '';
    let list = fin.transactions.filter(t => {
      if (filters.period && filters.period !== 'all' && monthKey(t.date) !== filters.period) return false;
      if (filters.account && t.accountId !== filters.account) return false;
      if (filters.source && t.source !== filters.source) return false;
      if (filters.status && t.matchStatus !== filters.status) return false;
      const cats = t.splits.length ? t.splits.map(s => s.category) : [t.category];
      if (filters.category && !cats.includes(filters.category)) return false;
      if (filters.type && !cats.some(c => categoryType(c) === filters.type)) return false;
      if (q) {
        const hay = [t.description, custName(t.customerId), plate(t.vehicleId), String(t.amount), categoryLabel(t.category), t.notes].join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const mul = sort.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sort.col === 'date') return (a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')) * mul;
      if (sort.col === 'amount') return (a.amount - b.amount) * mul;
      if (sort.col === 'description') return a.description.localeCompare(b.description) * mul;
      if (sort.col === 'account') return (fin.accounts.find(x => x.id === a.accountId)?.name || '').localeCompare(fin.accounts.find(x => x.id === b.accountId)?.name || '') * mul;
      if (sort.col === 'category') return categoryLabel(a.category).localeCompare(categoryLabel(b.category)) * mul;
      if (sort.col === 'status') return a.matchStatus.localeCompare(b.matchStatus) * mul;
      return 0;
    });
    return list;
  }, [fin.transactions, fin.accounts, filters, sort, data.customers, data.vehicles]);

  const totals = useMemo(() => rows.reduce((acc, t) => { if (t.matchStatus === 'ignored') return acc; if (t.amount > 0) acc.in += t.amount; else acc.out += t.amount; return acc; }, { in: 0, out: 0 }), [rows]);

  const toggleSort = (col) => setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: col === 'date' ? 'desc' : 'asc' });
  const sortTh = (col, children, className, style) => (
    <th className={className} onClick={() => toggleSort(col)} style={{ cursor: 'pointer', userSelect: 'none', ...style }}>
      {children}<span style={{ marginLeft: 4, opacity: sort.col === col ? 1 : 0.3, fontSize: 10 }}>{sort.col === col && sort.dir === 'desc' ? '▼' : '▲'}</span>
    </th>
  );

  const allSelected = rows.length > 0 && rows.every(r => selected.includes(r.id));
  const toggleAll = () => setSelected(allSelected ? [] : rows.map(r => r.id));
  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const applyBulk = async (updates) => {
    try { await fin.bulkUpdate(selected, updates); setToast({ message: `${selected.length} transactions updated` }); setSelected([]); setBulkCat(''); }
    catch (e) { setToast({ message: e.message }); }
  };

  const onSaved = (tx, effects) => {
    if (!tx) { setToast({ message: 'Transaction deleted' }); return; }
    setToast({ message: effects?.[0] || (tx.matchStatus === 'ignored' ? 'Marked as ignored' : 'Saved and confirmed'), undo: tx.hasUndo ? tx.id : null });
  };
  const undo = async () => { if (!toast?.undo) return; try { await fin.undoTransaction(toast.undo); setToast({ message: 'Undone' }); } catch (e) { setToast({ message: e.message }); } };

  const doSync = async () => {
    setSyncing(true);
    try { const r = await syncStripe(); await fin.refresh(); setToast({ message: `Stripe synced · ${r.inserted ?? 0} new lines` }); }
    catch (e) { setToast({ message: `Stripe sync failed: ${e.message}` }); } finally { setSyncing(false); }
  };

  const linkedTo = (t) => {
    const c = data.customers.find(x => x.id === t.customerId);
    const r = data.rentals.find(x => x.id === t.rentalId);
    const v = data.vehicles.find(x => x.id === t.vehicleId || x.id === r?.vehicleId);
    const linked = t.linkedTransactionId ? fin.transactions.find(x => x.id === t.linkedTransactionId) : null;
    const reimbursedBy = fin.transactions.find(x => x.linkedTransactionId === t.id);
    if (linked) return [`Pairs with ${linked.description.slice(0, 24)}`, `${formatDate(linked.date)}`];
    if (reimbursedBy) return [`Reimbursed ${formatDate(reimbursedBy.date)}`, fin.accounts.find(a => a.id === reimbursedBy.accountId)?.name || ''];
    if (c || r) return [c?.name || '—', [r?.contractNumber, v?.plate].filter(Boolean).join(' · ')];
    if (v) return [v.plate, 'Vehicle'];
    if (t.splits.length) return [`${t.splits.length} splits`, t.splits.map(s => categoryLabel(s.category)).join(' + ')];
    return ['—', ''];
  };

  const stripeAccount = fin.accounts.find(a => a.feed === 'stripe');
  const lastSync = fin.settings.stripeLastSync;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <div><h1 className="page-title">Finance</h1><div className="text-sm text-muted">Every money movement across NAB, Stripe, your personal card and cash</div></div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {stripeAccount && <button className="btn btn-secondary" onClick={doSync} disabled={syncing}>{syncing ? 'Syncing…' : `Sync Stripe now${lastSync ? ` · ${new Date(lastSync).toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })}` : ''}`}</button>}
          <button className="btn btn-secondary" onClick={() => setShowImport(true)}>Import bank CSV</button>
          <button className="btn btn-primary" onClick={() => setEditing('new')}>+ Add manual transaction</button>
        </div>
      </div>

      <div className="card mb-16" style={{ padding: 16 }}>
        <div className="fin-filters">
          <div className="field"><label className="label">Period</label>
            <select className="select" value={filters.period} onChange={e => sfl('period', e.target.value)}>
              <option value="all">All time</option>{months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}</select></div>
          <div className="field"><label className="label">Account</label>
            <select className="select" value={filters.account} onChange={e => sfl('account', e.target.value)}><option value="">All accounts</option>{fin.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
          <div className="field"><label className="label">Source</label>
            <select className="select" value={filters.source} onChange={e => sfl('source', e.target.value)}><option value="">All sources</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="field"><label className="label">Category</label><CategorySelect value={filters.category} onChange={v => sfl('category', v)} placeholder="All categories" /></div>
          <div className="field"><label className="label">Category type</label>
            <select className="select" value={filters.type} onChange={e => sfl('type', e.target.value)}><option value="">All types</option>{Object.entries(CATEGORY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
          <div className="field"><label className="label">Match status</label>
            <select className="select" value={filters.status} onChange={e => sfl('status', e.target.value)}><option value="">All statuses</option>{Object.entries(MATCH_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></div>
        </div>
        <div className="field" style={{ marginTop: 10, maxWidth: 480 }}><label className="label">Search</label>
          <input className="input" placeholder="Description, customer, plate, amount…" value={filters.q} onChange={e => sfl('q', e.target.value)} /></div>
      </div>

      <div className="card">
        {selected.length > 0 && (
          <div className="fin-bulk">
            <span className="fw-600">{selected.length} selected</span>
            <span>Categorise as</span>
            <CategorySelect value={bulkCat} onChange={setBulkCat} />
            <button className="btn btn-primary btn-sm" disabled={!bulkCat} onClick={() => applyBulk({ category: bulkCat, matchStatus: 'confirmed' })}>Apply to {selected.length}</button>
            <button className="btn btn-sm" style={{ background: 'transparent', color: 'white' }} onClick={() => applyBulk({ matchStatus: 'confirmed' })}>Confirm as is</button>
            <button className="btn btn-sm" style={{ background: 'transparent', color: 'white' }} onClick={() => applyBulk({ matchStatus: 'ignored' })}>Mark ignored</button>
            <span style={{ flex: 1 }} />
            <button className="btn btn-sm" style={{ background: 'transparent', color: 'white' }} onClick={() => setSelected([])}>Clear selection</button>
          </div>
        )}
        {rows.length === 0 ? (
          <EmptyState icon="▦" message={fin.transactions.length === 0 ? 'No transactions yet. Import a bank CSV or your spreadsheet, or add a cash payment by hand.' : 'Nothing matches these filters.'}
            action={fin.transactions.length === 0 ? <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}><button className="btn btn-primary" onClick={() => setShowImport(true)}>Import bank CSV</button><button className="btn btn-secondary" onClick={() => setShowSheet(true)}>Import spreadsheet history</button></div> : null} />
        ) : (
          <div className="table-wrap"><table className="table fin-table-hover">
            <thead><tr>
              <th style={{ width: 36 }}><input type="checkbox" checked={allSelected} onChange={toggleAll} /></th>
              {sortTh('date', 'Date')}
              {sortTh('description', 'Description')}
              {sortTh('amount', 'Amount', undefined, { textAlign: 'right' })}
              {sortTh('account', 'Account', 'col-hide-mobile')}
              {sortTh('category', 'Category')}
              <th className="col-hide-tablet">Linked to</th>
              {sortTh('status', 'Match status', 'col-hide-mobile')}
            </tr></thead>
            <tbody>
              {rows.map(t => {
                const [l1, l2] = linkedTo(t);
                const sug = suggestions[t.id];
                const account = fin.accounts.find(a => a.id === t.accountId);
                const isSel = selected.includes(t.id);
                return (
                  <tr key={t.id} className={isSel ? 'fin-row-selected' : ''} onClick={() => setEditing(t)} style={{ opacity: t.matchStatus === 'ignored' ? 0.55 : 1 }}>
                    <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={isSel} onChange={() => toggle(t.id)} /></td>
                    <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date).replace(/ \d{4}$/, '')}</td>
                    <td>
                      <div className={t.source === 'bank_csv' ? 'fin-mono' : 'fw-500'} style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description || '—'}</div>
                      <div className="text-sm text-muted">{SOURCE_LABEL[t.source]}{t.notes ? ` · ${t.notes.slice(0, 40)}` : ''}</div>
                    </td>
                    <td style={{ textAlign: 'right' }}><AmountCell value={t.amount} /></td>
                    <td className="col-hide-mobile"><AccountBadge account={account} /></td>
                    <td>
                      {t.splits.length ? (
                        <div><div className="fw-500">Split · {t.splits.length} lines</div><div className="text-sm text-muted">{t.splits.map(s => `${categoryLabel(s.category)} ${money(s.amount, { decimals: 0 })}`).join(' + ')}</div></div>
                      ) : t.category ? (
                        <div><div className="fw-500">{categoryLabel(t.category)}</div><div className="text-sm text-muted">{categoryTypeNote(t.category)}</div></div>
                      ) : sug ? (
                        <div><div className="fw-500" style={{ color: 'var(--blue)' }}>{categoryLabel(sug.category)}</div><div className="text-sm text-muted">Suggested · {sug.reason.slice(0, 40)}</div></div>
                      ) : <div className="text-muted">Uncategorised</div>}
                    </td>
                    <td className="col-hide-tablet"><div className="fw-500">{l1}</div><div className="text-sm text-muted">{l2}</div></td>
                    <td className="col-hide-mobile"><StatusBadge status={t.matchStatus === 'unreviewed' && sug ? 'suggested' : t.matchStatus} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
        {rows.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 13 }}>
            <span className="text-muted">{rows.length} transactions{filters.period !== 'all' ? ` in ${monthLabel(filters.period)}` : ''} · click a row to edit it in the side panel</span>
            <span>Money in <AmountCell value={totals.in} /> &nbsp; Money out <AmountCell value={totals.out} /></span>
          </div>
        )}
      </div>

      <div className="text-sm text-muted" style={{ marginTop: 10, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setShowSheet(true)}>Import spreadsheet history</button>
        <button className="btn btn-ghost btn-sm" onClick={() => go('reconcile')}>Open reconcile queue{fin.queueCount ? ` · ${fin.queueCount}` : ''}</button>
        {fin.imports[0] && <span style={{ alignSelf: 'center' }}>Last import {formatTimestamp(fin.imports[0].createdAt)} · {fin.imports[0].fileName}</span>}
      </div>

      <TransactionDrawer open={!!editing} tx={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={onSaved} />
      <ImportCsvModal open={showImport} onClose={() => setShowImport(false)} onDone={(n) => { setShowImport(false); setToast({ message: `${n} new lines imported` }); if (n > 0) go('reconcile'); }} />
      <SpreadsheetImportModal open={showSheet} onClose={() => setShowSheet(false)} onDone={(n) => { setShowSheet(false); setToast({ message: `${n} lines imported from the spreadsheet` }); }} />
      <Toast toast={toast} onUndo={undo} onClose={() => setToast(null)} />
    </div>
  );
}
