// Cloudflare Pages Functions - Wallet Backend
// Stores wallet balance and transactions in D1 (no localStorage dummy data)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

// GET /api/wallet?action=transactions — list transactions
// GET /api/wallet — get balance
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'transactions') {
      const txs = await db.prepare('SELECT * FROM wallet_transactions ORDER BY created_at DESC').all();
      return new Response(JSON.stringify({ transactions: txs.results || [] }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Default: get balance
    const row = await db.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first();
    const balance = parseFloat(row?.value || '0');
    return new Response(JSON.stringify({ balance }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// POST /api/wallet — add transaction, update balance
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    const body = await request.json();
    const action = body.action || 'add_transaction';

    if (action === 'add_transaction') {
      const { title, amount, type, method } = body;
      if (!title || amount == null || !type) {
        return new Response(JSON.stringify({ error: 'title, amount, type required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      }

      const txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
      await db.prepare('INSERT INTO wallet_transactions (id, title, amount, type, method) VALUES (?, ?, ?, ?, ?)')
        .bind(txId, title, parseFloat(amount), type, method || '').run();

      // Update balance
      const balRow = await db.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first();
      let balance = parseFloat(balRow?.value || '0');
      if (type === 'in') balance += parseFloat(amount);
      else if (type === 'out') balance -= parseFloat(amount);

      await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(String(balance)).run();

      // Log activity
      try { await db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').bind('wallet_transaction', title + ' (' + type + ': ' + amount + ')').run(); } catch {}

      return new Response(JSON.stringify({ success: true, id: txId, balance }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    if (action === 'set_balance') {
      const balance = parseFloat(body.balance || 0);
      await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
        .bind(String(balance)).run();
      return new Response(JSON.stringify({ success: true, balance }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    if (action === 'clear_transactions') {
      // Clear all transactions and reset balance to 0
      await db.prepare('DELETE FROM wallet_transactions').run();
      await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
      return new Response(JSON.stringify({ success: true, balance: 0 }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// DELETE — delete a single transaction by id
export async function onRequestDelete({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (id) {
      // Get the transaction to adjust balance
      const tx = await db.prepare('SELECT * FROM wallet_transactions WHERE id = ?').bind(id).first();
      if (tx) {
        const balRow = await db.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first();
        let balance = parseFloat(balRow?.value || '0');
        if (tx.type === 'in') balance -= parseFloat(tx.amount);
        else if (tx.type === 'out') balance += parseFloat(tx.amount);
        if (balance < 0) balance = 0;

        await db.prepare('DELETE FROM wallet_transactions WHERE id = ?').bind(id).run();
        await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
          .bind(String(balance)).run();
      }
      return new Response(JSON.stringify({ success: true, balance: balance }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // No id = delete all
    await db.prepare('DELETE FROM wallet_transactions').run();
    await db.prepare("INSERT INTO wallet_balance (key, value) VALUES ('balance', '0') ON CONFLICT(key) DO UPDATE SET value = '0'").run();
    return new Response(JSON.stringify({ success: true, balance: 0 }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
