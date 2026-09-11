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
  // Subdomain pendek (maks 9 karakter): cno-<hash5> — unik per project, isolasi antar akun tetap terjaga.
  return 'cno-' + projHash(projectId);
}

// Halaman gerbang password — disuntik ke deploy saat visibilitas = Dilindungi Password.
const GATE_PAGE_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Akses Terlindungi</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; color: #fff; }
  body.light { background: #fafafa; color: #111; }
  .card { width: 100%; max-width: 380px; padding: 40px 32px; text-align: center; }
  .lock { width: 48px; height: 48px; margin: 0 auto 20px; border-radius: 12px; background: rgba(255,255,255,.08); display: flex; align-items: center; justify-content: center; }
  body.light .lock { background: rgba(0,0,0,.05); }
  h1 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  p { font-size: 14px; opacity: .6; margin-bottom: 24px; }
  input { width: 100%; padding: 12px 16px; font-size: 15px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: transparent; color: inherit; outline: none; text-align: center; margin-bottom: 12px; }
  body.light input { border-color: rgba(0,0,0,.15); }
  input:focus { border-color: #3b82f6; }
  button { width: 100%; padding: 12px; font-size: 15px; font-weight: 600; background: #fff; color: #111; border: 0; border-radius: 10px; cursor: pointer; }
  body.light button { background: #111; color: #fff; }
  button:disabled { opacity: .5; cursor: wait; }
  .err { color: #ef4444; font-size: 13px; margin-top: 12px; min-height: 18px; }
</style>
</head>
<body>
<div class="card">
  <div class="lock"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>
  <h1>Situs ini terlindungi</h1>
  <p>Masukkan password untuk melanjutkan</p>
  <form id="f"><input id="pw" type="password" placeholder="Password" autofocus autocomplete="current-password"><button id="btn" type="submit">Masuk</button></form>
  <div class="err" id="err"></div>
</div>
<script>
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) document.body.classList.add('light');
  document.getElementById('f').addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = document.getElementById('btn'), err = document.getElementById('err');
    btn.disabled = true; err.textContent = '';
    try {
      var res = await fetch('/__gate-auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: document.getElementById('pw').value }) });
      var data = await res.json().catch(function () { return {}; });
      if (res.ok && data.ok) { location.replace('/'); return; }
      err.textContent = data.error || 'Password salah';
    } catch (e2) { err.textContent = 'Tidak dapat menghubungi server'; }
    btn.disabled = false;
  });
</script>
</body>
</html>`;

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

    // === Visibilitas & Akses (dari halaman Pengaturan > Visibilitas & Akses) ===
    // - mode 'password'  -> gerbang auth sebelum situs bisa dibuka (_worker.js + __gate.html)
    // - indexSearch = 0   -> _headers X-Robots-Tag: noindex (mesin pencari tidak mengindeks)
    let vis = null;
    try {
      const visRaw = await getSetting(db, T.projectSettings, projectId, 'visibility_settings');
      vis = visRaw ? JSON.parse(visRaw) : null;
    } catch (e) { vis = null; }

    if (vis && vis.mode === 'password' && /^[a-f0-9]{64}$/.test(String(vis.pass_hash || ''))) {
      const workerJs = [
        'const GATE_TOKEN = "' + vis.pass_hash + '";',
        'const COOKIE_NAME = "clincoo_gate";',
        'async function sha256hexGate(str) {',
        '  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));',
        '  return [...new Uint8Array(buf)].map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");',
        '}',
        'export default {',
        '  async fetch(request, env) {',
        '    const url = new URL(request.url);',
        '    if (url.pathname === "/__gate.html" || url.pathname === "/__gate-auth") {',
        '      if (url.pathname === "/__gate-auth") {',
        '        if (request.method !== "POST") return new Response(null, { status: 405 });',
        '        const body = await request.json().catch(function () { return {}; });',
        '        const digest = await sha256hexGate("clincoo-gate:" + String(body.password || ""));',
        '        if (digest === GATE_TOKEN) {',
        '          return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json", "Set-Cookie": COOKIE_NAME + "=" + GATE_TOKEN + "; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax" } });',
        '        }',
        '        return new Response(JSON.stringify({ ok: false, error: "Password salah" }), { status: 401, headers: { "Content-Type": "application/json" } });',
        '      }',
        '      return env.ASSETS.fetch(request);',
        '    }',
        '    const cookie = request.headers.get("Cookie") || "";',
        '    const ok = cookie.split(/;\\s*/).some(function (c) { return c === COOKIE_NAME + "=" + GATE_TOKEN; });',
        '    if (ok) return env.ASSETS.fetch(request);',
        '    return new Response(null, { status: 302, headers: { Location: "/__gate.html" } });',
        '  }',
        '};'
      ].join('\n');
      files.push({ path: '_worker.js', content: workerJs });
      files.push({ path: '__gate.html', content: GATE_PAGE_HTML });
      await setPhase(db, T.projectSettings, projectId, 'Gerbang password dipasang ke situs...');
    }

    if (vis && String(vis.indexSearch) === '0') {
      const NOINDEX = 'X-Robots-Tag: noindex, nofollow';
      const ex = files.findIndex(function (f) { return f.path === '_headers'; });
      if (ex > -1) {
        if (files[ex].content.indexOf('X-Robots-Tag') === -1) {
          files[ex].content = files[ex].content.replace(/\n*$/, '') + '\n/*\n  ' + NOINDEX + '\n';
        }
      } else {
        files.push({ path: '_headers', content: '/*\n  ' + NOINDEX + '\n' });
      }
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
