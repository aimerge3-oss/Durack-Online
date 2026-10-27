/**
 * Дневные квесты — сбалансированные награды
 *
 * Макс. с квестов в день: ~95 монет
 * (не перебивает магазин, но мотивирует играть)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

/** Каталог квестов */
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

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

async function ensureTables(env) {
  try {
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
  } catch (e) {
    console.error('ensure quests', e.message);
  }
}

async function getUser(env, telegramId) {
  return env.DB.prepare('SELECT id, coins, wins_random, first_name, username, photo_url FROM users WHERE telegram_id = ?')
    .bind(telegramId)
    .first();
}

export async function handleQuestsList(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }
    const user = await getUser(env, telegramId);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: cors });
    }

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

    const list = QUESTS.map((q) => {
      const row = map[q.id] || { progress: 0, claimed: 0 };
      const progress = Math.min(row.progress || 0, q.target);
      const done = progress >= q.target;
      return {
        id: q.id,
        title: q.title,
        desc: q.desc,
        target: q.target,
        progress,
        reward: q.reward,
        done,
        claimed: !!row.claimed,
      };
    });

    return new Response(JSON.stringify({ ok: true, day, quests: list, coins: user.coins }), {
      headers: cors,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

/** POST { event, mode, result, coinsDelta? } */
export async function handleQuestEvent(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }
    const user = await getUser(env, telegramId);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: cors });
    }

    const body = await request.json();
    const payload = {
      mode: body.mode || 'bot',
      result: body.result || 'lose',
      coinsDelta: body.coinsDelta || 0,
    };

    // history
    await env.DB.prepare(
      'INSERT INTO game_history (telegram_id, mode, result, coins_delta) VALUES (?, ?, ?, ?)'
    )
      .bind(telegramId, payload.mode, payload.result, payload.coinsDelta)
      .run();

    const day = todayUTC();
    const updated = [];

    for (const q of QUESTS) {
      if (q.event !== 'game_end') continue;
      if (!q.filter(payload)) continue;

      let row = await env.DB.prepare(
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
        await env.DB.prepare(
          'UPDATE quest_progress SET progress = ? WHERE user_id = ? AND quest_id = ? AND day = ?'
        )
          .bind(next, user.id, q.id, day)
          .run();
        updated.push({ id: q.id, progress: next });
      }
    }

    return new Response(JSON.stringify({ ok: true, updated }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

/** POST { questId } — забрать награду */
export async function handleQuestClaim(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }
    const user = await getUser(env, telegramId);
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { status: 404, headers: cors });
    }

    const body = await request.json();
    const questId = body.questId;
    const q = QUESTS.find((x) => x.id === questId);
    if (!q) {
      return new Response(JSON.stringify({ error: 'Квест не найден' }), { status: 404, headers: cors });
    }

    const day = todayUTC();
    const row = await env.DB.prepare(
      'SELECT progress, claimed FROM quest_progress WHERE user_id = ? AND quest_id = ? AND day = ?'
    )
      .bind(user.id, questId, day)
      .first();

    if (!row || (row.progress || 0) < q.target) {
      return new Response(JSON.stringify({ error: 'Квест ещё не выполнен' }), {
        status: 400,
        headers: cors,
      });
    }
    if (row.claimed) {
      return new Response(JSON.stringify({ error: 'Уже получено' }), { status: 400, headers: cors });
    }

    await env.DB.prepare(
      'UPDATE quest_progress SET claimed = 1 WHERE user_id = ? AND quest_id = ? AND day = ?'
    )
      .bind(user.id, questId, day)
      .run();
    await env.DB.prepare('UPDATE users SET coins = coins + ? WHERE id = ?')
      .bind(q.reward, user.id)
      .run();

    const updated = await getUser(env, telegramId);
    return new Response(
      JSON.stringify({ ok: true, reward: q.reward, coins: updated.coins }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
