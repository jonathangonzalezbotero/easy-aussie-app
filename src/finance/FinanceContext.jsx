import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const FinanceContext = createContext(null);

// ── Normalizers ──────────────────────────────────────────────────────────────
const accountFromDb = (a) => ({ id: a.id, name: a.name, kind: a.kind, feed: a.feed, accountHint: a.account_hint || '', sortOrder: a.sort_order || 0, lastImportAt: a.last_import_at });
const accountToDb = (a) => ({ name: a.name, kind: a.kind, feed: a.feed, account_hint: a.accountHint || null, sort_order: a.sortOrder || 0, last_import_at: a.lastImportAt || null });

const splitFromDb = (s) => ({ id: s.id, transactionId: s.transaction_id, category: s.category, amount: Number(s.amount), rentalId: s.rental_id, customerId: s.customer_id, vehicleId: s.vehicle_id, payeeId: s.payee_id || null, notes: s.notes || '', sortOrder: s.sort_order || 0 });

const payeeFromDb = (p) => ({ id: p.id, name: p.name, kind: p.kind || 'supplier', abn: p.abn || '', defaultCategory: p.default_category || '', matchText: p.match_text || '', notes: p.notes || '', active: p.active !== false });
const payeeToDb = (p) => ({ name: p.name, kind: p.kind || 'supplier', abn: p.abn || null, default_category: p.defaultCategory || null, match_text: p.matchText || null, notes: p.notes || null, active: p.active !== false });

const txFromDb = (t) => ({
  id: t.id, accountId: t.account_id, date: t.date, amount: Number(t.amount), description: t.description || '',
  balance: t.balance == null ? null : Number(t.balance), source: t.source, importId: t.import_id, externalId: t.external_id,
  raw: t.raw, category: t.category || '', matchStatus: t.match_status, suggestion: t.suggestion,
  customerId: t.customer_id, rentalId: t.rental_id, vehicleId: t.vehicle_id, payeeId: t.payee_id || null, linkedTransactionId: t.linked_transaction_id,
  notes: t.notes || '', hasUndo: !!t.previous_state, confirmedAt: t.confirmed_at, createdAt: t.created_at, splits: [],
});
// Only the editable columns. Locked columns (date, amount, description) are passed only for manual lines.
const txToDb = (t, { full = false } = {}) => ({
  ...(full ? { account_id: t.accountId, date: t.date, amount: Number(t.amount), description: t.description || '', source: t.source || 'manual', balance: t.balance == null || t.balance === '' ? null : Number(t.balance), raw: t.raw || null, external_id: t.externalId || null, import_id: t.importId || null } : {}),
  category: t.category || null, match_status: t.matchStatus || 'unreviewed', suggestion: t.suggestion || null,
  customer_id: t.customerId || null, rental_id: t.rentalId || null, vehicle_id: t.vehicleId || null, payee_id: t.payeeId || null,
  linked_transaction_id: t.linkedTransactionId || null, notes: t.notes || null, updated_at: new Date().toISOString(),
});

const ruleFromDb = (r) => ({ id: r.id, pattern: r.pattern, category: r.category, accountId: r.account_id, payeeId: r.payee_id || null, priority: r.priority ?? 100, active: r.active !== false });
const ruleToDb = (r) => ({ pattern: r.pattern, category: r.category, account_id: r.accountId || null, payee_id: r.payeeId || null, priority: r.priority ?? 100, active: r.active !== false });

const recurringFromDb = (r) => ({ id: r.id, name: r.name, category: r.category, amount: Number(r.amount), frequency: r.frequency, nextDue: r.next_due, vehicleId: r.vehicle_id, active: r.active !== false });
const recurringToDb = (r) => ({ name: r.name, category: r.category, amount: Number(r.amount), frequency: r.frequency, next_due: r.nextDue || null, vehicle_id: r.vehicleId || null, active: r.active !== false });

const overrideFromDb = (o) => ({ id: o.id, month: o.month, category: o.category, amount: Number(o.amount), note: o.note || '' });

const settingsFromDb = (s) => ({
  cutoverDate: s.cutover_date || '', directorLoanOpening: s.director_loan_opening == null ? '' : String(s.director_loan_opening),
  directorLoanOpeningDate: s.director_loan_opening_date || '', targetOccupancy: Number(s.target_occupancy ?? 0.8),
  scooterWeeklyRate: Number(s.scooter_weekly_rate ?? 135), ebikeWeeklyRate: Number(s.ebike_weekly_rate ?? 55),
  reminderEnabled: s.reminder_enabled !== false, reminderEmail: s.reminder_email || '',
  stripeLastSync: s.stripe_last_sync, stripeSyncFrom: s.stripe_sync_from || '',
});
const settingsToDb = (s) => ({
  cutover_date: s.cutoverDate || null, director_loan_opening: s.directorLoanOpening === '' ? 0 : Number(s.directorLoanOpening),
  director_loan_opening_date: s.directorLoanOpeningDate || null, target_occupancy: Number(s.targetOccupancy),
  scooter_weekly_rate: Number(s.scooterWeeklyRate), ebike_weekly_rate: Number(s.ebikeWeeklyRate),
  reminder_enabled: !!s.reminderEnabled, reminder_email: s.reminderEmail || null, stripe_sync_from: s.stripeSyncFrom || null,
});

const importFromDb = (i) => ({ id: i.id, accountId: i.account_id, kind: i.kind, fileName: i.file_name, lineCount: i.line_count, newCount: i.new_count, skippedCount: i.skipped_count, fromDate: i.from_date, toDate: i.to_date, closingBalance: i.closing_balance == null ? null : Number(i.closing_balance), createdAt: i.created_at });

const subFromDb = (s) => ({ id: s.id, customerEmail: s.customer_email, customerName: s.customer_name, amount: s.amount == null ? null : Number(s.amount), interval: s.interval, status: s.status, pastDueSince: s.past_due_since, lastFailedAmount: s.last_failed_amount == null ? null : Number(s.last_failed_amount), lastFailureReason: s.last_failure_reason || '', lastFailedAt: s.last_failed_at || null, updatedAt: s.updated_at });

const regoFromDb = (r) => ({ id: r.id, vehicleId: r.vehicle_id, renewalDate: r.renewal_date, expiryDate: r.expiry_date, duration: r.duration, cost: r.cost == null ? null : Number(r.cost) });

const DEFAULT_SETTINGS = settingsFromDb({});

// Supabase caps a select at 1000 rows; page through to get everything.
async function fetchAll(buildQuery) {
  const PAGE = 1000; let from = 0; const out = [];
  for (;;) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export function FinanceProvider({ children }) {
  const [state, setState] = useState({ accounts: [], transactions: [], rules: [], recurring: [], overrides: [], imports: [], subscriptions: [], regoRenewals: [], payees: [], settings: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);     // set when the finance tables are missing (migration not run)

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [accounts, txs, splits, rules, recurring, overrides, imports, subs, settingsRow, regos, payees] = await Promise.all([
        fetchAll(() => supabase.from('finance_accounts').select('*').order('sort_order')),
        fetchAll(() => supabase.from('finance_transactions').select('*').order('date', { ascending: false }).order('created_at', { ascending: false })),
        fetchAll(() => supabase.from('finance_splits').select('*').order('sort_order')),
        fetchAll(() => supabase.from('finance_rules').select('*').order('priority')),
        fetchAll(() => supabase.from('finance_recurring').select('*').order('next_due')),
        fetchAll(() => supabase.from('finance_forecast_overrides').select('*')),
        fetchAll(() => supabase.from('finance_imports').select('*').order('created_at', { ascending: false })),
        fetchAll(() => supabase.from('finance_stripe_subscriptions').select('*')),
        supabase.from('finance_settings').select('*').eq('id', 1).maybeSingle().then(({ data, error }) => { if (error) throw error; return data; }),
        fetchAll(() => supabase.from('rego_renewals').select('*').order('renewal_date')).catch(() => []),
        fetchAll(() => supabase.from('finance_payees').select('*').order('name')).catch(() => []),
      ]);
      const splitsByTx = {};
      for (const s of splits.map(splitFromDb)) (splitsByTx[s.transactionId] ||= []).push(s);
      setState({
        accounts: accounts.map(accountFromDb),
        transactions: txs.map(t => ({ ...txFromDb(t), splits: splitsByTx[t.id] || [] })),
        rules: rules.map(ruleFromDb), recurring: recurring.map(recurringFromDb), overrides: overrides.map(overrideFromDb),
        imports: imports.map(importFromDb), subscriptions: subs.map(subFromDb), regoRenewals: regos.map(regoFromDb), payees: payees.map(payeeFromDb),
        settings: settingsRow ? settingsFromDb(settingsRow) : DEFAULT_SETTINGS,
      });
    } catch (e) {
      console.error('Finance load failed:', e);
      setError(e.message || String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const patchTx = (id, patch) => setState(s => ({ ...s, transactions: s.transactions.map(t => t.id === id ? { ...t, ...patch } : t) }));

  // ── Transactions ──────────────────────────────────────────────────────────
  const addTransaction = async (tx) => {
    const { data: row, error } = await supabase.from('finance_transactions').insert(txToDb(tx, { full: true })).select().single();
    if (error) throw error;
    const item = txFromDb(row);
    if (tx.splits?.length) item.splits = await replaceSplits(item.id, tx.splits);
    setState(s => ({ ...s, transactions: [item, ...s.transactions] }));
    return item;
  };

  // Lines from a bank file or Stripe keep their date, amount and description. Only manual lines may change them.
  const updateTransaction = async (id, updates) => {
    const current = state.transactions.find(t => t.id === id);
    const merged = { ...current, ...updates };
    const full = current.source === 'manual';
    const { error } = await supabase.from('finance_transactions').update(txToDb(merged, { full })).eq('id', id);
    if (error) throw error;
    if (updates.splits) merged.splits = await replaceSplits(id, updates.splits);
    patchTx(id, merged);
    return merged;
  };

  // Lines that already have an id keep it (service-log links point at split ids); the rest are inserted.
  const replaceSplits = async (txId, splits) => {
    const rows = splits.map((s, i) => ({ ...(s.id ? { id: s.id } : {}), transaction_id: txId, category: s.category, amount: Number(s.amount), rental_id: s.rentalId || null, customer_id: s.customerId || null, vehicle_id: s.vehicleId || null, payee_id: s.payeeId || null, notes: s.notes || null, sort_order: i }));
    let kept = [];
    if (rows.length) {
      const { data, error } = await supabase.from('finance_splits').upsert(rows).select();
      if (error) throw error;
      kept = data.map(splitFromDb);
    }
    let del = supabase.from('finance_splits').delete().eq('transaction_id', txId);
    if (kept.length) del = del.not('id', 'in', `(${kept.map(k => k.id).join(',')})`);
    const { error: delErr } = await del;
    if (delErr) throw delErr;
    return kept.sort((a, b) => a.sortOrder - b.sortOrder);
  };

  const removeTransaction = async (id) => {
    const { error } = await supabase.from('finance_transactions').delete().eq('id', id);
    if (error) throw error;
    setState(s => ({ ...s, transactions: s.transactions.filter(t => t.id !== id) }));
  };

  const bulkUpdate = async (ids, updates) => {
    const dbPatch = {};
    if ('category' in updates) dbPatch.category = updates.category || null;
    if ('matchStatus' in updates) dbPatch.match_status = updates.matchStatus;
    if ('payeeId' in updates) dbPatch.payee_id = updates.payeeId || null;
    dbPatch.updated_at = new Date().toISOString();
    const { error } = await supabase.from('finance_transactions').update(dbPatch).in('id', ids);
    if (error) throw error;
    setState(s => ({ ...s, transactions: s.transactions.map(t => ids.includes(t.id) ? { ...t, ...updates } : t) }));
  };

  // Bulk insert for importers. Rows are snake_case-ready app objects. Duplicates are skipped by the unique index.
  const insertTransactions = async (txs) => {
    const rows = txs.map(t => txToDb(t, { full: true }));
    const { data, error } = await supabase.from('finance_transactions').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true }).select();
    if (error) throw error;
    const items = (data || []).map(t => ({ ...txFromDb(t), splits: [] }));
    setState(s => ({ ...s, transactions: [...items, ...s.transactions].sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt || '').localeCompare(a.createdAt || '')) }));
    return items;
  };

  const addImport = async (imp) => {
    const { data, error } = await supabase.from('finance_imports').insert({ account_id: imp.accountId || null, kind: imp.kind, file_name: imp.fileName, line_count: imp.lineCount, new_count: imp.newCount, skipped_count: imp.skippedCount, from_date: imp.fromDate || null, to_date: imp.toDate || null, closing_balance: imp.closingBalance ?? null }).select().single();
    if (error) throw error;
    const item = importFromDb(data);
    setState(s => ({ ...s, imports: [item, ...s.imports] }));
    if (imp.accountId) await updateAccount(imp.accountId, { lastImportAt: new Date().toISOString() });
    return item;
  };

  // Atomic confirm: transaction fields + splits + rental bond patch, with an undo snapshot server-side.
  const confirmTransaction = async ({ id, updates = {}, splits = null, rentalId = null, rentalUpdates = null }) => {
    const p_updates = {};
    if ('category' in updates) p_updates.category = updates.category || null;
    p_updates.match_status = updates.matchStatus || 'confirmed';
    for (const [k, col] of [['customerId', 'customer_id'], ['rentalId', 'rental_id'], ['vehicleId', 'vehicle_id'], ['payeeId', 'payee_id'], ['linkedTransactionId', 'linked_transaction_id'], ['notes', 'notes']]) {
      if (k in updates) p_updates[col] = updates[k] ?? '';
    }
    const p_splits = splits ? splits.map(s => ({ id: s.id || null, category: s.category, amount: Number(s.amount), rental_id: s.rentalId || null, customer_id: s.customerId || null, vehicle_id: s.vehicleId || null, payee_id: s.payeeId || null, notes: s.notes || null })) : null;
    const p_rental_updates = rentalUpdates ? Object.fromEntries(Object.entries({
      bond_status: rentalUpdates.status, bond_refunded_amount: rentalUpdates.refundedAmount, bond_retained_amount: rentalUpdates.retainedAmount,
      bond_retain_reason: rentalUpdates.retainReason, bond_refund_method: rentalUpdates.refundMethod, bond_refund_date: rentalUpdates.refundDate, bond_amount: rentalUpdates.amount,
    }).filter(([, v]) => v !== undefined)) : null;
    const { error } = await supabase.rpc('finance_confirm', { p_transaction_id: id, p_updates, p_splits, p_rental_id: rentalId, p_rental_updates });
    if (error) throw error;
    // Patch only what changed: another update may have landed in local state since this closure was created.
    const patch = { ...updates, matchStatus: p_updates.match_status, hasUndo: true, confirmedAt: new Date().toISOString() };
    if (splits) {
      const { data: sp } = await supabase.from('finance_splits').select('*').eq('transaction_id', id).order('sort_order');
      patch.splits = (sp || []).map(splitFromDb);
    }
    let merged;
    setState(s => ({ ...s, transactions: s.transactions.map(t => t.id === id ? (merged = { ...t, ...patch }) : t) }));
    return merged || { ...(state.transactions.find(t => t.id === id) || {}), ...patch };
  };

  const undoTransaction = async (id) => {
    const { error } = await supabase.rpc('finance_undo', { p_transaction_id: id });
    if (error) throw error;
    const { data: row } = await supabase.from('finance_transactions').select('*').eq('id', id).single();
    const { data: sp } = await supabase.from('finance_splits').select('*').eq('transaction_id', id).order('sort_order');
    patchTx(id, { ...txFromDb(row), splits: (sp || []).map(splitFromDb) });
  };

  // ── Simple tables ─────────────────────────────────────────────────────────
  const simple = (table, key, fromDb, toDb) => ({
    add: async (item) => {
      const { data, error } = await supabase.from(table).insert(toDb(item)).select().single();
      if (error) throw error;
      const it = fromDb(data); setState(s => ({ ...s, [key]: [...s[key], it] })); return it;
    },
    update: async (id, updates) => {
      const merged = { ...state[key].find(i => i.id === id), ...updates };
      const { error } = await supabase.from(table).update(toDb(merged)).eq('id', id);
      if (error) throw error;
      setState(s => ({ ...s, [key]: s[key].map(i => i.id === id ? merged : i) }));
    },
    remove: async (id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      setState(s => ({ ...s, [key]: s[key].filter(i => i.id !== id) }));
    },
  });
  const rulesApi = simple('finance_rules', 'rules', ruleFromDb, ruleToDb);
  const recurringApi = simple('finance_recurring', 'recurring', recurringFromDb, recurringToDb);
  const accountsApi = simple('finance_accounts', 'accounts', accountFromDb, accountToDb);
  const payeesApi = simple('finance_payees', 'payees', payeeFromDb, payeeToDb);
  const updateAccount = accountsApi.update;

  const setOverride = async (month, category, amount, note) => {
    if (amount === null || amount === '') {
      const { error } = await supabase.from('finance_forecast_overrides').delete().match({ month, category });
      if (error) throw error;
      setState(s => ({ ...s, overrides: s.overrides.filter(o => !(o.month === month && o.category === category)) }));
      return;
    }
    const { data, error } = await supabase.from('finance_forecast_overrides').upsert({ month, category, amount: Number(amount), note: note || null }, { onConflict: 'month,category' }).select().single();
    if (error) throw error;
    const it = overrideFromDb(data);
    setState(s => ({ ...s, overrides: [...s.overrides.filter(o => !(o.month === month && o.category === category)), it] }));
  };

  const updateSettings = async (updates) => {
    const merged = { ...state.settings, ...updates };
    const { error } = await supabase.from('finance_settings').upsert({ id: 1, ...settingsToDb(merged) });
    if (error) throw error;
    setState(s => ({ ...s, settings: merged }));
  };

  const queueCount = useMemo(() => state.transactions.filter(t => t.matchStatus === 'unreviewed' || t.matchStatus === 'suggested').length, [state.transactions]);

  const value = {
    ...state, loading, error, refresh, queueCount,
    addTransaction, updateTransaction, removeTransaction, bulkUpdate, insertTransactions, addImport,
    confirmTransaction, undoTransaction,
    addRule: rulesApi.add, updateRule: rulesApi.update, removeRule: rulesApi.remove,
    addRecurring: recurringApi.add, updateRecurring: recurringApi.update, removeRecurring: recurringApi.remove,
    updateAccount, setOverride, updateSettings,
    addPayee: payeesApi.add, updatePayee: payeesApi.update, removePayee: payeesApi.remove,
  };
  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export const useFinance = () => useContext(FinanceContext);
