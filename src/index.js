/**
 * Durack Online — Cloudflare Worker
 */

import { handleAuth } from './auth.js';
import { handleMe, handleLeaderboard, handleOnline, handlePresence } from './api.js';
import { handleShop, handleBuy } from './shop.js';
import { handleQuestsList, handleQuestEvent, handleQuestClaim } from './quests.js';
import {
  handleTournamentsList,
  handleAdminCreateTournament,
  handleAdminCloseTournament,
  handleTournamentJoin,
  handleAdminCheck,
} from './admin.js';
import { handleProfile } from './profile.js';
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

      if (path === '/' && request.method === 'GET') {
        return json({ name: 'Durack Online', version: '0.4.0', status: 'ok' });
      }

      if (path === '/telegram' && request.method === 'POST') {
        return handleTelegramWebhook(request, env);
      }
      if (path === '/set-webhook' && request.method === 'GET') {
        return handleSetWebhook(request, env);
      }
      if (path === '/auth' && request.method === 'POST') {
        return handleAuth(request, env);
      }
      if (path === '/me' && request.method === 'GET') {
        return handleMe(request, env);
      }
      if (path === '/profile' && request.method === 'GET') {
        return handleProfile(request, env);
      }
      if (path === '/leaderboard' && request.method === 'GET') {
        return handleLeaderboard(request, env);
      }
      if (path === '/online' && request.method === 'GET') {
        return handleOnline(request, env);
      }
      if (path === '/presence' && request.method === 'POST') {
        return handlePresence(request, env);
      }
      if (path === '/shop' && request.method === 'GET') {
        return handleShop(request, env);
      }
      if (path === '/shop/buy' && request.method === 'POST') {
        return handleBuy(request, env);
      }

      // quests
      if (path === '/quests' && request.method === 'GET') {
        return handleQuestsList(request, env);
      }
      if (path === '/quests/event' && request.method === 'POST') {
        return handleQuestEvent(request, env);
      }
      if (path === '/quests/claim' && request.method === 'POST') {
        return handleQuestClaim(request, env);
      }

      // tournaments
      if (path === '/tournaments' && request.method === 'GET') {
        return handleTournamentsList(request, env);
      }
      if (path === '/tournament/join' && request.method === 'POST') {
        return handleTournamentJoin(request, env);
      }
      if (path === '/admin/me' && request.method === 'GET') {
        return handleAdminCheck(request, env);
      }
      if (path === '/admin/tournament' && request.method === 'POST') {
        return handleAdminCreateTournament(request, env);
      }
      if (path === '/admin/tournament/close' && request.method === 'POST') {
        return handleAdminCloseTournament(request, env);
      }

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
