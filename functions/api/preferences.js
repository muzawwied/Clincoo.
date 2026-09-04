// Cloudflare Pages Functions - User Preferences Backend
// Stores toggle/settings data in D1 (real-time, interconnected)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

// GET /api/preferences — get all preferences
// GET /api/preferences?key=analytics — get specific key
export async function onRequestGet({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS user_preferences (key TEXT PRIMARY KEY, value TEXT)').run();
    
    // Default values
    const defaults = {
      analytics: 'true',
      personalization: 'true'
    };

    const url = new URL(request.url);
    const key = url.searchParams.get('key');

    if (key) {
      const row = await db.prepare('SELECT value FROM user_preferences WHERE key = ?').bind(key).first();
      const value = row?.value || defaults[key] || null;
      return new Response(JSON.stringify({ key, value }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    const rows = await db.prepare('SELECT key, value FROM user_preferences').all();
    const data = { ...defaults };
    for (const row of rows.results || []) {
      data[row.key] = row.value;
    }

    // Also gather linked data for export
    const subRow = await db.prepare("SELECT value FROM user_preferences WHERE key = 'plan_info'").first();
    const exportData = {
      preferences: data
    };

    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// POST /api/preferences — update preferences
// Body: { analytics: 'true', personalization: 'false' }
// Body: { key: 'analytics', value: 'true' }
export async function onRequestPost({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS user_preferences (key TEXT PRIMARY KEY, value TEXT)').run();
    
    const body = await request.json();
    const updates = body.key ? { [body.key]: body.value } : body;
    
    for (const [key, value] of Object.entries(updates)) {
      if (key === 'key' || key === 'value') continue; // skip wrapper fields
      await db.prepare("INSERT INTO user_preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(key, String(value)).run();
    }

    // Log activity
    const changedKeys = Object.keys(updates).filter(k => k !== 'key' && k !== 'value');
    if (changedKeys.length > 0) {
      try {
        await db.prepare("INSERT INTO activity_log (action, details) VALUES (?, ?)").bind('preferences_update', JSON.stringify(updates)).run();
      } catch(e) {}
    }

    return new Response(JSON.stringify({ success: true, updated: updates }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

// DELETE /api/preferences — delete account data (danger zone)
export async function onRequestDelete({ request, env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    // Clear all user data
    await db.prepare("DELETE FROM user_preferences").run();
    await db.prepare("DELETE FROM activity_log").run();
    await db.prepare("DELETE FROM subscription").run();
    await db.prepare("DELETE FROM notifications").run();
    await db.prepare("DELETE FROM projects").run();
    await db.prepare("DELETE FROM env_vars").run();
    await db.prepare("DELETE FROM wallet_transactions").run();
    await db.prepare("DELETE FROM wallet_balance").run();
    await db.prepare("DELETE FROM chat_messages").run();
    await db.prepare("DELETE FROM chat_sessions").run();

    return new Response(JSON.stringify({ success: true, message: 'All account data deleted' }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
