export default function Drawer({ open, onClose, title, children }) {
  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <div className="drawer" style={{ transform: open ? 'translateX(0)' : 'translateX(100%)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, background: 'white', zIndex: 1 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '24px' }}>{children}</div>
      </div>
    </>
  );
}
