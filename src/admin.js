/**
 * Админ: запуск турниров
 * ADMIN_IDS — через запятую telegram_id в env (vars или secret)
 */

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

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
  // если список пуст — никто не админ (безопасно)
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
      prize INTEGER DEFAULT 200,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
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

/** GET /tournaments — открытые турниры для игроков */
export async function handleTournamentsList(request, env) {
  try {
    await ensureTables(env);
    const rows = await env.DB.prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) as players
       FROM tournaments t
       WHERE t.status IN ('open', 'running')
       ORDER BY t.created_at DESC LIMIT 10`
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

/** POST /admin/tournament — создать/открыть турнир (только админ) */
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
    const maxPlayers = Math.min(16, Math.max(2, parseInt(body.maxPlayers, 10) || 8));
    const prize = Math.min(5000, Math.max(50, parseInt(body.prize, 10) || 200));
    const code = body.code || randomCode();

    await env.DB.prepare(
      `INSERT INTO tournaments (code, title, status, max_players, created_by, prize)
       VALUES (?, ?, 'open', ?, ?, ?)`
    )
      .bind(code, title, maxPlayers, telegramId, prize)
      .run();

    const t = await env.DB.prepare('SELECT * FROM tournaments WHERE code = ?').bind(code).first();

    return new Response(JSON.stringify({ ok: true, tournament: t }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

/** POST /admin/tournament/close { code } */
export async function handleAdminCloseTournament(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!isAdmin(env, telegramId)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: cors });
    }
    const body = await request.json();
    const code = body.code;
    await env.DB.prepare(`UPDATE tournaments SET status = 'finished' WHERE code = ?`)
      .bind(code)
      .run();
    return new Response(JSON.stringify({ ok: true }), { headers: cors });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: cors });
  }
}

/** POST /tournament/join { code } */
export async function handleTournamentJoin(request, env) {
  try {
    await ensureTables(env);
    const telegramId = getTelegramId(request);
    if (!telegramId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: cors });
    }

    const body = await request.json();
    const code = String(body.code || '').trim().toUpperCase();
    const t = await env.DB.prepare('SELECT * FROM tournaments WHERE code = ?').bind(code).first();
    if (!t || t.status !== 'open') {
      return new Response(JSON.stringify({ error: 'Турнир недоступен' }), {
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

    const players = await env.DB.prepare(
      'SELECT COUNT(*) as c FROM tournament_players WHERE tournament_id = ?'
    )
      .bind(t.id)
      .first();

    // комната WS: tour_<code>
    return new Response(
      JSON.stringify({
        ok: true,
        roomId: 'tour_' + code,
        players: players.c,
        maxPlayers: t.max_players,
        prize: t.prize,
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
