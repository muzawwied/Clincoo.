// Deploy Engine — publish file workspace per proyek ke Cloudflare Pages (Direct Upload asli).
// Semua operasi wajib lolos guard kepemilikan (anti-IDOR) dan membaca file dari
// tabel per-proyek, jadi hanya pemilik akun yang bisa deploy proyeknya sendiri.
// POST /api/deploy {project_id} = deploy; action 'unpublish' = hapus situs;
// action 'add_domain'/'remove_domain' = kelola domain kustom; GET = status situs.

import { getProjectTables } from './_tables.js';
import { guardProject, currentUser } from './user-scope.js';
import { getEffectivePlan, getMonthlyDeployCount, bumpMonthlyDeployCount } from './plan-helpers.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

const API_BASE = 'https://api.cloudflare.com/client/v4';

const MIME = {
  html: 'text/html;charset=utf-8', htm: 'text/html;charset=utf-8', css: 'text/css',
  js: 'application/javascript', mjs: 'application/javascript', json: 'application/json',
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  txt: 'text/plain;charset=utf-8', md: 'text/markdown;charset=utf-8', csv: 'text/csv',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav',
  wasm: 'application/wasm', xml: 'application/xml', pdf: 'application/pdf'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

function b64(str) {
  return btoa(unescape(encodeURIComponent(String(str || ''))));
}

function slugify(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function cfFetch(path, apiKey, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body && typeof opts.body === 'string' && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (!headers['Authorization']) headers['Authorization'] = 'Bearer ' + apiKey;
  const res = await fetch(API_BASE + path, { ...opts, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { throw new Error('Cloudflare API tidak merespons'); }
  if (!data.success) {
    const first = (data.errors && data.errors[0]) || {};
    const err = new Error(first.message || ('HTTP ' + res.status));
    err.code = first.code;
    throw err;
  }
  return data.result;
}

async function getSetting(db, table, projectId, key) {
  try {
    const row = await db.prepare(`SELECT value FROM ${table} WHERE project_id = ? AND key = ?`).bind(projectId, key).first();
    return row ? row.value : null;
  } catch (e) { return null; }
}

// Integrasi Webhook aktif: kirim event deploy ke endpoint yang tersimpan di project-settings.
// Format webhook_settings: { webhooks:[{url,method}], deployEvent:'all|success|fail|none', retry:bool }
async function fireWebhooks(db, table, projectId, status, payload) {
  try {
    const raw = await getSetting(db, table, projectId, 'webhook_settings');
    if (!raw) return;
    let cfg; try { cfg = JSON.parse(raw); } catch (e) { return; }
    const evFilter = cfg.deployEvent || 'all';
    if (evFilter === 'none') return;
    if (evFilter !== 'all' && evFilter !== status) return;
    const hooks = Array.isArray(cfg.webhooks) ? cfg.webhooks.filter(h => h && h.url) : [];
    if (!hooks.length) return;
    const attempts = cfg.retry ? 2 : 1;
    await Promise.all(hooks.slice(0, 10).map(async h => {
      for (let a = 0; a < attempts; a++) {
        try {
          const method = (h.method === 'GET' || h.method === 'PUT') ? h.method : 'POST';
          await fetch(h.url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: method === 'GET' ? undefined : JSON.stringify(payload)
          });
          break; // terkirim — tidak perlu retry
        } catch (e) { /* coba lagi bila retry aktif */ }
      }
    }));
  } catch (e) { /* webhook tidak boleh membatalkan deploy */ }
}

async function setPhase(db, table, projectId, text) {
  try { await setSetting(db, table, projectId, 'deploy_phase', text || ''); } catch (e) {}
}

async function setSetting(db, table, projectId, key, value) {
  // Tabel project_settings per-proyek hanya punya kolom (project_id, key, value) —
  // JANGAN pakai updated_at/ON CONFLICT, itu membuat insert GAGAL SENYAP
  // (pages_project & last_deploy_by tidak pernah tersimpan).
  try {
    await db.prepare(`INSERT OR REPLACE INTO ${table} (project_id, key, value) VALUES (?, ?, ?)`)
      .bind(projectId, key, String(value)).run();
  } catch (e) {}
}

async function getCreds(db) {
  const keyRow = await db.prepare("SELECT value FROM user_preferences WHERE key = 'cloudflare_api_key'").first();
  const acctRow = await db.prepare("SELECT value FROM user_preferences WHERE key = 'cloudflare_account_id'").first();
  return { apiKey: keyRow ? keyRow.value : '', accountId: acctRow ? acctRow.value : '' };
}

// Nama project Pages untuk proyek ini: pakai yang tersimpan (stabil), kalau belum ada
// turunkan dari app_name (subdomain saat deploy pertama) dengan fallback ke project_id.
// Suffix unik per proyek: dua akun BERBEDA yang memakai template sama (app_name sama)
// tidak boleh berakhir di project Pages yang sama — deployment satu sama lain akan bocor
// (status + link publik saling terlihat / saling menimpa). Hash pendek project_id memastikan unik.
function projHash(projectId) {
  let h = 5381;
  const s = String(projectId || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36).padStart(5, '0').slice(-5);
}

async function resolvePagesName(db, table, projectId) {
  const stored = await getSetting(db, table, projectId, 'pages_project');
  if (stored) return stored;
  const appName = await getSetting(db, table, projectId, 'app_name');
  const slug = slugify(appName) || slugify(projectId) || 'app';
  return ('cno-be2' + slug + '-' + projHash(projectId)).slice(0, 60);
}

// Lihat project Pages tanpa membuat baru (8000007 = belum ada).
async function lookupProject(creds, name) {
  try {
    return await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name, creds.apiKey);
  } catch (e) {
    if (e.code === 8000007) return null;
    throw e;
  }
}

// Pastikan project ada; jika baru dibuat, TUNGGU sampai terpropagasi di semua
// layanan Cloudflare (upload-token dll. bisa balas "Project not found" sesaat
// setelah create — race condition nyata yang pernah membuat deploy gagal).
async function ensurePagesProject(creds, name) {
  let project = await lookupProject(creds, name);
  if (!project) {
    try {
      project = await cfFetch('/accounts/' + creds.accountId + '/pages/projects', creds.apiKey, {
        method: 'POST', body: JSON.stringify({ name, production_branch: 'main' })
      });
    } catch (e) {
      if (e.code !== 8000002) throw e; // "already exists": nama sisa hapus/limbo -> lanjut tunggu lookup
    }
    for (let i = 0; i < 12; i++) { // tunggu propagasi maks ~36 detik
      await new Promise(r => setTimeout(r, 3000));
      const check = await lookupProject(creds, name);
      if (check) { project = check; break; }
    }
  }
  return project;
}

async function readFiles(db, table, projectId) {
  try {
    const { results } = await db.prepare(`SELECT path, content FROM ${table} WHERE project_id = ?`).bind(projectId).all();
    return results || [];
  } catch (e) { return []; }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('project_id') || '';
  const deny = await guardProject(env, request, projectId);
  if (deny) return deny;
  try {
    const db = env.DB;
    const creds = await getCreds(db);
    if (!creds.apiKey) return json({ error: 'Cloudflare API key belum dikonfigurasi' }, 500);
    const T = await getProjectTables(db, projectId);
    const name = await resolvePagesName(db, T.projectSettings, projectId);
    const pagesUrl = 'https://' + name + '.pages.dev';

    let project = null;
    try { project = await lookupProject(creds, name); } catch (e) { project = null; }

    let last = null;
    let domains = [];
    if (project) {
      try {
        const deps = await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name + '/deployments?per_page=1', creds.apiKey);
        const d = (deps && deps[0]) || null;
        if (d) {
          last = {
            id: d.id,
            status: (d.latest_stage && d.latest_stage.status) || d.status || 'idle',
            url: (d.aliases && d.aliases[0]) || d.url || pagesUrl,
            created: d.created_on
          };
        }
      } catch (e) {}
      try {
        const doms = await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name + '/domains', creds.apiKey);
        domains = (doms || []).map(x => ({ name: x.name, status: x.status || 'pending' }));
      } catch (e) {}
    }

    let logs = [];
    try {
      const { results } = await db.prepare(`SELECT status, url, message, created_at FROM ${T.deployLogs} WHERE project_id = ? ORDER BY id DESC LIMIT 10`).bind(projectId).all();
      logs = results || [];
    } catch (e) {}

    const lastDeployBy = await getSetting(db, T.projectSettings, projectId, 'last_deploy_by');
    const deployPhase = await getSetting(db, T.projectSettings, projectId, 'deploy_phase');
    return json({ pages_project: name, pages_url: pagesUrl, last_deployment: last, last_deploy_by: lastDeployBy || '', domains, logs, deploy_phase: deployPhase || '', api_rev: 'uniq2' });
  } catch (err) {
    try {
      const db = env.DB;
      const T = await getProjectTables(db, projectId);
      await setPhase(db, T.projectSettings, projectId, '');
    } catch (e2) {}
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const projectId = body.project_id || '';
  const deny = await guardProject(env, request, projectId);
  if (deny) return deny;
  try {
    const db = env.DB;
    const creds = await getCreds(db);
    if (!creds.apiKey) return json({ error: 'Cloudflare API key belum dikonfigurasi' }, 500);
    const T = await getProjectTables(db, projectId);
    const name = await resolvePagesName(db, T.projectSettings, projectId);
    const pagesUrl = 'https://' + name + '.pages.dev';

    if (body.action === 'unpublish') {
      const existing = await lookupProject(creds, name);
      if (!existing) {
        await db.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message, created_at) VALUES (?, 'unpublished', '', ?, datetime('now'))`)
          .bind(projectId, 'tidak ada situs aktif').run();
        return json({ success: true, unpublished: name, note: 'Situs belum pernah dideploy — tidak ada yang perlu ditarik.' });
      }
      try {
        await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name, creds.apiKey, { method: 'DELETE' });
      } catch (e) {
        if (e.code !== 8000007) {
          await db.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message, created_at) VALUES (?, 'failed', '', ?, datetime('now'))`)
            .bind(projectId, 'unpublish gagal: ' + e.message).run();
          return json({ error: e.message }, 500);
        }
      }
      await db.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message, created_at) VALUES (?, 'unpublished', '', ?, datetime('now'))`)
        .bind(projectId, 'situs ditarik').run();
      return json({ success: true, unpublished: name });
    }

    if (body.action === 'add_domain' || body.action === 'remove_domain') {
      const domain = String(body.domain || '').trim().toLowerCase();
      if (!domain || !/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return json({ error: 'Domain tidak valid' }, 400);
      await ensurePagesProject(creds, name);
      const isAdd = body.action === 'add_domain';
      try {
        await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name + '/domains' + (isAdd ? '' : '/' + domain), creds.apiKey, {
          method: isAdd ? 'POST' : 'DELETE',
          body: isAdd ? JSON.stringify({ name: domain }) : undefined
        });
      } catch (e) {
        return json({ error: e.message }, 500);
      }
      return json({ success: true, action: body.action, domain });
    }

    // Kuota deploy per paket langganan (Starter 2x/bln, Pro 25x/bln, Bisnis tanpa batas)
    const user = await currentUser(env, request);
    const planInfo = await getEffectivePlan(db, user);
    if (planInfo.limits.deployLimit !== null && planInfo.limits.deployLimit !== undefined) {
      const used = await getMonthlyDeployCount(db, user && user.id);
      if (used >= planInfo.limits.deployLimit) {
        return json({ error: 'Kuota deploy paket ' + planInfo.plan + ' habis: maksimal ' + planInfo.limits.deployLimit + ' deploy per bulan (sudah terpakai ' + used + '). Upgrade paket di halaman Langganan untuk deploy lagi.', upgrade_needed: true, plan: planInfo.plan, limit: planInfo.limits.deployLimit, used: used }, 402);
      }
    }

    const files = await readFiles(db, T.files, projectId);
    if (!files.length) {
      return json({ error: 'Workspace proyek masih kosong — tidak ada file untuk dideploy. Buat file dulu di halaman Workspace.' }, 400);
    }

    await setPhase(db, T.projectSettings, projectId, 'Menyiapkan proyek Pages...');
    await ensurePagesProject(creds, name);
    await setSetting(db, T.projectSettings, projectId, 'pages_project', name);

    const tokenRes = await cfFetch('/accounts/' + creds.accountId + '/pages/projects/' + name + '/upload-token', creds.apiKey);
    const jwt = tokenRes.jwt;

    const assets = [];
    for (const f of files) {
      const ext = (String(f.path).split('.').pop() || '').toLowerCase();
      const value = b64(f.content);
      assets.push({
        key: (await sha256hex(value + ext)).slice(0, 32),
        value,
        ext,
        path: f.path,
        contentType: MIME[ext] || 'application/octet-stream'
      });
    }

    let missing = assets.map(a => a.key);
    try {
      const miss = await cfFetch('/pages/assets/check-missing', creds.apiKey, {
        method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: JSON.stringify({ hashes: assets.map(a => a.key) })
      });
      if (Array.isArray(miss)) missing = miss;
    } catch (e) {}

    const toUpload = assets.filter(a => missing.indexOf(a.key) > -1);
    if (toUpload.length) await setPhase(db, T.projectSettings, projectId, 'Mengunggah ' + toUpload.length + ' file (0/' + toUpload.length + ')...');
    const chunks = [];
    for (let i = 0; i < toUpload.length; i += 25) chunks.push(toUpload.slice(i, i + 25));
    let uploaded = 0;
    const CONC = 3;
    for (let i = 0; i < chunks.length; i += CONC) {
      await Promise.all(chunks.slice(i, i + CONC).map(async (chunk) => {
        const batch = chunk.map(a => ({
          key: a.key, value: a.value, metadata: { contentType: a.contentType }, base64: true
        }));
        await cfFetch('/pages/assets/upload', creds.apiKey, {
          method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: JSON.stringify(batch)
        });
        uploaded += chunk.length;
        await setPhase(db, T.projectSettings, projectId, 'Mengunggah ' + toUpload.length + ' file (' + uploaded + '/' + toUpload.length + ')...');
      }));
    }

    try {
      await cfFetch('/pages/assets/upsert-hashes', creds.apiKey, {
        method: 'POST', headers: { Authorization: 'Bearer ' + jwt }, body: JSON.stringify({ hashes: assets.map(a => a.key) })
      });
    } catch (e) {}

    await setPhase(db, T.projectSettings, projectId, 'Memproses deployment di Cloudflare...');
    const form = new FormData();
    const manifest = {};
    for (const a of assets) manifest['/' + a.path] = a.key;
    form.append('manifest', JSON.stringify(manifest));
    form.append('branch', 'main');
    const depRes = await fetch(API_BASE + '/accounts/' + creds.accountId + '/pages/projects/' + name + '/deployments', {
      method: 'POST', headers: { Authorization: 'Bearer ' + creds.apiKey }, body: form
    });
    const depData = await depRes.json().catch(() => null);
    if (!depData || !depData.success) {
      const msg = depData && depData.errors && depData.errors[0] ? depData.errors[0].message : ('HTTP ' + depRes.status);
      await db.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message, created_at) VALUES (?, 'failed', '', ?, datetime('now'))`)
        .bind(projectId, 'deploy gagal: ' + msg).run();
      await fireWebhooks(db, T.projectSettings, projectId, 'fail', {
        event: 'deploy.failed', project_id: projectId, pages_project: name, error: msg, at: new Date().toISOString()
      });
      await setPhase(db, T.projectSettings, projectId, '');
      return json({ error: 'Cloudflare menolak deployment: ' + msg }, 500);
    }
    const dep = depData.result || {};

    await db.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message, created_at) VALUES (?, 'success', ?, ?, datetime('now'))`)
      .bind(projectId, pagesUrl, 'deploy ' + files.length + ' file ke ' + name).run();
    await setPhase(db, T.projectSettings, projectId, '');
    await bumpMonthlyDeployCount(db, user && user.id);
    try { await setSetting(db, T.projectSettings, projectId, 'last_deploy_by', (user && (user.name || user.email)) || 'pengguna'); } catch (e) {}
    await fireWebhooks(db, T.projectSettings, projectId, 'success', {
      event: 'deploy.success', project_id: projectId, pages_project: name, pages_url: pagesUrl, file_count: files.length, at: new Date().toISOString()
    });

    return json({
      success: true,
      pages_project: name,
      pages_url: pagesUrl,
      deployment: {
        id: dep.id,
        url: (dep.aliases && dep.aliases[0]) || dep.url || pagesUrl,
        aliases: dep.aliases || [],
        status: (dep.latest_stage && dep.latest_stage.status) || 'idle',
        created: dep.created_on
      },
      fileCount: files.length
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}
