/**
 * Durack Online — Cloudflare Worker v0.6.2
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
import { rateLimit, clientKey, LIMITS } from './rate-limit.js';
import {
  handleMatchJoin,
  handleMatchStatus,
  handleMatchLeave,
  cleanupMatchQueue,
} from './matchmaking.js';
import { handleHealth } from './health.js';
import { requireTelegramUser } from './telegram-auth.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Init-Data',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

async function withRateLimit(request, env, name, cfg, telegramId) {
  const key = name + ':' + clientKey(request, telegramId);
  const rl = await rateLimit(env, key, cfg.limit, cfg.window);
  if (!rl.ok) {
    return json(
      { error: 'Too many requests', retryAfter: rl.retryAfter },
      429,
      { 'Retry-After': String(rl.retryAfter || 60) }
    );
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/health' && request.method === 'GET') {
        return handleHealth(request, env);
      }

      if (path === '/' && request.method === 'GET') {
        return json({ name: 'Durack Online', version: '0.6.2', status: 'ok' });
      }

      if (path === '/telegram' && request.method === 'POST') {
        return handleTelegramWebhook(request, env);
      }
      if (path === '/set-webhook' && request.method === 'GET') {
        return handleSetWebhook(request, env);
      }

      // ---- AUTH (rate limited) ----
      if (path === '/auth' && request.method === 'POST') {
        const blocked = await withRateLimit(request, env, 'auth', LIMITS.auth, null);
        if (blocked) return blocked;
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

      // ---- SHOP ----
      if (path === '/shop' && request.method === 'GET') {
        return handleShop(request, env);
      }
      if (path === '/shop/buy' && request.method === 'POST') {
        let tid = null;
        try {
          const a = await requireTelegramUser(request, env);
          if (a.ok) tid = a.telegramId;
        } catch (e) {}
        const blocked = await withRateLimit(request, env, 'buy', LIMITS.shopBuy, tid);
        if (blocked) return blocked;
        return handleBuy(request, env);
      }

      // ---- QUESTS ----
      if (path === '/quests' && request.method === 'GET') {
        let tid = null;
        try {
          const a = await requireTelegramUser(request, env);
          if (a.ok) tid = a.telegramId;
        } catch (e) {}
        const blocked = await withRateLimit(request, env, 'quests', LIMITS.quests, tid);
        if (blocked) return blocked;
        return handleQuestsList(request, env);
      }
      if (path === '/quests/event' && request.method === 'POST') {
        let tid = null;
        try {
          const a = await requireTelegramUser(request, env);
          if (a.ok) tid = a.telegramId;
        } catch (e) {}
        const blocked = await withRateLimit(request, env, 'qevent', LIMITS.quests, tid);
        if (blocked) return blocked;
        return handleQuestEvent(request, env);
      }
      if (path === '/quests/claim' && request.method === 'POST') {
        let tid = null;
        try {
          const a = await requireTelegramUser(request, env);
          if (a.ok) tid = a.telegramId;
        } catch (e) {}
        const blocked = await withRateLimit(request, env, 'qclaim', LIMITS.shopBuy, tid);
        if (blocked) return blocked;
        return handleQuestClaim(request, env);
      }

      // ---- MATCHMAKING QUEUE ----
      if (path === '/matchmaking/join' && request.method === 'POST') {
        return handleMatchJoin(request, env);
      }
      if (path === '/matchmaking/status' && request.method === 'GET') {
        return handleMatchStatus(request, env);
      }
      if (path === '/matchmaking/leave' && request.method === 'POST') {
        return handleMatchLeave(request, env);
      }

      if (path === '/tournaments' && request.method === 'GET') {
        return handleTournamentsList(request, env);
      }
      if (path.startsWith('/tournament/') && path !== '/tournament/join' && request.method === 'GET') {
        return handleTournamentDetail(request, env, path.slice('/tournament/'.length));
      }
      if (path === '/tournament/join' && request.method === 'POST') {
        return handleTournamentJoin(request, env);
      }

      if (path === '/admin/me' && request.method === 'GET') {
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
      console.error('Worker error', path, err && err.stack ? err.stack : err);
      return json({ error: err.message || 'Internal error', path }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    try {
      await cleanupMatchQueue(env);
    } catch (e) {
      console.error('cleanup queue', e);
    }
    try {
      const res = await createAutoTournament(env);
      console.log('auto tournament', res);
    } catch (e) {
      console.error('cron tournament', e);
    }
  },
};

export { GameRoom };
