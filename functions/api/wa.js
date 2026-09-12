// Cloudflare Pages Function — /api/wa "Gateway WhatsApp untuk Clincoo AI" (SELF-CONTAINED)
// Chat Clincoo AI lewat WhatsApp (Cloud API Meta), ala superagent:
//   GET  /api/wa?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...  → verifikasi webhook Meta
//   POST /api/wa  → event masuk dari Meta: pesan user dibalas Clincoo AI OTOMATIS
//   POST /api/wa  body { action: 'send', to, text } (Bearer admin) → kirim manual
// Konfigurasi (env_vars / env): WHATSAPP_TOKEN (access token Cloud API),
// WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN (string bebas untuk verifikasi webhook).
// Sesi per nomor WA tersimpan di D1 (wa_sessions) + kuota harian per nomor (wa_quota, 30/hari).
// Webhook WAJIB dipasang di dashboard Meta → URL: https://clincoo-be2.pages.dev/api/wa

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
export async function onRequestOptions() { return new Response(null, { status: 200, headers: CORS }); }

const GRAPH = 'https://graph.facebook.com/v21.0';
const MAX_CHARS = 3800;          // batas aman satu pesan WA sebelum dipecah
const SESSION_MSGS = 10;         // konteks yang diingat per nomor
const DAILY_LIMIT = 30;          // balasan AI per nomor per hari

const WA_SYSTEM = `Kamu adalah "Clincoo AI" — asisten resmi Clincoo, platform pembuatan website dengan AI Indonesia (template, editor kode, deploy Cloudflare Pages, domain kustom, SSL otomatis; paket Starter gratis, Pro Rp49.000/bln, Bisnis Rp129.000/bln).
Sekarang kamu mengobrol lewat WhatsApp. Jawab dalam Bahasa Indonesia yang hangat, profesional, dan SINGKAT (ideal 2-6 kalimat — ini chat WA, bukan dokumen). Tanpa markdown; teks polos + emoji secukupnya.
Kalau user minta hal yang butuh akun Clincoo (deploy, workspace, dll), arahkan membuka clincoo.pages.dev dan login. Kalau pertanyaan di luar produk Clincoo, tetap bantu secukupnya secara umum.`;

// ===== env vars (DB env_vars / env asli) =====
async function getEnvKey(env, name) {
  if (env[name]) return env[name];
  if (!env.DB) return null;
  try { const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind(name).first(); return row?.value || null; } catch { return null; }
}

// ===== AI provider chain (Workers AI -> OpenRouter -> Gemini) =====
const WORKERS_AI_MODELS = ['@cf/zai-org/glm-5.2', '@cf/deepseek-ai/deepseek-v4-flash-0731', '@cf/zai-org/glm-4.7-flash'];
const OPENROUTER_MODELS = ['nvidia/nemotron-3-super-120b-a12b:free', 'openrouter/free'];
const GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-3-flash-preview'];
async function aiCall(env, messages) {
  const orKey = await getEnvKey(env, 'OPENROUTER_API_KEY');
  const gemKey = await getEnvKey(env, 'GEMINI_API_KEY');
  if (env.AI) {
    for (const model of WORKERS_AI_MODELS) {
      for (let t = 0; t < 2; t++) {
        try {
          const result = await env.AI.run(model, { messages });
          const raw = (result && (result.response || (typeof result === 'string' ? result : ''))) || '';
          const text = raw || (result && result.choices?.[0]?.message?.content) || '';
          if (text) return { text };
        } catch (e) {}
      }
    }
  }
  if (orKey) {
    for (const model of OPENROUTER_MODELS) {
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + orKey },
          body: JSON.stringify({ model, messages })
        });
        const d = await res.json().catch(() => ({}));
        const text = res.ok ? (d?.choices?.[0]?.message?.content || '') : '';
        if (text) return { text };
      } catch (e) {}
    }
  }
  if (gemKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
        const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
        const body = { contents }; if (sys) body.systemInstruction = { parts: [{ text: sys }] };
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': gemKey }, body: JSON.stringify(body)
        });
        const d = await res.json().catch(() => ({}));
        const text = res.ok ? ((d?.candidates?.[0]?.content?.parts) || []).map(p => p.text || '').join('') : '';
        if (text) return { text };
      } catch (e) {}
    }
  }
  return { error: 'Semua provider AI gagal' };
}

// ===== D1: sesi + kuota =====
async function ensureTables(DB) {
  await DB.prepare('CREATE TABLE IF NOT EXISTS wa_sessions (phone TEXT PRIMARY KEY, messages TEXT, updated_at TEXT)').run();
  await DB.prepare('CREATE TABLE IF NOT EXISTS wa_quota (phone TEXT, day TEXT, count INTEGER, PRIMARY KEY (phone, day))').run();
}
async function loadSession(DB, phone) {
  const row = await DB.prepare('SELECT messages FROM wa_sessions WHERE phone = ?').bind(phone).first();
  try { return JSON.parse(row?.messages || '[]') || []; } catch (e) { return []; }
}
async function saveSession(DB, phone, msgs) {
  const cut = msgs.slice(-SESSION_MSGS * 2);
  await DB.prepare('INSERT INTO wa_sessions (phone, messages, updated_at) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at')
    .bind(phone, JSON.stringify(cut), new Date().toISOString()).run();
}
async function quotaOk(DB, phone) {
  const day = new Date().toISOString().slice(0, 10);
  try {
    const row = await DB.prepare('SELECT count FROM wa_quota WHERE phone = ? AND day = ?').bind(phone, day).first();
    if ((row ? row.count : 0) + 1 > DAILY_LIMIT) return false;
    await DB.prepare('INSERT INTO wa_quota (phone, day, count) VALUES (?, ?, 1) ON CONFLICT(phone, day) DO UPDATE SET count = count + 1').bind(phone, day).run();
    return true;
  } catch (e) { return true; }
}

// ===== kirim pesan WA =====
async function waSend(env, phoneId, token, to, text) {
  const chunks = [];
  let s = String(text || '').trim();
  while (s.length) { chunks.push(s.slice(0, MAX_CHARS)); s = s.slice(MAX_CHARS); }
  for (const c of chunks) {
    await fetch(`${GRAPH}/${phoneId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: c } })
    }).catch(() => {});
  }
}

async function handleIncoming(env, msg) {
  const token = await getEnvKey(env, 'WHATSAPP_TOKEN');
  const phoneId = await getEnvKey(env, 'WHATSAPP_PHONE_NUMBER_ID');
  const verify = await getEnvKey(env, 'WHATSAPP_VERIFY_TOKEN');
  if (!token || !phoneId || !verify) return; // gateway belum dikonfigurasi — abaikan
  const from = String(msg.from || '');
  if (!from) return;
  await ensureTables(env.DB);

  let userText = '';
  if (msg.type === 'text' && msg.text?.body) userText = String(msg.text.body).slice(0, 3000);
  else if (msg.type === 'interactive' && msg.interactive?.button_reply?.title) userText = String(msg.interactive.button_reply.title).slice(0, 1000);
  else if (msg.type === 'interactive' && msg.interactive?.list_reply?.title) userText = String(msg.interactive.list_reply.title).slice(0, 1000);

  if (!userText) {
    await waSend(env, phoneId, token, from, 'Maaf, untuk saat ini aku baru bisa membaca pesan teks ya 🙂 — kirim pertanyaanmu dalam bentuk teks. (Clincoo AI)');
    return;
  }
  if (!(await quotaOk(env.DB, from))) {
    await waSend(env, phoneId, token, from, 'Kamu sudah mencapai batas chat 30 pesan hari ini lewat WhatsApp. Lanjut lagi besok ya! (Clincoo AI)');
    return;
  }

  const history = await loadSession(env.DB, from);
  const messages = [{ role: 'system', content: WA_SYSTEM }, ...history, { role: 'user', content: userText }];
  const r = await aiCall(env, messages);
  if (r.error) {
    await waSend(env, phoneId, token, from, 'Maaf, server AI sedang sibuk — coba kirim ulang sebentar lagi ya. (Clincoo AI)');
    return;
  }
  history.push({ role: 'user', content: userText });
  history.push({ role: 'assistant', content: r.text });
  await saveSession(env.DB, from, history);
  await waSend(env, phoneId, token, from, r.text);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// ===== GET: verifikasi webhook Meta =====
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  if (q.get('hub.mode') === 'subscribe') {
    const verify = await getEnvKey(env, 'WHATSAPP_VERIFY_TOKEN');
    if (verify && q.get('hub.verify_token') === verify) {
      return new Response(q.get('hub.challenge') || '', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response('Forbidden', { status: 403 });
  }
  return json({ ok: true, service: 'Clincoo AI WhatsApp Gateway', webhook: 'https://clincoo-be2.pages.dev/api/wa' });
}

// ===== POST: event Meta (masuk otomatis) / kirim manual (admin) =====
export async function onRequestPost({ request, env }) {
  // jalur 1: kirim manual dari dashboard Clincoo (wajib Bearer admin)
  const auth = request.headers.get('Authorization') || '';
  const body = await request.json().catch(() => null);
  if (body && body.action === 'send') {
    if (!auth.startsWith('Bearer ')) return json({ error: 'Login diperlukan', need_login: true }, 401);
    try {
      const { initTables, getUserByToken } = await import('./auth/shared.js');
      await initTables(env.DB);
      const u = await getUserByToken(env.DB, auth.slice(7));
      const ADMIN = new Set(['devconium@gmail.com', 'muzawwied@gmail.com']);
      if (!u || !ADMIN.has(String(u.email || '').toLowerCase())) return json({ error: 'Hanya admin' }, 403);
    } catch (e) { return json({ error: 'Auth gagal' }, 403); }
    const token = await getEnvKey(env, 'WHATSAPP_TOKEN');
    const phoneId = await getEnvKey(env, 'WHATSAPP_PHONE_NUMBER_ID');
    if (!token || !phoneId) return json({ error: 'Gateway WA belum dikonfigurasi (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' }, 500);
    if (!body.to || !body.text) return json({ error: 'to & text wajib' }, 400);
    await waSend(env, phoneId, token, String(body.to).replace(/[^0-9+]/g, ''), body.text);
    return json({ ok: true, sent: true });
  }

  // jalur 2: event webhook Meta (tanpa Bearer — dibuktikan lewat struktur payload)
  try {
    const entries = body?.entry || [];
    let handled = 0;
    for (const e of entries) {
      for (const ch of (e.changes || [])) {
        const msgs = ch?.value?.messages || [];
        for (const m of msgs) { if (m && m.from) { await handleIncoming(env, m); handled++; } }
      }
    }
    // Meta wajib menerima 200 cepat — selalu oke
    return json({ ok: true, handled });
  } catch (err) {
    return json({ ok: true }); // jangan pernah error ke Meta
  }
}
