// Cloudflare Pages Functions - Export All User Data
// Pulls real data from all D1 tables for JSON export

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ env }) {
  const db = env.DB;
  if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

  try {
    // Gather all data from D1
    const [prefs, sub, walletTxs, walletBal, activities, notifs, projects, envVars, chatSessions, chatMsgs] = await Promise.all([
      db.prepare('SELECT key, value FROM user_preferences').all().catch(() => ({ results: [] })),
      db.prepare('SELECT key, value FROM subscription').all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM wallet_transactions ORDER BY created_at DESC').all().catch(() => ({ results: [] })),
      db.prepare("SELECT value FROM wallet_balance WHERE key = 'balance'").first().catch(() => null),
      db.prepare('SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 100').all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all().catch(() => ({ results: [] })),
      db.prepare('SELECT key, is_secret, created_at, updated_at FROM env_vars ORDER BY created_at DESC').all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM chat_sessions ORDER BY created_at DESC').all().catch(() => ({ results: [] })),
      db.prepare('SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 200').all().catch(() => ({ results: [] }))
    ]);

    // Build preferences object
    const preferences = {};
    for (const row of prefs.results || []) { preferences[row.key] = row.value; }

    // Build subscription object
    const subscription = {};
    for (const row of sub.results || []) { subscription[row.key] = row.value; }

    const exportData = {
      export_date: new Date().toISOString(),
      app_name: "Clincoo",
      app_version: "2.4.0",
      preferences,
      subscription,
      wallet: {
        balance: parseFloat(walletBal?.value || '0'),
        transactions: walletTxs.results || []
      },
      activity_log: activities.results || [],
      notifications: notifs.results || [],
      projects: projects.results || [],
      env_vars: envVars.results || [],
      chat_sessions: chatSessions.results || [],
      chat_messages: chatMsgs.results || []
    };

    return new Response(JSON.stringify(exportData, null, 2), {
      headers: { 
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="clincoo_data_export.json"',
        ...CORS 
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
