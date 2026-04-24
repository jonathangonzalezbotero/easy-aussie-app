export default function Modal({ open, onClose, title, children, footer, width }) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: width || 520 }}>
        <div className="modal-header">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
