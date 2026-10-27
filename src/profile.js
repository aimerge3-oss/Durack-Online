/**
 * Профиль и история игр
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

export async function handleProfile(request, env) {
  try {
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const user = await env.DB.prepare(
      'SELECT telegram_id, username, first_name, photo_url, coins, wins_random, created_at FROM users WHERE telegram_id = ?'
    )
      .bind(telegramId)
      .first();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: cors });
    }

    let history = [];
    try {
      const rows = await env.DB.prepare(
        'SELECT mode, result, coins_delta, created_at FROM game_history WHERE telegram_id = ? ORDER BY created_at DESC LIMIT 20'
      )
        .bind(telegramId)
        .all();
      history = rows.results || [];
    } catch (e) {}

    let gamesTotal = history.length;
    try {
      const c = await env.DB.prepare(
        'SELECT COUNT(*) as c FROM game_history WHERE telegram_id = ?'
      )
        .bind(telegramId)
        .first();
      gamesTotal = c.c || 0;
    } catch (e) {}

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          photo_url: user.photo_url,
          coins: user.coins,
          wins_random: user.wins_random,
          games_total: gamesTotal,
          created_at: user.created_at,
        },
        history,
      }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}
