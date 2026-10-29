/**
 * Дневные квесты — надёжное начисление + HMAC auth
 */

import { requireTelegramUser, corsJson } from './telegram-auth.js';

export const QUESTS = [
  {
    id: 'play_bot',
    title: 'Игра с ботом',
    desc: 'Сыграй 1 партию против бота',
    target: 1,
    reward: 15,
    event: 'game_end',
    filter: (p) => p.mode === 'bot',
  },
  {
    id: 'play_any_3',
    title: 'Разминка',
    desc: 'Сыграй 3 партии (любой режим)',
    target: 3,
    reward: 25,
    event: 'game_end',
    filter: () => true,
  },
  {
    id: 'win_online',
    title: 'Онлайн-победа',
    desc: 'Выиграй 1 партию онлайн',
    target: 1,
    reward: 40,
    event: 'game_end',
    filter: (p) => p.mode === 'online' && p.result === 'win',
  },
  {
    id: 'not_fool',
    title: 'Не дурак',
    desc: 'Закончи 2 игры без поражения',
    target: 2,
    reward: 20,
    event: 'game_end',
    filter: (p) => p.result === 'win',
  },
];

function todayUTC() {
  return new Date().toISOString().slice(0, 10);
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS quest_progress (
      user_id INTEGER NOT NULL,
      quest_id TEXT NOT NULL,
      day TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      claimed INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, quest_id, day)
    )
  `).run();

  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS game_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id INTEGER NOT NULL,
      mode TEXT NOT NULL,
      result TEXT NOT NULL,
      coins_delta INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // идемпотентность событий квестов
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS quest_event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_key TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, event_key)
    )
  `).run();
}

async function getUser(env, telegramId) {
  return env.DB.prepare(
    'SELECT id, coins, wins_random, first_name, username, photo_url FROM users WHERE telegram_id = ?'
  )
    .bind(telegramId)
    .first();
}

export async function handleQuestsList(request, env) {
  try {
    await ensureTables(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    const user = await getUser(env, auth.telegramId);
    if (!user) return corsJson({ error: 'User not found' }, 404);

    const day = todayUTC();
    const rows = await env.DB.prepare(
      'SELECT quest_id, progress, claimed FROM quest_progress WHERE user_id = ? AND day = ?'
    )
      .bind(user.id, day)
      .all();

    const map = {};
    for (const r of rows.results || []) {
      map[r.quest_id] = r;
    }

    const quests = QUESTS.map((q) => {
      const row = map[q.id];
      const progress = row ? row.progress || 0 : 0;
      const claimed = row ? !!row.claimed : false;
      const done = progress >= q.target;
      return {
        id: q.id,
        title: q.title,
        desc: q.desc,
        target: q.target,
        reward: q.reward,
        progress: Math.min(progress, q.target),
        done,
        claimed,
      };
    });

    return corsJson({ ok: true, quests, coins: user.coins, day });
  } catch (err) {
    return corsJson({ error: err.message }, 500);
  }
}

/**
 * POST { mode, result, eventId? }
 * eventId — уникальный id партии (анти-дубль)
 */
export async function handleQuestEvent(request, env) {
  try {
    await ensureTables(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    const user = await getUser(env, auth.telegramId);
    if (!user) return corsJson({ error: 'User not found' }, 404);

    const body = await request.json();
    const mode = body.mode || 'bot';
    const result = body.result || 'lose';
    const day = todayUTC();

    // идемпотентный ключ события
    const eventKey =
      body.eventId ||
      [day, mode, result, body.ts || '', body.nonce || Math.random().toString(36).slice(2, 10)].join(
        ':'
      );

    try {
      await env.DB.prepare(
        'INSERT INTO quest_event_log (user_id, event_key, day) VALUES (?, ?, ?)'
      )
        .bind(user.id, String(eventKey).slice(0, 120), day)
        .run();
    } catch (e) {
      // дубликат — не накручиваем прогресс
      return corsJson({ ok: true, updated: [], duplicate: true });
    }

    // история
    try {
      await env.DB.prepare(
        'INSERT INTO game_history (telegram_id, mode, result, coins_delta) VALUES (?, ?, ?, ?)'
      )
        .bind(auth.telegramId, mode, result, body.coinsDelta || 0)
        .run();
    } catch (e) {}

    const payload = { mode, result };
    const updated = [];

    for (const q of QUESTS) {
      if (q.event !== 'game_end') continue;
      if (!q.filter(payload)) continue;

      const row = await env.DB.prepare(
        'SELECT progress, claimed FROM quest_progress WHERE user_id = ? AND quest_id = ? AND day = ?'
      )
        .bind(user.id, q.id, day)
        .first();

      if (!row) {
        await env.DB.prepare(
          'INSERT INTO quest_progress (user_id, quest_id, day, progress, claimed) VALUES (?, ?, ?, 1, 0)'
        )
          .bind(user.id, q.id, day)
          .run();
        updated.push({ id: q.id, progress: 1 });
      } else if (!row.claimed) {
        const next = Math.min((row.progress || 0) + 1, q.target);
        if (next !== row.progress) {
          await env.DB.prepare(
            'UPDATE quest_progress SET progress = ? WHERE user_id = ? AND quest_id = ? AND day = ? AND claimed = 0'
          )
            .bind(next, user.id, q.id, day)
            .run();
        }
        updated.push({ id: q.id, progress: next });
      }
    }

    return corsJson({ ok: true, updated });
  } catch (err) {
    return corsJson({ error: err.message }, 500);
  }
}

/** POST { questId } — атомарный claim */
export async function handleQuestClaim(request, env) {
  try {
    await ensureTables(env);
    const auth = await requireTelegramUser(request, env);
    if (!auth.ok) return corsJson({ error: auth.error }, auth.status || 401);

    const user = await getUser(env, auth.telegramId);
    if (!user) return corsJson({ error: 'User not found' }, 404);

    const body = await request.json();
    const questId = body.questId;
    const q = QUESTS.find((x) => x.id === questId);
    if (!q) return corsJson({ error: 'Квест не найден' }, 404);

    const day = todayUTC();

    // атомарно: claimed только если ещё 0 и progress достаточен
    const upd = await env.DB.prepare(
      `UPDATE quest_progress
       SET claimed = 1
       WHERE user_id = ? AND quest_id = ? AND day = ?
         AND claimed = 0 AND progress >= ?`
    )
      .bind(user.id, questId, day, q.target)
      .run();

    const changes = (upd.meta && upd.meta.changes) || 0;
    if (!changes) {
      const row = await env.DB.prepare(
        'SELECT progress, claimed FROM quest_progress WHERE user_id = ? AND quest_id = ? AND day = ?'
      )
        .bind(user.id, questId, day)
        .first();
      if (!row || (row.progress || 0) < q.target) {
        return corsJson({ error: 'Квест ещё не выполнен' }, 400);
      }
      if (row.claimed) return corsJson({ error: 'Уже получено' }, 400);
      return corsJson({ error: 'Не удалось забрать' }, 409);
    }

    await env.DB.prepare('UPDATE users SET coins = coins + ? WHERE id = ?')
      .bind(q.reward, user.id)
      .run();

    const updated = await getUser(env, auth.telegramId);
    return corsJson({ ok: true, reward: q.reward, coins: updated.coins });
  } catch (err) {
    return corsJson({ error: err.message }, 500);
  }
}
