export default function Badge({ variant, children }) {
  return <span className={`badge badge-${variant || 'gray'}`}>{children}</span>;
}
