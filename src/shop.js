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
  { id: 1, name: 'Классика', price: 50, emoji: '🃏', description: 'Карта' },
  { id: 2, name: 'Огонь', price: 100, emoji: '🔥', description: 'Жар' },
  { id: 3, name: 'Молния', price: 150, emoji: '⚡', description: 'Скорость' },
  { id: 4, name: 'Корона', price: 300, emoji: '👑', description: 'Победитель' },
  { id: 5, name: 'Черт', price: 200, emoji: '👿', description: 'Дурак' },
  { id: 6, name: 'Звезда', price: 250, emoji: '⭐', description: 'Удача' },
  { id: 7, name: 'Роза', price: 80, emoji: '🌹', description: 'Стиль' },
  { id: 8, name: 'Ракета', price: 500, emoji: '🚀', description: 'Премиум' },
];

async function ensureStickers(env) {
  try {
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stickers (
        id INTEGER PRIMARY KEY,
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
        .bind(s.id, s.name, s.price, s.emoji, s.description)
        .run();
    }
  } catch (e) {
    console.error('ensureStickers', e.message);
  }
}

export async function handleShop(request, env) {
  try {
    await ensureStickers(env);
    const telegramId = getTelegramId(request);

    let owned = new Set();
    let coins = 0;

    if (telegramId) {
      try {
        const user = await env.DB.prepare(
          'SELECT id, coins FROM users WHERE telegram_id = ?'
        )
          .bind(telegramId)
          .first();
        if (user) {
          coins = user.coins || 0;
          const rows = await env.DB.prepare(
            'SELECT sticker_id FROM user_stickers WHERE user_id = ?'
          )
            .bind(user.id)
            .all();
          for (const r of rows.results || []) owned.add(r.sticker_id);
        }
      } catch (e) {
        console.error('shop user', e.message);
      }
    }

    let list = SEED.map((s) => ({ ...s, owned: owned.has(s.id) }));
    try {
      const stickers = await env.DB.prepare(
        'SELECT id, name, price, emoji, description FROM stickers ORDER BY price ASC'
      ).all();
      if (stickers.results && stickers.results.length) {
        list = stickers.results.map((s) => ({
          ...s,
          owned: owned.has(s.id),
        }));
      }
    } catch (e) {
      console.error('shop list', e.message);
    }

    return new Response(JSON.stringify({ ok: true, stickers: list, coins }), {
      headers: cors,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: true,
        stickers: SEED.map((s) => ({ ...s, owned: false })),
        coins: 0,
        warn: err.message,
      }),
      { headers: cors }
    );
  }
}

export async function handleBuy(request, env) {
  try {
    await ensureStickers(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: cors,
      });
    }

    const body = await request.json();
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

    let sticker = await env.DB.prepare(
      'SELECT id, name, price, emoji FROM stickers WHERE id = ?'
    )
      .bind(stickerId)
      .first();
    if (!sticker) {
      sticker = SEED.find((s) => s.id === stickerId);
    }
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

    await env.DB.prepare('UPDATE users SET coins = coins - ? WHERE id = ?')
      .bind(sticker.price, user.id)
      .run();
    await env.DB.prepare(
      'INSERT INTO user_stickers (user_id, sticker_id) VALUES (?, ?)'
    )
      .bind(user.id, stickerId)
      .run();

    const updated = await env.DB.prepare('SELECT coins FROM users WHERE id = ?')
      .bind(user.id)
      .first();

    return new Response(
      JSON.stringify({ ok: true, sticker, coins: updated.coins }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}
