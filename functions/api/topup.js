// Cloudflare Pages Functions - Top Up via Midtrans Snap
// Real-time top-up: create transaction -> Snap popup -> webhook verifies payment -> balance updated
// Server key source: env.MIDTRANS_SERVER_KEY (Pages env var) or D1 env_vars table (key: MIDTRANS_SERVER_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

async function getServerKey(env) {
  if (env.MIDTRANS_SERVER_KEY) return env.MIDTRANS_SERVER_KEY;
  try {
    const row = await env.DB.prepare("SELECT value FROM env_vars WHERE key = 'MIDTRANS_SERVER_KEY' AND (project_id IS NULL OR project_id = '')").first();
    if (row?.value) return row.value;
  } catch {}
  return null;
}

function isProductionKey(key) {
  return key && !key.startsWith('SB-');
}

function snapBaseUrl(key) {
  return isProductionKey(key) ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...CORS } });
}

// GET /api/topup?action=status&order_id=X — poll order status (real-time check)
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    if (action !== 'status') return json({ error: 'unknown action' }, 400);

    const orderId = url.searchParams.get('order_id');
    if (!orderId) return json({ error: 'order_id required' }, 400);

    const order = await env.DB.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(orderId).first();
    if (!order) return json({ error: 'order not found' }, 404);

    const balRow = await env.DB.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first();
    return json({
      order_id: order.id,
      amount: order.amount,
      method: order.method,
      status: order.status,
      transaction_status: order.transaction_status,
      balance: parseFloat(balRow?.value || '0')
    });
  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// POST /api/topup
//  a) JSON {action:'create', amount, method} -> create Snap transaction, return token
//  b) Midtrans notification (webhook) -> verify signature -> credit balance (real-time)
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return json({ error: 'D1 not bound' }, 500);

  let body = {};
  const contentType = request.headers.get('content-type') || '';
  try {
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else {
      // Midtrans sends x-www-form-urlencoded notifications
      const form = await request.formData();
      for (const [k, v] of form.entries()) {
        try { body[k] = JSON.parse(v); } catch { body[k] = v; }
      }
    }
  } catch (err) {
    return json({ error: 'invalid body' }, 400);
  }

  // ---- Midtrans webhook notification ----
  if (body.transaction_status && body.order_id) {
    return await handleMidtransNotification(db, env, body);
  }

  // ---- Create top-up transaction ----
  if (body.action === 'create') {
    return await createTopup(db, env, body);
  }

  return json({ error: 'unknown action' }, 400);
}

async function createTopup(db, env, body) {
  const serverKey = await getServerKey(env);
  if (!serverKey) {
    return json({
      error: 'payment_not_configured',
      message: 'MIDTRANS_SERVER_KEY belum diatur. Tambahkan di Cloudflare Pages > Settings > Environment variables, atau di tabel env_vars.'
    }, 503);
  }

  const amount = parseInt(body.amount, 10);
  if (!amount || amount < 10000) return json({ error: 'minimal top up 10000' }, 400);

  const method = body.method === 'Virtual Account' ? 'Virtual Account' : 'QRIS Instant';
  const orderId = 'TOPUP-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

  const enabledPayments = method === 'Virtual Account'
    ? ['bca_va', 'bni_va', 'bri_va', 'mandiri_va', 'other_va']
    : ['qris', 'gopay', 'shopeepay', 'other_qris'];

  const auth = btoa(serverKey + ':');

  const payload = {
    transaction_details: { order_id: orderId, gross_amount: amount },
    item_details: [{ id: 'topup', price: amount, quantity: 1, name: 'Top Up Saldo Clincoo' }],
    customer_details: { first_name: 'Clincoo User' },
    enabled_payments: enabledPayments
  };

  const res = await fetch(snapBaseUrl(serverKey) + '/snap/v1/transactions', {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    return json({ error: data.error_messages || 'midtrans error', message: Array.isArray(data.error_messages) ? data.error_messages.join(', ') : data.error_messages }, res.status);
  }

  // Save pending order
  await db.prepare(
    'INSERT INTO topup_orders (id, amount, method, status, snap_token, transaction_status) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(orderId, amount, method, 'pending', data.token, null).run();

  await db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)')
    .bind('topup_created', orderId + ' (' + method + ': ' + amount + ')').run();

  return json({
    success: true,
    order_id: orderId,
    token: data.token,
    client_key: serverKey.startsWith('SB-') ? serverKey.replace('SB-Mid-server-', 'SB-Mid-client-') : serverKey.replace('Mid-server-', 'Mid-client-'),
    is_production: isProductionKey(serverKey)
  });
}

async function handleMidtransNotification(db, env, body) {
  const serverKey = await getServerKey(env) || '';
  const { order_id, status_code, gross_amount, signature_key, transaction_status } = body;

  // Verify signature: sha512(order_id + status_code + gross_amount + serverKey)
  const expected = await sha512Hex(order_id + (status_code || '') + (gross_amount || '') + serverKey);
  if (!signature_key || signature_key.toLowerCase() !== expected) {
    return json({ error: 'invalid signature' }, 403);
  }

  const order = await db.prepare('SELECT * FROM topup_orders WHERE id = ?').bind(order_id).first();
  if (!order) return json({ received: true, note: 'order not found' });

  // Update transaction status
  await db.prepare('UPDATE topup_orders SET transaction_status = ? WHERE id = ?').bind(transaction_status, order_id).run();

  // Credit balance once — idempotent
  const paidStatuses = ['capture', 'settlement'];
  if (paidStatuses.includes(transaction_status) && order.status !== 'paid') {
    const txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
    await db.prepare('INSERT INTO wallet_transactions (id, title, amount, type, method) VALUES (?, ?, ?, ?, ?)')
      .bind(txId, 'Isi Saldo via ' + (order.method || 'Midtrans'), order.amount, 'in', order.method || 'Midtrans').run();

    const balRow = await db.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first();
    let balance = parseFloat(balRow?.value || '0') + parseFloat(order.amount);
    await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .bind(String(balance)).run();

    await db.prepare("UPDATE topup_orders SET status = 'paid', paid_at = datetime('now') WHERE id = ?").bind(order_id).run();

    await db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)')
      .bind('topup_paid', order_id + ' (+' + order.amount + ')').run();
  }

  // Deny/cancel/expire -> mark failed
  if (['deny', 'cancel', 'expire'].includes(transaction_status) && order.status !== 'paid') {
    await db.prepare("UPDATE topup_orders SET status = 'failed' WHERE id = ?").bind(order_id).run();
  }

  return json({ received: true });
}

async function sha512Hex(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-512', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}
