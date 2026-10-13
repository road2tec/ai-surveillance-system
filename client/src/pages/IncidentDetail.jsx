import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2, Save, Trash2 } from 'lucide-react';
import { api, assetUrl, errorMessage } from '../api.js';
import { useLiveEvent } from '../context/LiveContext.jsx';
import { EmailState, LevelBadge, StatusPill, ThreatChips } from '../components/Badges.jsx';
import { formatTime, STATUSES, threatLabel } from '../format.js';

export default function IncidentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [incident, setIncident] = useState(null);
  const [status, setStatus] = useState('new');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get(`/incidents/${id}`)
      .then(({ data }) => {
        setIncident(data);
        setStatus(data.status);
        setNotes(data.notes || '');
      })
      .catch((err) => setError(errorMessage(err)));
  }, [id]);

  // Email result arrives a moment after the incident itself.
  useLiveEvent('incident_updated', (inc) => {
    if (inc._id === id) setIncident((cur) => ({ ...cur, emailSent: inc.emailSent, emailError: inc.emailError }));
  });

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const { data } = await api.patch(`/incidents/${id}`, { status, notes });
      setIncident(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this incident and its screenshot permanently?')) return;
    try {
      await api.delete(`/incidents/${id}`);
      navigate('/history', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!incident) {
    return (
      <div className="page">
        <Link to="/history" className="back">
          <ArrowLeft size={16} aria-hidden /> Detection history
        </Link>
        {error ? <div className="alert alert-danger">{error}</div> : <p className="muted">Loading incident</p>}
      </div>
    );
  }

  const conf = Object.entries(incident.confidences || {}).sort((a, b) => b[1] - a[1]);
  const dirty = status !== incident.status || notes !== (incident.notes || '');

  return (
    <div className="page">
      <Link to="/history" className="back">
        <ArrowLeft size={16} aria-hidden /> Detection history
      </Link>
      <header className="page-head">
        <div>
          <h1 className="row gap-2">
            {incident.threats.filter((t) => t !== 'suspicious_activity').map(threatLabel).join(' + ') || 'Incident'}
            <LevelBadge level={incident.level} />
          </h1>
          <p className="muted">
            {formatTime(incident.createdAt)} · {incident.cameraName}
          </p>
        </div>
        <button type="button" className="btn btn-ghost danger-text" onClick={remove}>
          <Trash2 size={16} aria-hidden /> Delete
        </button>
      </header>
      {error && <div className="alert alert-danger">{error}</div>}

      <div className="detail-grid">
        <figure className="shot panel flush">
          {incident.screenshotUrl ? (
            <a href={assetUrl(incident.screenshotUrl)} target="_blank" rel="noreferrer" title="Open full size">
              <img src={assetUrl(incident.screenshotUrl)} alt={`Screenshot of ${incident.threats.map(threatLabel).join(', ')}`} />
            </a>
          ) : (
            <div className="empty">No screenshot</div>
          )}
          {incident.screenshotUrl && (
            <figcaption>
              <a className="link small" href={assetUrl(incident.screenshotUrl)} target="_blank" rel="noreferrer">
                Open full size <ExternalLink size={12} aria-hidden />
              </a>
            </figcaption>
          )}
        </figure>

        <div className="detail-side">
          <section className="panel">
            <div className="score-line">
              <span className="score-big mono">{incident.score}</span>
              <span className="muted">/ 100 threat score</span>
            </div>
            <dl className="kv">
              <div>
                <dt>Threats</dt>
                <dd>
                  <ThreatChips threats={incident.threats} />
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <StatusPill status={incident.status} />
                </dd>
              </div>
              <div>
                <dt>Email alert</dt>
                <dd>
                  <EmailState incident={incident} />
                </dd>
              </div>
              {incident.emailError && (
                <div className="kv-stack">
                  <dt>Email error</dt>
                  <dd className="small danger-text wrap">{incident.emailError}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="panel">
            <div className="panel-title">Model confidence</div>
            <ul className="conf">
              {conf.map(([k, v]) => (
                <li key={k}>
                  <span>{threatLabel(k)}</span>
                  <span className="bar" aria-hidden>
                    <span style={{ width: `${Math.round(v * 100)}%` }} />
                  </span>
                  <span className="mono">{(v * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-title">Review</div>
            <label className="field">
              <span>Status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Notes</span>
              <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What happened, who responded" />
            </label>
            <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !dirty}>
              {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} aria-hidden />} {saved ? 'Saved' : 'Save changes'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
