/**
 * Простые API эндпоинты
 */

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function handleMe(request, env) {
  const telegramId = getTelegramId(request);
  if (!telegramId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: cors,
    });
  }

  const user = await env.DB.prepare(
    'SELECT id, telegram_id, username, first_name, last_name, photo_url, coins, wins_random FROM users WHERE telegram_id = ?'
  )
    .bind(telegramId)
    .first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: cors,
    });
  }

  // heartbeat
  await env.DB.prepare(
    'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
  )
    .bind(telegramId)
    .run();

  return new Response(JSON.stringify({ ok: true, user }), { headers: cors });
}

export async function handleLeaderboard(request, env) {
  const rows = await env.DB.prepare(`
    SELECT username, first_name, photo_url, wins_random, coins
    FROM users
    ORDER BY wins_random DESC
    LIMIT 50
  `).all();

  return new Response(
    JSON.stringify({
      ok: true,
      leaderboard: rows.results || [],
    }),
    { headers: cors }
  );
}

/** GET /online — сколько активны за последние 5 минут */
export async function handleOnline(request, env) {
  try {
    const row = await env.DB.prepare(`
      SELECT COUNT(*) as cnt FROM users
      WHERE updated_at >= datetime('now', '-5 minutes')
    `).first();

    return new Response(
      JSON.stringify({
        ok: true,
        online: row?.cnt ?? 0,
      }),
      { headers: cors }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: true, online: 0 }),
      { headers: cors }
    );
  }
}

/** POST /presence — heartbeat «я в сети» */
export async function handlePresence(request, env) {
  const telegramId = getTelegramId(request);
  if (!telegramId) {
    // гость — не пишем в БД, но отвечаем ok
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  }

  try {
    await env.DB.prepare(
      'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
    )
      .bind(telegramId)
      .run();
  } catch (_) {}

  return new Response(JSON.stringify({ ok: true }), { headers: cors });
}
