import mongoose from 'mongoose';

export const THREAT_TYPES = ['fire', 'gun', 'knife', 'fight', 'blood', 'smoke', 'suspicious_activity'];
export const LEVELS = ['Safe', 'Medium Danger', 'High Danger'];
export const STATUSES = ['new', 'acknowledged', 'resolved', 'false_alarm'];

const incidentSchema = new mongoose.Schema(
  {
    threats: { type: [String], index: true },
    primaryThreat: String,
    score: { type: Number, min: 0, max: 100, required: true },
    level: { type: String, enum: LEVELS, required: true, index: true },
    confidences: { type: Map, of: Number, default: {} },
    screenshotUrl: String,
    cameraName: String,
    emailSent: { type: Boolean, default: false },
    emailError: String,
    status: { type: String, enum: STATUSES, default: 'new', index: true },
    notes: { type: String, default: '' },
    // Detection time reported by the AI service; createdAt is when the backend stored it.
    detectedAt: Date,
  },
  { timestamps: true },
);

incidentSchema.index({ createdAt: -1 });

export default mongoose.model('Incident', incidentSchema);
