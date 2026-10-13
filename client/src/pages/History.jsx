import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Download, Loader2, Search, X } from 'lucide-react';
import { api, assetUrl, errorMessage } from '../api.js';
import { useLiveEvent } from '../context/LiveContext.jsx';
import { EmailState, LevelBadge, StatusPill, ThreatChips } from '../components/Badges.jsx';
import { formatTime, LEVELS, STATUSES, THREATS, threatLabel } from '../format.js';

const FILTER_KEYS = ['search', 'threat', 'level', 'status', 'from', 'to'];
const PAGE_SIZE = 15;

export default function History() {
  const navigate = useNavigate();
  // Filters live in the URL so a filtered view survives reloads and the back button.
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || '']));
  const page = Number(params.get('page') || 1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [searchText, setSearchText] = useState(filters.search);
  const query = params.toString();
  const refreshTimer = useRef();

  const load = useCallback(async () => {
    try {
      const p = Object.fromEntries(new URLSearchParams(query));
      const { data: d } = await api.get('/incidents', { params: { ...p, limit: PAGE_SIZE } });
      setData(d);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Debounced refresh when incidents change elsewhere (new detections, status edits).
  const scheduleRefresh = () => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(load, 400);
  };
  useLiveEvent('new_incident', scheduleRefresh);
  useLiveEvent('incident_updated', scheduleRefresh);
  useLiveEvent('incident_deleted', scheduleRefresh);
  useEffect(() => () => clearTimeout(refreshTimer.current), []);

  const setFilter = (key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page');
    setParams(next);
  };

  // Search applies after the user pauses typing.
  useEffect(() => {
    if (searchText === filters.search) return undefined;
    const id = setTimeout(() => setFilter('search', searchText.trim()), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const goPage = (p) => {
    const next = new URLSearchParams(params);
    next.set('page', String(p));
    setParams(next);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const p = Object.fromEntries(new URLSearchParams(query));
      delete p.page;
      const res = await api.get('/incidents/export', { params: p, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incidents-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(errorMessage(err, 'Export failed'));
    } finally {
      setExporting(false);
    }
  };

  const hasFilters = FILTER_KEYS.some((k) => filters[k]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Detection history</h1>
          <p className="muted">
            {data.total} incident{data.total === 1 ? '' : 's'}
            {hasFilters ? ' match the filters' : ' recorded'}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={exporting || !data.total}>
          {exporting ? <Loader2 size={16} className="spin" /> : <Download size={16} aria-hidden />} Export CSV
        </button>
      </header>

      <div className="filters" role="search">
        <label className="search">
          <Search size={16} aria-hidden />
          <input placeholder="Search threats, camera, notes" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search incidents" />
        </label>
        <select value={filters.threat} onChange={(e) => setFilter('threat', e.target.value)} aria-label="Threat type">
          <option value="">All threats</option>
          {THREATS.map((t) => (
            <option key={t} value={t}>
              {threatLabel(t)}
            </option>
          ))}
        </select>
        <select value={filters.level} onChange={(e) => setFilter('level', e.target.value)} aria-label="Level">
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <label className="date">
          <span>From</span>
          <input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
        </label>
        <label className="date">
          <span>To</span>
          <input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
        </label>
        {hasFilters && (
          <button
            type="button"
            className="btn btn-text"
            onClick={() => {
              setSearchText('');
              setParams(new URLSearchParams());
            }}
          >
            <X size={14} aria-hidden /> Clear
          </button>
        )}
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      <div className="table-wrap panel flush">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Snapshot</th>
              <th scope="col">Time (IST)</th>
              <th scope="col">Threats</th>
              <th scope="col" className="num">
                Score
              </th>
              <th scope="col">Level</th>
              <th scope="col">Status</th>
              <th scope="col">Email</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i) => (
              <tr
                key={i._id}
                tabIndex={0}
                onClick={() => navigate(`/history/${i._id}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/history/${i._id}`)}
                className={i.status === 'new' ? 'unread' : ''}
              >
                <td>{i.screenshotUrl ? <img className="thumb" src={assetUrl(i.screenshotUrl)} alt="" loading="lazy" /> : <div className="thumb" />}</td>
                <td className="nowrap">{formatTime(i.createdAt)}</td>
                <td>
                  <ThreatChips threats={i.threats} />
                </td>
                <td className="num mono">{i.score}</td>
                <td>
                  <LevelBadge level={i.level} size="sm" />
                </td>
                <td>
                  <StatusPill status={i.status} />
                </td>
                <td>
                  <EmailState incident={i} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !data.items.length && <p className="empty">{hasFilters ? 'No incidents match these filters.' : 'No incidents recorded yet.'}</p>}
        {loading && !data.items.length && (
          <p className="empty">
            <Loader2 size={16} className="spin" /> Loading
          </p>
        )}
      </div>

      {data.pages > 1 && (
        <nav className="pager" aria-label="Pagination">
          <button type="button" className="btn btn-ghost sm" onClick={() => goPage(page - 1)} disabled={page <= 1}>
            <ChevronLeft size={16} aria-hidden /> Prev
          </button>
          <span className="muted small">
            Page {page} of {data.pages}
          </span>
          <button type="button" className="btn btn-ghost sm" onClick={() => goPage(page + 1)} disabled={page >= data.pages}>
            Next <ChevronRight size={16} aria-hidden />
          </button>
        </nav>
      )}
    </div>
  );
}
