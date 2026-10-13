import express from 'express';
import Incident from '../models/Incident.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
const TZ = 'Asia/Kolkata';

/** YYYY-MM-DD for a date in IST, matching Mongo's $dateToString with the same timezone. */
const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);

router.get('/', requireAuth, async (req, res) => {
  const days = [7, 30].includes(Number(req.query.days)) ? Number(req.query.days) : 7;
  const now = new Date();
  const todayKey = istDay(now);
  // Start of the window: midnight IST (days-1) days ago. IST is UTC+05:30 with no DST.
  const startOfTodayIST = new Date(`${todayKey}T00:00:00+05:30`);
  const since = new Date(startOfTodayIST.getTime() - (days - 1) * 86400000);

  const [byThreat, byLevel, perDay, total, today, high, open] = await Promise.all([
    Incident.aggregate([{ $unwind: '$threats' }, { $group: { _id: '$threats', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Incident.aggregate([{ $group: { _id: '$level', count: { $sum: 1 } } }]),
    Incident.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
          count: { $sum: 1 },
          high: { $sum: { $cond: [{ $eq: ['$level', 'High Danger'] }, 1, 0] } },
        },
      },
    ]),
    Incident.countDocuments(),
    Incident.countDocuments({ createdAt: { $gte: startOfTodayIST } }),
    Incident.countDocuments({ level: 'High Danger' }),
    Incident.countDocuments({ status: 'new' }),
  ]);

  // Fill missing days with zero so the chart has a continuous axis.
  const map = Object.fromEntries(perDay.map((d) => [d._id, d]));
  const series = [];
  for (let i = 0; i < days; i += 1) {
    const key = istDay(new Date(since.getTime() + i * 86400000 + 3600000));
    series.push({ date: key, count: map[key]?.count || 0, high: map[key]?.high || 0 });
  }

  res.json({
    total,
    today,
    highDanger: high,
    open,
    byThreat: byThreat.map((t) => ({ threat: t._id, count: t.count })),
    byLevel: ['High Danger', 'Medium Danger', 'Safe'].map((l) => ({
      level: l,
      count: byLevel.find((x) => x._id === l)?.count || 0,
    })),
    perDay: series,
    days,
  });
});

export default router;
