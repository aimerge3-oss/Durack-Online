/**
 * Durack Online — Cloudflare Worker
 * Основной entry point
 */

import { Router } from 'itty-router';
import { handleAuth } from './auth.js';
import { handleMe, handleLeaderboard } from './api.js';
import { GameRoom } from './game-room.js';

const router = Router();

// CORS для Telegram Mini App и GitHub Pages
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
};

router.options('*', () => new Response(null, { headers: corsHeaders }));

// Health
router.get('/', () => new Response(JSON.stringify({
  name: 'Durack Online',
  version: '0.1.0',
  status: 'ok',
  message: 'Telegram Mini App backend ready'
}), {
  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
}));

// Авторизация через Telegram WebApp initData
router.post('/auth', handleAuth);

// Профиль текущего пользователя
router.get('/me', handleMe);

// Лидерборд (заглушка на этапе 1)
router.get('/leaderboard', handleLeaderboard);

// WebSocket upgrade для игровых комнат (Durable Object)
router.get('/ws/:roomId', async (request, env) => {
  const roomId = request.params.roomId;
  const id = env.GAME_ROOM.idFromName(roomId);
  const stub = env.GAME_ROOM.get(id);
  return stub.fetch(request);
});

// 404
router.all('*', () => new Response('Not Found', { status: 404, headers: corsHeaders }));

export default {
  async fetch(request, env, ctx) {
    try {
      const response = await router.handle(request, env, ctx);
      // Добавляем CORS ко всем ответам
      const newHeaders = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([k, v]) => newHeaders.set(k, v));
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
      });
    } catch (err) {
      console.error(err);
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Экспортируем Durable Object
export { GameRoom };
