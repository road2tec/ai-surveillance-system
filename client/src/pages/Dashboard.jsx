import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api, errorMessage } from '../api.js';
import { useLiveEvent } from '../context/LiveContext.jsx';
import { threatLabel } from '../format.js';

// Chart tokens: one accent hue for counts; status colours only for danger levels.
const C = {
  accent: '#E8A33D',
  grid: '#22262D',
  axis: '#6B727D',
  level: { 'High Danger': '#E5484D', 'Medium Danger': '#E8A33D', Safe: '#3FB950' },
};
const axisProps = { stroke: C.axis, tick: { fill: C.axis, fontSize: 12 }, tickLine: false, axisLine: { stroke: C.grid } };

function ChartTooltip({ active, payload, label, labelFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tip">
      <div className="chart-tip-label">{labelFormat ? labelFormat(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="chart-tip-row">
          <span>{p.name}</span>
          <b className="mono">{p.value}</b>
        </div>
      ))}
    </div>
  );
}

const shortDay = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export default function Dashboard() {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api
      .get('/stats', { params: { days } })
      .then((r) => {
        setStats(r.data);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)));
  }, [days]);

  useEffect(load, [load]);
  useLiveEvent('new_incident', load);
  useLiveEvent('incident_deleted', load);

  const byThreat = (stats?.byThreat || []).map((t) => ({ ...t, name: threatLabel(t.threat) }));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Incident overview, all cameras</p>
        </div>
      </header>
      {error && <div className="alert alert-danger">{error}</div>}

      <section className="stat-strip panel" aria-label="Totals">
        <div className="stat stat-lead">
          <span className="stat-label">Total incidents</span>
          <span className="stat-value">{stats?.total ?? '-'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Today</span>
          <span className="stat-value">{stats?.today ?? '-'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">High danger</span>
          <span className="stat-value danger-text">{stats?.highDanger ?? '-'}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Awaiting review</span>
          <span className="stat-value">{stats?.open ?? '-'}</span>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-title row-between">
          <span>Incidents per day</span>
          <div className="seg" role="group" aria-label="Range">
            {[7, 30].map((d) => (
              <button key={d} type="button" className={days === d ? 'on' : ''} aria-pressed={days === d} onClick={() => setDays(d)}>
                {d} days
              </button>
            ))}
          </div>
        </div>
        <div className="chart-h">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.perDay || []} margin={{ top: 8, right: 8, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid vertical={false} stroke={C.grid} />
              <XAxis dataKey="date" tickFormatter={shortDay} {...axisProps} interval="preserveStartEnd" minTickGap={16} />
              <YAxis allowDecimals={false} {...axisProps} axisLine={false} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip labelFormat={shortDay} />} />
              <Bar dataKey="count" name="Incidents" fill={C.accent} radius={[4, 4, 0, 0]} maxBarSize={36} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="split">
        <section className="panel chart-panel">
          <div className="panel-title">By threat type</div>
          {byThreat.length ? (
            <div style={{ height: Math.max(160, byThreat.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byThreat} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }} barCategoryGap="25%">
                  <CartesianGrid horizontal={false} stroke={C.grid} />
                  <XAxis type="number" allowDecimals={false} {...axisProps} />
                  <YAxis type="category" dataKey="name" width={130} {...axisProps} axisLine={false} />
                  <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" name="Incidents" fill={C.accent} radius={[0, 4, 4, 0]} maxBarSize={22} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted small">No data yet.</p>
          )}
        </section>

        <section className="panel chart-panel">
          <div className="panel-title">By danger level</div>
          <ul className="level-bars">
            {(stats?.byLevel || []).map((l) => {
              const max = Math.max(1, ...(stats?.byLevel || []).map((x) => x.count));
              return (
                <li key={l.level}>
                  <span className="lb-label">
                    <span className="swatch" style={{ background: C.level[l.level] }} aria-hidden />
                    {l.level}
                  </span>
                  <span className="lb-track" title={`${l.level}: ${l.count}`}>
                    <span style={{ width: `${(l.count / max) * 100}%`, background: C.level[l.level] }} />
                  </span>
                  <span className="mono lb-val">{l.count}</span>
                </li>
              );
            })}
          </ul>
          <p className="muted small">Safe-level entries only appear if the alert threshold is set below 40.</p>
        </section>
      </div>
    </div>
  );
}
