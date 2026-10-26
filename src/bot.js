/**
 * Telegram Bot — /start + реферальный start param
 */

const MINI_APP_URL = 'https://aimerge3-oss.github.io/Durack-Online/index.html';

async function sendMessage(token, chatId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function handleTelegramWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return new Response('No bot token', { status: 500 });

  let update;
  try {
    update = await request.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const message = update.message || update.edited_message;
  if (!message || !message.chat) return new Response('OK');

  const chatId = message.chat.id;
  const text = (message.text || '').trim();
  const firstName = message.from?.first_name || 'игрок';

  if (text === '/start' || text.startsWith('/start ')) {
    const parts = text.split(/\s+/);
    const ref = parts[1] ? `?tgWebAppStartParam=${encodeURIComponent(parts[1])}` : '';

    const welcome =
      `Привет, <b>${escapeHtml(firstName)}</b>! 🃏\n\n` +
      `Добро пожаловать в <b>Дурак Онлайн</b>.\n` +
      `Классический дурак прямо в Telegram.\n\n` +
      `Пригласи друза — получи <b>+500 монет</b>!\n\n` +
      `Нажми кнопку ниже, чтобы начать.`;

    await sendMessage(token, chatId, welcome, {
      inline_keyboard: [
        [{ text: '🂮 Играть', web_app: { url: MINI_APP_URL + ref } }],
        [{ text: '🏆 Доска почёта', web_app: { url: MINI_APP_URL } }],
      ],
    });
  }

  return new Response('OK');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function handleSetWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return new Response(JSON.stringify({ error: 'No TELEGRAM_BOT_TOKEN' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const workerUrl = new URL(request.url);
  const webhookUrl = `${workerUrl.origin}/telegram`;

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ['message'],
      drop_pending_updates: true,
    }),
  });

  const data = await res.json();
  return new Response(JSON.stringify({ webhookUrl, result: data }, null, 2), {
    headers: { 'Content-Type': 'application/json' },
  });
}
