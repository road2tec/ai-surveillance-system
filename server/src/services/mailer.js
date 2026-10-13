import fs from 'node:fs';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { config } from '../config.js';

const LABELS = {
  fire: 'Fire',
  gun: 'Gun',
  knife: 'Knife',
  fight: 'Fight',
  blood: 'Blood',
  smoke: 'Smoke',
  suspicious_activity: 'Suspicious activity',
};
export const threatLabel = (t) => LABELS[t] || t;

const LEVEL_COLOURS = { 'High Danger': '#E5484D', 'Medium Danger': '#E8A33D', Safe: '#3FB950' };

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    });
  }
  return transporter;
}

export function smtpConfigured() {
  return Boolean(config.smtp.user && config.smtp.pass);
}

/** "13 Oct 2026 01:12 AM" in India Standard Time. */
export function formatIST(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.day} ${parts.month} ${parts.year} ${parts.hour}:${parts.minute} ${parts.dayPeriod.toUpperCase()}`;
}

export function buildSubject(incident) {
  const main = incident.threats.filter((t) => t !== 'suspicious_activity');
  const names = (main.length ? main : incident.threats).map(threatLabel).join(' + ');
  const when = formatIST(incident.detectedAt || incident.createdAt);
  return `[${incident.level.toUpperCase()}] ${names} detected - Score ${incident.score} - ${when}`;
}

function buildHtml(incident, link) {
  const colour = LEVEL_COLOURS[incident.level] || '#E8A33D';
  const confRows = [...(incident.confidences?.entries?.() || [])]
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#9aa0a6">${threatLabel(k)}</td><td>${(v * 100).toFixed(1)}%</td></tr>`)
    .join('');
  const row = (k, v) => `<tr><td style="padding:6px 16px 6px 0;color:#9aa0a6;white-space:nowrap">${k}</td><td style="padding:6px 0">${v}</td></tr>`;
  return `
  <div style="font-family:Inter,Segoe UI,Arial,sans-serif;background:#0E1013;color:#E6E6E6;padding:24px">
    <div style="max-width:640px;margin:0 auto;background:#16191E;border:1px solid #262A31;border-radius:8px;overflow:hidden">
      <div style="border-left:6px solid ${colour};padding:16px 24px">
        <div style="font-size:12px;letter-spacing:.08em;color:${colour};font-weight:700">${incident.level.toUpperCase()}</div>
        <div style="font-size:20px;font-weight:600;margin-top:4px">${incident.threats.map(threatLabel).join(', ')}</div>
      </div>
      <div style="padding:8px 24px 16px">
        <table style="border-collapse:collapse;font-size:14px;color:#E6E6E6">
          ${row('Threat score', `<b>${incident.score}</b> / 100`)}
          ${row('Level', `<span style="color:${colour};font-weight:600">${incident.level}</span>`)}
          ${row('Time (IST)', formatIST(incident.detectedAt || incident.createdAt))}
          ${row('Camera', incident.cameraName || '-')}
        </table>
        ${confRows ? `<div style="margin-top:12px;font-size:13px;color:#9aa0a6">Model confidence</div><table style="font-size:13px;color:#E6E6E6">${confRows}</table>` : ''}
        <img src="cid:screenshot" alt="Incident screenshot" style="display:block;width:100%;margin-top:16px;border-radius:6px;border:1px solid #262A31"/>
        <a href="${link}" style="display:inline-block;margin-top:16px;background:#E8A33D;color:#0E1013;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px">Open incident in admin panel</a>
      </div>
    </div>
  </div>`;
}

/**
 * Sends the alert email. Never throws: returns { sent, error } so the caller can record it.
 */
export async function sendIncidentEmail(incident, recipients, screenshotPath) {
  if (!recipients?.length) return { sent: false, error: 'No alert recipients configured' };
  if (!smtpConfigured()) return { sent: false, error: 'SMTP_USER / SMTP_PASS not set in server/.env' };
  try {
    const link = `${config.clientUrl}/history/${incident._id}`;
    const attachments = [];
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      const filename = path.basename(screenshotPath);
      // Same file twice: once inline (cid) for the HTML body, once as a regular attachment.
      attachments.push({ filename, path: screenshotPath, cid: 'screenshot' });
      attachments.push({ filename, path: screenshotPath });
    }
    await getTransporter().sendMail({
      from: `"Surveillance Alerts" <${config.smtp.user}>`,
      to: recipients.join(', '),
      subject: buildSubject(incident),
      html: buildHtml(incident, link),
      text: `${buildSubject(incident)}\nCamera: ${incident.cameraName}\nOpen: ${link}`,
      attachments,
    });
    return { sent: true, error: null };
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendTestEmail(recipients) {
  if (!recipients?.length) return { sent: false, error: 'No alert recipients configured' };
  if (!smtpConfigured()) return { sent: false, error: 'SMTP_USER / SMTP_PASS not set in server/.env' };
  try {
    await getTransporter().sendMail({
      from: `"Surveillance Alerts" <${config.smtp.user}>`,
      to: recipients.join(', '),
      subject: `Test alert - ${formatIST(new Date())}`,
      html: `<div style="font-family:Inter,Arial,sans-serif">Email alerts are configured correctly for the surveillance system.</div>`,
    });
    return { sent: true, error: null };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}
