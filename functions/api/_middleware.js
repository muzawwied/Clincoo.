// Middleware /api/* — semua endpoint wajib login (Bearer), KECUALI:
//   - /api/auth/*        (login, register, me, oauth akun)
//   - /api/github-oauth* (redirect callback GitHub, tanpa header Bearer)
//   - /api/topup*        (callback Xendit divalidasi sendiri via x-callback-token)
//   - preflight OPTIONS  (CORS)
// Respons 401 sama seperti versi production: {"error":"Login diperlukan","need_login":true}
import { initTables as initAuthTables, getUserByToken, getToken } from './auth/shared.js';

const PUBLIC = [/^\/api\/auth(\/|$)/, /^\/api\/github-oauth(\/|$)/, /^\/api\/topup(\/|$)/, /^\/api\/wallet(\/|$)/];

export async function onRequest({ request, env, next }) {
  if (request.method === 'OPTIONS') return next();
  const path = new URL(request.url).pathname;
  for (const re of PUBLIC) if (re.test(path)) return next();
  try {
    if (env.DB) {
      await initAuthTables(env.DB);
      const user = await getUserByToken(env.DB, getToken(request));
      if (user) return next();
    }
  } catch (e) { /* lanjut ke 401 */ }
  return new Response(JSON.stringify({ error: 'Login diperlukan', need_login: true }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}
