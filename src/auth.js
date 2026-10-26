/**
 * Telegram Mini App авторизация
 * Проверяет initData по официальному алгоритму Telegram
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */

/**
 * Проверяет подлинность initData от Telegram WebApp
 * @param {string} initData - строка window.Telegram.WebApp.initData
 * @param {string} botToken - токен бота
 * @returns {{ valid: boolean, user?: object, error?: string }}
 */
export async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false, error: 'No hash in initData' };

    // Собираем data-check-string
    const entries = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') {
        entries.push(`${key}=${value}`);
      }
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    // secret_key = HMAC-SHA256(bot_token, "WebAppData")
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKey = await crypto.subtle.sign('HMAC', key, encoder.encode(botToken));

    // hash = HMAC-SHA256(data_check_string, secret_key)
    const secretKeyImported = await crypto.subtle.importKey(
      'raw',
      secretKey,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const calculatedHashBuffer = await crypto.subtle.sign(
      'HMAC',
      secretKeyImported,
      encoder.encode(dataCheckString)
    );

    const calculatedHash = Array.from(new Uint8Array(calculatedHashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Invalid hash' };
    }

    // Проверяем auth_date (не старше 24 часов)
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) {
      return { valid: false, error: 'initData expired' };
    }

    // Парсим user
    const userStr = params.get('user');
    let user = null;
    if (userStr) {
      user = JSON.parse(userStr);
    }

    return { valid: true, user };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * POST /auth
 * Body: { initData: string, referrerId?: number }
 */
export async function handleAuth(request, env) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    const body = await request.json();
    const { initData, referrerId } = body;

    const botToken = env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: no bot token' }), {
        status: 500,
        headers: cors
      });
    }

    const validation = await validateTelegramInitData(initData, botToken);
    if (!validation.valid) {
      return new Response(JSON.stringify({ error: validation.error || 'Invalid initData' }), {
        status: 401,
        headers: cors
      });
    }

    const tgUser = validation.user;
    if (!tgUser || !tgUser.id) {
      return new Response(JSON.stringify({ error: 'No user in initData' }), {
        status: 400,
        headers: cors
      });
    }

    // Ищем или создаём пользователя в D1
    let user = await env.DB.prepare(
      'SELECT * FROM users WHERE telegram_id = ?'
    ).bind(tgUser.id).first();

    if (!user) {
      // Новый пользователь
      await env.DB.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referrer_id, coins)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(
        tgUser.id,
        tgUser.username || null,
        tgUser.first_name || null,
        tgUser.last_name || null,
        tgUser.photo_url || null,
        referrerId || null,
        0
      ).run();

      // Если есть реферер — даём ему +500 монет
      if (referrerId) {
        await env.DB.prepare(
          'UPDATE users SET coins = coins + 500 WHERE telegram_id = ?'
        ).bind(referrerId).run();
      }

      user = await env.DB.prepare(
        'SELECT * FROM users WHERE telegram_id = ?'
      ).bind(tgUser.id).first();
    } else {
      // Обновляем данные
      await env.DB.prepare(`
        UPDATE users SET
          username = ?,
          first_name = ?,
          last_name = ?,
          photo_url = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE telegram_id = ?
      `).bind(
        tgUser.username || null,
        tgUser.first_name || null,
        tgUser.last_name || null,
        tgUser.photo_url || null,
        tgUser.id
      ).run();

      user = await env.DB.prepare(
        'SELECT * FROM users WHERE telegram_id = ?'
      ).bind(tgUser.id).first();
    }

    return new Response(JSON.stringify({
      ok: true,
      user: {
        id: user.id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        photo_url: user.photo_url,
        coins: user.coins,
        wins_random: user.wins_random
      },
      token: String(user.telegram_id)
    }), { headers: cors });

  } catch (err) {
    console.error('Auth error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors
    });
  }
}
