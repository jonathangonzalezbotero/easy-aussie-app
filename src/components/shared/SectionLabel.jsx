export default function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, marginTop: 4 }}>
      {children}
    </div>
  );
}
