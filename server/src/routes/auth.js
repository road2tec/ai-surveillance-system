import express from 'express';
import User from '../models/User.js';
import { requireAuth, signToken } from '../middleware/auth.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const user = await User.findOne({ email });
  if (!user || !(await user.checkPassword(password))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  res.json({ token: signToken(user), user });
});

router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findById(req.user.sub);
  if (!user) return res.status(401).json({ error: 'User no longer exists' });
  res.json({ user });
});

export default router;
