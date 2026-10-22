import { useEffect, useMemo, useState } from 'react';
import Modal from '../../components/shared/Modal';
import Badge from '../../components/shared/Badge';
import { useFinance } from '../../finance/FinanceContext';
import { useStore } from '../../context/StoreContext';
import { parseCsv, guessMapping, looksLikeHeader, mapRows, dedupeKey, last4, COLUMN_ROLES } from '../../finance/csv';
import { suggestFor } from '../../finance/matching';
import { money } from '../../finance/categories';
import { formatDate } from '../../utils/dates';
import { AmountCell } from './bits';

const Steps = ({ n, total = 4 }) => <div className="fin-steps">{Array.from({ length: total }).map((_, i) => <span key={i} className={i < n ? 'done' : ''} />)}</div>;

export default function ImportCsvModal({ open, onClose, onDone, accountId: initialAccount }) {
  const fin = useFinance();
  const { data } = useStore();
  const csvAccounts = fin.accounts.filter(a => a.feed === 'csv');
  const [step, setStep] = useState(1);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [warn, setWarn] = useState('');
  const [over, setOver] = useState(false);

  useEffect(() => { if (open) { setStep(1); setAccountId(initialAccount || csvAccounts[0]?.id || ''); setFile(null); setRows([]); setHeaders([]); setMapping([]); setErr(''); setWarn(''); setShowAll(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const account = fin.accounts.find(a => a.id === accountId);

  const loadFile = async (f) => {
    setErr('');
    try {
      const text = await f.text();
      const all = parseCsv(text);
      if (!all.length) throw new Error('The file is empty.');
      const hasHeader = looksLikeHeader(all[0]);
      const hdr = hasHeader ? all[0].map(h => h.trim()) : all[0].map((_, i) => `Column ${i + 1}`);
      const body = hasHeader ? all.slice(1) : all;
      const saved = localStorage.getItem(`finance.csvMapping.${accountId}`);
      let map = saved ? JSON.parse(saved) : null;
      if (!map || map.length !== hdr.length) map = guessMapping(hdr);
      const hasAmount = (m) => m.includes('amount') || (m.includes('debit') || m.includes('credit'));
      // NAB's export without a header row: Date, Amount, Account Number, blank, Type, Details, Balance, Category, Merchant
      if (!hasAmount(map) && !hasHeader && hdr.length === 9) map = ['date', 'amount', 'account', 'ignore', 'raw', 'description', 'balance', 'ignore', 'merchant'];
      setWarn(hasAmount(map) ? '' : 'No Amount column was recognised (nor Debit and Credit). Set the columns by hand in the next step, or export again from NAB as CSV: Transaction history › Export › CSV.');
      setFile(f); setHeaders(hdr); setRows(body); setMapping(map);
    } catch (e) { setErr(e.message); setFile(null); }
  };

  const mapped = useMemo(() => (rows.length && mapping.length) ? mapRows(rows, headers, mapping) : { lines: [], problems: [] }, [rows, headers, mapping]);

  // Account check: compare the file's account number column with the stored last-4 digits.
  const accountCheck = useMemo(() => {
    const nums = mapped.lines.map(l => last4(l.accountNumber)).filter(Boolean);
    const fileLast4 = nums[0] || '';
    if (!fileLast4) return { state: 'none' };
    if (!account?.accountHint) return { state: 'new', fileLast4 };
    if (account.accountHint === fileLast4) return { state: 'ok', fileLast4 };
    const other = fin.accounts.find(a => a.accountHint === fileLast4);
    return { state: 'mismatch', fileLast4, other };
  }, [mapped.lines, account, fin.accounts]);

  // Classify each line: new / duplicate / before cut-over
  const classified = useMemo(() => {
    const existing = new Set(fin.transactions.filter(t => t.accountId === accountId).map(t => dedupeKey(accountId, t)));
    const cutover = fin.settings.cutoverDate || '';
    return mapped.lines.map(l => {
      const key = dedupeKey(accountId, l);
      const result = existing.has(key) ? 'duplicate' : (cutover && l.date <= cutover) ? 'cutover' : 'new';
      return { ...l, key, result };
    });
  }, [mapped.lines, fin.transactions, fin.settings.cutoverDate, accountId]);

  const counts = useMemo(() => ({ new: classified.filter(l => l.result === 'new').length, duplicate: classified.filter(l => l.result === 'duplicate').length, cutover: classified.filter(l => l.result === 'cutover').length }), [classified]);
  const newLines = useMemo(() => classified.filter(l => l.result === 'new').sort((a, b) => a.date.localeCompare(b.date)), [classified]);

  // Suggestions for the review step
  const prepared = useMemo(() => {
    const ctx = { rules: fin.rules, customers: data.customers, rentals: data.rentals, vehicles: data.vehicles, transactions: fin.transactions, accounts: fin.accounts, payees: fin.payees };
    return newLines.map(l => {
      const tx = { accountId, date: l.date, amount: l.amount, description: l.description, raw: l.raw };
      const sug = suggestFor(tx, ctx);
      const byRule = sug?.kind === 'rule' || sug?.kind === 'vehicle';
      return { ...l, suggestion: sug, matchStatus: sug ? (byRule ? 'unreviewed' : 'suggested') : 'unreviewed', category: sug?.category || '', customerId: sug?.customerId || null, rentalId: sug?.rentalId || null, vehicleId: sug?.vehicleId || null, payeeId: sug?.payeeId || null, linkedTransactionId: sug?.linkedTransactionId || null };
    });
  }, [newLines, fin, data, accountId]);
  const reviewCounts = useMemo(() => ({ rule: prepared.filter(p => p.suggestion && p.matchStatus === 'unreviewed').length, matched: prepared.filter(p => p.matchStatus === 'suggested').length, none: prepared.filter(p => !p.suggestion).length, in: prepared.filter(p => p.amount > 0).reduce((s, p) => s + p.amount, 0), out: prepared.filter(p => p.amount < 0).reduce((s, p) => s + p.amount, 0) }), [prepared]);
  const closing = useMemo(() => { const withBal = mapped.lines.filter(l => l.balance != null).sort((a, b) => a.date.localeCompare(b.date)); return withBal.length ? withBal[withBal.length - 1].balance : null; }, [mapped.lines]);
  const dateRange = useMemo(() => { const ds = mapped.lines.map(l => l.date).sort(); return ds.length ? [ds[0], ds[ds.length - 1]] : null; }, [mapped.lines]);

  const doImport = async () => {
    setBusy(true); setErr('');
    try {
      localStorage.setItem(`finance.csvMapping.${accountId}`, JSON.stringify(mapping));
      const items = prepared.map(p => ({ accountId, date: p.date, amount: p.amount, description: p.description, balance: p.balance, source: 'bank_csv', raw: p.raw, category: p.category, matchStatus: p.matchStatus, suggestion: p.suggestion ? { category: p.suggestion.category, reason: p.suggestion.reason, kind: p.suggestion.kind } : null, customerId: p.customerId, rentalId: p.rentalId, vehicleId: p.vehicleId, payeeId: p.payeeId, linkedTransactionId: p.linkedTransactionId }));
      const inserted = items.length ? await fin.insertTransactions(items) : [];
      await fin.addImport({ accountId, kind: 'bank_csv', fileName: file.name, lineCount: mapped.lines.length, newCount: inserted.length, skippedCount: mapped.lines.length - inserted.length, fromDate: dateRange?.[0], toDate: dateRange?.[1], closingBalance: closing });
      if (accountCheck.state === 'new' && accountCheck.fileLast4) await fin.updateAccount(accountId, { accountHint: accountCheck.fileLast4 });
      onDone?.(inserted.length);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const title = ['Import bank CSV', 'Check the columns', 'What is new in this file', `Import ${counts.new} lines`][step - 1];
  const sub = [`Step 1 of 4 · Choose account`, `Step 2 of 4 · Saved for ${account?.name || 'this account'}, so next time this is skipped`, 'Step 3 of 4', `Step 4 of 4 · ${account?.name || ''}${dateRange ? ` · ${formatDate(dateRange[0])} – ${formatDate(dateRange[1])}` : ''}`][step - 1];
  const canNext = step === 1 ? !!file && !!accountId && accountCheck.state !== 'mismatch' : step === 2 ? mapped.lines.length > 0 : true;

  return (
    <Modal open={open} onClose={onClose} title={title} width={640}
      footer={<>
        {step > 1 ? <button className="btn btn-secondary" onClick={() => setStep(s => s - 1)} disabled={busy}>Back</button> : <button className="btn btn-secondary" onClick={onClose}>Cancel</button>}
        {step < 4
          ? <button className="btn btn-primary" disabled={!canNext} onClick={() => setStep(s => s + 1)}>{['Next: check columns', 'Next: check duplicates', 'Next: review'][step - 1]}</button>
          : <button className="btn btn-primary" disabled={busy || counts.new === 0} onClick={doImport}>{busy ? 'Importing…' : 'Import and open queue'}</button>}
      </>}>
      <div className="text-sm text-muted" style={{ marginTop: -8 }}>{sub}</div>
      <Steps n={step} />

      {step === 1 && (
        <>
          <div className="field"><label className="label">Account</label>
            <select className="select" value={accountId} onChange={e => setAccountId(e.target.value)}>{csvAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            {account?.lastImportAt && <span className="field-hint">Last imported {formatDate(account.lastImportAt.slice(0, 10))}</span>}</div>
          <div className={`fin-dropzone${over ? ' over' : ''}`} onDragOver={e => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={e => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) loadFile(f); }} onClick={() => document.getElementById('fin-csv-input').click()}>
            <div style={{ fontSize: 22 }}>↑</div>
            <div className="fw-600" style={{ color: 'var(--text)' }}>Drop the CSV here</div>
            <div className="text-sm">From NAB internet banking: Transaction history › Export › CSV</div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} type="button">Choose file</button>
            <input id="fin-csv-input" type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && loadFile(e.target.files[0])} />
          </div>
          {file && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
              <div><div className="fw-600" style={{ fontSize: 14 }}>{file.name}</div><div className="text-sm text-muted">{(file.size / 1024).toFixed(0)} KB · {mapped.lines.length} lines{dateRange ? ` · ${formatDate(dateRange[0])} – ${formatDate(dateRange[1])}` : ''}</div></div>
              <button className="btn btn-secondary btn-sm" onClick={() => setFile(null)}>Remove</button>
            </div>
          )}
          {file && accountCheck.state === 'ok' && <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>Account number in the file (••• {accountCheck.fileLast4}) matches {account.name}.</div>}
          {file && accountCheck.state === 'new' && <div style={{ background: 'var(--blue-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>The file is for account ••• {accountCheck.fileLast4}. It will be remembered for {account.name} so future files are checked.</div>}
          {file && accountCheck.state === 'mismatch' && <div style={{ background: 'var(--red-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--red)' }}>This file is from account ••• {accountCheck.fileLast4}{accountCheck.other ? ` (${accountCheck.other.name})` : ''}, not {account.name}. Switch account or choose another file.
            {accountCheck.other && <button className="btn btn-secondary btn-sm" style={{ marginLeft: 8 }} onClick={() => setAccountId(accountCheck.other.id)}>Switch to {accountCheck.other.name}</button>}</div>}
          {err && <div style={{ background: 'var(--red-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13, color: 'var(--red)' }}>{err}</div>}
          {file && warn && <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>{warn}</div>}
        </>
      )}

      {step === 2 && (
        <>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Column in file</th><th>Example</th><th>Used as</th></tr></thead>
            <tbody>{headers.map((h, i) => (
              <tr key={i} style={{ cursor: 'default' }}>
                <td className="fin-mono">{h || `Column ${i + 1}`}</td>
                <td className="text-sm text-muted" style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rows[0]?.[i]}</td>
                <td><select className="select" value={mapping[i]} onChange={e => setMapping(m => m.map((x, j) => j === i ? e.target.value : x))} style={{ padding: '6px 10px' }}>{COLUMN_ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}</select></td>
              </tr>))}</tbody>
          </table></div>
          {mapped.problems.length > 0 && <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>{mapped.problems.length} rows could not be read ({mapped.problems[0].reason}) and will be skipped.</div>}
          <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>Columns are guessed from the headers. Check the date and amount columns the first time; the mapping is saved per account.</div>
        </>
      )}

      {step === 3 && (
        <>
          <div className="grid-4 fin-3" style={{ gap: 10 }}>
            {[['new', 'New lines', 'var(--accent)'], ['duplicate', 'Already imported', 'var(--muted)'], ['cutover', 'Before cut-over', 'var(--amber)']].map(([k, label, color]) => (
              <div key={k} style={{ border: `1.5px solid ${k === 'new' ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, padding: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 700, color }}>{counts[k]}</div><div className="text-sm text-muted">{label}</div></div>))}
          </div>
          <div className="text-sm text-muted">A line is a duplicate when date, amount, description and running balance all match one already stored. Same-day lines with the same amount but a different balance are kept.</div>
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th>Result</th></tr></thead>
            <tbody>{(showAll ? classified : classified.slice(0, 8)).map((l, i) => (
              <tr key={i} style={{ cursor: 'default' }}>
                <td className="text-muted" style={{ whiteSpace: 'nowrap' }}>{formatDate(l.date).replace(/ \d{4}$/, '')}</td>
                <td className="fin-mono" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description}</td>
                <td style={{ textAlign: 'right' }}><AmountCell value={l.amount} bold={false} /></td>
                <td><Badge variant={l.result === 'new' ? 'green' : l.result === 'duplicate' ? 'gray' : 'amber'}>{l.result === 'new' ? 'New' : l.result === 'duplicate' ? 'Duplicate · skipped' : 'Before cut-over'}</Badge></td>
              </tr>))}</tbody>
          </table></div>
          {classified.length > 8 && <button className="btn btn-secondary btn-sm" onClick={() => setShowAll(s => !s)}>{showAll ? 'Show fewer' : `Show all ${classified.length} lines`}</button>}
          {counts.cutover > 0 && <div style={{ background: 'var(--amber-bg)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>The {counts.cutover} lines dated on or before {formatDate(fin.settings.cutoverDate)} are covered by your spreadsheet history, so they are not imported.</div>}
        </>
      )}

      {step === 4 && (
        <>
          {[['Categorised by a rule', reviewCounts.rule, 'amber', 'Unreviewed'], ['Matched to a customer, payout or transfer', reviewCounts.matched, 'blue', 'Suggested'], ['No rule or match yet', reviewCounts.none, 'amber', 'Unreviewed']].map(([label, n, v, s]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 14 }}><span>{label}</span><span><Badge variant={v}>{s}</Badge> <strong style={{ marginLeft: 8 }}>{n}</strong></span></div>))}
          <div className="grid-2">
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}><div className="text-sm text-muted">Money in</div><div style={{ fontSize: 20, fontWeight: 700 }}><AmountCell value={reviewCounts.in} /></div></div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}><div className="text-sm text-muted">Money out</div><div style={{ fontSize: 20, fontWeight: 700 }}><AmountCell value={reviewCounts.out} /></div></div>
          </div>
          {closing != null && <div style={{ background: 'var(--accent-light)', borderRadius: 8, padding: '8px 12px', fontSize: 13 }}>Closing balance in the file: {money(closing)}.</div>}
          <div className="text-sm text-muted">Nothing changes in Rentals or Bonds until you confirm items in the reconciliation queue.</div>
          {err && <div style={{ color: 'var(--red)', fontSize: 13 }}>{err}</div>}
        </>
      )}
    </Modal>
  );
}
