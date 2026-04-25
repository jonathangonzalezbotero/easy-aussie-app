import { NavLink, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useStore } from '../context/StoreContext';
import { daysUntil } from '../utils/dates';

const NAV = [
  { to: '/', id: 'dashboard', label: 'Dashboard' },
  { to: '/vehicles', id: 'vehicles', label: 'Vehicles' },
  { to: '/customers', id: 'customers', label: 'Customers' },
  { to: '/rentals', id: 'rentals', label: 'Rentals' },
  { to: '/maintenance', id: 'maintenance', label: 'Maintenance' },
  { to: '/bonds', id: 'bonds', label: 'Bonds' },
  { to: '/settings', id: 'settings', label: 'Settings' },
];

function Icon({ id }) {
  const s = { width: 18, height: 18, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (id === 'dashboard') return <svg viewBox="0 0 18 18" style={s}><rect x="1.5" y="1.5" width="6" height="6" rx="1.2" /><rect x="10.5" y="1.5" width="6" height="6" rx="1.2" /><rect x="1.5" y="10.5" width="6" height="6" rx="1.2" /><rect x="10.5" y="10.5" width="6" height="6" rx="1.2" /></svg>;
  if (id === 'vehicles') return <svg viewBox="0 0 18 18" style={s}><ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8" /><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8" /><path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3" /><path d="M6.3 13.5h5.4" /><path d="M4.5 4.5v4.5h9" /></svg>;
  if (id === 'customers') return <svg viewBox="0 0 18 18" style={s}><circle cx="9" cy="6" r="3" /><path d="M2.5 16.5c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" /></svg>;
  if (id === 'rentals') return <svg viewBox="0 0 18 18" style={s}><rect x="2" y="5.5" width="14" height="10" rx="2" /><path d="M6.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" /><circle cx="9" cy="11" r="1.5" /><path d="M9 12.5v1.5" /></svg>;
  if (id === 'maintenance') return <svg viewBox="0 0 18 18" style={s}><path d="M14.5 3.5 11 7l2 2 3.5-3.5a3 3 0 0 0-4.5-4L9 4.5 4 9.5l-2 4 4-2 5-5 1.5-3z" /><path d="M2 16l3-3" /></svg>;
  if (id === 'bonds') return <svg viewBox="0 0 18 18" style={s}><path d="M9 1.5L2.5 4.5v5c0 4 2.8 6.8 6.5 7.5 3.7-.7 6.5-3.5 6.5-7.5v-5z" /><path d="M6 9l2 2 4-4" /></svg>;
  if (id === 'settings') return <svg viewBox="0 0 18 18" style={s}><circle cx="9" cy="9" r="2.5" /><path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.2 3.2l1.4 1.4M13.4 13.4l1.4 1.4M3.2 14.8l1.4-1.4M13.4 4.6l1.4-1.4" /></svg>;
  return null;
}

export default function Layout({ children }) {
  const { data } = useStore();
  const navigate = useNavigate();

  const alertCount = data.vehicles.reduce((n, v) => {
    if (v.status === 'stolen' || v.status === 'sold') return n;
    if (v.regoExpiry) { const d = daysUntil(v.regoExpiry); if (d !== null && d <= 30) n++; }
    if (v.nextServiceDate) { const d = daysUntil(v.nextServiceDate); if (d !== null && d <= 14) n++; }
    return n;
  }, 0);

  const badges = {
    dashboard: alertCount || null,
    rentals: data.rentals.filter(r => r.status === 'active').length || null,
    bonds: data.rentals.filter(r => r.bond?.status === 'held').length || null,
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <img src="/logo.png" alt="Easy Aussie" className="logo-img" />
          <div>
            <div className="logo-name">Easy Aussie</div>
            <div className="logo-sub">Portal</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(item => (
            <NavLink
              key={item.id}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              {({ isActive }) => (
                <>
                  <Icon id={item.id} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {badges[item.id] && (
                    <span className={`nav-badge${isActive ? ' nav-badge-active' : ''}`}>{badges[item.id]}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="signout-btn">
            <svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />
              <path d="M12 13l4-4-4-4" />
              <path d="M16 9H7" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <div className="content">
          {children}
        </div>
      </main>
    </div>
  );
}
