const LABELS = {
  fire: 'Fire',
  gun: 'Gun',
  knife: 'Knife',
  fight: 'Fight',
  blood: 'Blood',
  smoke: 'Smoke',
  suspicious_activity: 'Suspicious activity',
};
export const THREATS = Object.keys(LABELS);
export const threatLabel = (t) => LABELS[t] || t;

export const LEVELS = ['High Danger', 'Medium Danger', 'Safe'];
export const STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'acknowledged', label: 'Acknowledged' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'false_alarm', label: 'False alarm' },
];
export const statusLabel = (s) => STATUSES.find((x) => x.value === s)?.label || s;

export const levelKey = (level) => (level === 'High Danger' ? 'high' : level === 'Medium Danger' ? 'medium' : 'safe');

const dt = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});
export const formatTime = (d) => (d ? dt.format(new Date(d)) : '-');

export function timeAgo(d) {
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
