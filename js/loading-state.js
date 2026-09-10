// Clincoo Loading State — overlay icon loading (tanpa teks) selama data awal halaman dimuat.
// Cara kerja: menghitung semua fetch yang berjalan saat halaman dibuka; overlay memudar
// begitu semuanya selesai (min 400ms, pengaman maks 3.5 detik).
// Tidak mengubah style/struktur halaman — overlay dilepas dari DOM setelah selesai.
(function () {
  if (window.__clincooLoading) return;
  window.__clincooLoading = true;

  var MIN_MS = 400, MAX_MS = 3500;
  var t0 = Date.now();
  var pending = 0, done = false, ready = false;

  // Ikuti tema app ('Gelap' / 'Sistem (Default)') supaya warna overlay menyatu
  var theme = '';
  try { theme = localStorage.getItem('clincoo_theme') || 'Sistem (Default)'; } catch (e) {}
  var dark = theme === 'Gelap' || ((theme === 'Sistem (Default)' || !theme) && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  try {
    var style = document.createElement('style');
    style.textContent = '@keyframes clincooSpin{to{transform:rotate(360deg)}}';
    (document.head || document.documentElement).appendChild(style);
  } catch (e) {}

  var overlay = document.createElement('div');
  overlay.id = 'clincoo-loading';
  overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:' + (dark ? '#000000' : '#f7f7f9') + ';transition:opacity .25s ease;opacity:1;');
  overlay.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="' + (dark ? '#52525b' : '#a1a1aa') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:clincooSpin .9s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  document.documentElement.appendChild(overlay);

  function finish() {
    if (done) return;
    done = true;
    try {
      overlay.style.opacity = '0';
      setTimeout(function () { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    } catch (e) {}
  }

  function check() {
    if (!done && ready && pending <= 0 && Date.now() - t0 >= MIN_MS) finish();
  }

  // Bungkus window.fetch untuk menghitung request awal yang masih berjalan
  var of = window.fetch;
  window.fetch = function () {
    pending++;
    return of.apply(window, arguments).then(function (res) {
      pending--; check(); return res;
    }, function (err) {
      pending--; check(); throw err;
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    ready = true;
    check();
    setTimeout(check, 50);
    setTimeout(check, 200);
  });
  setTimeout(finish, MAX_MS); // pengaman: overlay tidak pernah menggantung selamanya
})();
