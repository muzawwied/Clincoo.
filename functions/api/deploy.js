const CF_PROJECT = 'clincoo';

import { getProjectTables } from './_tables.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

async function getCFCreds(env) {
  const keyRow = await env.DB.prepare("SELECT value FROM user_preferences WHERE key = 'cloudflare_api_key'").first();
  const acctRow = await env.DB.prepare("SELECT value FROM user_preferences WHERE key = 'cloudflare_account_id'").first();
  return { apiKey: keyRow?.value || '', accountId: acctRow?.value || '' };
}

export async function onRequestOptions() {
  return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' } });
}

export async function onRequestGet({ env }) {
  try {
    const { apiKey, accountId } = await getCFCreds(env);
    if (!apiKey) return new Response(JSON.stringify({ error: 'Cloudflare API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
    
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/pages/projects/' + CF_PROJECT + '/deployments?per_page=5', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    const data = await res.json();
    const deploys = (data.result || []).map(d => ({ id: d.id, status: d.latest_stage?.status, url: d.url, created: d.created_on, stage: d.latest_stage?.name }));
    return new Response(JSON.stringify({ deployments: deploys }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const projectId = body.project_id || '';
  try {
    const { apiKey, accountId } = await getCFCreds(env);
    if (!apiKey) return new Response(JSON.stringify({ error: 'Cloudflare API key not configured' }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
    
    const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + accountId + '/pages/projects/' + CF_PROJECT + '/deployments?per_page=1', {
      headers: { 'Authorization': 'Bearer ' + apiKey }
    });
    const data = await res.json();
    const latest = data.result?.[0];
    
    if (latest) {
      const T = await getProjectTables(env.DB, projectId);
      await env.DB.prepare(`INSERT INTO ${T.deployLogs} (project_id, status, url, message) VALUES (?, ?, ?, ?)`).bind(projectId, latest.latest_stage?.status || 'unknown', latest.url || '', 'Deployment ' + latest.id).run();
      await env.DB.prepare('INSERT INTO activity_log (action, details) VALUES (?, ?)').bind('deploy_triggered', 'Status: ' + (latest.latest_stage?.status || 'unknown')).run();
    }
    
    return new Response(JSON.stringify({ 
      success: true, 
      deployment: latest ? { id: latest.id, status: latest.latest_stage?.status, url: latest.url, created: latest.created_on } : null
    }), { headers: { 'Content-Type': 'application/json', ...CORS } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { 'Content-Type': 'application/json', ...CORS } });
  }
}
