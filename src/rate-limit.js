/**
 * Rate limit на D1 (окно + лимит запросов)
 */

async function ensureTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER DEFAULT 0,
      window_start INTEGER NOT NULL
    )
  `).run();
}

/**
 * @param {string} key
 * @param {number} limit
 * @param {number} windowSec
 * @returns {{ ok: boolean, remaining: number, retryAfter?: number }}
 */
export async function rateLimit(env, key, limit, windowSec) {
  if (!env.DB) return { ok: true, remaining: limit };
  try {
    await ensureTable(env);
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      'SELECT count, window_start FROM rate_limits WHERE key = ?'
    )
      .bind(key)
      .first();

    if (!row || now - row.window_start >= windowSec) {
      await env.DB.prepare(
        'INSERT OR REPLACE INTO rate_limits (key, count, window_start) VALUES (?, 1, ?)'
      )
        .bind(key, now)
        .run();
      return { ok: true, remaining: limit - 1 };
    }

    if (row.count >= limit) {
      const retryAfter = windowSec - (now - row.window_start);
      return { ok: false, remaining: 0, retryAfter: Math.max(1, retryAfter) };
    }

    await env.DB.prepare(
      'UPDATE rate_limits SET count = count + 1 WHERE key = ?'
    )
      .bind(key)
      .run();

    return { ok: true, remaining: limit - row.count - 1 };
  } catch (e) {
    console.error('rateLimit', e.message);
    return { ok: true, remaining: limit }; // fail-open
  }
}

export function clientKey(request, telegramId) {
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For') ||
    'unknown';
  return (telegramId ? 'tg:' + telegramId : 'ip:' + ip);
}

/** пресеты лимитов */
export const LIMITS = {
  auth: { limit: 20, window: 60 }, // 20 / мин
  shopBuy: { limit: 10, window: 60 },
  quests: { limit: 40, window: 60 },
  matchmaking: { limit: 30, window: 60 },
};
