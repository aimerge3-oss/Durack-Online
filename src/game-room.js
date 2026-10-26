/**
 * Durable Object — игровая комната + Дурак
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
  }

  async fetch(request) {
    const url = new URL(request.url);

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
        this.send(server, {
          type: 'state',
          state: this.publicStateFor(userId),
        });
      }

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  listPlayers() {
    return Array.from(this.sessions.values()).map((p) => ({
      userId: p.userId,
      name: p.name,
    }));
  }

  send(ws, msg) {
    try {
      if (ws.readyState === 1) ws.send(JSON.stringify(msg));
    } catch (_) {}
  }

  broadcast(msg, exclude = null) {
    const data = JSON.stringify(msg);
    for (const [ws] of this.sessions) {
      if (ws !== exclude && ws.readyState === 1) {
        try {
          ws.send(data);
        } catch (_) {}
      }
    }
  }

  broadcastState() {
    for (const [ws, info] of this.sessions) {
      this.send(ws, { type: 'state', state: this.publicStateFor(info.userId) });
    }
  }

  publicStateFor(userId) {
    if (!this.game) return null;
    const state = this.game.getPublicState(userId);
    const legal = this.game.getLegalMoves(userId);
    state.legal = {
      attacks: legal.attacks || [],
      defends: legal.defends || [],
    };
    state.turnDeadline = this.turnDeadline;
    return state;
  }

  startGame() {
    const players = this.listPlayers().slice(0, 6);
    if (players.length < 2) return;

    this.game = new DurakGame(
      players.map((p) => ({ id: p.userId, name: p.name }))
    );
    this.game.start();
    this.winsRecorded = false;
    this.turnDeadline = Date.now() + 15000;
    this.broadcast({ type: 'game_started' });
    this.broadcastState();
  }

  async recordWins() {
    if (this.winsRecorded || !this.game || !this.env.DB) return;
    this.winsRecorded = true;
    const foolId = this.game.foolId;
    const winners = (this.game.winnerIds || []).filter((id) => id !== foolId);
    // все кроме дурака — +1 победа
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

    if (data.type === 'start_game') {
      if (!this.game && this.sessions.size >= 2) this.startGame();
      return;
    }

    if (data.type === 'join') {
      info.name = data.name || info.name;
      if (data.userId) info.userId = String(data.userId);
      this.broadcast({
        type: 'player_joined',
        userId: info.userId,
        name: info.name,
        players: this.listPlayers(),
      });
      if (this.sessions.size >= 2 && !this.game) this.startGame();
      else if (this.game) {
        this.send(ws, { type: 'state', state: this.publicStateFor(info.userId) });
      }
      return;
    }

    if (data.type === 'ping') {
      this.send(ws, { type: 'pong' });
      return;
    }

    if (!this.game) return;

    const uid = info.userId;
    let result = null;

    switch (data.type) {
      case 'attack':
        result = this.game.attack(uid, data.card);
        break;
      case 'defend':
        result = this.game.defend(uid, data.attackIndex, data.card);
        break;
      case 'take':
        result = this.game.take(uid);
        break;
      case 'bito':
        result = this.game.bito(uid);
        break;
      case 'pass':
        result = this.game.pass(uid);
        break;
      default:
        return;
    }

    if (!result || !result.ok) {
      this.send(ws, {
        type: 'error',
        message: (result && result.error) || 'Invalid move',
      });
      return;
    }

    this.turnDeadline = Date.now() + 15000;
    this.broadcastState();

    if (this.game.phase === 'finished') {
      await this.recordWins();
      this.broadcast({
        type: 'game_over',
        foolId: this.game.foolId,
        winners: this.game.winnerIds,
      });
    }
  }
}
