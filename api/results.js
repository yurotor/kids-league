// GET  /api/results — מחזיר את כל התוצאות (JSON)
// POST /api/results — שומר תוצאות (דורש סיסמת מנהל בכותרת x-admin-password)
import { Redis } from '@upstash/redis';

const KEY = 'krl:results';

export default async function handler(req, res) {
  // בפריסת Vercel האינטגרציה מזריקה KV_REST_API_*; בפיתוח מקומי משתמשים ב-UPSTASH_REDIS_REST_*
  const redis = new Redis({
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
  });

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
    // מבנה תקין: { gameId: { h, a, st?: "L"|"E", goals?: [{side:"h"|"a", player:string|null}], startedAt?: string } }
    for (const [id, r] of Object.entries(body)) {
      if (!r || typeof r.h !== 'number' || typeof r.a !== 'number' || r.h < 0 || r.a < 0) {
        return res.status(400).json({ error: `invalid result for ${id}` });
      }
      if (r.st !== undefined && r.st !== 'L' && r.st !== 'E') {
        return res.status(400).json({ error: `invalid state for ${id}` });
      }
      if (r.startedAt !== undefined && r.startedAt !== null && typeof r.startedAt !== 'string') {
        return res.status(400).json({ error: `invalid startedAt for ${id}` });
      }
      if (r.goals !== undefined) {
        if (!Array.isArray(r.goals)) {
          return res.status(400).json({ error: `invalid goals for ${id}` });
        }
        for (const g of r.goals) {
          if (!g || (g.side !== 'h' && g.side !== 'a') ||
              (g.player !== null && typeof g.player !== 'string')) {
            return res.status(400).json({ error: `invalid goal entry for ${id}` });
          }
        }
      }
    }

    await redis.set(KEY, body);
    return res.status(200).json({ ok: true, count: Object.keys(body).length });
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method not allowed' });
}
