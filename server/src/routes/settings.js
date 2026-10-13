import express from 'express';
import Settings from '../models/Settings.js';
import { requireApiKey, requireAuth } from '../middleware/auth.js';
import { sendTestEmail, smtpConfigured } from '../services/mailer.js';
import { config } from '../config.js';

const router = express.Router();
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Polled by the AI service so threshold / cooldown changes apply without a restart.
router.get('/runtime', requireApiKey, async (_req, res) => {
  const s = await Settings.get();
  res.json({ alertThreshold: s.alertThreshold, cooldownSeconds: s.cooldownSeconds });
});

router.use(requireAuth);

router.get('/', async (_req, res) => {
  const s = await Settings.get();
  res.json({ ...s.toJSON(), smtpConfigured: smtpConfigured(), smtpUser: config.smtp.user });
});

router.put('/', async (req, res) => {
  const s = await Settings.get();
  const { alertEmails, cooldownSeconds, alertThreshold, emailEnabled } = req.body;
  if (alertEmails !== undefined) {
    const list = (Array.isArray(alertEmails) ? alertEmails : String(alertEmails).split(','))
      .map((e) => String(e).trim().toLowerCase())
      .filter(Boolean);
    const bad = list.find((e) => !EMAIL_RX.test(e));
    if (bad) return res.status(400).json({ error: `Invalid email address: ${bad}` });
    s.alertEmails = [...new Set(list)];
  }
  if (cooldownSeconds !== undefined) {
    const v = Number(cooldownSeconds);
    if (!Number.isFinite(v) || v < 0 || v > 3600) return res.status(400).json({ error: 'Cooldown must be 0-3600 seconds' });
    s.cooldownSeconds = Math.round(v);
  }
  if (alertThreshold !== undefined) {
    const v = Number(alertThreshold);
    if (!Number.isFinite(v) || v < 0 || v > 100) return res.status(400).json({ error: 'Threshold must be 0-100' });
    s.alertThreshold = Math.round(v);
  }
  if (emailEnabled !== undefined) s.emailEnabled = Boolean(emailEnabled);
  await s.save();
  res.json({ ...s.toJSON(), smtpConfigured: smtpConfigured(), smtpUser: config.smtp.user });
});

router.post('/test-email', async (_req, res) => {
  const s = await Settings.get();
  const result = await sendTestEmail(s.alertEmails);
  res.status(result.sent ? 200 : 502).json(result);
});

export default router;
