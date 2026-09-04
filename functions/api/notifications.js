// Cloudflare Pages Functions - Notifications with page links
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestDelete({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
    
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    
    if (id) {
      await db.prepare('DELETE FROM notifications WHERE id = ?').bind(id).run();
    } else {
      // Delete all read notifications (keep unread)
      await db.prepare('DELETE FROM notifications WHERE read = 1').run();
    }
    
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });

    const body = await request.json();
    const action = body.action || 'create';

    if (action === 'mark_read') {
      const id = body.id;
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
      await db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').bind(id).run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (action === 'mark_all_read') {
      await db.prepare('UPDATE notifications SET read = 1 WHERE read = 0').run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (action === 'clear_all') {
      await db.prepare('DELETE FROM notifications').run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (action === 'clear_read') {
      await db.prepare('DELETE FROM notifications WHERE read = 1').run();
      return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Default: create notification with optional link and type
    const { source, message, link, type } = body;
    if (!source || !message) return new Response(JSON.stringify({ error: 'source and message required' }), { status: 400, headers: { 'Content-Type': 'application/json', ...CORS } });
    
    try {
      await db.prepare('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT "info", link TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    } catch(e) {}
    
    await db.prepare('INSERT INTO notifications (source, message, type, link) VALUES (?, ?, ?, ?)').bind(source, message, type || 'info', link || '').run();
    return new Response(JSON.stringify({ success: true }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

export async function onRequestGet({ request, env }) {
  try {
    const db = env.DB;
    if (!db) return new Response(JSON.stringify({ error: 'D1 not bound' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
    
    try {
      await db.prepare('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT "info", link TEXT, read INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime(\'now\')))').run();
    } catch(e) {}
    
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';
    
    // Only show unread notifications by default — read notifications are cleared automatically
    let query = 'SELECT * FROM notifications WHERE read = 0 ORDER BY created_at DESC LIMIT 50';
    if (!unreadOnly) {
      // Show recent notifications (both read and unread) but only from last 24 hours
      query = "SELECT * FROM notifications WHERE read = 0 OR (read = 1 AND created_at > datetime('now', '-1 hour')) ORDER BY created_at DESC LIMIT 50";
    }
    
    const result = await db.prepare(query).all();
    
    // Also get unread count
    const unreadResult = await db.prepare('SELECT COUNT(*) as c FROM notifications WHERE read = 0').first();
    
    return new Response(JSON.stringify({ 
      notifications: result.results, 
      unreadCount: unreadResult?.c || 0 
    }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
