/**
 * Магазин стикеров
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const match = auth.match(/^Bearer\s+(\d+)$/i);
  return match ? parseInt(match[1], 10) : null;
}

const SEED = [
  [1, 'Классика', 50, '🃏', 'Карта'],
  [2, 'Огонь', 100, '🔥', 'Жар'],
  [3, 'Молния', 150, '⚡', 'Скорость'],
  [4, 'Корона', 300, '👑', 'Победитель'],
  [5, 'Черт', 200, '👿', 'Дурак'],
  [6, 'Звезда', 250, '⭐', 'Удача'],
  [7, 'Роза', 80, '🌹', 'Стиль'],
  [8, 'Ракета', 500, '🚀', 'Премиум'],
];

async function ensureStickers(env) {
  try {
    const row = await env.DB.prepare('SELECT COUNT(*) as c FROM stickers').first();
    if (row && row.c > 0) return;
  } catch (_) {
    // table may not exist
  }
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stickers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        emoji TEXT,
        description TEXT
      )
    `).run();
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS user_stickers (
        user_id INTEGER NOT NULL,
        sticker_id INTEGER NOT NULL,
        purchased_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, sticker_id)
      )
    `).run();
    for (const s of SEED) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO stickers (id, name, price, emoji, description) VALUES (?, ?, ?, ?, ?)'
      )
        .bind(s[0], s[1], s[2], s[3], s[4])
        .run();
    }
  } catch (e) {
    console.error('ensureStickers', e);
  }
}

export async function handleShop(request, env) {
  await ensureStickers(env);
  const telegramId = getTelegramId(request);

  let owned = new Set();
  let coins = 0;
  let userId = null;

  if (telegramId) {
    const user = await env.DB.prepare(
      'SELECT id, coins FROM users WHERE telegram_id = ?'
    )
      .bind(telegramId)
      .first();
    if (user) {
      userId = user.id;
      coins = user.coins || 0;
      const rows = await env.DB.prepare(
        'SELECT sticker_id FROM user_stickers WHERE user_id = ?'
      )
        .bind(userId)
        .all();
      for (const r of rows.results || []) owned.add(r.sticker_id);
    }
  }

  const stickers = await env.DB.prepare(
    'SELECT id, name, price, emoji, description FROM stickers ORDER BY price ASC'
  ).all();

  const list = (stickers.results || []).map((s) => ({
    ...s,
    owned: owned.has(s.id),
  }));

  return new Response(
    JSON.stringify({ ok: true, stickers: list, coins }),
    { headers: cors }
  );
}

export async function handleBuy(request, env) {
  await ensureStickers(env);
  const telegramId = getTelegramId(request);
  if (!telegramId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: cors,
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Bad JSON' }), {
      status: 400,
      headers: cors,
    });
  }

  const stickerId = parseInt(body.stickerId, 10);
  if (!stickerId) {
    return new Response(JSON.stringify({ error: 'stickerId required' }), {
      status: 400,
      headers: cors,
    });
  }

  const user = await env.DB.prepare(
    'SELECT id, coins FROM users WHERE telegram_id = ?'
  )
    .bind(telegramId)
    .first();
  if (!user) {
    return new Response(JSON.stringify({ error: 'User not found' }), {
      status: 404,
      headers: cors,
    });
  }

  const sticker = await env.DB.prepare(
    'SELECT id, name, price, emoji FROM stickers WHERE id = ?'
  )
    .bind(stickerId)
    .first();
  if (!sticker) {
    return new Response(JSON.stringify({ error: 'Sticker not found' }), {
      status: 404,
      headers: cors,
    });
  }

  const already = await env.DB.prepare(
    'SELECT 1 FROM user_stickers WHERE user_id = ? AND sticker_id = ?'
  )
    .bind(user.id, stickerId)
    .first();
  if (already) {
    return new Response(JSON.stringify({ error: 'Уже куплено' }), {
      status: 400,
      headers: cors,
    });
  }

  if ((user.coins || 0) < sticker.price) {
    return new Response(JSON.stringify({ error: 'Недостаточно монет' }), {
      status: 400,
      headers: cors,
    });
  }

  await env.DB.prepare(
    'UPDATE users SET coins = coins - ? WHERE id = ?'
  )
    .bind(sticker.price, user.id)
    .run();

  await env.DB.prepare(
    'INSERT INTO user_stickers (user_id, sticker_id) VALUES (?, ?)'
  )
    .bind(user.id, stickerId)
    .run();

  const updated = await env.DB.prepare(
    'SELECT coins FROM users WHERE id = ?'
  )
    .bind(user.id)
    .first();

  return new Response(
    JSON.stringify({
      ok: true,
      sticker,
      coins: updated.coins,
    }),
    { headers: cors }
  );
}
