import { currentUser, rowScope } from './user-scope.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Jenis aktivitas yang ditampilkan di halaman Aktivitas (semua yang memang ditulis sistem)
const ALLOWED_ACTIONS = [
  'login',                  // Login berhasil
  'login_detected',         // (legacy)
  'delete_project',         // Proyek dihapus
  'wallet_transaction',     // Transaksi dompet / top up
  'topup',                  // (legacy) Top up saldo
  'topup_created',          // Order top up dibuat
  'topup_paid',             // Top up dibayar
  'subscription',           // Aktivasi/aktivitas langganan
  'subscribe',              // (legacy)
  'deploy_triggered',       // Deploy dipicu (build/push GitHub)
  'redeploy_triggered',     // Deploy ulang
  'settings_update',        // Perubahan pengaturan umum
  'project_settings_update',// Perubahan pengaturan proyek
  'security_updated',       // Perubahan keamanan
  'profile_updated',        // Perubahan profil
  'preferences_update',     // Perubahan preferensi
  'env_var_added',          // Variabel environment ditambah
  'env_var_deleted'         // Variabel environment dihapus
];

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

// Semua handler wajib login — aktivitas bersifat per-akun (isolasi data, fail-closed)
export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

    const user = await currentUser(env, request);
    const uid = user ? user.id : null;
    if (!uid) return new Response(JSON.stringify({ error: 'Login diperlukan', need_login: true }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });

    await rowScope(env.DB, 'activity_log', user);
    const placeholders = ALLOWED_ACTIONS.map(() => '?').join(',');
    const rows = await env.DB.prepare('SELECT * FROM activity_log WHERE user_id = ? AND action IN (' + placeholders + ') ORDER BY created_at DESC LIMIT ?')
      .bind(uid, ...ALLOWED_ACTIONS, limit).all();

    return new Response(JSON.stringify({ activities: rows.results || [] }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();
    // Kompatibilitas: terima {action, details} maupun {type, description} (lama)
    const action = body.action || body.type;
    const details = body.details || body.description || '';
    const actUser = await currentUser(env, request);
    const actUid = actUser ? actUser.id : null;
    if (!actUid) return new Response(JSON.stringify({ error: 'Login diperlukan', need_login: true }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
    if (!action) return new Response(JSON.stringify({ error: 'action required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
    });
    await env.DB.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)').bind(action, details, actUid).run();
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}

export async function onRequestDelete({ env, request }) {
  try {
    const delUser = await currentUser(env, request);
    const delUid = delUser ? delUser.id : null;
    if (!delUid) return new Response(JSON.stringify({ error: 'Login diperlukan', need_login: true }), { status: 401, headers: { 'Content-Type': 'application/json', ...CORS } });
    await env.DB.prepare('DELETE FROM activity_log WHERE user_id = ?').bind(delUid).run();
    return new Response(JSON.stringify({ success: true, message: 'Activity log cleared' }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
