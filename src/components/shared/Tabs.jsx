export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs">
      {tabs.map(t => (
        <button key={t.value} className={`tab${active === t.value ? ' active' : ''}`} onClick={() => onChange(t.value)}>
          {t.label}
          {t.count !== undefined && (
            <span style={{
              marginLeft: 6,
              background: active === t.value ? 'rgba(0,0,0,0.12)' : 'var(--border)',
              color: active === t.value ? 'inherit' : 'var(--muted)',
              borderRadius: 20, padding: '1px 6px', fontSize: 11, fontWeight: 700
            }}>{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
