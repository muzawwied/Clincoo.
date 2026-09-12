// Cloudflare Pages Function — /api/ai "Clincoo AI" (SELF-CONTAINED)
// Endpoint asisten AI persona Clincoo. Provider utama: Workers AI (binding "AI",
// tanpa API key) -> fallback OpenRouter (model gratis) -> fallback Gemini.
// Fitur:
//   - Auth per-user (middleware /api/* sudah menolak tanpa Bearer)
//   - Kuota harian bersama dengan chat (tabel ai_quota: 25 gratis / 500 admin)
//   - Rate limit per-IP 30 req/menit, batas payload 512KB
//   - GET  /api/ai  -> status provider tersedia
//   - POST /api/ai  -> { messages:[{role,content}], system?, stream? }
// Tidak memakai function calling di sini — tools workspace tetap di /api/chat.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { status: 200, headers: CORS });
}

// --- Rate limiter per-IP (isolate-local, sama pola chat.js) ---
const RATE_LIMIT = { max: 30, windowMs: 60_000 };
const rateBuckets = new Map();
function rateLimitOk(ip) {
  const now = Date.now();
  let b = rateBuckets.get(ip);
  if (!b || now - b.start >= RATE_LIMIT.windowMs) b = { start: now, count: 0 };
  b.count++;
  rateBuckets.set(ip, b);
  if (rateBuckets.size > 5000) for (const [k, v] of rateBuckets) if (now - v.start >= RATE_LIMIT.windowMs) rateBuckets.delete(k);
  return b.count <= RATE_LIMIT.max;
}
function clientIp(request) {
  try { return (request && request.headers && request.headers.get('cf-connecting-ip')) || 'unknown'; } catch (e) { return 'unknown'; }
}

// ===== Persona "Clincoo AI" =====
const CLINCOO_AI_SYSTEM_PROMPT = `Kamu adalah "Clincoo AI" — asisten resmi platform Clincoo, pembuatan website dengan AI: template profesional, generate AI, editor kode, dan deploy instan.

Tentang Clincoo (fakta yang kamu pegang):
- Layanan utama: galeri template publik (SEO-friendly, tanpa login), workspace dengan editor kode, chat AI per proyek (bisa menulis/mengubah file, menyiapkan aplikasi), deploy ke Cloudflare Pages dengan subdomain *.pages.dev, domain kustom (record CNAME/ALIAS @ ke <subdomain>.pages.dev, tanpa A record IP), SSL otomatis, pengaturan proyek (umum, environment, keamanan/HTTPS, visibilitas akses & proteksi password, zona bahaya), tugas terjadwal, dompet dengan top-up ClincooPay, dan kolaborasi tim.
- Paket langganan: Starter gratis (3 proyek aktif, 1 kolaborator per proyek, chat AI, 3 template, tugas terjadwal, deploy web 2x/bulan), Pro Rp49.000/bulan (10 proyek, 5 kolaborator, deploy 25x/bulan, impor repository GitHub, paling populer), Bisnis Rp129.000/bulan (50 proyek, 20 kolaborator, kontrol akses lanjutan, deploy tanpa batas).
- Bantuan & info: halaman FAQ, Bantuan, dan Tentang di aplikasi Clincoo; laporan bug tersedia di menu akun.
- Kuota chat AI harian: 25 pesan (paket gratis), reset otomatis tiap hari.

Gaya kamu:
- Bicara dalam Bahasa Indonesia yang hangat, profesional, dan ringkas — seperti kolega yang pintar, bukan robot manual.
- Jelaskan istilah teknis (DNS, deploy, SSL, CNAME) dengan cara sederhana saat user baru belajar.
- Kalau tidak tahu sesuatu di luar platform Clincoo, katakan jujur — jangan mengarang fitur yang tidak ada.
- Untuk pertanyaan yang butuh aksi di proyek user (buat file, deploy, dsb.), arahkan ke Chat AI di dalam proyek tersebut.`;

// ===== Kuota harian (tabel ai_quota bersama /api/chat) =====
const ADMIN_EMAILS = new Set(['devconium@gmail.com', 'muzawwied@gmail.com']);
const DAILY_LIMIT = 25;
const ADMIN_DAILY_LIMIT = 500;
const QUOTA_MSG = 'Kuota AI Clincoo hari ini sudah habis. Kuota reset otomatis setiap hari — silakan coba lagi besok.';

async function resolveUser(env, request) {
  try {
    const { initTables, getUserByToken, getToken } = await import('./auth/shared.js');
    await initTables(env.DB);
    const token = getToken(request);
    if (!token) return null;
    const u = await getUserByToken(env.DB, token);
    if (u) return { key: 'u' + u.id, email: String(u.email || '').toLowerCase() };
  } catch (e) {}
  return null;
}

async function quotaSpend(env, user, cost) {
  const day = new Date().toISOString().slice(0, 10);
  const isAdmin = ADMIN_EMAILS.has(user.email);
  const limit = isAdmin ? ADMIN_DAILY_LIMIT : DAILY_LIMIT;
  try {
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS ai_quota (user_key TEXT, day TEXT, count INTEGER, PRIMARY KEY (user_key, day))').run();
    const row = await env.DB.prepare('SELECT count FROM ai_quota WHERE user_key = ? AND day = ?').bind(user.key, day).first();
    const count = row ? row.count : 0;
    if (count + cost > limit) return { exceeded: true, limit };
    await env.DB.prepare('INSERT INTO ai_quota (user_key, day, count) VALUES (?, ?, ?) ON CONFLICT(user_key, day) DO UPDATE SET count = count + ?').bind(user.key, day, cost, cost).run();
    return { exceeded: false, limit };
  } catch (e) {
    return { exceeded: false, limit }; // gagal DB ≠ blokir user
  }
}

// ===== Kunci provider cadangan (env var / tabel env_vars — pola chat.js) =====
async function getEnvKey(env, name) {
  if (env[name]) return env[name];
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind(name).first();
    return row?.value || null;
  } catch { return null; }
}

// ===== Normalisasi pesan klien -> [{role, content(text)}] =====
function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    const parts = [];
    for (const b of content) if (b && b.type === 'text' && b.text) parts.push(b.text);
    return parts.join('\n');
  }
  return '';
}
function normalizeMessages(messages) {
  const out = [];
  for (const m of (messages || [])) {
    if (!m || !m.role) continue;
    const text = textFromContent(m.content);
    if (m.role === 'system') { if (text) out.push({ role: 'system', content: text }); }
    else if (m.role === 'user' || m.role === 'assistant') { if (text) out.push({ role: m.role, content: text }); }
  }
  return out;
}

// ===== Provider 1: Workers AI (binding "AI") =====
// Rantai model 2026 (NON-Llama, agentic + jago kode + paham bahasa manusia):
//   glm-5.2      : flagship agentic coding (Z.ai) — reasoning, function calling, ctx 262K
//   deepseek-v4  : agentic cepat, reasoning, ctx 1.3M token
//   glm-4.7-flash: cepat & multilingual (100+ bahasa — ramah Bahasa Indonesia)
const WORKERS_AI_MODELS = ['@cf/zai-org/glm-5.2', '@cf/deepseek-ai/deepseek-v4-flash-0731', '@cf/zai-org/glm-4.7-flash'];

async function tryWorkersAI(env, messages, stream) {
  if (!env.AI) return { error: 'Workers AI binding tidak tersedia' };
  const sysIdx = messages.findIndex(m => m.role === 'system');
  const system = sysIdx !== -1 ? messages[sysIdx].content : '';
  const chatMsgs = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }));
  let lastErr = null;
  for (const model of WORKERS_AI_MODELS) {
    try {
      const payload = { messages: chatMsgs };
      if (system) payload.system = system;
      if (stream) payload.stream = true;
      const result = await env.AI.run(model, payload);
      if (stream && result && typeof result.pipeThrough === 'function') {
        return { stream: result, model };
      }
      const raw = (result && (result.response || (typeof result === 'string' ? result : ''))) || '';
      const text = raw || ((result && Array.isArray(result.choices) && result.choices[0] && result.choices[0].message && result.choices[0].message.content) || '');
      if (text) return { text, model };
      lastErr = `Model ${model}: respons kosong`;
    } catch (e) {
      lastErr = `Model ${model}: ${e && e.message}`;
    }
  }
  return { error: lastErr || 'Workers AI gagal' };
}

// ===== Provider 2: OpenRouter (model gratis — pola chat.js) =====
const OPENROUTER_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'nvidia/nemotron-3.5-lightning:free', 'openrouter/free'];

async function tryOpenRouter(key, messages) {
  let lastErr = null;
  for (const model of OPENROUTER_MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({ model, messages })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { lastErr = `Model ${model}: HTTP ${res.status}`; continue; }
      const text = data?.choices?.[0]?.message?.content || '';
      if (text) return { text, model };
      lastErr = `Model ${model}: respons kosong`;
    } catch (e) {
      lastErr = `Model ${model}: ${e && e.message}`;
    }
  }
  return { error: lastErr || 'OpenRouter gagal' };
}

// ===== Provider 3: Gemini (cadangan — pola chat.js) =====
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3-flash-preview'];

async function tryGemini(key, messages) {
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
  const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  let lastErr = null;
  for (const model of GEMINI_MODELS) {
    try {
      const body = { contents };
      if (sys) body.systemInstruction = { parts: [{ text: sys }] };
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { lastErr = `Model ${model}: HTTP ${res.status}`; continue; }
      const text = ((data?.candidates?.[0]?.content?.parts) || []).map(p => p.text || '').join('');
      if (text) return { text, model };
      lastErr = `Model ${model}: respons kosong`;
    } catch (e) {
      lastErr = `Model ${model}: ${e && e.message}`;
    }
  }
  return { error: lastErr || 'Gemini gagal' };
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ===== GET /api/ai — status provider =====
export async function onRequestGet({ request, env }) {
  if (!rateLimitOk(clientIp(request))) return json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, 429);
  const user = await resolveUser(env, request);
  if (!user) return json({ error: 'Login diperlukan', need_login: true }, 401);
  const orKey = await getEnvKey(env, 'OPENROUTER_API_KEY');
  const gemKey = await getEnvKey(env, 'GEMINI_API_KEY');
  return json({
    ok: true,
    persona: 'Clincoo AI',
    providers: {
      workers_ai: !!env.AI,
      openrouter: !!orKey,
      gemini: !!gemKey
    },
    models: {
      workers_ai: WORKERS_AI_MODELS,
      openrouter: OPENROUTER_MODELS,
      gemini: GEMINI_MODELS
    }
  });
}

// ===== POST /api/ai — chat persona Clincoo AI =====
export async function onRequestPost({ request, env }) {
  if (!rateLimitOk(clientIp(request))) return json({ error: 'Terlalu banyak permintaan. Coba lagi sebentar.' }, 429);

  const user = await resolveUser(env, request);
  if (!user) return json({ error: 'Login diperlukan', need_login: true }, 401);

  let body = null;
  try {
    const len = parseInt(request.headers.get('content-length') || '0', 10);
    if (len > 512 * 1024) return json({ error: 'Payload terlalu besar' }, 413);
    body = await request.json();
  } catch (e) { return json({ error: 'Body JSON tidak valid' }, 400); }

  const messages = normalizeMessages(body?.messages);
  const hasUserMsg = messages.some(m => m.role === 'user');
  if (!messages.length || !hasUserMsg) return json({ error: 'Pesan kosong' }, 400);

  // Kuota harian (bersama chat AI)
  const q = await quotaSpend(env, user, 1);
  if (q.exceeded) return json({ quota_exhausted: true, error: QUOTA_MSG }, 429);

  // Pesan final: persona Clincoo AI (+ system tambahan dari klien)
  const system = [CLINCOO_AI_SYSTEM_PROMPT];
  for (const m of messages) if (m.role === 'system') system.push(m.content);
  if (body?.system && typeof body.system === 'string') system.push(body.system);
  const finalMessages = [{ role: 'system', content: system.join('\n\n') }, ...messages.filter(m => m.role !== 'system')];

  const stream = body?.stream === true;
  const orKey = await getEnvKey(env, 'OPENROUTER_API_KEY');
  const gemKey = await getEnvKey(env, 'GEMINI_API_KEY');

  // Provider utama: Workers AI (binding, tanpa API key)
  let r = null;
  if (env.AI) r = await tryWorkersAI(env, finalMessages, stream);
  if ((!r || r.error) && orKey) r = await tryOpenRouter(orKey, finalMessages);
  if ((!r || r.error) && gemKey) r = await tryGemini(gemKey, finalMessages);

  if (!r || r.error) {
    return json({ error: 'Tidak ada provider AI tersedia. Aktifkan binding Workers AI atau set kunci OpenRouter/Gemini di Pengaturan → Environment.' }, 502);
  }

  if (r.stream) {
    // Workers AI streaming: ReadableStream -> passthrough sebagai SSE mentah
    return new Response(r.stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', ...CORS } });
  }

  return json({ text: r.text, model: r.model, provider: env.AI && r.model.startsWith('@cf') ? 'workers_ai' : 'fallback', session_id: body?.session_id || ('ai_' + Date.now()) });
}
