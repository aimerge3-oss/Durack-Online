/**
 * /health — проверка Worker + D1
 */

export async function handleHealth(request, env) {
  const start = Date.now();
  const checks = { worker: true, db: false, version: '0.6.2' };

  try {
    if (env.DB) {
      await env.DB.prepare('SELECT 1 AS ok').first();
      checks.db = true;
    }
  } catch (e) {
    checks.db = false;
    checks.dbError = e.message;
    console.error('health db fail', e.message);
  }

  const ok = checks.worker && checks.db;
  return new Response(
    JSON.stringify({
      ok,
      status: ok ? 'healthy' : 'degraded',
      checks,
      latencyMs: Date.now() - start,
      ts: new Date().toISOString(),
    }),
    {
      status: ok ? 200 : 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    }
  );
}
