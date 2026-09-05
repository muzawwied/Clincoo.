// Scoping data per akun. JANGAN beri prefix "_" (wrangler mengecualikannya dari bundle).
// Tabel KV (wallet_balance, account_profile, subscription): key per user = u<id>:<key>
// Tabel baris (wallet_transactions, notifications, activity_log, ...): kolom user_id.
// Data lama (tanpa user) otomatis diklaim user pertama yang login.
import { initTables as initAuthTables, getUserByToken, getToken } from './auth/shared.js';

export async function currentUser(env, request) {
  try {
    if (!env.DB) return null;
    await initAuthTables(env.DB);
    return await getUserByToken(env.DB, getToken(request));
  } catch (e) { return null; }
}

export async function getUserById(db, id) {
  if (!id) return null;
  try { return await db.prepare('SELECT * FROM auth_users WHERE id = ?').bind(id).first(); } catch (e) { return null; }
}

export function userPrefix(user) { return user ? 'u' + user.id + ':' : ''; }

// Kembalikan key yang sudah di-scope untuk user; efek samping: klaim data legacy sekali.
export async function scopedKey(db, table, user, key) {
  if (!user) return key;
  const p = 'u' + user.id + ':';
  try {
    const c = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE key LIKE ?`).bind(p + '%').first();
    if ((c?.c || 0) === 0) {
      // klaim: pindahkan semua key legacy (tanpa ':') ke namespace user ini
      await db.prepare(`UPDATE ${table} SET key = ? || key WHERE key NOT LIKE '%:%'`).bind(p).run();
    }
  } catch (e) {}
  return p + key;
}

// Pastikan kolom user_id ada + klaim baris legacy (NULL) ke user ini. Return user id atau null.
export async function rowScope(db, table, user) {
  try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER`).run(); } catch (e) {}
  if (!user) return null;
  try {
    const c = await db.prepare(`SELECT COUNT(*) c FROM ${table} WHERE user_id = ?`).bind(user.id).first();
    if ((c?.c || 0) === 0) {
      await db.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).bind(user.id).run();
    }
  } catch (e) {}
  return user.id;
}
