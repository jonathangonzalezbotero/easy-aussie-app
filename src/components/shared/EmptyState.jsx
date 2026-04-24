export default function EmptyState({ icon, message, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '52px 24px', color: 'var(--muted)' }}>
      {icon && <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.4 }}>{icon}</div>}
      <div style={{ fontSize: 14, marginBottom: action ? 16 : 0 }}>{message}</div>
      {action}
    </div>
  );
}
