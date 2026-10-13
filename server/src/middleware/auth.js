import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), email: user.email, role: user.role }, config.jwtSecret, {
    expiresIn: '8h',
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

/** JWT from "Authorization: Bearer" (or ?token= for <img> MJPEG requests that cannot set headers). */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = verifyToken(token);
    return next();
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    return res.status(401).json({ error: expired ? 'Session expired, please log in again' : 'Invalid token', expired });
  }
}

/** Shared-secret check for machine-to-machine calls from the Python AI service. */
export function requireApiKey(req, res, next) {
  const given = Buffer.from(String(req.headers['x-api-key'] || ''));
  const expected = Buffer.from(config.ingestApiKey);
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  return next();
}
