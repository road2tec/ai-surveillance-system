import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2, ShieldHalf } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { errorMessage } from '../api.js';

export default function Login() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (token) return <Navigate to={location.state?.from || '/live'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email, password);
      navigate(location.state?.from || '/live', { replace: true });
    } catch (err) {
      setError(errorMessage(err, 'Login failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <div className="login-side" aria-hidden>
        <div className="login-grid" />
        <div className="login-copy">
          <p className="eyebrow">AI-driven integrated surveillance</p>
          <h1>Threat recognition and emergency response</h1>
          <p className="muted">Weapons, fire, smoke, blood and violence detected from a live camera feed, scored and escalated in seconds.</p>
        </div>
      </div>
      <form className="login-card" onSubmit={submit} noValidate>
        <div className="brand">
          <ShieldHalf size={24} aria-hidden />
          <div>
            <div className="brand-name">Sentinel</div>
            <div className="brand-sub">Admin console</div>
          </div>
        </div>
        <h2>Sign in</h2>
        {location.state?.notice && <div className="alert alert-warn">{location.state.notice}</div>}
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy && <Loader2 size={16} className="spin" aria-hidden />}
          Sign in
        </button>
      </form>
    </div>
  );
}
