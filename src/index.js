/**
 * Durack Online — Cloudflare Worker
 * Без внешних зависимостей (чистый JS)
 */

import { handleAuth } from './auth.js';
import { handleMe, handleLeaderboard } from './api.js';
import { GameRoom } from './game-room.js';
import { handleTelegramWebhook, handleSetWebhook } from './bot.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      const path = url.pathname;

      // Health
      if (path === '/' && request.method === 'GET') {
        return json({
          name: 'Durack Online',
          version: '0.1.0',
          status: 'ok',
          message: 'Telegram Mini App backend ready',
        });
      }

      // Telegram webhook
      if (path === '/telegram' && request.method === 'POST') {
        return handleTelegramWebhook(request, env);
      }

      // Один раз: установить webhook
      if (path === '/set-webhook' && request.method === 'GET') {
        return handleSetWebhook(request, env);
      }

      // Auth
      if (path === '/auth' && request.method === 'POST') {
        return handleAuth(request, env);
      }

      // Me
      if (path === '/me' && request.method === 'GET') {
        return handleMe(request, env);
      }

      // Leaderboard
      if (path === '/leaderboard' && request.method === 'GET') {
        return handleLeaderboard(request, env);
      }

      // WebSocket к комнате
      if (path.startsWith('/ws/') && request.method === 'GET') {
        const roomId = path.slice(4);
        if (!roomId) return json({ error: 'roomId required' }, 400);
        const id = env.GAME_ROOM.idFromName(roomId);
        const stub = env.GAME_ROOM.get(id);
        return stub.fetch(request);
      }

      return json({ error: 'Not Found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: err.message || 'Internal error' }, 500);
    }
  },
};

export { GameRoom };
