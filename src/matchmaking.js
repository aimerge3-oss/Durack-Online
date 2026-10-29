/**
 * Очередь матчмейкинга (не слот по минуте)
 */

import { requireTelegramUser, corsJson } from './telegram-auth.js';
import { rateLimit, clientKey, LIMITS } from './rate-limit.js';

async function ensureQueue(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS match_queue (
      telegram_id INTEGER PRIMARY KEY,
      name TEXT,
      need_players INTEGER DEFAULT 2,
      room_id TEXT,
      status TEXT DEFAULT 'waiting',
      created_at INTEGER NOT NULL
    )
  `).run();
}

function roomCode() {
  return (
    'live_' +
    Date.now().toString(36) +
    '_' +
    Math.random().toString(36).slice(2, 8)
  );
}

/** POST — встать в очередь */
export async function handleMatchJoin(request, env) {
  try {
    await ensureQueue(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    const rl = await rateLimit(
      env,
      'mm:' + clientKey(request, auth.telegramId),
      LIMITS.matchmaking.limit,
      LIMITS.matchmaking.window
    );
    if (!rl.ok) {
      return corsJson(
        { error: 'Too many requests', retryAfter: rl.retryAfter },
        429
      );
    }

    const body = await request.json().catch(() => ({}));
    const need = Math.min(4, Math.max(2, parseInt(body.needPlayers, 10) || 2));
    const name = (auth.user && auth.user.first_name) || body.name || 'Игрок';
    const now = Math.floor(Date.now() / 1000);

    // уже есть комната?
    const existing = await env.DB.prepare(
      "SELECT room_id, status FROM match_queue WHERE telegram_id = ?"
    )
      .bind(auth.telegramId)
      .first();

    if (existing && existing.status === 'matched' && existing.room_id) {
      return corsJson({
        ok: true,
        status: 'matched',
        roomId: existing.room_id,
        needPlayers: need,
      });
    }

    // upsert waiting
    await env.DB.prepare(
      `INSERT INTO match_queue (telegram_id, name, need_players, room_id, status, created_at)
       VALUES (?, ?, ?, NULL, 'waiting', ?)
       ON CONFLICT(telegram_id) DO UPDATE SET
         name = excluded.name,
         need_players = excluded.need_players,
         room_id = NULL,
         status = 'waiting',
         created_at = excluded.created_at`
    )
      .bind(auth.telegramId, name, need, now)
      .run();

    // попытка сматчить
    const matched = await tryMatch(env, need);
    if (matched) {
      const me = await env.DB.prepare(
        'SELECT room_id, status FROM match_queue WHERE telegram_id = ?'
      )
        .bind(auth.telegramId)
        .first();
      if (me && me.status === 'matched') {
        return corsJson({
          ok: true,
          status: 'matched',
          roomId: me.room_id,
          needPlayers: need,
        });
      }
    }

    const waiting = await env.DB.prepare(
      "SELECT COUNT(*) as c FROM match_queue WHERE status = 'waiting' AND need_players = ?"
    )
      .bind(need)
      .first();

    return corsJson({
      ok: true,
      status: 'waiting',
      needPlayers: need,
      inQueue: waiting.c || 1,
    });
  } catch (e) {
    console.error('matchJoin', e);
    return corsJson({ error: e.message }, 500);
  }
}

async function tryMatch(env, need) {
  // берём N самых старых waiting
  const rows = await env.DB.prepare(
    `SELECT telegram_id, name FROM match_queue
     WHERE status = 'waiting' AND need_players = ?
     ORDER BY created_at ASC LIMIT ?`
  )
    .bind(need, need)
    .all();

  const list = rows.results || [];
  if (list.length < need) return false;

  const roomId = roomCode();
  const ids = list.map((p) => p.telegram_id);

  for (const tid of ids) {
    await env.DB.prepare(
      `UPDATE match_queue SET status = 'matched', room_id = ? WHERE telegram_id = ? AND status = 'waiting'`
    )
      .bind(roomId, tid)
      .run();
  }

  console.log('matchmaking matched', roomId, ids);
  return true;
}

/** GET — статус очереди */
export async function handleMatchStatus(request, env) {
  try {
    await ensureQueue(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    const row = await env.DB.prepare(
      'SELECT status, room_id, need_players, created_at FROM match_queue WHERE telegram_id = ?'
    )
      .bind(auth.telegramId)
      .first();

    if (!row) {
      return corsJson({ ok: true, status: 'idle' });
    }

    if (row.status === 'waiting') {
      // ещё раз попытка сматчить (если другие ждут)
      await tryMatch(env, row.need_players || 2);
      const again = await env.DB.prepare(
        'SELECT status, room_id, need_players FROM match_queue WHERE telegram_id = ?'
      )
        .bind(auth.telegramId)
        .first();
      if (again && again.status === 'matched') {
        return corsJson({
          ok: true,
          status: 'matched',
          roomId: again.room_id,
          needPlayers: again.need_players,
        });
      }
      const waiting = await env.DB.prepare(
        "SELECT COUNT(*) as c FROM match_queue WHERE status = 'waiting' AND need_players = ?"
      )
        .bind(row.need_players || 2)
        .first();
      return corsJson({
        ok: true,
        status: 'waiting',
        inQueue: waiting.c || 1,
        needPlayers: row.need_players,
        waitedSec: Math.floor(Date.now() / 1000) - (row.created_at || 0),
      });
    }

    return corsJson({
      ok: true,
      status: row.status,
      roomId: row.room_id,
      needPlayers: row.need_players,
    });
  } catch (e) {
    console.error('matchStatus', e);
    return corsJson({ error: e.message }, 500);
  }
}

/** POST — выйти из очереди */
export async function handleMatchLeave(request, env) {
  try {
    await ensureQueue(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    await env.DB.prepare('DELETE FROM match_queue WHERE telegram_id = ?')
      .bind(auth.telegramId)
      .run();

    return corsJson({ ok: true });
  } catch (e) {
    return corsJson({ error: e.message }, 500);
  }
}

/** очистка старых waiting (>3 мин) */
export async function cleanupMatchQueue(env) {
  try {
    await ensureQueue(env);
    const cutoff = Math.floor(Date.now() / 1000) - 180;
    await env.DB.prepare(
      "DELETE FROM match_queue WHERE status = 'waiting' AND created_at < ?"
    )
      .bind(cutoff)
      .run();
    // matched старше 30 мин
    const cutoff2 = Math.floor(Date.now() / 1000) - 1800;
    await env.DB.prepare(
      "DELETE FROM match_queue WHERE status = 'matched' AND created_at < ?"
    )
      .bind(cutoff2)
      .run();
  } catch (e) {
    console.error('cleanupMatchQueue', e.message);
  }
}
