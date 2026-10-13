import { useEffect, useState } from 'react';
import { Loader2, Mail, Plus, Save, Send, X } from 'lucide-react';
import { api, errorMessage } from '../api.js';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings() {
  const [form, setForm] = useState(null);
  const [smtp, setSmtp] = useState({ configured: false, user: '' });
  const [newEmail, setNewEmail] = useState('');
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const apply = (d) => {
    setForm({ alertEmails: d.alertEmails, cooldownSeconds: d.cooldownSeconds, alertThreshold: d.alertThreshold, emailEnabled: d.emailEnabled });
    setSmtp({ configured: d.smtpConfigured, user: d.smtpUser });
  };

  useEffect(() => {
    api.get('/settings').then((r) => apply(r.data)).catch((err) => setMsg({ type: 'danger', text: errorMessage(err) }));
  }, []);

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL_RX.test(e)) {
      setMsg({ type: 'danger', text: `"${newEmail}" is not a valid email address` });
      return;
    }
    if (!form.alertEmails.includes(e)) setForm({ ...form, alertEmails: [...form.alertEmails, e] });
    setNewEmail('');
    setMsg(null);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/settings', form);
      apply(data);
      setMsg({ type: 'safe', text: 'Settings saved. The AI service picks them up within 20 seconds.' });
    } catch (err) {
      setMsg({ type: 'danger', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const testEmail = async () => {
    setTesting(true);
    try {
      await api.post('/settings/test-email');
      setMsg({ type: 'safe', text: `Test email sent to ${form.alertEmails.join(', ')}` });
    } catch (err) {
      setMsg({ type: 'danger', text: `Test email failed: ${errorMessage(err)}` });
    } finally {
      setTesting(false);
    }
  };

  if (!form) {
    return (
      <div className="page">
        <h1>Settings</h1>
        {msg ? <div className={`alert alert-${msg.type}`}>{msg.text}</div> : <p className="muted">Loading</p>}
      </div>
    );
  }

  return (
    <form className="page settings" onSubmit={save}>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Alerting rules and notification recipients</p>
        </div>
        <button className="btn btn-primary" disabled={saving}>
          {saving ? <Loader2 size={16} className="spin" /> : <Save size={16} aria-hidden />} Save settings
        </button>
      </header>
      {msg && (
        <div className={`alert alert-${msg.type}`} role="status">
          {msg.text}
        </div>
      )}

      <section className="settings-row">
        <div className="settings-copy">
          <h2>Email alerts</h2>
          <p className="muted small">
            Sent through Gmail SMTP {smtp.user ? `as ${smtp.user}` : ''}. {smtp.configured ? '' : 'SMTP credentials are missing in server/.env.'}
          </p>
        </div>
        <div className="panel">
          <label className="switch">
            <input type="checkbox" checked={form.emailEnabled} onChange={(e) => setForm({ ...form, emailEnabled: e.target.checked })} />
            <span className="switch-ui" aria-hidden />
            <span>Send an email for every new incident</span>
          </label>
          <div className="field">
            <span>Recipients</span>
            <ul className="email-list">
              {form.alertEmails.map((em) => (
                <li key={em}>
                  <Mail size={14} aria-hidden />
                  <span>{em}</span>
                  <button
                    type="button"
                    className="icon-btn sm"
                    aria-label={`Remove ${em}`}
                    onClick={() => setForm({ ...form, alertEmails: form.alertEmails.filter((x) => x !== em) })}
                  >
                    <X size={14} />
                  </button>
                </li>
              ))}
              {!form.alertEmails.length && <li className="muted small">No recipients yet</li>}
            </ul>
            <div className="row gap-1">
              <input
                type="email"
                placeholder="name@example.com"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                aria-label="New recipient email"
              />
              <button type="button" className="btn btn-ghost" onClick={addEmail} disabled={!newEmail}>
                <Plus size={16} aria-hidden /> Add
              </button>
            </div>
          </div>
          <button type="button" className="btn btn-ghost" onClick={testEmail} disabled={testing || !form.alertEmails.length}>
            {testing ? <Loader2 size={16} className="spin" /> : <Send size={16} aria-hidden />} Send test email
          </button>
          <p className="muted small">The test uses the saved recipient list. Save first if you changed it.</p>
        </div>
      </section>

      <section className="settings-row">
        <div className="settings-copy">
          <h2>Alert rules</h2>
          <p className="muted small">Scores of 40 and above are Medium Danger, 70 and above High Danger.</p>
        </div>
        <div className="panel">
          <label className="field">
            <span>
              Alert threshold <b className="mono">{form.alertThreshold}</b>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={form.alertThreshold}
              onChange={(e) => setForm({ ...form, alertThreshold: Number(e.target.value) })}
            />
            <small className="muted">An incident is created when the frame score reaches this value.</small>
          </label>
          <label className="field">
            <span>Cooldown per threat type (seconds)</span>
            <input
              type="number"
              min="0"
              max="3600"
              value={form.cooldownSeconds}
              onChange={(e) => setForm({ ...form, cooldownSeconds: e.target.value === '' ? '' : Number(e.target.value) })}
            />
            <small className="muted">The same threat will not alert again within this window. A different threat alerts immediately.</small>
          </label>
        </div>
      </section>
    </form>
  );
}
