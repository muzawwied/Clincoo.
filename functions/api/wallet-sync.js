// Cloudflare Pages Functions — Jembatan sinkronisasi DOMPET dua arah
// (Clincoo Dompet <-> web wallet eksternal milik akun)
//
// GET  /api/wallet-sync                  (Bearer JWT) -> konfigurasi integrasi; api_key dibuat otomatis
// GET  /api/wallet-sync?action=external_pull&api_key=K -> data dompet terbaru (ditarik web wallet)
// POST /api/wallet-sync (Bearer JWT)     -> { action: 'set_url' | 'reset_key' | 'push_now' }
// POST /api/wallet-sync (tanpa login)    -> { action: 'external_push', api_key, data } dari web wallet
//
// Protokol data: { balance: number, transactions: [{ id?, title, amount, type:'in'|'out', method? }] }
// Arah wallet -> Clincoo: external_push. Arah Clincoo -> wallet: pushWalletToExternal
// (dipanggil otomatis setelah saldo berubah di Clincoo, plus manual via push_now).

import { currentUser, scopedKey, rowScope } from './user-scope.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function j(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json', ...CORS } });
}

export async function onRequestOptions() { return new Response(null, { headers: CORS }); }

function newApiKey() {
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function getPref(db, fullKey) {
  const r = await db.prepare('SELECT value FROM user_preferences WHERE key = ?').bind(fullKey).first();
  return r?.value || '';
}
async function setPref(db, fullKey, val) {
  await db.prepare('INSERT INTO user_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .bind(fullKey, String(val)).run();
}

// Konfigurasi integrasi per akun (api_key dibuat malas saat pertama kali diminta)
async function ensureSyncConfig(db, user) {
  const p = 'u' + user.id + ':';
  let key = await getPref(db, p + 'wallet_sync_key');
  if (!key) { key = newApiKey(); await setPref(db, p + 'wallet_sync_key', key); }
  return {
    api_key: key,
    target_url: await getPref(db, p + 'wallet_sync_url'),
    last_sync_at: await getPref(db, p + 'wallet_sync_at') || null
  };
}

// Cari pemilik akun dari API key (jalur eksternal tanpa login — fail-closed bila key tak cocok)
async function findOwnerByApiKey(db, apiKey) {
  if (!apiKey) return null;
  const row = await db.prepare("SELECT key FROM user_preferences WHERE value = ? AND key LIKE '%:wallet_sync_key'")
    .bind(String(apiKey)).first();
  if (!row || !row.key) return null;
  const m = row.key.match(/^u(\d+):/);
  if (!m) return null;
  return { id: Number(m[1]) };
}

// Snapshot data dompet (saldo + 100 transaksi terakhir)
async function walletSnapshot(db, user) {
  const balKey = await scopedKey(db, 'wallet_balance', user, 'balance');
  const balRow = await db.prepare('SELECT value FROM wallet_balance WHERE key = ?').bind(balKey).first();
  const uid = await rowScope(db, 'wallet_transactions', user);
  let txs = [];
  if (uid) {
    const res = await db.prepare('SELECT * FROM wallet_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 100').bind(uid).all();
    txs = res.results || [];
  }
  return { balance: parseFloat(balRow?.value || '0'), transactions: txs };
}

// Dorong data dompet Clincoo ke web wallet eksternal (arah Clincoo -> wallet).
// Fire-and-forget: dipanggil tanpa await setelah mutasi saldo di /api/wallet.
export async function pushWalletToExternal(env, user) {
  try {
    const db = env.DB;
    if (!db || !user) return null;
    const cfg = await ensureSyncConfig(db, user);
    if (!cfg.target_url || !/^https:\/\//.test(cfg.target_url)) return null;
    const snap = await walletSnapshot(db, user);
    const payload = JSON.stringify({ source: 'clincoo', api_key: cfg.api_key, synced_at: new Date().toISOString(), data: snap });
    try {
      await fetch(cfg.target_url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload });
    } catch (e) {}
    await setPref(db, 'u' + user.id + ':wallet_sync_at', new Date().toISOString());
    return true;
  } catch (e) { return null; }
}

export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    // Web wallet menarik data dompet Clincoo (arah Clincoo -> wallet, pull)
    if (action === 'external_pull') {
      const owner = await findOwnerByApiKey(db, url.searchParams.get('api_key'));
      if (!owner) return j({ error: 'API key tidak valid' }, 401);
      const snap = await walletSnapshot(db, owner);
      return j({ source: 'clincoo', synced_at: new Date().toISOString(), data: snap });
    }

    const user = await currentUser(env, request);
    if (!user) return j({ error: 'Login diperlukan', need_login: true }, 401);
    return j(await ensureSyncConfig(db, user));
  } catch (err) { return j({ error: err.message }, 500); }
}

export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return j({ error: 'D1 not bound' }, 500);
  try {
    const body = await request.json();

    // === Jalur eksternal: web wallet mendorong datanya (arah wallet -> Clincoo) ===
    if (body.action === 'external_push') {
      const owner = await findOwnerByApiKey(db, body.api_key);
      if (!owner) return j({ error: 'API key tidak valid' }, 401);
      const data = body.data || {};
      const p = 'u' + owner.id + ':';

      if (data.balance != null) {
        const bal = parseFloat(data.balance);
        if (!isNaN(bal)) {
          const balKey = await scopedKey(db, 'wallet_balance', owner, 'balance');
          await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
            .bind(balKey, String(bal)).run();
        }
      }

      if (Array.isArray(data.transactions)) {
        const uid = await rowScope(db, 'wallet_transactions', owner);
        if (uid) {
          if (data.replace) await db.prepare('DELETE FROM wallet_transactions WHERE user_id = ?').bind(uid).run();
          for (const t of data.transactions.slice(0, 200)) {
            if (!t || t.title == null || t.amount == null) continue;
            const amount = parseFloat(t.amount);
            if (isNaN(amount)) continue;
            const title = String(t.title);
            if (!data.replace) {
              const dup = await db.prepare('SELECT id FROM wallet_transactions WHERE user_id = ? AND title = ? LIMIT 1').bind(uid, title).first();
              if (dup) continue;
            }
            const txId = (t.id != null && String(t.id)) ? String(t.id) : 'TX-' + Math.floor(100000 + Math.random() * 900000);
            const type = (t.type === 'out') ? 'out' : 'in';
            await db.prepare('INSERT INTO wallet_transactions (id, title, amount, type, method, user_id) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(txId, title, amount, type, String(t.method || 'wallet-sync'), uid).run();
          }
          // Jika replace penuh tanpa saldo eksplisit, hitung ulang saldo dari transaksi
          if (data.replace && data.balance == null) {
            const res = await db.prepare("SELECT COALESCE(SUM(CASE WHEN type='in' THEN amount ELSE -amount END), 0) AS b FROM wallet_transactions WHERE user_id = ?").bind(uid).first();
            const balKey = await scopedKey(db, 'wallet_balance', owner, 'balance');
            await db.prepare('INSERT INTO wallet_balance (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
              .bind(balKey, String(res?.b || 0)).run();
          }
        }
      }

      await setPref(db, p + 'wallet_sync_at', new Date().toISOString());
      const snap = await walletSnapshot(db, owner);
      return j({ success: true, synced_at: new Date().toISOString(), data: snap });
    }

    const user = await currentUser(env, request);
    if (!user) return j({ error: 'Login diperlukan', need_login: true }, 401);
    const p = 'u' + user.id + ':';

    if (body.action === 'set_url') {
      const u = String(body.target_url || '').trim();
      if (!u) { await setPref(db, p + 'wallet_sync_url', ''); return j({ success: true, target_url: '' }); }
      if (!/^https:\/\//.test(u)) return j({ error: 'URL harus diawali https://' }, 400);
      await setPref(db, p + 'wallet_sync_url', u);
      return j({ success: true, target_url: u });
    }
    if (body.action === 'reset_key') {
      await setPref(db, p + 'wallet_sync_key', newApiKey());
      return j({ success: true });
    }
    if (body.action === 'push_now') {
      const ok = await pushWalletToExternal(env, user);
      if (!ok) return j({ error: 'URL wallet belum diatur atau tidak valid' }, 400);
      return j({ success: true, pushed: true });
    }
    return j({ error: 'action tidak dikenal' }, 400);
  } catch (err) { return j({ error: err.message }, 500); }
}
