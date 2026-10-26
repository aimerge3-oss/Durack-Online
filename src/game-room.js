/**
 * Durable Object — игровая комната
 * На этапе 1 — заглушка. Полная логика Дурака будет в Этапе 1.
 */

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.game = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      server.accept();

      const userId = url.searchParams.get('userId') || 'anon';
      const username = url.searchParams.get('username') || 'Игрок';

      this.sessions.set(server, { userId, username });

      server.addEventListener('message', (event) => {
        this.handleMessage(server, event.data);
      });

      server.addEventListener('close', () => {
        this.sessions.delete(server);
        this.broadcast({ type: 'player_left', userId, username });
      });

      server.send(JSON.stringify({
        type: 'welcome',
        message: `Добро пожаловать в комнату, ${username}!`,
        players: Array.from(this.sessions.values())
      }));

      this.broadcast({ type: 'player_joined', userId, username }, server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  handleMessage(ws, raw) {
    try {
      const data = JSON.parse(raw);
      this.broadcast({
        type: 'chat',
        from: this.sessions.get(ws)?.username || '???',
        text: data.text || raw
      });
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: e.message }));
    }
  }

  broadcast(message, exclude = null) {
    const data = JSON.stringify(message);
    for (const [ws] of this.sessions) {
      if (ws !== exclude && ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
}
