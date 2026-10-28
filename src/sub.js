/**
 * Проверка подписки на канал
 * Бот должен быть админом канала!
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export function isSubRequired(env) {
  return String(env.REQUIRE_CHANNEL_SUB || '').toLowerCase() === 'true';
}

export function channelId(env) {
  return env.CHANNEL_ID || '-1004333834801';
}

export function channelLink(env) {
  return env.CHANNEL_LINK || 'https://t.me/Durack_0nline';
}

/**
 * @returns {Promise<{ok:boolean, status?:string, error?:string}>}
 */
export async function checkChannelSub(env, telegramUserId) {
  if (!isSubRequired(env)) {
    return { ok: true, status: 'not_required' };
  }
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: 'no_bot_token' };
  }
  if (!telegramUserId) {
    return { ok: false, error: 'no_user' };
  }

  try {
    const url =
      'https://api.telegram.org/bot' +
      token +
      '/getChatMember?chat_id=' +
      encodeURIComponent(channelId(env)) +
      '&user_id=' +
      encodeURIComponent(String(telegramUserId));
    const res = await fetch(url);
    const data = await res.json();
    if (!data.ok) {
      console.error('getChatMember', data);
      return { ok: false, status: 'unknown', error: data.description || 'api_error' };
    }
    const status = data.result && data.result.status;
    const allowed = ['creator', 'administrator', 'member', 'restricted'].includes(status);
    return { ok: allowed, status };
  } catch (e) {
    console.error('checkChannelSub', e);
    return { ok: false, error: e.message };
  }
}

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

/** GET /sub-check */
export async function handleSubCheck(request, env) {
  const telegramId = getTelegramId(request);
  if (!telegramId) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: cors,
    });
  }
  const result = await checkChannelSub(env, telegramId);
  return new Response(
    JSON.stringify({
      ok: true,
      required: isSubRequired(env),
      subscribed: !!result.ok,
      status: result.status || null,
      channel: channelLink(env),
      error: result.error || null,
    }),
    { headers: cors }
  );
}
