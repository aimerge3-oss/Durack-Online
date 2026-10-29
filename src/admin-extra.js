/**
 * Админ: статистика, выдача монет, проверка прав
 */

import { requireTelegramUser, corsJson } from './telegram-auth.js';

function isAdmin(env, telegramId) {
  if (!telegramId) return false;
  const raw = env.ADMIN_IDS || '';
  const ids = String(raw)
    .split(/[,\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n));
  return ids.includes(Number(telegramId));
}

export async function handleAdminMe(request, env) {
  try {
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ ok: false, admin: false, error: auth.error }, 401);
    const admin = isAdmin(env, auth.telegramId);
    return corsJson({ ok: true, admin, telegramId: auth.telegramId });
  } catch (e) {
    return corsJson({ error: e.message }, 500);
  }
}

export async function handleAdminStats(request, env) {
  try {
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, 401);
    if (!isAdmin(env, auth.telegramId)) return corsJson({ error: 'Forbidden' }, 403);

    const users = await env.DB.prepare('SELECT COUNT(*) as c FROM users').first();
    const coins = await env.DB.prepare('SELECT COALESCE(SUM(coins),0) as s FROM users').first();
    let games = { c: 0 };
    try {
      games = await env.DB.prepare('SELECT COUNT(*) as c FROM game_history').first();
    } catch (e) {}
    let stickers = { c: 0 };
    try {
      stickers = await env.DB.prepare('SELECT COUNT(*) as c FROM user_stickers').first();
    } catch (e) {}
    let refs = { c: 0 };
    try {
      refs = await env.DB.prepare('SELECT COUNT(*) as c FROM referral_credits').first();
    } catch (e) {}
    let presence = { c: 0 };
    try {
      presence = await env.DB.prepare(
        "SELECT COUNT(*) as c FROM presence WHERE datetime(last_seen) > datetime('now', '-2 minutes')"
      ).first();
    } catch (e) {
      try {
        presence = await env.DB.prepare(
          "SELECT COUNT(*) as c FROM online_presence WHERE datetime(updated_at) > datetime('now', '-2 minutes')"
        ).first();
      } catch (e2) {}
    }

    let top = [];
    try {
      const rows = await env.DB.prepare(
        'SELECT telegram_id, first_name, coins, wins_random FROM users ORDER BY wins_random DESC LIMIT 5'
      ).all();
      top = rows.results || [];
    } catch (e) {}

    return corsJson({
      ok: true,
      stats: {
        users: users.c || 0,
        totalCoins: coins.s || 0,
        games: games.c || 0,
        stickerPurchases: stickers.c || 0,
        referrals: refs.c || 0,
        onlineApprox: presence.c || 0,
        topWins: top,
      },
    });
  } catch (e) {
    return corsJson({ error: e.message }, 500);
  }
}

/** POST { telegramId, amount } */
export async function handleAdminGrantCoins(request, env) {
  try {
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, 401);
    if (!isAdmin(env, auth.telegramId)) return corsJson({ error: 'Forbidden' }, 403);

    const body = await request.json();
    const tid = parseInt(body.telegramId, 10);
    const amount = parseInt(body.amount, 10);
    if (!tid || isNaN(amount) || amount === 0) {
      return corsJson({ error: 'telegramId and amount required' }, 400);
    }
    if (Math.abs(amount) > 100000) {
      return corsJson({ error: 'amount too large' }, 400);
    }

    const user = await env.DB.prepare('SELECT id, coins FROM users WHERE telegram_id = ?')
      .bind(tid)
      .first();
    if (!user) return corsJson({ error: 'User not found' }, 404);

    await env.DB.prepare(
      'UPDATE users SET coins = MAX(0, coins + ?), updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
    )
      .bind(amount, tid)
      .run();

    const updated = await env.DB.prepare('SELECT coins FROM users WHERE telegram_id = ?')
      .bind(tid)
      .first();

    return corsJson({ ok: true, telegramId: tid, coins: updated.coins });
  } catch (e) {
    return corsJson({ error: e.message }, 500);
  }
}
