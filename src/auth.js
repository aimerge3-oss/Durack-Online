/**
 * Auth + рефералка (жёсткий HMAC, стабильные +500)
 */

import { checkChannelSub, isSubRequired, channelLink } from './sub.js';
import { validateTelegramInitData, corsJson } from './telegram-auth.js';

function parseReferrerId(startParam, bodyReferrerId) {
  if (bodyReferrerId) {
    const n = parseInt(bodyReferrerId, 10);
    if (n && !isNaN(n)) return n;
  }
  if (!startParam) return null;
  const s = String(startParam).trim();
  if (s.startsWith('ref_')) {
    const n = parseInt(s.slice(4), 10);
    return n && !isNaN(n) ? n : null;
  }
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    return n && !isNaN(n) ? n : null;
  }
  return null;
}

async function ensureReferralTable(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS referral_credits (
      referred_telegram_id INTEGER PRIMARY KEY,
      referrer_telegram_id INTEGER NOT NULL,
      amount INTEGER NOT NULL DEFAULT 500,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

/**
 * Начислить рефереру +500 ровно один раз на referred
 */
async function creditReferrer(env, referredTelegramId, referrerTelegramId) {
  if (!referrerTelegramId || referrerTelegramId === referredTelegramId) {
    return { credited: false, amount: 0 };
  }

  await ensureReferralTable(env);

  const exists = await env.DB.prepare(
    'SELECT 1 AS x FROM referral_credits WHERE referred_telegram_id = ?'
  )
    .bind(referredTelegramId)
    .first();
  if (exists) return { credited: false, amount: 0, reason: 'already' };

  const refUser = await env.DB.prepare(
    'SELECT telegram_id FROM users WHERE telegram_id = ?'
  )
    .bind(referrerTelegramId)
    .first();
  if (!refUser) return { credited: false, amount: 0, reason: 'no_referrer' };

  try {
    // UNIQUE referred — если параллельно, второй INSERT упадёт
    const ins = await env.DB.prepare(
      'INSERT INTO referral_credits (referred_telegram_id, referrer_telegram_id, amount) VALUES (?, ?, 500)'
    )
      .bind(referredTelegramId, referrerTelegramId)
      .run();

    if (!ins.success && ins.meta && ins.meta.changes === 0) {
      return { credited: false, amount: 0, reason: 'race' };
    }

    await env.DB.prepare(
      'UPDATE users SET coins = coins + 500, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
    )
      .bind(referrerTelegramId)
      .run();

    return { credited: true, amount: 500 };
  } catch (e) {
    // UNIQUE conflict
    return { credited: false, amount: 0, reason: e.message };
  }
}

export async function handleAuth(request, env) {
  try {
    const body = await request.json();
    const initData = body.initData || '';
    const botToken = env.TELEGRAM_BOT_TOKEN;

    if (!botToken) {
      return corsJson({ error: 'Server misconfigured: no bot token' }, 500);
    }

    // ЖЁСТКО: без валидного initData — 401 (нет demo-path)
    const validation = await validateTelegramInitData(initData, botToken);
    if (!validation.valid) {
      return corsJson({ error: validation.error || 'Invalid initData' }, 401);
    }

    const tgUser = validation.user;
    if (!tgUser || !tgUser.id) {
      return corsJson({ error: 'No user in initData' }, 400);
    }

    const startParam = validation.startParam || body.startParam || null;
    let referrerId = parseReferrerId(startParam, body.referrerId);
    if (referrerId && referrerId === tgUser.id) referrerId = null;

    let referralBonus = 0;
    let isNew = false;

    let user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
      .bind(tgUser.id)
      .first();

    if (!user) {
      isNew = true;
      await env.DB.prepare(`
        INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, referrer_id, coins)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `)
        .bind(
          tgUser.id,
          tgUser.username || null,
          tgUser.first_name || null,
          tgUser.last_name || null,
          tgUser.photo_url || null,
          referrerId
        )
        .run();

      user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
        .bind(tgUser.id)
        .first();

      if (referrerId) {
        const cred = await creditReferrer(env, tgUser.id, referrerId);
        if (cred.credited) referralBonus = cred.amount;
      }
    } else {
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

      // если пользователь старый, но реферал ещё не начисляли
      // (например первый вход был без start_param) — не даём повторно
      // только если referrer_id был NULL и есть новый start_param в течение 24ч после регистрации
      if (referrerId && !user.referrer_id) {
        const created = user.created_at ? Date.parse(user.created_at) : 0;
        const young = created && Date.now() - created < 24 * 3600 * 1000;
        if (young) {
          await env.DB.prepare(
            'UPDATE users SET referrer_id = ? WHERE telegram_id = ? AND referrer_id IS NULL'
          )
            .bind(referrerId, tgUser.id)
            .run();
          const cred = await creditReferrer(env, tgUser.id, referrerId);
          if (cred.credited) referralBonus = cred.amount;
        }
      }

      user = await env.DB.prepare('SELECT * FROM users WHERE telegram_id = ?')
        .bind(tgUser.id)
        .first();
    }

    const sub = await checkChannelSub(env, tgUser.id);

    return corsJson({
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
      // token для совместимости; реальная защита — initData в заголовках
      token: String(user.telegram_id),
      isNew,
      referralBonus,
      subscription: {
        required: isSubRequired(env),
        subscribed: !!sub.ok,
        channel: channelLink(env),
        status: sub.status || null,
      },
    });
  } catch (err) {
    console.error('Auth error:', err);
    return corsJson({ error: err.message }, 500);
  }
}

// re-export для старых import
export { validateTelegramInitData } from './telegram-auth.js';
