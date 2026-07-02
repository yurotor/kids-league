// GET  /api/results — מחזיר את כל התוצאות (JSON)
// POST /api/results — שומר תוצאות (דורש סיסמת מנהל בכותרת x-admin-password)
import { Redis } from '@upstash/redis';

const KEY = 'krl:results';

export default async function handler(req, res) {
  const redis = Redis.fromEnv();

  if (req.method === 'GET') {
    const data = await redis.get(KEY);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(data || {});
  }

  if (req.method === 'POST') {
    const pass = req.headers['x-admin-password'];
    if (pass !== (process.env.ADMIN_PASSWORD || 'admin')) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return res.status(400).json({ error: 'expected results object' });
    }
    // מבנה תקין: { gameId: {h: number, a: number}, ... }
    for (const [id, r] of Object.entries(body)) {
      if (!r || typeof r.h !== 'number' || typeof r.a !== 'number' || r.h < 0 || r.a < 0) {
        return res.status(400).json({ error: `invalid result for ${id}` });
      }
    }

    await redis.set(KEY, body);
    return res.status(200).json({ ok: true, count: Object.keys(body).length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
