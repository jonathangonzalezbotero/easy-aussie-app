import Badge from '../../components/shared/Badge';
import { CATEGORIES, CATEGORY_TYPES, MATCH_STATUS, accountVariant, categoryLabel, categoryTypeNote, money } from '../../finance/categories';

export const AmountCell = ({ value, bold = true, sign = true }) => {
  const n = Number(value) || 0;
  return <span style={{ color: n < 0 ? 'var(--red)' : n > 0 ? 'var(--accent)' : 'var(--muted)', fontWeight: bold ? 700 : 500, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{money(n, { sign })}</span>;
};

export const AccountBadge = ({ account }) => <Badge variant={accountVariant(account)}>{account?.name || '—'}</Badge>;

export const StatusBadge = ({ status }) => { const m = MATCH_STATUS[status] || MATCH_STATUS.unreviewed; return <Badge variant={m.variant}>{m.label}</Badge>; };

export const CategoryCell = ({ category, sub }) => (
  <div>
    <div className="fw-500" style={{ color: category ? 'inherit' : 'var(--amber)' }}>{categoryLabel(category)}</div>
    <div className="text-sm text-muted">{sub || categoryTypeNote(category)}</div>
  </div>
);

// Grouped category <select>. Pass allow={['income', ...]} to limit the groups shown.
export const CategorySelect = ({ value, onChange, allow, placeholder = 'Choose category…', className = 'select', style }) => (
  <select className={className} value={value || ''} onChange={e => onChange(e.target.value)} style={style}>
    <option value="">{placeholder}</option>
    {Object.entries(CATEGORY_TYPES).filter(([t]) => !allow || allow.includes(t)).map(([type, meta]) => (
      <optgroup key={type} label={meta.label}>
        {CATEGORIES.filter(c => c.type === type).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
      </optgroup>
    ))}
  </select>
);

export const AlertStrip = ({ tone = 'amber', title, detail, action, onAction }) => {
  const colors = { red: ['var(--red-bg)', 'var(--red)'], amber: ['var(--amber-bg)', 'var(--amber)'], blue: ['var(--blue-bg)', 'var(--blue)'], green: ['var(--accent-light)', 'var(--accent)'] }[tone];
  return (
    <div className="fin-alert" style={{ background: colors[0] }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: colors[1], flexShrink: 0, marginTop: 6 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="fw-600" style={{ fontSize: 14 }}>{title}</div>
        {detail && <div className="text-sm text-muted">{detail}</div>}
      </div>
      {action && <button className="btn btn-secondary btn-sm" style={{ background: 'white' }} onClick={onAction}>{action}</button>}
    </div>
  );
};

export const StatCard = ({ value, label, sub, color = 'var(--text)', onClick, soft }) => (
  <div className="stat-card" onClick={onClick} style={{ borderTopColor: color, cursor: onClick ? 'pointer' : 'default', background: soft ? 'oklch(0.985 0.012 80)' : undefined }}>
    <div className="stat-value" style={{ color, fontSize: 26 }}>{value}</div>
    <div className="stat-label">{label}</div>
    {sub && <div className="text-sm text-muted">{sub}</div>}
  </div>
);

export const SideEffectNote = ({ title = 'What confirming will change', items }) => items?.length ? (
  <div style={{ background: 'var(--blue-bg)', borderRadius: 10, padding: '12px 14px', fontSize: 13 }}>
    <div className="label" style={{ color: 'var(--blue)', marginBottom: 6 }}>{title}</div>
    <ul style={{ paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 3 }}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
  </div>
) : null;

export const Skeleton = ({ rows = 5, label }) => (
  <div style={{ padding: 20 }}>
    {label && <div className="text-sm text-muted" style={{ marginBottom: 12 }}>{label}</div>}
    {Array.from({ length: rows }).map((_, i) => <div key={i} className="fin-skel" style={{ width: `${60 + ((i * 17) % 35)}%` }} />)}
  </div>
);

export const Raw = ({ children }) => <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}>{children}</span>;

export const Toast = ({ toast, onUndo, onClose }) => toast ? (
  <div className="fin-toast">
    <span style={{ flex: 1 }}>{toast.message}</span>
    {toast.undo && <button className="btn btn-sm" style={{ background: 'transparent', color: 'white', fontWeight: 700 }} onClick={onUndo}>Undo</button>}
    <button className="btn btn-ghost btn-sm" style={{ color: 'white' }} onClick={onClose}>×</button>
  </div>
) : null;

export const PeriodSwitch = ({ mode, onMode, label, onPrev, onNext, nextDisabled }) => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
    {onMode && (
      <div className="tabs" style={{ padding: 3 }}>
        <button className={`tab${mode === 'month' ? ' active' : ''}`} onClick={() => onMode('month')}>Month</button>
        <button className={`tab${mode === 'fy' ? ' active' : ''}`} onClick={() => onMode('fy')}>Financial year</button>
      </div>
    )}
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 9, background: 'white' }}>
      <button className="btn btn-ghost btn-sm" onClick={onPrev}>‹</button>
      <span className="fw-600" style={{ fontSize: 14, minWidth: 120, textAlign: 'center' }}>{label}</span>
      <button className="btn btn-ghost btn-sm" onClick={onNext} disabled={nextDisabled}>›</button>
    </div>
  </div>
);
