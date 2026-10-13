import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Camera, CameraOff, Cpu, FlaskConical, Gauge, Loader2, Users } from 'lucide-react';
import { api, API_URL, assetUrl, errorMessage, tokenStore } from '../api.js';
import { useLiveEvent } from '../context/LiveContext.jsx';
import ScoreGauge from '../components/ScoreGauge.jsx';
import { LevelBadge, ThreatChips } from '../components/Badges.jsx';
import { threatLabel, timeAgo } from '../format.js';
import { unlockAudio } from '../sound.js';

const MODEL_NAMES = { person: 'Person', weapon: 'Weapons', fire_smoke: 'Fire / smoke', fight: 'Fight', blood: 'Blood' };

export default function LiveMonitor() {
  const [status, setStatus] = useState(null);
  const [reachable, setReachable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState([]);
  // Changing the key forces the <img> to reopen the MJPEG stream after start/stop.
  const [streamKey, setStreamKey] = useState(0);

  const poll = useCallback(async () => {
    try {
      const { data } = await api.get('/camera/status');
      setStatus(data);
      setReachable(true);
    } catch (err) {
      // 503 = API up but AI service down; no response = API itself down.
      if (!err.response || err.response.status === 503) {
        setReachable(false);
        setStatus(null);
      }
    }
  }, []);

  useEffect(() => {
    poll();
    const id = setInterval(poll, 700);
    return () => clearInterval(id);
  }, [poll]);

  useEffect(() => {
    api.get('/incidents', { params: { limit: 6 } }).then((r) => setRecent(r.data.items)).catch(() => {});
  }, []);

  useLiveEvent('new_incident', (inc) => setRecent((r) => [inc, ...r].slice(0, 6)));

  const control = async (action) => {
    setBusy(true);
    setError('');
    unlockAudio(); // browsers only allow sound after a user gesture
    try {
      const { data } = await api.post(`/camera/${action}`);
      setStatus(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      setStreamKey((k) => k + 1);
    }
  };

  const simulate = async () => {
    try {
      await api.post('/camera/simulate');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const running = Boolean(status?.running);
  const ready = Boolean(status?.modelsReady);
  const level = running ? status.level : 'Safe';
  const score = running ? status.score : 0;
  const streamSrc = `${API_URL}/api/camera/video_feed?token=${encodeURIComponent(tokenStore.get() || '')}&k=${streamKey}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Live monitor</h1>
          <p className="muted">{status?.cameraName || 'Camera'} · real-time detection</p>
        </div>
        <div className="head-actions">
          <button type="button" className="btn btn-ghost" onClick={simulate} disabled={!reachable} title="Send a synthetic incident through the full alert pipeline">
            <FlaskConical size={16} aria-hidden /> Test alert
          </button>
          {running ? (
            <button type="button" className="btn btn-danger" onClick={() => control('stop')} disabled={busy}>
              {busy ? <Loader2 size={16} className="spin" /> : <CameraOff size={16} aria-hidden />} Stop camera
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => control('start')} disabled={busy || !reachable || !ready}>
              {busy ? <Loader2 size={16} className="spin" /> : <Camera size={16} aria-hidden />} Start camera
            </button>
          )}
        </div>
      </header>

      {!reachable && <div className="alert alert-danger">AI service is offline. Start it, then this page reconnects automatically.</div>}
      {reachable && status && !ready && (
        <div className="alert alert-warn">
          <Loader2 size={16} className="spin" aria-hidden /> Loading AI models. The first start can take a minute.
        </div>
      )}
      {(error || status?.error) && <div className="alert alert-danger">{error || status.error}</div>}
      {status?.backendError && status.pendingIncidents > 0 && (
        <div className="alert alert-warn">{status.pendingIncidents} incident(s) queued in the AI service, retrying delivery.</div>
      )}

      <div className="live-grid">
        <section className={`video-frame level-${running ? level.split(' ')[0].toLowerCase() : 'off'}`} aria-label="Camera stream">
          <img key={streamKey} src={streamSrc} alt="Annotated live camera stream" />
          <div className="video-meta">
            <span className={`rec ${running ? 'on' : ''}`}>{running ? 'LIVE' : 'OFFLINE'}</span>
            {running && (
              <>
                <span>{status.fps} fps</span>
                <span>{status.detectionFps} det/s</span>
              </>
            )}
          </div>
        </section>

        <aside className="live-side">
          <div className="panel">
            <div className="panel-title">Threat score</div>
            <ScoreGauge score={score} level={level} />
            <div className="center">
              <LevelBadge level={level} size="lg" />
            </div>
          </div>

          <div className="panel">
            <div className="panel-title">Active threats</div>
            {running && status.threats.length ? (
              <ul className="threat-list">
                {status.threats.map((t) => (
                  <li key={t}>
                    <span>{threatLabel(t)}</span>
                    <span className="mono">{status.confidences?.[t] != null ? `${Math.round(status.confidences[t] * 100)}%` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted small">{running ? 'No threats in view' : 'Camera is not running'}</p>
            )}
          </div>

          <dl className="kv panel">
            <div>
              <dt>
                <Gauge size={14} aria-hidden /> Stream
              </dt>
              <dd>{running ? `${status.fps} fps` : '-'}</dd>
            </div>
            <div>
              <dt>
                <Activity size={14} aria-hidden /> Detection
              </dt>
              <dd>{running ? `${status.detectionFps} /s` : '-'}</dd>
            </div>
            <div>
              <dt>
                <Users size={14} aria-hidden /> People
              </dt>
              <dd>{running ? status.persons : '-'}</dd>
            </div>
            <div>
              <dt>
                <Activity size={14} aria-hidden /> Fight prob.
              </dt>
              <dd>{running ? `${Math.round(status.fightProb * 100)}%` : '-'}</dd>
            </div>
            <div>
              <dt>
                <Cpu size={14} aria-hidden /> Device
              </dt>
              <dd className="upper">{status?.device || '-'}</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="split">
        <section className="panel">
          <div className="panel-title row-between">
            <span>Recent incidents</span>
            <Link to="/history" className="link small">
              All history
            </Link>
          </div>
          {recent.length ? (
            <ul className="recent">
              {recent.map((i) => (
                <li key={i._id}>
                  <Link to={`/history/${i._id}`}>
                    <img src={assetUrl(i.screenshotUrl)} alt="" loading="lazy" />
                    <div className="recent-body">
                      <ThreatChips threats={i.threats} />
                      <span className="muted small">
                        Score {i.score} · {timeAgo(i.createdAt)}
                      </span>
                    </div>
                    <LevelBadge level={i.level} size="sm" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No incidents recorded yet.</p>
          )}
        </section>
        <section className="panel">
          <div className="panel-title">Loaded models</div>
          {status?.models && Object.keys(status.models).length ? (
            <ul className="models">
              {Object.entries(status.models).map(([k, v]) => (
                <li key={k}>
                  <span className="model-name">{MODEL_NAMES[k] || k}</span>
                  <span className={`model-src ${String(v).startsWith('FAILED') ? 'fail' : ''}`}>{v}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{reachable ? 'Models are loading' : 'AI service offline'}</p>
          )}
        </section>
      </div>
    </div>
  );
}
