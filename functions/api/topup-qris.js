// Cloudflare Pages Functions - Top Up via QRIS Pakasir (app.pakasir.com)
// Flow: pilih QRIS -> create transaction Pakasir -> frontend render QR string -> bayar -> webhook/poll -> saldo masuk D1
// Env: PAKASIR_API_KEY (wajib) & PAKASIR_PROJECT (opsional, default 'clincoo')
// Alternatif env: tabel env_vars D1 (key: PAKASIR_API_KEY / PAKASIR_PROJECT)
// Webhook (di dashboard Pakasir): https://<domain>/api/topup-qris

import { currentUser } from './user-scope.js';
import { creditTopup } from './topup.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

async function getSecret(env, key) {
  if (env[key]) return env[key];
  try {
    const row = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ? AND (project_id IS NULL OR project_id = \'\')').bind(key).first();
    if (row?.value) return row.value;
  } catch {}
  return null;
}

const PAKASIR_BASE = 'https://app.pakasir.com';

async function pakasirPost(path, apiKey, project, orderId, amount) {
  try {
    const res = await fetch(PAKASIR_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project, order_id: orderId, amount, api_key: apiKey })
    });
    return await res.json();
  } catch { return null; }
}

async function pakasirDetail(apiKey, project, orderId, amount) {
  try {
    const url = PAKASIR_BASE + '/api/transactiondetail?project=' + encodeURIComponent(project) +
      '&amount=' + encodeURIComponent(amount) + '&order_id=' + encodeURIComponent(orderId) +
      '&api_key=' + encodeURIComponent(apiKey);
    const res = await fetch(url);
    return await res.json();
  } catch { return null; }
}

// Klaim order atomik: mencegah kredit ganda saat webhook & poll berjalan bersamaan
async function claimOrder(db, orderId) {
  const r = await db.prepare("UPDATE topup_orders SET status = 'paid' WHERE id = ? AND status = 'pending'").bind(orderId).run();
  return (r.meta?.changes || 0) > 0;
}

// GET /api/topup-qris?action=ping            -> status konfigurasi (untuk UI)
// GET /api/topup-qris?action=status&order_id -> cek status order (live check ke Pakasir + kredit bila lunas)
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 not bound' }, 500);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');

  if (action === 'ping') {
    const apiKey = await getSecret(env, 'PAKASIR_API_KEY');
    const project = (await getSecret(env, 'PAKASIR_PROJECT')) || 'clincoo';
    return json({ configured: !!apiKey, project, provider: 'pakasir' });
  }

  if (action === 'status') {
    const orderId = url.searchParams.get('order_id') || '';
    if (!orderId) return json({ error: 'order_id required' }, 400);
    let order;
    try { order = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(orderId).first(); } catch (e) { return json({ error: e.message }, 500); }
    if (!order) return json({ status: 'unknown' });
    if (order.status === 'paid') return json({ status: 'paid', amount: order.amount });
    if (order.status === 'failed') return json({ status: 'failed' });

    // Order pending -> cek live ke Pakasir
    const apiKey = await getSecret(env, 'PAKASIR_API_KEY');
    const project = (await getSecret(env, 'PAKASIR_PROJECT')) || 'clincoo';
    if (!apiKey) return json({ status: order.status, error: 'payment_not_configured' });
    const det = await pakasirDetail(apiKey, project, orderId, order.amount);
    const trx = det?.transaction;
    if (trx?.status === 'completed') {
      if (await claimOrder(db, orderId)) {
        const fresh = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(orderId).first();
        try { await creditTopup(env, fresh); } catch (e) {}
      }
      return json({ status: 'paid', amount: order.amount });
    }
    return json({ status: 'pending', expired_at: trx?.expired_at || null });
  }

  return json({ error: 'unknown action' }, 400);
}

// POST /api/topup-qris
//  a) {action:'create', amount}                 -> buat transaksi QRIS di Pakasir, simpan order pending
//  b) {action:'cancel', order_id}               -> batalkan order (Pakasir + D1)
//  c) Webhook Pakasir {order_id, status, ...}   -> verifikasi via transactiondetail -> kredit saldo
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 not bound' }, 500);

  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'invalid body' }, 400); }

  // ---- Webhook Pakasir (tanpa field action) ----
  // Pakasir tidak mengirim token tanda tangan, jadi sebelum mengkredit saldo
  // kita WAJIB verifikasi ulang via API transactiondetail (server-to-server).
  if (!body.action && body.order_id && body.status) {
    const apiKey = await getSecret(env, 'PAKASIR_API_KEY');
    const project = (await getSecret(env, 'PAKASIR_PROJECT')) || 'clincoo';
    if (!apiKey) return json({ received: false, error: 'not configured' }, 503);
    let order = null;
    try { order = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(String(body.order_id)).first(); } catch (e) {}
    if (order && order.status === 'pending') {
      const det = await pakasirDetail(apiKey, project, order.id, order.amount);
      if (det?.transaction?.status === 'completed') {
        if (await claimOrder(db, order.id)) {
          const fresh = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(order.id).first();
          try { await creditTopup(env, fresh); } catch (e) {}
        }
      }
    }
    return json({ received: true });
  }

  // ---- Batalkan order ----
  if (body.action === 'cancel') {
    const orderId = String(body.order_id || '');
    if (!orderId) return json({ error: 'order_id required' }, 400);
    const apiKey = await getSecret(env, 'PAKASIR_API_KEY');
    const project = (await getSecret(env, 'PAKASIR_PROJECT')) || 'clincoo';
    let order = null;
    try { order = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(orderId).first(); } catch (e) {}
    if (!order) return json({ error: 'order not found' }, 404);
    if (apiKey && order.status === 'pending') {
      await pakasirPost('/api/transactioncancel', apiKey, project, order.id, order.amount);
      await db.prepare("UPDATE topup_orders SET status = 'failed' WHERE id = ?").bind(order.id).run();
    }
    return json({ success: true });
  }

  // ---- Buat transaksi QRIS baru ----
  if (body.action !== 'create') return json({ error: 'unknown action' }, 400);

  const tpUser = await currentUser(env, request);
  if (!tpUser) return json({ error: 'Login diperlukan', need_login: true }, 401);

  const amount = parseInt(body.amount, 10);
  if (!amount || amount < 10000) return json({ error: 'minimal top up 10000' }, 400);

  const apiKey = await getSecret(env, 'PAKASIR_API_KEY');
  if (!apiKey) {
    return json({
      error: 'payment_not_configured',
      message: 'PAKASIR_API_KEY belum diatur. Tambahkan di Cloudflare Pages > Settings > Environment variables, atau di tabel env_vars.'
    }, 503);
  }
  const project = (await getSecret(env, 'PAKASIR_PROJECT')) || 'clincoo';

  const orderId = 'TOPUPQ-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const pay = await pakasirPost('/api/transactioncreate/qris', apiKey, project, orderId, amount);
  const p = pay?.payment;
  if (!p || !p.payment_number) {
    return json({ error: 'pakasir_error', message: (pay?.message) || 'Gagal membuat transaksi QRIS di Pakasir.' }, 502);
  }

  // Kolom tambahan untuk QRIS Pakasir (aman dipanggil berulang)
  try { await db.prepare('ALTER TABLE topup_orders ADD COLUMN pakasir_qr TEXT').run(); } catch (e) {}
  try { await db.prepare('ALTER TABLE topup_orders ADD COLUMN pakasir_total REAL').run(); } catch (e) {}
  try { await db.prepare('ALTER TABLE topup_orders ADD COLUMN pakasir_expired TEXT').run(); } catch (e) {}

  await db.prepare(
    'INSERT INTO topup_orders (id, amount, method, status, xendit_id, invoice_url, user_id, pakasir_qr, pakasir_total, pakasir_expired) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?)'
  ).bind(orderId, amount, 'QRIS (Pakasir)', 'pending', tpUser.id, p.payment_number, p.total_payment || amount, p.expired_at || null).run();

  try {
    await db.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)')
      .bind('topup_qris_created', orderId + ' (' + amount + ')', tpUser.id).run();
  } catch (e) {}

  return json({
    success: true,
    order_id: orderId,
    qr_string: p.payment_number,
    amount: amount,
    fee: p.fee || 0,
    total_payment: p.total_payment || amount,
    expired_at: p.expired_at || null,
    sandbox: (p.is_sandbox === true) || null
  });
}
