// Cloudflare Pages Functions — Daftar proyek PER AKUN (D1, tabel user_projects)
// GET    /api/projects            -> { projects: [...] } milik user login
// POST   /api/projects            -> { action: 'upsert'|'replace_all'|'delete'|'delete_all', ... }
// DELETE /api/projects?id=<id>    -> hapus satu proyek (tanpa id = semua milik user)
// Semua aksi wajib Bearer token (per akun, terisolasi lewat user_id).
import { currentUser } from './user-scope.js';
import { tableFor } from './_tables.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function j(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function ensureTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS user_projects (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    title TEXT DEFAULT '',
    prompt TEXT DEFAULT '',
    ai_name TEXT DEFAULT '',
    ai_desc TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT
  )`).run();
}

function rowToProject(r) {
  return {
    id: r.id,
    title: r.title || '',
    prompt: r.prompt || '',
    aiName: r.ai_name || '',
    aiDesc: r.ai_desc || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at || r.created_at
  };
}

async function upsert(db, uid, p) {
  if (!p || !p.id) return;
  await db.prepare(`INSERT INTO user_projects (id, user_id, title, prompt, ai_name, ai_desc, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET title = excluded.title, prompt = excluded.prompt,
      ai_name = excluded.ai_name, ai_desc = excluded.ai_desc, updated_at = excluded.updated_at
    WHERE user_projects.user_id = excluded.user_id`)
    .bind(String(p.id), uid, String(p.title || ''), String(p.prompt || ''),
          String(p.aiName || p.ai_name || ''), String(p.aiDesc || p.ai_desc || ''),
          String(p.updatedAt || new Date().toISOString())).run();
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return j({ error: 'D1 not bound' }, 500);
    await ensureTable(db);
    const user = await currentUser(env, request);
    if (!user) return j({ error: 'unauthorized' }, 401);
    const res = await db.prepare(
      'SELECT * FROM user_projects WHERE user_id = ? ORDER BY COALESCE(updated_at, created_at) DESC'
    ).bind(user.id).all();
    return j({ projects: (res.results || []).map(rowToProject) });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return j({ error: 'D1 not bound' }, 500);
    await ensureTable(db);
    const user = await currentUser(env, request);
    if (!user) return j({ error: 'unauthorized' }, 401);
    const body = await request.json();
    const action = body.action || 'upsert';

    if (action === 'delete') {
      if (!body.id) return j({ error: 'id required' }, 400);
      await db.prepare('DELETE FROM user_projects WHERE id = ? AND user_id = ?').bind(String(body.id), user.id).run();
      // Kaskade: hapus SEMUA data proyek (chat, file workspace, settings, env vars, log deploy)
      try {
        for (const t of ['chat_sessions', 'chat_messages', 'project_files', 'env_vars', 'project_settings', 'security_settings', 'deploy_logs']) {
          await db.prepare(`DROP TABLE IF EXISTS ${tableFor(t, String(body.id))}`).run();
        }
      } catch (e) {}
      return j({ success: true });
    }
    if (action === 'delete_all') {
      await db.prepare('DELETE FROM user_projects WHERE user_id = ?').bind(user.id).run();
      return j({ success: true });
    }
    if (action === 'replace_all') {
      const list = Array.isArray(body.projects) ? body.projects.slice(0, 500) : [];
      await db.prepare('DELETE FROM user_projects WHERE user_id = ?').bind(user.id).run();
      for (const p of list) await upsert(db, user.id, p);
      return j({ success: true, count: list.length });
    }
    // default: upsert satu proyek atau daftar
    const list = Array.isArray(body.projects) ? body.projects.slice(0, 500) : (body.project ? [body.project] : []);
    for (const p of list) await upsert(db, user.id, p);
    return j({ success: true, count: list.length });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return j({ error: 'D1 not bound' }, 500);
    await ensureTable(db);
    const user = await currentUser(env, request);
    if (!user) return j({ error: 'unauthorized' }, 401);
    const id = new URL(request.url).searchParams.get('id');
    if (id) await db.prepare('DELETE FROM user_projects WHERE id = ? AND user_id = ?').bind(id, user.id).run();
    else await db.prepare('DELETE FROM user_projects WHERE user_id = ?').bind(user.id).run();
    return j({ success: true });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}
