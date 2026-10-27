// Search box used above lists. Clearing button appears once something is typed.
export default function SearchBar({ value, onChange, placeholder = 'Search…', maxWidth = 320 }) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth }}>
      <input className="input" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ paddingRight: value ? 30 : undefined }} />
      {value && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange('')} title="Clear" style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  );
}
