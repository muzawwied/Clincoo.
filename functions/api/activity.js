import { currentUser, rowScope } from './user-scope.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Only these activity types are shown
const ALLOWED_ACTIONS = [
  'login',           // Login detected
  'delete_project',  // Project deleted
  'subscription',    // Subscription activity
  'wallet_transaction', // Top up / wallet
  'subscribe',       // Subscription change
  'topup',           // Top up saldo
  'login_detected'   // Login detected (alt name)
];

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ env, request }) {
  try {
    const url = new URL(request.url);
    const limit = url.searchParams.get('limit') || 50;
    
    // Only fetch allowed activity types
    const user = await currentUser(env, request);
    const uid = await rowScope(env.DB, 'activity_log', user);

    // Only fetch allowed activity types
    const placeholders = ALLOWED_ACTIONS.map(() => '?').join(',');
    const rows = uid
      ? await env.DB.prepare('SELECT * FROM activity_log WHERE user_id = ? AND action IN (' + placeholders + ') ORDER BY created_at DESC LIMIT ?').bind(uid, ...ALLOWED_ACTIONS, parseInt(limit)).all()
      : await env.DB.prepare('SELECT * FROM activity_log WHERE action IN (' + placeholders + ') ORDER BY created_at DESC LIMIT ?').bind(...ALLOWED_ACTIONS, parseInt(limit)).all();
    
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
    const { action, details } = await request.json();
    const actUser = await currentUser(env, request);
    const actUid = await rowScope(env.DB, 'activity_log', actUser);
    if (!action) return new Response(JSON.stringify({ error: 'action required' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
    });
    await env.DB.prepare('INSERT INTO activity_log (action, details, user_id) VALUES (?, ?, ?)').bind(action, details || '', actUid).run();
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
    const delUid = await rowScope(env.DB, 'activity_log', delUser);
    if (delUid) await env.DB.prepare('DELETE FROM activity_log WHERE user_id = ?').bind(delUid).run();
    else await env.DB.prepare('DELETE FROM activity_log').run();
    return new Response(JSON.stringify({ success: true, message: 'Activity log cleared' }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
