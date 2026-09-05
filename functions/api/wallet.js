// Cloudflare Pages Functions - Wallet Backend (per-account)
import { currentUser, scopedKey, rowScope } from './user-scope.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function j(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

// GET /api/wallet?action=transactions — list transaksi; GET /api/wallet — saldo
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');
    const user = await currentUser(env, request);

    if (action === 'transactions') {
      const uid = await rowScope(db, 'wallet_transactions', user);
      const txs = uid
        ? await db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC').bind(uid).all()
        : await db.prepare('SELECT * FROM wallet_transactions ORDER BY created_at DESC').all();
      return j({ transactions: txs.results || [] });
    }

    const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
    const row = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
    return j({ balance: parseFloat(row?.value || '0') });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}

// POST /api/wallet — add_transaction | set_balance | clear_transactions
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const body = await request.json();
    const action = body.action || 'add_transaction';
    const user = await currentUser(env, request);
    const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
    const uid = user ? user.id : null;

    if (action === 'add_transaction') {
      const { title, amount, type, method } = body;
      if (!title || amount == null || !type) return j({ error: 'title, amount, type required' }, 400);

      await rowScope(db, 'wallet_transactions', user);
      const txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
      await db.prepare('INSERT INTO wallet_transactions (id, title, amount, type, method, user_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(txId, title, parseFloat(amount), type, method || '', uid).run();

      const balRow = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
      let balance = parseFloat(balRow?.value || '0');
      if (type === 'in') balance += parseFloat(amount);
      else if (type === 'out') balance -= parseFloat(amount);

      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, String(balance)).run();

      try {
        await rowScope(db, 'activity_log', user);
        await db.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)').bind('wallet_transaction', title + ' (' + type + ': ' + amount + ')', uid).run();
      } catch {}

      return j({ success: true, id: txId, balance });
    }

    if (action === 'set_balance') {
      const balance = parseFloat(body.balance || 0);
      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, String(balance)).run();
      return j({ success: true, balance });
    }

    if (action === 'clear_transactions') {
      await rowScope(db, 'wallet_transactions', user);
      if (uid) await db.prepare('DELETE FROM wallet_transactions WHERE user_id = ?').bind(uid).run();
      else await db.prepare('DELETE FROM wallet_transactions').run();
      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, '0').run();
      return j({ success: true, balance: 0 });
    }

    return j({ error: 'Unknown action' }, 400);
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}

// DELETE /api/wallet?id=... — hapus satu transaksi; tanpa id — hapus semua (milik user)
export async function onRequestDelete({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const user = await currentUser(env, request);
    const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
    const uid = user ? user.id : null;
    await rowScope(db, 'wallet_transactions', user);

    if (id) {
      const tx = uid
        ? await db.prepare('SELECT * FROM wallet_transactions WHERE id = ? AND user_id = ?').bind(id, uid).first()
        : await db.prepare('SELECT * FROM wallet_transactions WHERE id = ?').bind(id).first();
      if (tx) {
        const balRow = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
        let balance = parseFloat(balRow?.value || '0');
        if (tx.type === 'in') balance -= parseFloat(tx.amount);
        else if (tx.type === 'out') balance += parseFloat(tx.amount);
        if (balance < 0) balance = 0;

        if (uid) await db.prepare('DELETE FROM wallet_transactions WHERE id = ? AND user_id = ?').bind(id, uid).run();
        else await db.prepare('DELETE FROM wallet_transactions WHERE id = ?').bind(id).run();
        await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
          .bind(balKey, String(balance)).run();
        return j({ success: true, balance });
      }
      const cur = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
      return j({ success: true, balance: parseFloat(cur?.value || '0') });
    }

    if (uid) await db.prepare('DELETE FROM wallet_transactions WHERE user_id = ?').bind(uid).run();
    else await db.prepare('DELETE FROM wallet_transactions').run();
    await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind(balKey, '0').run();
    return j({ success: true, balance: 0 });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}
