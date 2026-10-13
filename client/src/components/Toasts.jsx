import { Link } from 'react-router-dom';
import { AlertTriangle, X } from 'lucide-react';
import { useLive } from '../context/LiveContext.jsx';
import { levelKey, threatLabel } from '../format.js';

export default function Toasts() {
  const { toasts, dismiss } = useLive();
  return (
    <div className="toasts" role="region" aria-live="assertive" aria-label="Incident alerts">
      {toasts.map(({ id, incident }) => (
        <div key={id} className={`toast toast-${levelKey(incident.level)}`} role="alert">
          <AlertTriangle size={18} className="toast-icon" aria-hidden />
          <div className="toast-body">
            <div className="toast-title">
              {incident.level} <span className="toast-score">Score {incident.score}</span>
            </div>
            <div className="toast-text">{incident.threats.map(threatLabel).join(', ')} on {incident.cameraName}</div>
            <Link to={`/history/${incident._id}`} className="toast-link" onClick={() => dismiss(id)}>
              View incident
            </Link>
          </div>
          <button type="button" className="icon-btn sm" onClick={() => dismiss(id)} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
