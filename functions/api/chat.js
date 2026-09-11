// Cloudflare Pages Function — Backend Chat AI Clincoo (SELF-CONTAINED)
// Memanggil Gemini langsung dari project ini (TIDAK lagi mem-forward ke proxy lain —
// self-forward adalah bug loop yang membakar kuota 25x per pesan).
// Fitur:
//   - Auth per-user via token D1 lokal (auth_sessions)
//   - Kuota AI harian per user (25 gratis / 500 admin), hop tool tidak dihitung
//   - Rate limit per-IP 30 req/menit + batas payload 2MB
//   - Function calling: 7 tools workspace + 7 tools super (sandbox CLI, web, proyek)
//   - thought_signature pass-through untuk multi-hop function calling
// PENTING: jangan campur google_search grounding dengan functionDeclarations
// dalam satu request — Gemini API menolak kombinasi itu (HTTP 400), dan itulah
// akar bug "AI pura-pura membuat file". Mode tools = functionDeclarations saja.

import { initTables as initAuthTables, getUserByToken, getToken } from './auth/shared.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

// --- Rate limiter per-IP ---
const RATE_LIMIT = { max: 30, windowMs: 60_000 };
const rateBuckets = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now - b.start >= RATE_LIMIT.windowMs) b = { start: now, count: 0 };
  b.count++;
  rateBuckets.set(ip, b);
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) if (now - v.start >= RATE_LIMIT.windowMs) rateBuckets.delete(k);
  }
  return b.count <= RATE_LIMIT.max;
}
function clientIp(request) {
  try { return (request && request.headers && request.headers.get('cf-connecting-ip')) || 'unknown'; } catch (e) { return 'unknown'; }
}

const PREFERRED_MODELS = ['gemini-3.6-flash', 'gemini-3-flash-preview'];

// ===== PROVIDER UTAMA: OpenRouter (model gratis, tool calling) =====
// Rantai fallback: nemotron-3-super (nalar+tools terkuat) -> nemotron-3.5-lightning
// (eksekusi agent cepat) -> openrouter/free (router, tahan model delist).
// Gemini hanya cadangan: dipanggil saat OpenRouter gagal/limit/tanpa kunci.
const OPENROUTER_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3.5-lightning:free',
  'openrouter/free'
];
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const QUOTA_MSG = 'Kuota AI Clincoo hari ini sudah habis. Kuota reset otomatis setiap hari — silakan coba lagi besok.';

const ADMIN_EMAILS = new Set(['devconium@gmail.com', 'muzawwied@gmail.com']);
const DAILY_LIMIT = 25;
const ADMIN_DAILY_LIMIT = 500;

async function getApiKey(env) {
  if (env.GEMINI_API_KEY) return env.GEMINI_API_KEY;
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind('GEMINI_API_KEY').first();
    return row?.value || null;
  } catch { return null; }
}

async function getOpenRouterKey(env) {
  if (env.OPENROUTER_API_KEY) return env.OPENROUTER_API_KEY;
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind('OPENROUTER_API_KEY').first();
    return row?.value || null;
  } catch { return null; }
}

async function resolveUser(env, request) {
  const token = getToken(request);
  if (!token) return null;
  try {
    await initAuthTables(env.DB);
    const u = await getUserByToken(env.DB, token);
    if (u) return { key: 'u' + u.id, email: String(u.email || '').toLowerCase() };
  } catch (e) {}
  return null;
}

async function quotaCheck(env, user) {
  const isAdmin = ADMIN_EMAILS.has(user.email);
  const limit = isAdmin ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS ai_quota (user_key TEXT, day TEXT, count INTEGER, PRIMARY KEY (user_key, day))'
    ).run();
    const row = await env.DB.prepare('SELECT count FROM ai_quota WHERE user_key = ? AND day = ?').bind(user.key, day).first();
    const count = row ? row.count : 0;
    if (count >= limit) return { exceeded: true, limit };
    await env.DB.prepare(
      'INSERT INTO ai_quota (user_key, day, count) VALUES (?, ?, 1) ON CONFLICT(user_key, day) DO UPDATE SET count = count + 1'
    ).bind(user.key, day).run();
    return { exceeded: false, limit };
  } catch (e) {
    return { exceeded: false, limit }; // gagal DB ≠ blokir user
  }
}

function partsFromContent(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (Array.isArray(content)) {
    const parts = [];
    for (const block of content) {
      if (!block) continue;
      if (block.type === 'text' && block.text) parts.push({ text: block.text });
      else if (block.type === 'image_url' && block.image_url?.url) {
        const m = /^data:(.+?);base64,(.+)$/.exec(block.image_url.url || '');
        if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
      }
      // Pass-through function calling (hop multi-step dari klien)
      else if (block.type === 'function_call' && block.name) {
        const fcPart = { functionCall: { name: block.name, args: block.args || {} } };
        if (block.thought_signature) fcPart.thoughtSignature = block.thought_signature;
        parts.push(fcPart);
      }
      else if (block.type === 'function_response' && block.name) {
        parts.push({ functionResponse: { name: block.name, response: { result: block.result } } });
      }
    }
    return parts.length ? parts : [{ text: '.' }];
  }
  return [{ text: '.' }];
}

function toGeminiPayload(messages) {
  let systemInstruction = null;
  const contents = [];
  for (const m of messages) {
    if (!m) continue;
    if (m.role === 'system') {
      const text = typeof m.content === 'string' ? m.content : partsFromContent(m.content).map(p => p.text || '').join('\n');
      systemInstruction = systemInstruction ? systemInstruction + '\n' + text : text;
      continue;
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: partsFromContent(m.content) });
  }
  // Lindungi dari konteks kepanjangan: simpan 30 pesan terakhir
  if (contents.length > 30) contents.splice(0, contents.length - 30);
  return { systemInstruction, contents };
}

// ===== Deklarasi tools (dieksekusi LOKAL di browser klien) =====
const WORKSPACE_FUNCTION_DECLARATIONS = [
  { name: 'list_items',
    description: 'Lihat daftar file & folder di dalam sebuah folder workspace Clincoo milik user. Gunakan ini untuk melihat isi workspace atau folder sebelum melakukan operasi lain.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path folder. Contoh: "root" (folder utama), "js", "root/css/style". Default: root.' } } } },
  { name: 'read_file',
    description: 'Baca isi lengkap sebuah file di workspace. WAJIB dipakai sebelum mengedit file agar konten terbaru dan akurat.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path file. Contoh: "index.html", "js/app.js", "root/style.css".' } }, required: ['path'] } },
  { name: 'write_file',
    description: 'Buat file baru di workspace atau timpa seluruh isi file yang sudah ada dengan konten baru. Folder induk dibuat otomatis jika belum ada.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path file tujuan, contoh: "pages/about.html".' }, content: { type: 'STRING', description: 'Isi lengkap file yang akan ditulis (overwrite penuh).' } }, required: ['path', 'content'] } },
  { name: 'create_folder',
    description: 'Buat folder baru (beserta folder induknya) di workspace.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path folder, contoh: "assets/img".' } }, required: ['path'] } },
  { name: 'rename_item',
    description: 'Ubah nama file atau folder di workspace.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path item yang di-rename, contoh: "old-name.html".' }, new_name: { type: 'STRING', description: 'Nama baru (tanpa path), contoh: "new-name.html".' } }, required: ['path', 'new_name'] } },
  { name: 'delete_item',
    description: 'Hapus file atau folder (beserta seluruh isinya) dari workspace. PERMANEN — konfirmasi dulu ke user kecuali user sudah jelas meminta penghapusan.',
    parameters: { type: 'OBJECT', properties: { path: { type: 'STRING', description: 'Path item yang akan dihapus.' } }, required: ['path'] } },
  { name: 'search_items',
    description: 'Cari file atau folder di seluruh workspace berdasarkan nama.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Kata kunci nama file/folder.' } }, required: ['query'] } },
  // ===== TOOLS SUPER =====
  { name: 'run_command',
    description: 'Jalankan perintah shell/CLI (bash) atau potongan Python di sandbox eksekusi aman yang terisolasi. Cocok untuk: perhitungan matematis, test cepat kode, generate data, verifikasi logika. Sandbox TIDAK melihat file workspace — jika kode butuh isi file, tulis/tempel isinya langsung di dalam kode. Python: awali dengan "python3 -c" atau tulis file lalu jalankan.',
    parameters: { type: 'OBJECT', properties: { command: { type: 'STRING', description: 'Perintah bash/CLI, contoh: "python3 -c \'print(2+2)\'" atau "echo hallo".' } }, required: ['command'] } },
  { name: 'read_web_page',
    description: 'Baca konten sebuah halaman web (URL) dan ubah jadi teks markdown yang bisa dibaca. Gunakan untuk membaca dokumentasi, artikel, atau halaman apapun yang user sebutkan.',
    parameters: { type: 'OBJECT', properties: { url: { type: 'STRING', description: 'URL lengkap halaman, contoh: "https://contoh.com/docs".' } }, required: ['url'] } },
  { name: 'web_search',
    description: 'Cari informasi terbaru di web (search engine). Gunakan untuk pertanyaan yang butuh data real-time atau terkini: harga, berita, dokumentasi versi baru, dll.',
    parameters: { type: 'OBJECT', properties: { query: { type: 'STRING', description: 'Kata kunci pencarian.' } }, required: ['query'] } },
  { name: 'rename_project',
    description: 'Ganti nama (judul) proyek Clincoo yang sedang aktif di percakapan ini.',
    parameters: { type: 'OBJECT', properties: { new_name: { type: 'STRING', description: 'Nama baru proyek.' } }, required: ['new_name'] } },
  { name: 'deploy_project',
    description: 'Publish / deploy proyek yang sedang aktif ke internet (Cloudflare Pages) sehingga situsnya live. Gunakan saat user minta deploy, publish, atau membuat situsnya online.',
    parameters: { type: 'OBJECT', properties: {} } },
  { name: 'add_env_var',
    description: 'Tambah atau perbarui environment variable (key=value) milik proyek aktif — contoh API key atau konfigurasi situs.',
    parameters: { type: 'OBJECT', properties: { key: { type: 'STRING', description: 'Nama variable, contoh: "STRIPE_KEY".' }, value: { type: 'STRING', description: 'Nilai variable.' }, is_secret: { type: 'BOOLEAN', description: 'true jika sensitif (disembunyikan). Default false.' } }, required: ['key', 'value'] } },
  { name: 'list_env_vars',
    description: 'Lihat daftar environment variable milik proyek aktif (nilai secret ditampilkan tersembunyi).',
    parameters: { type: 'OBJECT', properties: {} } }
];

async function fetchGemini(apiKey, model, systemInstruction, contents, tools) {
  const payload = { contents };
  if (tools) payload.tools = tools;
  if (systemInstruction) payload.systemInstruction = { parts: [{ text: systemInstruction }] };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(payload)
  });
  if (!res.ok) return { error: `Model ${model} returned ${res.status}: ${(await res.text()).slice(0, 300)}`, status: res.status };
  return { data: await res.json() };
}

async function tryModels(apiKey, systemInstruction, contents, tools) {
  let lastError = null;
  const statuses = [];
  for (const model of PREFERRED_MODELS) {
    try {
      const r = await fetchGemini(apiKey, model, systemInstruction, contents, tools);
      if (r.error) { lastError = r.error; statuses.push(r.status || 0); continue; }
      const parts = r.data?.candidates?.[0]?.content?.parts || [];
      const text = parts.map(p => p.text || '').join('');
      const toolCalls = parts
        .filter(p => p.functionCall)
        .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {}, thought_signature: p.thoughtSignature || undefined }));
      if (toolCalls.length > 0) return { tool_calls: toolCalls, text, model };
      if (text) return { text, model };
      lastError = `Model ${model} returned empty response`;
      statuses.push(0);
    } catch (err) {
      lastError = err.message;
      statuses.push(0);
    }
  }
  const quotaExhausted = statuses.length > 0 && statuses.every(st => st === 429);
  return { error: lastError || 'All models failed', quotaExhausted };
}

// ===== OpenRouter: konversi format =====
// Skema Gemini (OBJECT/STRING uppercase) -> JSON Schema OpenAI (lowercase)
function orParam(schema) {
  const t = String((schema && schema.type) || '').toLowerCase();
  const out = { type: t === 'array' ? 'array' : t === 'boolean' ? 'boolean' : t === 'number' ? 'number' : t === 'object' ? 'object' : 'string' };
  if (schema && schema.description) out.description = schema.description;
  if (schema && schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = orParam(v);
  }
  if (schema && Array.isArray(schema.required)) out.required = schema.required;
  return out;
}
function orTools() {
  return WORKSPACE_FUNCTION_DECLARATIONS.map(d => ({
    type: 'function',
    function: { name: d.name, description: d.description || '', parameters: orParam(d.parameters || { type: 'OBJECT', properties: {} }) }
  }));
}
// messages klien (format blok Clincoo) -> pesan OpenAI-compatible
function orMessages(messages) {
  const out = [];
  const pushText = (role, text) => { if (text) out.push({ role, content: text }); };
  for (const m of messages) {
    if (!m) continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'system' ? 'system' : 'user';
    if (typeof m.content === 'string') { pushText(role, m.content); continue; }
    const blocks = Array.isArray(m.content) ? m.content : [];
    let pendingText = '';
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === 'text' && b.text) pendingText += (pendingText ? '\n' : '') + b.text;
      else if (b.type === 'function_call' && b.name) {
        pushText(role === 'assistant' ? 'assistant' : 'user', pendingText); pendingText = '';
        out.push({ role: 'assistant', content: null, tool_calls: [{ id: 'call_' + (b.call_id || b.name), type: 'function', function: { name: b.name, arguments: JSON.stringify(b.args || {}) } }] });
      } else if (b.type === 'function_response' && b.name) {
        pushText('user', pendingText); pendingText = '';
        out.push({ role: 'tool', tool_call_id: 'call_' + (b.call_id || b.name), content: JSON.stringify({ result: b.result }) });
      }
      // image_url dibiarkan (model gratis OR non-vision; payload bergambar diarahkan ke Gemini)
    }
    pushText(role, pendingText);
  }
  // konteks panjang: 30 pesan terakhir (sama seperti jalur Gemini)
  if (out.length > 30) out.splice(0, out.length - 30);
  return out;
}
async function tryOpenRouter(apiKey, messages, tools) {
  const statuses = [];
  let lastError = null;
  for (const model of OPENROUTER_MODELS) {
    try {
      const payload = { model, messages };
      if (tools) { payload.tools = tools; payload.tool_choice = 'auto'; }
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey, 'HTTP-Referer': 'https://clincoo-be2.pages.dev', 'X-Title': 'Clincoo' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) { lastError = `OpenRouter ${model} returned ${res.status}: ${(await res.text()).slice(0, 200)}`; statuses.push(res.status); continue; }
      const d = await res.json();
      const m = d?.choices?.[0]?.message;
      const text = (typeof m?.content === 'string' ? m.content : '') || '';
      const toolCalls = (m?.tool_calls || []).map(tc => {
        let args = {};
        try { args = JSON.parse(tc.function?.arguments || '{}'); } catch (e) {}
        return { name: tc.function?.name || '', args };
      }).filter(tc => tc.name);
      if (toolCalls.length > 0) return { tool_calls: toolCalls, text, model };
      if (text) return { text, model };
      lastError = `OpenRouter ${model} returned empty response`; statuses.push(0);
    } catch (err) { lastError = 'OpenRouter ' + err.message; statuses.push(0); }
  }
  return { error: lastError || 'Semua model OpenRouter gagal', statuses };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!rateLimitOk(clientIp(request))) {
      return new Response(JSON.stringify({ error: 'Terlalu banyak permintaan. Coba lagi dalam 1 menit.' }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...CORS }
      });
    }

    // Batasi ukuran body maksimal 2 MB (anti abuse attachment base64 raksasa)
    const raw = await request.text();
    if (raw.length > 2_000_000) {
      return new Response(JSON.stringify({ error: 'Payload terlalu besar (maks 2MB).' }), {
        status: 413, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
    const body = JSON.parse(raw);

    // Aksi manajemen sesi — stateless (riwayat di localStorage klien), cukup ACK
    const action = body.action || 'send';
    if (action === 'delete_session') {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
    if (action === 'new_session') {
      return new Response(JSON.stringify({ session_id: body.session_id || ('ls_' + Date.now()), title: body.title || 'Percakapan Baru' }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // --- Auth per-user ---
    const user = await resolveUser(env, request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Login diperlukan', need_login: true }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    let messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0) {
      const fallback = typeof body.content === 'string' ? body.content
        : (typeof body.message === 'string' ? body.message : '');
      if (fallback) messages = [{ role: 'user', content: fallback }];
    }
    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Pesan kosong' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // --- Kuota: hanya pesan asli (hop 0). Hop tool lanjutan tidak dihitung ---
    const isFirstHop = body.save_user_message !== false;
    if (isFirstHop) {
      const q = await quotaCheck(env, user);
      if (q.exceeded) {
        return new Response(JSON.stringify({ quota_exhausted: true, error: QUOTA_MSG }), {
          status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600', ...CORS }
        });
      }
    }

    const orKey = await getOpenRouterKey(env);
    const apiKey = await getApiKey(env);
    if (!orKey && !apiKey) {
      return new Response(JSON.stringify({ error: 'Kunci AI (OpenRouter/Gemini) belum dikonfigurasi. Tambahkan lewat Pengaturan → Environment (global).' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Mode workspace tools.
    // Jalur Gemini: HANYA functionDeclarations (tanpa google_search — kombinasi
    // keduanya ditolak Gemini API dan memicu bug JSON palsu).
    const gTools = body.workspace_tools === true
      ? [{ functionDeclarations: WORKSPACE_FUNCTION_DECLARATIONS }]
      : null;
    const oTools = body.workspace_tools === true ? orTools() : null;

    // Payload bergambar -> langsung Gemini (model gratis OpenRouter non-vision).
    const hasImages = messages.some(m => Array.isArray(m?.content) && m.content.some(b => b && b.type === 'image_url' && b.image_url?.url));

    // PROVIDER UTAMA: OpenRouter. Gagal/limit/tanpa kunci -> cadangan Gemini.
    let r = null;
    if (orKey && !hasImages) {
      r = await tryOpenRouter(orKey, orMessages(messages), oTools);
    }
    if ((!r || r.error) && apiKey) {
      const { systemInstruction, contents } = toGeminiPayload(messages);
      r = await tryModels(apiKey, systemInstruction, contents, gTools);
    }
    if (!r || (r.error && !apiKey)) {
      if (!r) r = { error: 'Tidak ada provider AI tersedia' };
    }

    if (r.error && r.quotaExhausted) {
      return new Response(JSON.stringify({ quota_exhausted: true, error: QUOTA_MSG }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
    if (r.error) {
      return new Response(JSON.stringify({ error: r.error }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    const out = {
      text: r.text || '',
      model: r.model,
      session_id: body.session_id || ('ls_' + Date.now())
    };
    if (r.tool_calls) out.tool_calls = r.tool_calls;
    return new Response(JSON.stringify(out), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Server error: ' + err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
