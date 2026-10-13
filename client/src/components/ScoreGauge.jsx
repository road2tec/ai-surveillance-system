import { levelKey } from '../format.js';

/** Semi-circular 0-100 gauge with the 40 / 70 level boundaries marked on the track. */
export default function ScoreGauge({ score = 0, level = 'Safe' }) {
  const r = 80;
  const cx = 100;
  const cy = 96;
  const len = Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  const tick = (v) => {
    const a = Math.PI * (1 - v / 100);
    return { x1: cx + (r - 13) * Math.cos(a), y1: cy - (r - 13) * Math.sin(a), x2: cx + (r + 13) * Math.cos(a), y2: cy - (r + 13) * Math.sin(a) };
  };
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className={`gauge gauge-${levelKey(level)}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score} aria-label="Threat score">
      <svg viewBox="0 0 200 112" width="100%">
        <path d={arc} className="gauge-track" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path
          d={arc}
          className="gauge-fill"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - pct)}
        />
        {[40, 70].map((v) => (
          <line key={v} {...tick(v)} className="gauge-tick" strokeWidth="2" />
        ))}
      </svg>
      <div className="gauge-value">
        <span className="gauge-num">{score}</span>
        <span className="gauge-max">/100</span>
      </div>
    </div>
  );
}
