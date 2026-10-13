import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, History, LogOut, Radio, Settings, ShieldHalf, Volume2, VolumeX } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLive } from '../context/LiveContext.jsx';
import Toasts from './Toasts.jsx';

const NAV = [
  { to: '/live', label: 'Live monitor', icon: Radio },
  { to: '/history', label: 'Detection history', icon: History },
  { to: '/dashboard', label: 'Dashboard', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { connected, muted, toggleMute } = useLive();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <ShieldHalf size={22} strokeWidth={2} aria-hidden />
          <div>
            <div className="brand-name">Sentinel</div>
            <div className="brand-sub">Threat recognition</div>
          </div>
        </div>
        <nav className="nav" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              <Icon size={18} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="conn" title={connected ? 'Receiving live alerts' : 'Live alerts disconnected'}>
            <span className={`dot ${connected ? 'dot-safe' : 'dot-off'}`} aria-hidden />
            {connected ? 'Live alerts on' : 'Reconnecting'}
          </div>
          <button type="button" className="icon-btn" onClick={toggleMute} aria-label={muted ? 'Unmute alert sound' : 'Mute alert sound'} title={muted ? 'Unmute' : 'Mute'}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div className="user">
            <div className="user-name">{user?.name || 'Admin'}</div>
            <div className="user-mail">{user?.email}</div>
          </div>
          <button type="button" className="icon-btn" onClick={() => logout()} aria-label="Log out" title="Log out">
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <Toasts />
    </div>
  );
}
