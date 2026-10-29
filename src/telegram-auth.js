/**
 * Жёсткая проверка Telegram WebApp initData (HMAC-SHA256)
 *
 * Клиент должен передавать:
 *   X-Telegram-Init-Data: <initData>
 * или
 *   Authorization: tma <initData>
 *
 * Bearer <telegram_id> разрешён только если ALLOW_INSECURE_AUTH=1
 */

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

    // secret_key = HMAC_SHA256(key="WebAppData", msg=botToken)
    const webAppKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode('WebAppData'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const secretKeyBytes = await crypto.subtle.sign(
      'HMAC',
      webAppKey,
      encoder.encode(botToken)
    );

    const secretKey = await crypto.subtle.importKey(
      'raw',
      secretKeyBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const calculated = await crypto.subtle.sign(
      'HMAC',
      secretKey,
      encoder.encode(dataCheckString)
    );

    const calculatedHash = Array.from(new Uint8Array(calculated))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'Invalid hash' };
    }

    const authDate = parseInt(params.get('auth_date') || '0', 10);
    const now = Math.floor(Date.now() / 1000);
    // 24 часа — для Mini App допустимо (пользователь может держать открытым)
    if (!authDate || now - authDate > 86400) {
      return { valid: false, error: 'Auth data expired' };
    }

    let user = null;
    try {
      user = JSON.parse(params.get('user') || 'null');
    } catch (e) {
      user = null;
    }
    if (!user || !user.id) {
      return { valid: false, error: 'No user in initData' };
    }

    return {
      valid: true,
      user,
      startParam: params.get('start_param') || null,
      authDate,
    };
  } catch (e) {
    return { valid: false, error: e.message || 'validate failed' };
  }
}

function extractInitData(request) {
  const h = request.headers.get('X-Telegram-Init-Data');
  if (h && h.trim()) return h.trim();

  const auth = request.headers.get('Authorization') || '';
  const tma = auth.match(/^tma\s+(.+)$/i);
  if (tma) return tma[1].trim();

  return null;
}

/**
 * @returns {{ ok: true, telegramId: number, user: object } | { ok: false, error: string, status: number }}
 */
export async function requireTelegramUser(request, env) {
  const botToken = env.TELEGRAM_BOT_TOKEN;
  const initData = extractInitData(request);

  if (initData && botToken) {
    const v = await validateTelegramInitData(initData, botToken);
    if (v.valid && v.user && v.user.id) {
      return {
        ok: true,
        telegramId: Number(v.user.id),
        user: v.user,
        startParam: v.startParam || null,
      };
    }
    return {
      ok: false,
      error: (v && v.error) || 'Invalid initData',
      status: 401,
    };
  }

  // небезопасный fallback только по флагу
  if (String(env.ALLOW_INSECURE_AUTH || '') === '1') {
    const auth = request.headers.get('Authorization') || '';
    const m = auth.match(/^Bearer\s+(\d+)$/i);
    if (m) {
      return {
        ok: true,
        telegramId: parseInt(m[1], 10),
        user: { id: parseInt(m[1], 10) },
        startParam: null,
        insecure: true,
      };
    }
  }

  return {
    ok: false,
    error: 'Unauthorized: need X-Telegram-Init-Data',
    status: 401,
  };
}

export function corsJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    },
  });
}
