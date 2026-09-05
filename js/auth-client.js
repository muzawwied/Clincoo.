// Clincoo Auth Client — gate login + injeksi token ke semua API call
// Wajib dimuat PERTAMA di semua halaman (kecuali akun/auth.html).
(function () {
  var TOKEN_KEY = 'clincoo_auth_token';
  var isAuthPage = /akun\/auth\.html(\?|$)/.test(location.pathname + location.search);
  var AUTH_URL = (location.hostname.indexOf('github.io') !== -1)
    ? '/Clincoo./akun/auth.html'
    : 'https://muzawwied.github.io/Clincoo./akun/auth.html';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  window.ClincooAuth = {
    getToken: getToken,
    authUrl: AUTH_URL,
    logout: function () {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      location.replace(AUTH_URL);
    }
  };

  var origFetch = window.fetch;

  // Gate: buka halaman apa pun tanpa login -> langsung ke halaman auth
  if (!isAuthPage && !getToken()) {
    try { location.replace(AUTH_URL + '?next=' + encodeURIComponent(location.href)); } catch (e) { location.replace(AUTH_URL); }
    return;
  }

  // Validasi token ke backend: token mati (logout perangkat / reset) -> auth ulang
  if (!isAuthPage && getToken()) {
    var API = (location.hostname.indexOf('github.io') !== -1) ? 'https://clincoo.pages.dev' : '';
    origFetch(API + '/api/auth/me', { headers: { 'Authorization': 'Bearer ' + getToken() } })
      .then(function (r) { return r.ok ? r.json() : { authenticated: false }; })
      .then(function (d) {
        if (!d || !d.authenticated) {
          try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
          location.replace(AUTH_URL + '?next=' + encodeURIComponent(location.href));
        }
      })
      .catch(function () {});
  }

  // Wrapper fetch: semua call ke backend dibawa token Bearer; 401 -> auth
  window.fetch = function (input, init) {
    init = init || {};
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
    var isApi = url.indexOf('clincoo.pages.dev/api') !== -1 || /^\/api\//.test(url) || /^https?:\/\/[^\/]*clincoo\.pages\.dev\/api/.test(url);
    var isAuthApi = url.indexOf('/api/auth/') !== -1;
    if (isApi && !isAuthApi) {
      try {
        var headers = new Headers((init && init.headers) || (input && input.headers) || undefined);
        var tk = getToken();
        if (tk && !headers.get('Authorization')) headers.set('Authorization', 'Bearer ' + tk);
        init.headers = headers;
        if (typeof input === 'object' && input && input.headers && !(init && init.headers)) { /* noop */ }
      } catch (e) {}
    }
    var p = origFetch.call(this, input, init);
    return p.then(function (res) {
      try {
        if (res.status === 401 && !isAuthPage && isApi && !isAuthApi) {
          location.replace(AUTH_URL + '?next=' + encodeURIComponent(location.href));
        }
      } catch (e) {}
      return res;
    });
  };
})();
