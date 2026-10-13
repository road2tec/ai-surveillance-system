import http from 'node:http';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { config } from './config.js';
import { verifyToken } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import incidentRoutes from './routes/incidents.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';
import cameraRoutes from './routes/camera.js';
import { ensureAdmin } from './seed/createAdmin.js';

const app = express();
const server = http.createServer(app);
const allowedOrigins = [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'];

const io = new Server(server, { cors: { origin: allowedOrigins } });
// Only logged-in admins receive live incidents.
io.use((socket, next) => {
  try {
    verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
app.set('io', io);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev', { skip: (req) => req.path.includes('video_feed') || req.path.endsWith('/status') }));
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));
app.use('/api/auth', authRoutes);
app.use('/api/incidents', incidentRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/camera', cameraRoutes);
// Spec-compatible aliases: /api/start, /api/stop, /api/status
app.use('/api', cameraRoutes);

app.use((req, res) => res.status(404).json({ error: `Not found: ${req.method} ${req.path}` }));
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Server error' });
});

async function main() {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 8000 });
  console.log(`[db] connected ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`);
  const admin = await ensureAdmin();
  if (admin.created) console.log(`[seed] admin account created: ${admin.email}`);
  server.listen(config.port, () => console.log(`[api] listening on http://localhost:${config.port}`));
}

main().catch((err) => {
  console.error('[fatal] could not start server:', err.message);
  if (/ECONNREFUSED|querySrv|Server selection/i.test(err.message)) {
    console.error('Is MongoDB running? Check MONGO_URI in server/.env');
  }
  process.exit(1);
});
