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
  handleAdminAddPlayer,
  handleTournamentDetail,
  createAutoTournament,
} from './admin.js';
import { handleAdminMe, handleAdminStats, handleAdminGrantCoins } from './admin-extra.js';
import { handleProfile, handlePublicProfile } from './profile.js';
import { handleSubCheck } from './sub.js';
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
        return json({ name: 'Durack Online', version: '0.6.1', status: 'ok' });
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
      if (path === '/sub-check' && request.method === 'GET') {
        return handleSubCheck(request, env);
      }
      if (path === '/profile' && request.method === 'GET') {
        return handleProfile(request, env);
      }
      if (path.startsWith('/profile/') && request.method === 'GET') {
        return handlePublicProfile(request, env, path.slice('/profile/'.length));
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

      if (path === '/quests' && request.method === 'GET') {
        return handleQuestsList(request, env);
      }
      if (path === '/quests/event' && request.method === 'POST') {
        return handleQuestEvent(request, env);
      }
      if (path === '/quests/claim' && request.method === 'POST') {
        return handleQuestClaim(request, env);
      }

      if (path === '/tournaments' && request.method === 'GET') {
        return handleTournamentsList(request, env);
      }
      if (path.startsWith('/tournament/') && path !== '/tournament/join' && request.method === 'GET') {
        const code = path.slice('/tournament/'.length);
        return handleTournamentDetail(request, env, code);
      }
      if (path === '/tournament/join' && request.method === 'POST') {
        return handleTournamentJoin(request, env);
      }

      // Admin
      if (path === '/admin/me' && request.method === 'GET') {
        // HMAC-aware check; fallback to legacy
        try {
          return await handleAdminMe(request, env);
        } catch (e) {
          return handleAdminCheck(request, env);
        }
      }
      if (path === '/admin/stats' && request.method === 'GET') {
        return handleAdminStats(request, env);
      }
      if (path === '/admin/coins' && request.method === 'POST') {
        return handleAdminGrantCoins(request, env);
      }
      if (path === '/admin/tournament' && request.method === 'POST') {
        return handleAdminCreateTournament(request, env);
      }
      if (path === '/admin/tournament/close' && request.method === 'POST') {
        return handleAdminCloseTournament(request, env);
      }
      if (path === '/admin/tournament/add' && request.method === 'POST') {
        return handleAdminAddPlayer(request, env);
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

  async scheduled(event, env, ctx) {
    try {
      const res = await createAutoTournament(env);
      console.log('auto tournament', res);
    } catch (e) {
      console.error('cron tournament', e);
    }
  },
};

export { GameRoom };
