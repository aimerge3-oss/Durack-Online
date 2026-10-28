/**
 * Telegram Mini App авторизация + рефералка
 */

import { checkChannelSub, isSubRequired, channelLink } from './sub.js';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export async function validateTelegramInitData(initData, botToken) {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return { valid: false, error: 'No hash in initData' };

    const entries = [];
    for (const [key, value] of params.entries()) {
      if (key !== 'hash') entries.push(key + '=' + value);
    }
    entries.sort();
    const dataCheckString = entries.join('\n');

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKey = await crypto.subtle.sign('HMAC', key, encoder.encode(botToken));
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
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) return { valid: false, error: 'Invalid hash' };

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > 86400) return { valid: false, error: 'Auth data expired' };

    let user = null;
    try {
      user = JSON.parse(params.get('user') || 'null');
    } catch (e) {}

    const startParam = params.get('start_param') || null;
    return { valid: true, user, startParam };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function parseReferrerId(startParam, bodyReferrerId) {
  if (bodyReferrerId) {
    const n = parseInt(bodyReferrerId, 10);
    if (n && !isNaN(n)) return n;
  }
  if (!startParam) return null;
  const s = String(startParam).trim();
  // ref_12345 или просто 12345
  if (s.startsWith('ref_')) {
    const n = parseInt(s.slice(4), 10);
    return n && !isNaN(n) ? n : null;
  }
  const n = parseInt(s.replace(/\D/g, ''), 10);
  return n && !isNaN(n) ? n : null;
}

export async function handleAuth(request, env) {
  try {
    const body = await request.json();
    const initData = body.initData || '';
    const botToken = env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return new Response(JSON.stringify({ error: 'Server misconfigured: no bot token' }), {
        status: 500,
        headers: cors,
      });
    }

    const validation = await validateTelegramInitData(initData, botToken);
    if (!validation.valid) {
      if (!initData && body.user && body.user.id) {
        // demo path
      } else {
        return new Response(JSON.stringify({ error: validation.error || 'Invalid initData' }), {
          status: 401,
          headers: cors,
        });
      }
    }

    const tgUser = validation.user || body.user;
    if (!tgUser || !tgUser.id) {
      return new Response(JSON.stringify({ error: 'No user in initData' }), {
        status: 400,
        headers: cors,
      });
    }

    let referralBonus = 0;
    const startParam = validation.startParam || body.startParam || null;
    let referrerId = parseReferrerId(startParam, body.referrerId);
    if (referrerId && referrerId === tgUser.id) referrerId = null;

    let user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
      .bind(tgUser.id)
      .first();

    if (!user) {
      await env.DB.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referrer_id, coins)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          tgUser.id,
          tgUser.username || null,
          tgUser.first_name || null,
          tgUser.last_name || null,
          tgUser.photo_url || null,
          referrerId,
          0
        )
        .run();

      user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
        .bind(tgUser.id)
        .first();

      if (referrerId) {
        try {
          const refUser = await env.DB.prepare(
            'SELECT id, coins FROM users WHERE telegram_id = ?'
          )
            .bind(referrerId)
            .first();
          if (refUser) {
            await env.DB.prepare(
              'UPDATE users SET coins = coins + 500 WHERE telegram_id = ?'
            )
              .bind(referrerId)
              .run();
            referralBonus = 500;
          }
        } catch (e) {
          console.error('referral', e);
        }
      }
    } else {
      // если раньше без рефера и пришёл по ссылке — не начисляем повторно
      await env.DB.prepare(`
        UPDATE users SET username = ?, first_name = ?, last_name = ?, photo_url = ?,
          updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?
      `)
        .bind(
          tgUser.username || null,
          tgUser.first_name || null,
          tgUser.last_name || null,
          tgUser.photo_url || null,
          tgUser.id
        )
        .run();

      user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
        .bind(tgUser.id)
        .first();
    }

    const sub = await checkChannelSub(env, tgUser.id);

    return new Response(
      JSON.stringify({
        ok: true,
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          photo_url: user.photo_url,
          coins: user.coins,
          wins_random: user.wins_random,
        },
        token: String(user.telegram_id),
        referralBonus,
        subscription: {
          required: isSubRequired(env),
          subscribed: !!sub.ok,
          channel: channelLink(env),
          status: sub.status || null,
        },
      }),
      { headers: cors }
    );
  } catch (err) {
    console.error('Auth error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
}
