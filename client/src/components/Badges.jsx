import { CheckCircle2, AlertTriangle, OctagonAlert, Mail, MailX, Clock } from 'lucide-react';
import { levelKey, statusLabel, threatLabel } from '../format.js';

const LEVEL_ICON = { high: OctagonAlert, medium: AlertTriangle, safe: CheckCircle2 };

/** Level always carries icon + text, never colour alone. */
export function LevelBadge({ level, size = 'md' }) {
  const key = levelKey(level);
  const Icon = LEVEL_ICON[key];
  return (
    <span className={`badge badge-${key} badge-${size}`}>
      <Icon size={size === 'lg' ? 16 : 13} aria-hidden />
      {level}
    </span>
  );
}

export function ThreatChips({ threats = [] }) {
  return (
    <span className="chips">
      {threats.map((t) => (
        <span key={t} className={`chip${t === 'suspicious_activity' ? ' chip-muted' : ''}`}>
          {threatLabel(t)}
        </span>
      ))}
    </span>
  );
}

export function StatusPill({ status }) {
  return <span className={`status status-${status}`}>{statusLabel(status)}</span>;
}

export function EmailState({ incident }) {
  if (incident.emailSent) {
    return (
      <span className="email ok" title="Email sent">
        <Mail size={14} aria-hidden /> Sent
      </span>
    );
  }
  if (incident.emailError) {
    return (
      <span className="email fail" title={incident.emailError}>
        <MailX size={14} aria-hidden /> Failed
      </span>
    );
  }
  return (
    <span className="email pending" title="Sending">
      <Clock size={14} aria-hidden /> Pending
    </span>
  );
}
