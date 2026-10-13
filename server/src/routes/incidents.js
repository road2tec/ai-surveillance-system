import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';
import multer from 'multer';
import Incident, { LEVELS, STATUSES } from '../models/Incident.js';
import Settings from '../models/Settings.js';
import { config } from '../config.js';
import { requireApiKey, requireAuth } from '../middleware/auth.js';
import { formatIST, sendIncidentEmail, threatLabel } from '../services/mailer.js';

const router = express.Router();

fs.mkdirSync(config.screenshotsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.screenshotsDir,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^image\//.test(file.mimetype)),
});

const parseJson = (value, fallback) => {
  if (value == null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const screenshotFile = (url) => (url ? path.join(config.screenshotsDir, path.basename(url)) : null);

// ---------------------------------------------------------------- ingest (AI service)
router.post('/ingest', requireApiKey, upload.single('screenshot'), async (req, res) => {
  try {
    let threats = parseJson(req.body.threats, []);
    if (!Array.isArray(threats)) threats = String(threats).split(',');
    threats = threats.map((t) => String(t).trim()).filter(Boolean);
    const score = Math.max(0, Math.min(100, Number(req.body.score) || 0));
    const level = LEVELS.includes(req.body.level) ? req.body.level : score >= 70 ? 'High Danger' : score >= 40 ? 'Medium Danger' : 'Safe';
    const confidences = parseJson(req.body.confidences, {});
    const detectedAt = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    const incident = await Incident.create({
      threats,
      primaryThreat: req.body.primaryThreat || threats[0],
      score,
      level,
      confidences,
      cameraName: req.body.cameraName || 'Camera',
      screenshotUrl: req.file ? `/uploads/screenshots/${req.file.filename}` : undefined,
      detectedAt: Number.isNaN(detectedAt.getTime()) ? new Date() : detectedAt,
    });

    const io = req.app.get('io');
    io.emit('new_incident', incident.toJSON());
    res.status(201).json({ ok: true, id: incident._id });

    // Email runs after the response so the AI service is never blocked by SMTP latency.
    const settings = await Settings.get();
    if (settings.emailEnabled) {
      const { sent, error } = await sendIncidentEmail(incident, settings.alertEmails, req.file?.path);
      incident.emailSent = sent;
      incident.emailError = error || undefined;
    } else {
      incident.emailError = 'Email alerts disabled in settings';
    }
    await incident.save();
    io.emit('incident_updated', incident.toJSON());
  } catch (err) {
    console.error('[ingest]', err);
    if (!res.headersSent) res.status(400).json({ error: err.message });
  }
});

// ---------------------------------------------------------------- admin queries
router.use(requireAuth);

function buildFilter(q) {
  const filter = {};
  if (q.threat) filter.threats = q.threat;
  if (q.level && LEVELS.includes(q.level)) filter.level = q.level;
  if (q.status && STATUSES.includes(q.status)) filter.status = q.status;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(q.from);
    if (q.to) {
      const to = new Date(q.to);
      // A bare date (YYYY-MM-DD) means "until the end of that day".
      if (/^\d{4}-\d{2}-\d{2}$/.test(q.to)) to.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ threats: rx }, { cameraName: rx }, { notes: rx }, { level: rx }, { status: rx }];
  }
  return filter;
}

router.get('/', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  const filter = buildFilter(req.query);
  const [items, total] = await Promise.all([
    Incident.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Incident.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
});

router.get('/export', async (req, res) => {
  const items = await Incident.find(buildFilter(req.query)).sort({ createdAt: -1 }).limit(10000);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = ['Time (IST)', 'Threats', 'Primary', 'Score', 'Level', 'Status', 'Email sent', 'Email error', 'Camera', 'Notes', 'Screenshot', 'ID'];
  const rows = items.map((i) =>
    [
      formatIST(i.createdAt),
      i.threats.map(threatLabel).join('; '),
      threatLabel(i.primaryThreat || ''),
      i.score,
      i.level,
      i.status,
      i.emailSent ? 'yes' : 'no',
      i.emailError,
      i.cameraName,
      i.notes,
      i.screenshotUrl ? `${req.protocol}://${req.get('host')}${i.screenshotUrl}` : '',
      i._id,
    ]
      .map(esc)
      .join(','),
  );
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="incidents-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + [header.map(esc).join(','), ...rows].join('\r\n'));
});

router.param('id', (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) return res.status(404).json({ error: 'Incident not found' });
  return next();
});

router.get('/:id', async (req, res) => {
  const incident = await Incident.findById(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  res.json(incident);
});

router.patch('/:id', async (req, res) => {
  const update = {};
  if (req.body.status !== undefined) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    update.status = req.body.status;
  }
  if (req.body.notes !== undefined) update.notes = String(req.body.notes).slice(0, 5000);
  const incident = await Incident.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  req.app.get('io').emit('incident_updated', incident.toJSON());
  res.json(incident);
});

router.delete('/:id', async (req, res) => {
  const incident = await Incident.findByIdAndDelete(req.params.id);
  if (!incident) return res.status(404).json({ error: 'Incident not found' });
  const file = screenshotFile(incident.screenshotUrl);
  if (file) fs.promises.unlink(file).catch(() => {});
  req.app.get('io').emit('incident_deleted', { id: incident._id });
  res.json({ ok: true });
});

export default router;
