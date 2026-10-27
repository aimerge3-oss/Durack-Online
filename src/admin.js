/**
 * Турниры: авто каждые 6–12 ч, приз 20, длительность 15–20 мин
 * Крупные — только админ
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

const AUTO_PRIZE = 20;
const AUTO_DURATION_MIN = 18; // 15–20 мин
const AUTO_MAX_PLAYERS = 8;

function getTelegramId(request) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(\d+)$/i);
  return m ? parseInt(m[1], 10) : null;
}

function isAdmin(env, telegramId) {
  if (!telegramId) return false;
  const raw = env.ADMIN_IDS || '';
  const ids = String(raw)
    .split(/[,\s]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => !isNaN(n));
  return ids.includes(telegramId);
}

async function ensureTables(env) {
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT,
      status TEXT DEFAULT 'open',
      max_players INTEGER DEFAULT 8,
      created_by INTEGER,
      prize INTEGER DEFAULT 20,
      is_auto INTEGER DEFAULT 0,
      ends_at DATETIME,
      winner_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
  try {
    await env.DB.prepare('ALTER TABLE tournaments ADD COLUMN is_auto INTEGER DEFAULT 0').run();
  } catch (e) {}
  try {
    await env.DB.prepare('ALTER TABLE tournaments ADD COLUMN ends_at DATETIME').run();
  } catch (e) {}
  try {
    await env.DB.prepare('ALTER TABLE tournaments ADD COLUMN winner_id INTEGER').run();
  } catch (e) {}
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS tournament_players (
      tournament_id INTEGER NOT NULL,
      telegram_id INTEGER NOT NULL,
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tournament_id, telegram_id)
    )
  `).run();
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'T';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function endsAtIso(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString();
}

/** Закрыть просроченные + выдать приз случайному участнику (упрощённо) */
async function finalizeExpired(env) {
  const now = new Date().toISOString();
  const expired = await env.DB.prepare(
    `SELECT * FROM tournaments WHERE status IN ('open','running') AND ends_at IS NOT NULL AND ends_at < ?`
  )
    .bind(now)
    .all();

  for (const t of expired.results || []) {
    const players = await env.DB.prepare(
      'SELECT telegram_id FROM tournament_players WHERE tournament_id = ?'
    )
      .bind(t.id)
      .all();
    const list = players.results || [];
    let winnerId = null;
    if (list.length > 0) {
      winnerId = list[Math.floor(Math.random() * list.length)].telegram_id;
      const prize = t.prize || AUTO_PRIZE;
      await env.DB.prepare('UPDATE users SET coins = coins + ? WHERE telegram_id = ?')
        .bind(prize, winnerId)
        .run();
    }
    await env.DB.prepare(
      `UPDATE tournaments SET status = 'finished', winner_id = ? WHERE id = ?`
    )
      .bind(winnerId, t.id)
      .run();
  }
}

/** Создать авто-турнир если нет активного */
export async function createAutoTournament(env) {
  await ensureTables(env);
  await finalizeExpired(env);

  const active = await env.DB.prepare(
    `SELECT id FROM tournaments WHERE is_auto = 1 AND status IN ('open','running') LIMIT 1`
  ).first();
  if (active) return { skipped: true, reason: 'already_active' };

  const code = randomCode();
  const ends = endsAtIso(AUTO_DURATION_MIN);
  await env.DB.prepare(
    `INSERT INTO tournaments (code, title, status, max_players, created_by, prize, is_auto, ends_at)
     VALUES (?, ?, 'open', ?, 0, ?, 1, ?)`
  )
    .bind(code, 'Авто-турнир', AUTO_MAX_PLAYERS, AUTO_PRIZE, ends)
    .run();

  return { ok: true, code, ends_at: ends, prize: AUTO_PRIZE };
}

export async function handleTournamentsList(request, env) {
  try {
    await ensureTables(env);
    await finalizeExpired(env);

    const rows = await env.DB.prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) as players
       FROM tournaments t
       WHERE t.status IN ('open', 'running')
       ORDER BY t.created_at DESC LIMIT 15`
    ).all();

    return new Response(
      JSON.stringify({ ok: true, tournaments: rows.results || [] }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ ok: true, tournaments: [], warn: err.message }), {
      headers: cors,
    });
  }
}

export async function handleAdminCreateTournament(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!isAdmin(env, telegramId)) {
      return new Response(JSON.stringify({ error: 'Forbidden: not admin' }), {
        status: 403,
        headers: cors,
      });
    }

    const body = await request.json().catch(() => ({}));
    const title = body.title || 'Турнир';
    const maxPlayers = Math.min(32, Math.max(2, parseInt(body.maxPlayers, 10) || 16));
    const prize = Math.min(5000, Math.max(20, parseInt(body.prize, 10) || 100));
    const durationMin = Math.min(120, Math.max(15, parseInt(body.durationMin, 10) || 20));
    const code = body.code || randomCode();
    const ends = endsAtIso(durationMin);

    await env.DB.prepare(
      `INSERT INTO tournaments (code, title, status, max_players, created_by, prize, is_auto, ends_at)
       VALUES (?, ?, 'open', ?, ?, ?, 0, ?)`
    )
      .bind(code, title, maxPlayers, telegramId, prize, ends)
      .run();

    const t = await env.DB.prepare('SELECT * FROM tournaments WHERE code = ?').bind(code).first();
    return new Response(JSON.stringify({ ok: true, tournament: t }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function handleAdminCloseTournament(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!isAdmin(env, telegramId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    const body = await request.json();
    await env.DB.prepare(`UPDATE tournaments SET status = 'finished' WHERE code = ?`)
      .bind(body.code)
      .run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

/** Админ добавляет участника { code, telegramId } */
export async function handleAdminAddPlayer(request, env) {
  try {
    await ensureTables(env);
    const adminId = getTelegramId(request);
    if (!isAdmin(env, adminId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const tid = parseInt(body.telegramId, 10);
    if (!code || !tid) {
      return new Response(JSON.stringify({ error: 'code and telegramId required' }), {
        status: 400,
        headers: cors,
      });
    }
    const t = await env.DB.prepare('SELECT * FROM tournaments WHERE code = ?').bind(code).first();
    if (!t || t.status === 'finished') {
      return new Response(JSON.stringify({ error: 'Турнир недоступен' }), {
        status: 400,
        headers: cors,
      });
    }
    await env.DB.prepare(
      'INSERT OR IGNORE INTO tournament_players (tournament_id, telegram_id) VALUES (?, ?)'
    )
      .bind(t.id, tid)
      .run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function handleTournamentJoin(request, env) {
  try {
    await ensureTables(env);
    await finalizeExpired(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const t = await env.DB.prepare('SELECT * FROM tournaments WHERE code = ?').bind(code).first();
    if (!t || !['open', 'running'].includes(t.status)) {
      return new Response(JSON.stringify({ error: 'Турнир недоступен' }), {
        status: 400,
        headers: cors,
      });
    }
    if (t.ends_at && new Date(t.ends_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'Турнир закончен' }), {
        status: 400,
        headers: cors,
      });
    }

    const count = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tournament_players WHERE tournament_id = ?'
    )
      .bind(t.id)
      .first();

    if ((count.c || 0) >= t.max_players) {
      return new Response(JSON.stringify({ error: 'Мест нет' }), { status: 400, headers: cors });
    }

    await env.DB.prepare(
      'INSERT OR IGNORE INTO tournament_players (tournament_id, telegram_id) VALUES (?, ?)'
    )
      .bind(t.id, telegramId)
      .run();

    if (t.status === 'open') {
      await env.DB.prepare(`UPDATE tournaments SET status = 'running' WHERE id = ?`).bind(t.id).run();
    }

    const players = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tournament_players WHERE tournament_id = ?'
    )
      .bind(t.id)
      .first();

    return new Response(
      JSON.stringify({
        ok: true,
        roomId: 'tour_' + code,
        players: players.c,
        maxPlayers: t.max_players,
        prize: t.prize,
        ends_at: t.ends_at,
      }),
      { headers: cors }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

export async function handleAdminCheck(request, env) {
  const telegramId = getTelegramId(request);
  return new Response(
    JSON.stringify({ ok: true, isAdmin: isAdmin(env, telegramId) }),
    { headers: cors }
  );
}

export { AUTO_PRIZE, AUTO_DURATION_MIN };
