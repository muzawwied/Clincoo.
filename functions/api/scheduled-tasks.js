// Cloudflare Pages Functions - Scheduled Tasks (D1-backed)
// GET  /api/scheduled-tasks        -> list semua tugas aktif
// GET  /api/scheduled-tasks?due=1  -> hanya tugas yang jatuh tempo sekarang (matching WIB)
// POST /api/scheduled-tasks        -> { action: 'mark_run', id } tandai tugas baru saja dijalankan

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS scheduled_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    when_description TEXT,
    schedule_type TEXT DEFAULT 'daily',
    time_wib TEXT,
    interval_minutes INTEGER,
    prompt TEXT NOT NULL,
    active INTEGER DEFAULT 1,
    last_run_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

function parseDbTime(str) {
  if (!str) return null;
  const iso = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.getTime();
}

// Menit sejak tengah malam, waktu WIB (UTC+7)
function wibMinutesNow() {
  const now = new Date();
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  return (utcMinutes + 420) % 1440;
}

function isDue(task) {
  const nowMs = Date.now();
  const lastRun = parseDbTime(task.last_run_at);
  if (task.schedule_type === 'interval_minutes') {
    const intervalMs = (task.interval_minutes || 15) * 60000;
    const anchor = lastRun !== null ? lastRun : parseDbTime(task.created_at) || nowMs;
    return (nowMs - anchor) >= intervalMs;
  }
  // daily pada jam time_wib (HH:MM WIB), dengan catch-up: kalau waktunya sudah lewat
  // hari ini tapi belum dijalankan, tetap dianggap jatuh tempo.
  // Tugas baru (belum pernah jalan) di-anchor ke created_at supaya tidak
  // langsung dieksekusi begitu dibuat.
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(task.time_wib || ''));
  if (!m) return false;
  const taskMin = parseInt(m[1]) * 60 + parseInt(m[2]);
  const nowWib = wibMinutesNow();
  const minutesSinceOccurrence = (nowWib - taskMin + 1440) % 1440;
  const occurrenceMs = nowMs - minutesSinceOccurrence * 60000;
  const anchor = lastRun !== null ? lastRun : (parseDbTime(task.created_at) || nowMs);
  return anchor < occurrenceMs;
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  try {
    await ensureTable(db);
    const url = new URL(request.url);
    const dueOnly = url.searchParams.get('due') === '1';
    const rows = await db.prepare('SELECT * FROM scheduled_tasks WHERE active = 1 ORDER BY id ASC').all();
    const tasks = rows.results || [];
    const result = dueOnly ? tasks.filter(isDue) : tasks;
    return new Response(JSON.stringify({ tasks: result, due_tasks: dueOnly ? result : undefined }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  try {
    const body = await request.json();
    if (body.action === 'mark_run' && body.id) {
      await ensureTable(db);
      await db.prepare('UPDATE scheduled_tasks SET last_run_at = datetime(\'now\') WHERE id = ?').bind(body.id).run();
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
    return new Response(JSON.stringify({ error: 'action tidak dikenal' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
