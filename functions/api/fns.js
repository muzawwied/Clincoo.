// Cloudflare Pages Function — /api/fns "Backend Functions" (SELF-CONTAINED)
// Fitur ala platform builder: AI (dan user) bisa MEMBUAT backend function:
// tulis kode -> tersimpan -> langsung bisa dipanggil via URL /api/fn/<nama>.
//   POST /api/fns { action: 'create'|'update'|'delete'|'list'|'invoke',
//                   name?, description?, code?, args? }
//   GET  /api/fns  -> daftar function milik user
// Kontrak kode function: badan fungsi async dengan parameter `args` (objek),
// boleh memakai `fetch` dan `JSON`, WAJIB mengembalikan nilai dengan return.
// Contoh kode: "const r = await fetch(args.url); return { ok: r.status === 200, status: r.status };"
// Fungsi milik user (user_key) — private, hanya pemilik yang bisa memanggil.
// Tool chat AI: create/list/delete/call_backend_function (dieksekusi server di chat.js).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

const NAME_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const MAX_CODE = 32 * 1024;
const MAX_RESULT = 20 * 1000; // karakter
const MAX_LIST = 200;

// ===== D1 =====
async function ensureTable(DB) {
  await DB.prepare(`CREATE TABLE IF NOT EXISTS custom_functions (
    id TEXT PRIMARY KEY,
    user_key TEXT,
    name TEXT,
    description TEXT,
    code TEXT,
    created_at TEXT,
    updated_at TEXT
  )`).run();
  await DB.prepare('CREATE INDEX IF NOT EXISTS idx_cf_user ON custom_functions (user_key, name)').run().catch(() => {});
}
async function getFn(DB, userKey, name) {
  return await DB.prepare('SELECT * FROM custom_functions WHERE user_key = ? AND name = ?').bind(userKey, name).first() || null;
}
function fnJson(row) {
  return { id: row.id, name: row.name, description: row.description || '', code_length: (row.code || '').length, url: '/api/fn/' + row.name, created_at: row.created_at, updated_at: row.updated_at };
}

// ===== Eksekusi kode function user (timeout 15 detik) =====
export async function invokeFunction(DB, userKey, name, args) {
  await ensureTable(DB);
  const row = await getFn(DB, userKey, name);
  if (!row) return { error: `Function "${name}" tidak ditemukan. Buat dulu dengan create_backend_function.` };
  let fn;
  try {
    // badan fungsi async dengan parameter args; fetch & JSON tersedia
    fn = new Function('args', 'fetch', 'JSON', '"use strict"; return (async () => {' + row.code + '})();');
  } catch (e) {
    return { error: 'Kode function tidak valid: ' + e.message };
  }
  const safeArgs = (args && typeof args === 'object' && !Array.isArray(args)) ? args : {};
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Function melebihi 15 detik (timeout)')), 15_000));
  try {
    const value = await Promise.race([fn(safeArgs, fetch, JSON), timeout]);
    let out;
    try { out = JSON.stringify(value === undefined ? null : value); }
    catch (e) { out = JSON.stringify(String(value)); }
    if (out.length > MAX_RESULT) out = out.slice(0, MAX_RESULT) + '…(dipotong)';
    return { ok: true, function: row.name, result: JSON.parse(out) };
  } catch (e) {
    return { error: 'Function error: ' + (e && e.message) };
  }
}

// ===== CRUD (dipakai endpoint ini & tool chat AI) =====
export async function createFunction(DB, userKey, name, description, code) {
  name = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  if (!NAME_RE.test(name)) return { error: 'Nama function tidak valid: huruf kecil/angka/garis tengah, 2-40 karakter. Contoh: "cek-stok".' };
  code = String(code || '');
  if (!code.trim()) return { error: 'Kode function kosong.' };
  if (code.length > MAX_CODE) return { error: 'Kode terlalu panjang (maksimal 32KB).' };
  await ensureTable(DB);
  const now = new Date().toISOString();
  const existing = await getFn(DB, userKey, name);
  if (existing) {
    await DB.prepare('UPDATE custom_functions SET description=?, code=?, updated_at=? WHERE id=?')
      .bind(String(description || ''), code, now, existing.id).run();
    return { ok: true, updated: true, name, url: '/api/fn/' + name };
  }
  const id = 'fn_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  await DB.prepare('INSERT INTO custom_functions (id, user_key, name, description, code, created_at, updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind(id, userKey, name, String(description || ''), code, now, now).run();
  return { ok: true, created: true, name, url: '/api/fn/' + name };
}
export async function listFunctions(DB, userKey) {
  await ensureTable(DB);
  const { results } = await DB.prepare('SELECT * FROM custom_functions WHERE user_key = ? ORDER BY updated_at DESC LIMIT ?').bind(userKey, MAX_LIST).all();
  return { ok: true, functions: (results || []).map(fnJson) };
}
export async function deleteFunction(DB, userKey, name) {
  await ensureTable(DB);
  const row = await getFn(DB, userKey, name);
  if (!row) return { error: `Function "${name}" tidak ditemukan.` };
  await DB.prepare('DELETE FROM custom_functions WHERE id = ?').bind(row.id).run();
  return { ok: true, deleted: name };
}

// ===== HTTP handler =====
async function resolveUser(env, request) {
  try {
    const { initTables, getUserByToken, getToken } = await import('./auth/shared.js');
    await initTables(env.DB);
    const token = getToken(request);
    if (!token) return null;
    const u = await getUserByToken(env.DB, token);
    if (u) return { key: 'u' + u.id };
  } catch (e) {}
  return null;
}
function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestGet({ request, env }) {
  const user = await resolveUser(env, request);
  if (!user) return json({ error: 'Login diperlukan', need_login: true }, 401);
  try { return json(await listFunctions(env.DB, user.key)); }
  catch (e) { return json({ error: 'Server error: ' + e.message }, 500); }
}

export async function onRequestPost({ request, env }) {
  const user = await resolveUser(env, request);
  if (!user) return json({ error: 'Login diperlukan', need_login: true }, 401);
  let body = null;
  try { body = await request.json(); } catch (e) { return json({ error: 'Body JSON tidak valid' }, 400); }
  const action = body?.action || '';
  try {
    if (action === 'create' || action === 'update') return json(await createFunction(env.DB, user.key, body.name, body.description, body.code));
    if (action === 'list') return json(await listFunctions(env.DB, user.key));
    if (action === 'delete') return json(await deleteFunction(env.DB, user.key, body.name));
    if (action === 'invoke') return json(await invokeFunction(env.DB, user.key, body.name, body.args));
    return json({ error: 'Action tidak dikenal: create|update|list|delete|invoke' }, 400);
  } catch (e) {
    return json({ error: 'Server error: ' + e.message }, 500);
  }
}
