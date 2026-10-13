import mongoose from 'mongoose';
import { config } from '../config.js';

const settingsSchema = new mongoose.Schema(
  {
    // Singleton document; `key` lets us upsert it safely.
    key: { type: String, default: 'global', unique: true },
    alertEmails: { type: [String], default: [] },
    cooldownSeconds: { type: Number, default: 60, min: 0, max: 3600 },
    alertThreshold: { type: Number, default: 40, min: 0, max: 100 },
    emailEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

settingsSchema.statics.get = async function get() {
  let doc = await this.findOne({ key: 'global' });
  if (!doc) doc = await this.create({ key: 'global', alertEmails: config.alertTo });
  return doc;
};

settingsSchema.methods.toJSON = function toJSON() {
  const { alertEmails, cooldownSeconds, alertThreshold, emailEnabled, updatedAt } = this;
  return { alertEmails, cooldownSeconds, alertThreshold, emailEnabled, updatedAt };
};

export default mongoose.model('Settings', settingsSchema);
