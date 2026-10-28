/**
 * Durable Object: игровая комната + WebSocket
 */

// Минимальная копия движка на сервере — используем тот же код через import
import { DurakGame } from './durak-server.js';

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> { userId, name }
    this.game = null;
    this.turnDeadline = 0;
    this.roomId = null;
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      await this.handleSession(server, url);
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response('GameRoom OK', { status: 200 });
  }

  async handleSession(server, url) {
    server.accept();
    const userId = url.searchParams.get('userId') || 'anon_' + Math.random().toString(36).slice(2, 8);
    const username = decodeURIComponent(url.searchParams.get('username') || 'Игрок');
    this.roomId = url.pathname;

    this.sessions.set(server, { userId, name: username });

    server.addEventListener('message', async (event) => {
      try {
        await this.onMessage(server, event.data);
      } catch (e) {
        this.send(server, { type: 'error', message: e.message });
      }
    });

    server.addEventListener('close', () => {
      this.sessions.delete(server);
      this.broadcast({
        type: 'player_left',
        userId,
        players: this.playerList(),
      });
    });

    this.send(server, {
      type: 'welcome',
      userId,
      players: this.playerList(),
    });
    this.broadcast(
      {
        type: 'player_joined',
        userId,
        name: username,
        players: this.playerList(),
      },
      server
    );

    if (this.sessions.size >= 2 && !this.game) {
      this.startGame();
    }

    if (this.game) {
      this.send(server, { type: 'state', state: this.publicState(userId) });
    }
  }

  playerList() {
    const list = [];
    for (const info of this.sessions.values()) {
      list.push({ id: info.userId, name: info.name });
    }
    return list;
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
    for (const [ws, info] of this.sessions) {
      this.send(ws, { type: 'state', state: this.publicState(info.userId) });
    }
  }

  publicState(forUserId) {
    if (!this.game) return null;
    const st = this.game.getPublicState(forUserId);
    st.turnDeadline = this.turnDeadline;
    st.legal = this.game.getLegalMoves(forUserId);
    return st;
  }

  startGame() {
    const players = this.playerList().slice(0, 4);
    if (players.length < 2) return;
    this.game = new DurakGame(players);
    this.game.start();
    this.turnDeadline = Date.now() + 20000;
    this.broadcast({ type: 'game_started' });
    this.broadcastState();
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

    // стикеры — видно всем в комнате
    if (data.type === 'sticker') {
      this.broadcast(
        {
          type: 'sticker',
          emoji: data.emoji || '🃏',
          name: data.name || '',
          fromName: data.fromName || info.name || 'Игрок',
          fromId: userId,
          stickerId: data.stickerId || null,
        },
        null
      );
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
      }
    } catch (e) {
      res = { ok: false, error: e.message };
    }

    if (!res.ok) {
      this.send(ws, { type: 'error', message: res.error || 'error' });
      return;
    }

    this.turnDeadline = Date.now() + 20000;
    this.broadcastState();
  }
}
