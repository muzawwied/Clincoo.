import { getProjectTables } from './_tables.js';
import { guardProject } from './user-scope.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

async function migrateSecurityTable(db) {
  try {
    const info = await db.prepare("PRAGMA table_info(security_settings)").all();
    const hasProjectId = (info.results || []).some(c => c.name === 'project_id');
    if (!hasProjectId) {
      await db.prepare("ALTER TABLE security_settings RENAME TO security_settings_old").run();
      await db.prepare("CREATE TABLE security_settings (project_id TEXT, key TEXT NOT NULL, value TEXT, PRIMARY KEY (project_id, key))").run();
      await db.prepare("INSERT INTO security_settings (project_id, key, value) SELECT '', key, value FROM security_settings_old").run();
      await db.prepare("DROP TABLE security_settings_old").run();
    }
  } catch(e) {
    try {
      await db.prepare("CREATE TABLE IF NOT EXISTS security_settings (project_id TEXT, key TEXT NOT NULL, value TEXT, PRIMARY KEY (project_id, key))").run();
    } catch(e2) {}
  }
}

async function hashSitePassword(password, projectId) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':' + (projectId || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function saveSettingRecord(db, tableName, projectId, key, value) {
  await db.prepare(`INSERT OR REPLACE INTO ${tableName} (project_id, key, value) VALUES (?, ?, ?)`).bind(projectId, key, String(value)).run();
  try {
    await db.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').bind('security_updated', key + ' = ' + value + ' (project: ' + (projectId || 'global') + ')').run();
  } catch (e) {}
}

export async function onRequestOptions() {
  return new Response(null, { headers: CORS });
}

export async function onRequestGet({ request, env }) {
  try {
    await migrateSecurityTable(env.DB);
    const url = new URL(request.url);
    const projectId = url.searchParams.get('project_id') || '';
    const deny = await guardProject(env, request, projectId);
    if (deny) return deny;
    
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS security_settings (project_id TEXT, key TEXT NOT NULL, value TEXT, PRIMARY KEY (project_id, key))').run();
    
    let rows;
    if (projectId) {
      const T = await getProjectTables(env.DB, projectId);
      rows = await env.DB.prepare(`SELECT key, value FROM ${T.securitySettings} WHERE project_id = ? OR project_id = ''`).bind(projectId).all();
    } else {
      try {
        rows = await env.DB.prepare('SELECT key, value FROM security_settings WHERE project_id = ? OR project_id IS NULL').bind('').all();
      } catch(e) {
        rows = await env.DB.prepare('SELECT key, value FROM security_settings').all();
      }
    }
    
    const settings = {};
    (rows.results || []).forEach(r => settings[r.key] = r.value);
    return new Response(JSON.stringify({ settings, ssl_mode: 'auto' }), {
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
    await migrateSecurityTable(env.DB);
    const body = await request.json();
    const { key, value, project_id, settings: batchSettings } = body;
    const projectId = project_id || '';
    const deny = await guardProject(env, request, projectId);
    if (deny) return deny;
    
    await env.DB.prepare('CREATE TABLE IF NOT EXISTS security_settings (project_id TEXT, key TEXT NOT NULL, value TEXT, PRIMARY KEY (project_id, key))').run();
    const T = await getProjectTables(env.DB, projectId);
    const tableName = T.securitySettings;

    const handleKeyValuePair = async (k, v) => {
      if (!k) return;

      if (k === 'site_password' || k === 'password') {
        const rawPass = String(v || '').trim();
        if (rawPass) {
          const hashHex = await hashSitePassword(rawPass, projectId);
          await saveSettingRecord(env.DB, tableName, projectId, 'site_password_hash', hashHex);
          await saveSettingRecord(env.DB, tableName, projectId, 'site_password_active', '1');
          await saveSettingRecord(env.DB, tableName, projectId, 'visibility_mode', 'password');
          await saveSettingRecord(env.DB, tableName, projectId, 'visibility', 'password');
        }
        return;
      }

      if (k === 'visibility_mode' || k === 'visibility') {
        const mode = String(v || '').toLowerCase();
        await saveSettingRecord(env.DB, tableName, projectId, 'visibility_mode', mode);
        await saveSettingRecord(env.DB, tableName, projectId, 'visibility', mode);
        if (mode === 'password') {
          await saveSettingRecord(env.DB, tableName, projectId, 'site_password_active', '1');
        } else {
          await saveSettingRecord(env.DB, tableName, projectId, 'site_password_active', '0');
        }
        return;
      }

      if (k === 'indexSearch' || k === 'index_search') {
        const valStr = String(v);
        await saveSettingRecord(env.DB, tableName, projectId, 'indexSearch', valStr);
        await saveSettingRecord(env.DB, tableName, projectId, 'index_search', valStr);
        return;
      }

      await saveSettingRecord(env.DB, tableName, projectId, k, String(v));
    };

    if (batchSettings && typeof batchSettings === 'object') {
      for (const [bk, bv] of Object.entries(batchSettings)) {
        await handleKeyValuePair(bk, bv);
      }
    } else if (key !== undefined) {
      await handleKeyValuePair(key, value);
    } else if (body.password !== undefined || body.site_password !== undefined) {
      await handleKeyValuePair('site_password', body.password || body.site_password);
    } else {
      return new Response(JSON.stringify({ error: 'key or settings required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
