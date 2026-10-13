import mongoose from 'mongoose';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import User from '../models/User.js';
import Settings from '../models/Settings.js';

/** Creates the first admin from .env if no user with that email exists. Safe to run repeatedly. */
export async function ensureAdmin() {
  const existing = await User.findOne({ email: config.admin.email });
  if (existing) return { created: false, email: existing.email };
  await User.create({
    name: config.admin.name,
    email: config.admin.email,
    passwordHash: await User.hashPassword(config.admin.password),
    role: 'admin',
  });
  await Settings.get(); // make sure the settings singleton exists too
  return { created: true, email: config.admin.email };
}

// `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await mongoose.connect(config.mongoUri);
    const r = await ensureAdmin();
    console.log(r.created ? `Admin created: ${r.email}` : `Admin already exists: ${r.email}`);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
