import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';

const DEMO_LOGINS = [
  { name: 'Ava Chen', email: 'ava@example.com', password: 'admin123', role: 'Admin' },
  { name: 'Marcus Hale', email: 'marcus@example.com', password: 'manager123', role: 'Manager · Hale' },
  { name: 'Elena Voss', email: 'elena@example.com', password: 'manager123', role: 'Manager · Voss' },
  { name: 'Priya Shah', email: 'priya@example.com', password: 'rep123', role: 'Rep · Hale' },
  { name: 'Jordan Lee', email: 'jordan@example.com', password: 'rep123', role: 'Rep · Hale' },
  { name: 'Sam Okonkwo', email: 'sam@example.com', password: 'rep123', role: 'Rep · Voss' },
  { name: 'Riley Cho', email: 'riley@example.com', password: 'rep123', role: 'Rep · Voss' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function fillDemo(d) {
    setEmail(d.email);
    setPassword(d.password);
  }

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <div style={styles.brandMark}>Z</div>
          <div>
            <div style={styles.brandName}>ZafinOS</div>
            <div style={styles.brandSub}>Sales workspace</div>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </label>
          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </label>
          {error && <div style={styles.error}>{error}</div>}
          <button style={styles.submit} type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <div style={styles.demoHead}>Demo logins (assignment data pack)</div>
        <div style={styles.demoGrid}>
          {DEMO_LOGINS.map((d) => (
            <button key={d.email} type="button" style={styles.demoBtn} onClick={() => fillDemo(d)}>
              <span style={styles.demoName}>{d.name}</span>
              <span style={styles.demoRole}>{d.role}</span>
            </button>
          ))}
        </div>
        <p style={styles.demoHint}>Click a name to fill the form, then sign in.</p>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(160deg, #0f1f3d 0%, #14213a 55%, #0b1730 100%)',
    padding: 24,
  },
  card: {
    width: 420,
    background: '#ffffff',
    borderRadius: 12,
    padding: '28px 30px 26px',
    boxShadow: '0 24px 60px rgba(6, 14, 34, 0.35)',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 },
  brandMark: {
    width: 38, height: 38, borderRadius: 9, background: '#0f5fd6', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17,
  },
  brandName: { fontWeight: 700, fontSize: 16, color: '#14213a' },
  brandSub: { fontSize: 12, color: '#6b7590' },
  form: { display: 'flex', flexDirection: 'column', gap: 14 },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#4b5876', fontWeight: 600 },
  input: {
    padding: '9px 11px', borderRadius: 7, border: '1px solid #dde1ec', fontSize: 14, color: '#14213a',
  },
  error: { fontSize: 13, color: '#c0392b', background: '#fbeceb', border: '1px solid #f3c9c6', borderRadius: 7, padding: '8px 10px' },
  submit: {
    marginTop: 4, padding: '10px 12px', borderRadius: 7, border: 'none',
    background: '#0f5fd6', color: '#fff', fontWeight: 700, fontSize: 14,
  },
  demoHead: { marginTop: 26, marginBottom: 10, fontSize: 12, fontWeight: 700, color: '#4b5876' },
  demoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  demoBtn: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
    padding: '8px 10px', borderRadius: 7, border: '1px solid #dde1ec', background: '#f6f7fb', textAlign: 'left',
  },
  demoName: { fontSize: 12.5, fontWeight: 700, color: '#14213a' },
  demoRole: { fontSize: 11, color: '#6b7590' },
  demoHint: { marginTop: 10, fontSize: 11.5, color: '#8890a6' },
};
