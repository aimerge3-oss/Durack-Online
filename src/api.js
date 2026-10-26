/**
 * Простые API эндпоинты
 */

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

export async function handleMe(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const telegramId = getTelegramId(request);
  if (!telegramId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: cors
    });
  }

  const user = await env.DB.prepare(
    'SELECT id, telegram_id, username, first_name, last_name, photo_url, coins, wins_random FROM users WHERE telegram_id = ?'
  ).bind(telegramId).first();

  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: cors
    });
  }

  return new Response(JSON.stringify({ ok: true, user }), { headers: cors });
}

export async function handleLeaderboard(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  const rows = await env.DB.prepare(`
    SELECT username, first_name, photo_url, wins_random, coins
    FROM users
    ORDER BY wins_random DESC
    LIMIT 50
  `).all();

  return new Response(JSON.stringify({
    ok: true,
    leaderboard: rows.results || []
  }), { headers: cors });
}
