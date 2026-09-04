// Cloudflare Pages Functions - GitHub OAuth token exchange
// Reads GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET from D1 database.
// Exchanges an OAuth authorization code for an access token.

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}

async function getSecrets(env) {
  if (!env.DB) return { clientId: '', clientSecret: '' };
  try {
    const idRow = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind('GITHUB_CLIENT_ID').first();
    const secretRow = await env.DB.prepare('SELECT value FROM env_vars WHERE key = ?').bind('GITHUB_CLIENT_SECRET').first();
    return {
      clientId: idRow?.value || '',
      clientSecret: secretRow?.value || ''
    };
  } catch {
    return { clientId: '', clientSecret: '' };
  }
}

export async function onRequestPost({ request, env }) {
  try {
    const { clientId, clientSecret } = await getSecrets(env);
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'GitHub OAuth credentials not configured in database' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const body = await request.json();
    const code = body.code;
    if (!code) {
      return new Response(JSON.stringify({ error: 'Authorization code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const redirectUri = body.redirect_uri || '';

    // Exchange code for access token
    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        ...(redirectUri ? { redirect_uri: redirectUri } : {})
      })
    });

    const tokenData = await tokenRes.json();

    if (tokenData.error || !tokenData.access_token) {
      return new Response(JSON.stringify({ error: tokenData.error || 'Failed to get access token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    return new Response(JSON.stringify({ access_token: tokenData.access_token }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
