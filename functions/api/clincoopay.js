// API ClincooPay — hubungkan / putuskan dompet web Wallet milik akun Clincoo
// GET  /api/clincoopay            -> status koneksi
// POST /api/clincoopay {action:'link', wallet_address, pin}  -> verifikasi PIN di server wallet, simpan token koneksi
// POST /api/clincoopay {action:'unlink'}                    -> putuskan
import { currentUser } from './user-scope.js';
import { ensureCpTable, getCpConnection, mirroredBalance, WALLET_API } from './clincoopay-helpers.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};
function j(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}
export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    const user = await currentUser(env, request);
    if (!db) return j({ error: 'D1 not bound' }, 500);
    if (!user) return j({ connected: false });
    const conn = await getCpConnection(db, user.id);
    if (!conn) return j({ connected: false });
    const bal = await mirroredBalance(conn);
    return j({ connected: true, wallet_address: conn.wallet_address, wallet_balance: bal });
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const body = await request.json();
    const action = body.action || '';
    const user = await currentUser(env, request);
    if (!user) return j({ error: 'Login diperlukan', need_login: true }, 401);
    await ensureCpTable(db);

    if (action === 'link') {
      const address = String(body.wallet_address || '').toLowerCase().trim();
      const pin = String(body.pin || '').trim();
      if (!/^0x[0-9a-f]{40}$/.test(address)) return j({ error: 'Alamat dompet tidak valid — harus diawali 0x dan 42 karakter.' }, 400);
      if (!/^\d{6}$/.test(pin)) return j({ error: 'PIN harus 6 digit angka.' }, 400);
      // verifikasi PIN di server wallet (wallet-muz) — PIN tidak pernah disimpan Clincoo
      const r = await fetch(WALLET_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect', address: address, pin: pin, app: 'clincoo' })
      });
      const d = await r.json().catch(() => ({}));
      if (!d || !d.success) return j({ error: (d && d.error) || 'Gagal menghubungkan dompet — cek alamat & PIN.' }, 401);
      await db.prepare('DELETE FROM clincoopay_connections WHERE user_id = ?').bind(user.id).run();
      await db.prepare('INSERT INTO clincoopay_connections (user_id, wallet_address, token) VALUES (?, ?, ?)')
        .bind(user.id, address, d.token).run();
      return j({ success: true, connected: true, wallet_address: address, wallet_balance: Number(d.balance) || 0 });
    }

    if (action === 'unlink') {
      await db.prepare('DELETE FROM clincoopay_connections WHERE user_id = ?').bind(user.id).run();
      return j({ success: true, connected: false });
    }

    return j({ error: 'Aksi tidak dikenal' }, 400);
  } catch (err) {
    return j({ error: err.message }, 500);
  }
}
