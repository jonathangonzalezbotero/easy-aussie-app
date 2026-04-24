import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32, justifyContent: 'center' }}>
          <div className="logo-mark" style={{ width: 44, height: 44, borderRadius: 12 }}>
            <svg width="22" height="22" viewBox="0 0 18 18" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <ellipse cx="4.5" cy="13.5" rx="1.8" ry="1.8"/><ellipse cx="13.5" cy="13.5" rx="1.8" ry="1.8"/>
              <path d="M2.7 13.5H1.5V9L4.5 4.5h7.5L14.5 9h2v4.5h-1.3"/><path d="M6.3 13.5h5.4"/><path d="M4.5 4.5v4.5h9"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>Fleet Manager</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Easy Aussie AU</div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: '28px 28px 24px' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Sign in</h1>
            <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 24 }}>Enter your credentials to access Fleet Manager.</p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="field">
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
              </div>
              <div className="field">
                <label className="label">Password</label>
                <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {error && (
                <div style={{ background: 'var(--red-bg)', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 4, justifyContent: 'center' }}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
