/**
 * Durable Object — игровая комната + Дурак
 * stateSeq для синхрона стола (клиент игнорирует устаревшие state)
 */

import { DurakGame } from './durak.js';

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.game = null;
    this.turnDeadline = 0;
    this.winsRecorded = false;
    this.roomId = null;
    this.stateSeq = 0;
  }

  async fetch(request) {
    const url = new URL(request.url);
    try {
      const parts = url.pathname.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last && last !== 'ws') this.roomId = decodeURIComponent(last);
    } catch (e) {}

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();

      const userId =
        url.searchParams.get('userId') ||
        'anon_' + Math.random().toString(36).slice(2, 8);
      const username = url.searchParams.get('username') || 'Игрок';

      for (const [ws, info] of this.sessions) {
        if (info.userId === userId) {
          try {
            ws.close(1000, 'replaced');
          } catch (_) {}
          this.sessions.delete(ws);
        }
      }

      this.sessions.set(server, {
        userId,
        name: decodeURIComponent(username),
      });

      server.addEventListener('message', (event) => {
        this.onMessage(server, event.data).catch((e) => {
          console.error(e);
          this.send(server, { type: 'error', message: e.message });
        });
      });

      server.addEventListener('close', () => {
        const info = this.sessions.get(server);
        this.sessions.delete(server);
        if (info) {
          this.broadcast({
            type: 'player_left',
            userId: info.userId,
            name: info.name,
            players: this.listPlayers(),
          });
        }
      });

      this.send(server, {
        type: 'welcome',
        userId,
        players: this.listPlayers(),
        stateSeq: this.stateSeq,
      });
      this.broadcast(
        {
          type: 'player_joined',
          userId,
          name: decodeURIComponent(username),
          players: this.listPlayers(),
        },
        server
      );

      if (this.sessions.size >= 2 && !this.game) {
        this.startGame();
      } else if (this.game) {
        this.send(server, { type: 'state', state: this.publicState(userId) });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('GameRoom', { status: 200 });
  }

  listPlayers() {
    const out = [];
    for (const info of this.sessions.values()) {
      out.push({ userId: info.userId, name: info.name });
    }
    return out;
  }

  send(ws, msg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch (e) {}
  }

  broadcast(msg, except) {
    const raw = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
      if (ws === except) continue;
      try {
        ws.send(raw);
      } catch (e) {}
    }
  }

  broadcastState() {
    this.stateSeq += 1;
    for (const [ws, info] of this.sessions) {
      this.send(ws, { type: 'state', state: this.publicState(info.userId) });
    }
  }

  publicState(forUserId) {
    if (!this.game) return null;
    const st = this.game.getPublicState(forUserId);
    st.turnDeadline = this.turnDeadline;
    st.legal = this.game.getLegalMoves(forUserId);
    st.stateSeq = this.stateSeq;
    st.serverNow = Date.now();
    if (this.game.phase === 'finished') {
      st.phase = 'finished';
      st.foolId = this.game.foolId;
      st.winners = this.game.winnerIds;
      this.recordWins().catch(() => {});
    }
    return st;
  }

  startGame() {
    const players = this.listPlayers();
    if (players.length < 2) return;
    this.game = new DurakGame(
      players.map((p) => ({ id: p.userId, name: p.name }))
    );
    this.game.start();
    this.winsRecorded = false;
    this.turnDeadline = Date.now() + 20000;
    this.stateSeq = 0;
    this.broadcast({ type: 'game_started' });
    this.broadcastState();
  }

  async recordWins() {
    if (this.winsRecorded || !this.game || !this.env.DB) return;
    this.winsRecorded = true;
    const foolId = this.game.foolId;
    const players = this.listPlayers();
    for (const p of players) {
      if (String(p.userId) === String(foolId)) continue;
      if (String(p.userId).startsWith('anon_') || String(p.userId).startsWith('guest_')) continue;
      const tid = parseInt(p.userId, 10);
      if (!tid) continue;
      try {
        await this.env.DB.prepare(
          'UPDATE users SET wins_random = wins_random + 1, coins = coins + 25, updated_at = CURRENT_TIMESTAMP WHERE telegram_id = ?'
        )
          .bind(tid)
          .run();
        if (this.roomId && String(this.roomId).startsWith('tour_')) {
          const code = String(this.roomId).slice(5).toUpperCase();
          await this.env.DB.prepare(
            `UPDATE tournament_players SET score = COALESCE(score,0) + 1
             WHERE telegram_id = ? AND tournament_id = (
               SELECT id FROM tournaments WHERE code = ? LIMIT 1
             )`
          )
            .bind(tid, code)
            .run();
        }
      } catch (e) {
        console.error('win record', e);
      }
    }
  }

  async onMessage(ws, raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }

    const info = this.sessions.get(ws);
    if (!info) return;
    const userId = info.userId;

    if (data.type === 'join') {
      if (data.name) info.name = data.name;
      if (this.sessions.size >= 2 && !this.game) this.startGame();
      this.broadcastState();
      return;
    }

    if (data.type === 'ping') {
      this.send(ws, { type: 'pong', t: Date.now(), stateSeq: this.stateSeq });
      return;
    }

    if (data.type === 'sticker') {
      this.broadcast({
        type: 'sticker',
        emoji: data.emoji || '🃏',
        name: data.name || '',
        fromName: data.fromName || info.name || 'Игрок',
        fromId: userId,
        stickerId: data.stickerId || null,
      });
      return;
    }

    if (!this.game) {
      this.send(ws, { type: 'error', message: 'Ожидание игроков' });
      return;
    }

    if (this.game.phase === 'finished') {
      this.send(ws, { type: 'state', state: this.publicState(userId) });
      return;
    }

    let res = { ok: false, error: 'unknown' };
    try {
      if (data.type === 'attack' && data.card) {
        res = this.game.attack(userId, data.card);
      } else if (data.type === 'defend' && data.card) {
        res = this.game.defend(userId, data.attackIndex, data.card);
      } else if (data.type === 'take') {
        res = this.game.take(userId);
      } else if (data.type === 'bito' || data.type === 'pass') {
        res = this.game.bito(userId);
      } else if (data.type === 'forfeit') {
        this.game.phase = 'finished';
        this.game.foolId = userId;
        res = { ok: true };
      } else if (data.type === 'sync') {
        this.send(ws, { type: 'state', state: this.publicState(userId) });
        return;
      }
    } catch (e) {
      res = { ok: false, error: e.message };
    }

    if (!res.ok) {
      this.send(ws, { type: 'error', message: res.error || 'error' });
      // всё равно отдаём актуальный state — синхрон
      this.send(ws, { type: 'state', state: this.publicState(userId) });
      return;
    }

    this.turnDeadline = Date.now() + 20000;
    this.broadcastState();
  }
}
