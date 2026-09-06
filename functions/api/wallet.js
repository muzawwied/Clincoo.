// Cloudflare Pages Functions - Wallet Backend (per-account)
import { currentUser, scopedKey, rowScope } from './user-scope.js';
import { pushWalletToExternal } from './wallet-sync.js';
import { emailTemplate, formatIDR, sendEmail, notifyEvent, getUserByEmail } from './notify-helpers.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function j(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

// Ambil secret dari env Pages atau tabel env_vars D1 (per-proyek, key global = project_id NULL)
async function getSecret(env, key) {
  if (env[key]) return env[key];
  try {
    const row = await env.DB.prepare("SELECT value FROM env_vars WHERE key = ? AND (project_id IS NULL OR project_id = '')").bind(key).first();
    if (row?.value) return row.value;
  } catch {}
  return null;
}

// Callback top up (Base44/Xendit) datang TANPA login — identifikasi pemilik akun
// dari email di payload (email/payer_email) saja, lalu scope saldo/transaksi/notifikasi/email
// ke akun pemilik. Tanpa token ATAU email dikenal => ditolak (fail-closed).
// Webhook Xendit asli memakai /api/topup dengan verifikasi x-callback-token, bukan endpoint ini.
async function resolveOwner(env, request, body) {
  const u = await currentUser(env, request);
  if (u) return u;
  const cands = [];
  if (body) {
    if (body.email) cands.push(body.email);
    if (body.payer_email) cands.push(body.payer_email);
  }
  for (const c of cands) {
    if (!c) continue;
    const found = await getUserByEmail(env.DB, c);
    if (found) return found;
  }
  return null;
}

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
      if (!uid) return j({ transactions: [] }); // tanpa login: jangan bocorkan transaksi akun lain
      const txs = await db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC').bind(uid).all();
      return j({ transactions: txs.results || [] });
    }

    const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
    const row = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
    return j({ balance: parseFloat(row?.value || '0') });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}


// Dorong snapshot dompet ke web wallet eksternal (bila integrasi aktif) — tanpa menunggu
function pushExternal(env, user) {
  try { pushWalletToExternal(env, user).catch(function () {}); } catch (e) {}
}

// POST /api/wallet — add_transaction | set_balance | clear_transactions
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const body = await request.json();
    const action = body.action || 'add_transaction';
    const user = await resolveOwner(env, request, body);
    const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
    const uid = user ? user.id : null;

    // Mutasi dompet wajib login — mencegah penulisan/penghapusan data lintas akun
    if (!uid) return j({ error: 'Login diperlukan', need_login: true }, 401);

    if (action === 'add_transaction') {
      const { title, amount, type, method } = body;
      if (!title || amount == null || !type) return j({ error: 'title, amount, type required' }, 400);
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount)) return j({ error: 'amount tidak valid' }, 400);

      await rowScope(db, 'wallet_transactions', user);

      // Idempotensi top up Xendit: order_id yang sudah pernah dikreditkan tidak dikreditkan/dinotifikasi lagi
      // (mencegah saldo & notif dobel jika pemanggil — mis. callback Koda — mengirim request yang sama 2x)
      const orderId = (String(title).match(/\[(TOPUP-[^\]]+)\]/) || [])[1] || null;
      if (orderId) {
        const dup = await db.prepare('SELECT id FROM wallet_transactions WHERE user_id = ? AND title = ? LIMIT 1').bind(uid, title).first();
        if (dup) {
          const balRowDup = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
          return j({ success: true, id: dup.id, balance: parseFloat(balRowDup?.value || '0'), duplicate: true });
        }
      }

      const txId = 'TX-' + Math.floor(100000 + Math.random() * 900000);
      await db.prepare('INSERT INTO wallet_transactions (id, title, amount, type, method, user_id) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(txId, title, parsedAmount, type, method || '', uid).run();

      const balRow = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
      let balance = parseFloat(balRow?.value || '0');
      if (type === 'in') balance += parsedAmount;
      else if (type === 'out') balance -= parsedAmount;

      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, String(balance)).run();

      // Notifikasi in-app + email konfirmasi (Brevo) — hanya utk transaksi hasil top up Xendit
      if (/^top up xendit/i.test(String(title))) {
        const nres = { notif: false, email: null };
        try {
          nres.notif = await notifyEvent(db, user, {
            source: 'Dompet', type: 'wallet',
            message: 'Top up ' + formatIDR(parsedAmount) + ' via ' + (method || 'Xendit') + ' berhasil. Saldo sekarang ' + formatIDR(balance) + '.',
            link: 'https://muzawwied.github.io/Clincoo./akun/dompet.html'
          });
        } catch (e) { nres.notifErr = String(e && e.message || e); }
        if (user && user.email) {
          try {
            nres.email = await sendEmail(env, {
              toEmail: user.email, toName: user.name || '',
              subject: 'Konfirmasi Top Up Clincoo — ' + formatIDR(parsedAmount),
              html: emailTemplate(
                'Top Up Berhasil',
                user.name || '',
                'Top up saldo Clincoo Anda telah berhasil diproses dan saldo telah masuk ke Dompet Anda. Berikut rincian transaksinya:',
                [
                  ['Jumlah Top Up', formatIDR(parsedAmount) + ' (' + (method || 'Xendit') + ')'],
                  ['Saldo Saat Ini', formatIDR(balance)],
                  ['ID Transaksi', txId],
                  ['Order ID', orderId]
                ],
                'Lihat Riwayat Dompet',
                'https://muzawwied.github.io/Clincoo./akun/dompet.html',
                'Rincian lengkap transaksi dapat dilihat di halaman Dompet pada akun Clincoo Anda.'
              )
            });
          } catch (e) { nres.emailErr = String(e && e.message || e); }
        }
        try {
          await rowScope(db, 'activity_log', user);
          await db.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)')
            .bind('notify_email_result', 'notif=' + String(nres.notif) + ' email=' + JSON.stringify(nres.email).slice(0, 200), uid).run();
        } catch (e2) {}
      }

      try {
        await rowScope(db, 'activity_log', user);
        await db.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)').bind('wallet_transaction', title + ' (' + type + ': ' + amount + ')', uid).run();
      } catch {}

      pushExternal(env, user);
      return j({ success: true, id: txId, balance });
    }

    if (action === 'set_balance') {
      const balance = parseFloat(body.balance || 0);
      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, String(balance)).run();
      pushExternal(env, user);
      return j({ success: true, balance });
    }

    if (action === 'clear_transactions') {
      await rowScope(db, 'wallet_transactions', user);
      await db.prepare('DELETE FROM wallet_transactions WHERE user_id = ?').bind(uid).run();
      await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .bind(balKey, '0').run();
      pushExternal(env, user);
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

    // Hapus transaksi wajib login — mencegah penghapusan data akun lain
    if (!uid) return j({ error: 'Login diperlukan', need_login: true }, 401);
    await rowScope(db, 'wallet_transactions', user);

    if (id) {
      const tx = await db.prepare('SELECT * FROM wallet_transactions WHERE id = ? AND user_id = ?').bind(id, uid).first();
      if (tx) {
        const balRow = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
        let balance = parseFloat(balRow?.value || '0');
        if (tx.type === 'in') balance -= parseFloat(tx.amount);
        else if (tx.type === 'out') balance += parseFloat(tx.amount);
        if (balance < 0) balance = 0;

        await db.prepare('DELETE FROM wallet_transactions WHERE id = ? AND user_id = ?').bind(id, uid).run();
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
