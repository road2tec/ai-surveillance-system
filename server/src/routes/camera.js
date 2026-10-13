/**
 * Pass-through to the Python AI service so the browser only talks to this API.
 * The MJPEG stream is piped as-is; JWT comes from ?token= because <img> cannot send headers.
 */
import http from 'node:http';
import express from 'express';
import { config } from '../config.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

const AI_DOWN = 'AI service is not reachable. Start it with: cd ai-service && venv\\Scripts\\python -m app.main';

async function forward(res, method, pathname) {
  try {
    const r = await fetch(`${config.aiServiceUrl}${pathname}`, { method, signal: AbortSignal.timeout(20000) });
    const body = await r.json().catch(() => ({}));
    res.status(r.status).json(body);
  } catch {
    res.status(503).json({ error: AI_DOWN, running: false, reachable: false });
  }
}

router.post('/start', (_req, res) => forward(res, 'POST', '/start'));
router.post('/stop', (_req, res) => forward(res, 'POST', '/stop'));
router.get('/status', (_req, res) => forward(res, 'GET', '/status'));
router.post('/simulate', (_req, res) => forward(res, 'POST', '/simulate_incident'));

router.get('/video_feed', (req, res) => {
  const upstream = http.get(`${config.aiServiceUrl}/video_feed`, (aiRes) => {
    res.writeHead(aiRes.statusCode || 200, {
      'Content-Type': aiRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'close',
    });
    aiRes.pipe(res);
  });
  upstream.on('error', () => {
    if (!res.headersSent) res.status(503).json({ error: AI_DOWN });
    else res.end();
  });
  // Closing the browser tab must also close the upstream stream.
  req.on('close', () => upstream.destroy());
});

export default router;
