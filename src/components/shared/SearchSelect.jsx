import { useState } from 'react';

// Searchable single-select. options: [{ value, label, sub, group }]. Typing filters by label and sub.
// onCreate(query) is optional: shows an "Add …" row when nothing matches.
export default function SearchSelect({ options, value, onChange, placeholder = 'Search…', onCreate, createLabel = 'Add', disabled, maxResults = 30 }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  const q = query.trim().toLowerCase();
  const results = (q ? options.filter(o => `${o.label} ${o.sub || ''}`.toLowerCase().includes(q)) : options).slice(0, maxResults);

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <input className="input" disabled={disabled} placeholder={placeholder}
          value={open ? query : (selected?.label || '')}
          onFocus={() => { setQuery(''); setOpen(true); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={{ paddingRight: selected ? 30 : undefined }} />
        {selected && !open && !disabled && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', fontSize: 16, lineHeight: 1 }} onMouseDown={e => { e.preventDefault(); onChange(''); }} title="Clear">×</button>
        )}
      </div>
      {open && (
        <div style={{ position: 'absolute', zIndex: 30, top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, marginTop: 4, maxHeight: 260, overflowY: 'auto', boxShadow: '0 6px 20px rgba(0,0,0,0.1)' }}>
          {results.length === 0 && !onCreate && <div style={{ padding: '10px 12px', fontSize: 13 }} className="text-muted">No matches</div>}
          {results.map(o => (
            <div key={o.value} className={`picker-option${o.value === value ? ' active' : ''}`} onMouseDown={() => { onChange(o.value); setQuery(''); setOpen(false); }}>
              <div className="fw-500" style={{ fontSize: 14 }}>{o.label}</div>
              {o.sub && <div className="text-sm text-muted">{o.sub}</div>}
            </div>
          ))}
          {onCreate && q && !options.some(o => o.label.toLowerCase() === q) && (
            <div className="picker-option" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14 }} onMouseDown={() => { onCreate(query.trim()); setQuery(''); setOpen(false); }}>+ {createLabel} “{query.trim()}”</div>
          )}
        </div>
      )}
    </div>
  );
}
