/**
 * Профиль + стикеры (без @username у чужих)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

async function loadOwnedStickers(env, userId) {
  try {
    const rows = await env.DB.prepare(`
      SELECT s.id, s.name, s.emoji, s.price
      FROM user_stickers us
      JOIN stickers s ON s.id = us.sticker_id
      WHERE us.user_id = ?
      ORDER BY s.price ASC
    `)
      .bind(userId)
      .all();
    return rows.results || [];
  } catch (e) {
    return [];
  }
}

async function buildProfile(env, telegramId, isSelf) {
  const user = await env.DB.prepare(
    'SELECT id, telegram_id, username, first_name, photo_url, coins, wins_random, created_at FROM users WHERE telegram_id = ?'
  )
    .bind(telegramId)
    .first();

  if (!user) return null;

  let history = [];
  let gamesTotal = 0;
  try {
    const rows = await env.DB.prepare(
      'SELECT mode, result, coins_delta, created_at FROM game_history WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 12'
    )
      .bind(telegramId)
      .all();
    history = rows.results || [];
    const c = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM game_history WHERE telegram_id = ?'
    )
      .bind(telegramId)
      .first();
    gamesTotal = c.c || 0;
  } catch (e) {}

  const stickers = await loadOwnedStickers(env, user.id);

  return {
    telegram_id: user.telegram_id,
    username: isSelf ? user.username : null,
    first_name: user.first_name || 'Игрок',
    photo_url: user.photo_url,
    coins: isSelf ? user.coins : null,
    wins_random: user.wins_random || 0,
    games_total: gamesTotal,
    created_at: user.created_at,
    stickers: stickers,
    history: isSelf
      ? history
      : history.map((h) => ({
          mode: h.mode,
          result: h.result,
          created_at: h.created_at,
        })),
  };
}

export async function handleProfile(request, env) {
  try {
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: cors,
      });
    }
    const user = await buildProfile(env, telegramId, true);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: cors,
      });
    }
    return new Response(JSON.stringify({ ok: true, user, history: user.history }), {
      headers: cors,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}

export async function handlePublicProfile(request, env, targetId) {
  try {
    const me = getTelegramId(request);
    const tid = parseInt(targetId, 10);
    if (!tid || isNaN(tid)) {
      return new Response(JSON.stringify({ error: 'bad id' }), {
        status: 400,
        headers: cors,
      });
    }
    const isSelf = me && me === tid;
    const user = await buildProfile(env, tid, !!isSelf);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: cors,
      });
    }
    return new Response(JSON.stringify({ ok: true, user, history: user.history || [] }), {
      headers: cors,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}
