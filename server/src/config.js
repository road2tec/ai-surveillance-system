import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env') });

const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean);

export const config = {
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/surveillance',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret',
  ingestApiKey: process.env.INGEST_API_KEY || 'change-me-ingest-key',
  aiServiceUrl: (process.env.AI_SERVICE_URL || 'http://localhost:8000').replace(/\/$/, ''),
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, ''),
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    user: process.env.SMTP_USER || '',
    // Gmail shows App Passwords as "abcd efgh ijkl mnop"; spaces are not part of the password.
    pass: (process.env.SMTP_PASS || '').replace(/\s+/g, ''),
  },
  alertTo: list(process.env.ALERT_TO),
  admin: {
    name: process.env.ADMIN_NAME || 'Administrator',
    email: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
  },
  uploadsDir: path.join(ROOT_DIR, 'uploads'),
  screenshotsDir: path.join(ROOT_DIR, 'uploads', 'screenshots'),
};
