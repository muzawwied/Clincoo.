// Clincoo Loading State — indikator loading (icon spinner, tanpa teks) HANYA bila data awal lambat.
// Overlay baru muncul jika fetch masih berjalan setelah 500ms — kalau data cepat, halaman
// langsung tampil tanpa layar kosong, jadi pindah antar halaman (mis. workspace -> keamanan/env)
// tidak terhalang. Begitu muncul, overlay segera hilang saat semua fetch selesai (maks 3s).
(function () {
  if (window.__clincooLoading) return;
  window.__clincooLoading = true;

  var SHOW_DELAY = 500, MAX_MS = 3000;
  var t0 = Date.now();
  var pending = 0, done = false, ready = false, shown = false, shownAt = 0, overlay = null, iv = null;

  // Ikuti tema app ('Gelap' / 'Sistem (Default)') supaya warna overlay menyatu
  var theme = '';
  try { theme = localStorage.getItem('clincoo_theme') || 'Sistem (Default)'; } catch (e) {}
  var dark = theme === 'Gelap' || ((theme === 'Sistem (Default)' || !theme) && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);

  function build() {
    try {
      var style = document.createElement('style');
      style.textContent = '@keyframes clincooSpin{to{transform:rotate(360deg)}}';
      (document.head || document.documentElement).appendChild(style);
    } catch (e) {}
    overlay = document.createElement('div');
    overlay.id = 'clincoo-loading';
    overlay.setAttribute('style', 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:' + (dark ? '#000000' : '#f7f7f9') + ';transition:opacity .25s ease;opacity:0;');
    overlay.innerHTML = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="' + (dark ? '#52525b' : '#a1a1aa') + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:clincooSpin .9s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    document.documentElement.appendChild(overlay);
  }

  function show() {
    if (done || shown) return;
    shown = true; shownAt = Date.now();
    build();
    requestAnimationFrame(function () { if (overlay) overlay.style.opacity = '1'; });
  }

  function finish() {
    if (done) return;
    done = true;
    if (iv) { try { clearInterval(iv); } catch (e) {} }
    if (!shown || !overlay) return; // overlay tak pernah tampil -> halaman langsung jadi
    var wait = Math.max(0, 300 - (Date.now() - shownAt)); // jaga agar tak berkedip sekejap
    setTimeout(function () {
      if (!overlay) return;
      try {
        overlay.style.opacity = '0';
        setTimeout(function () { if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
      } catch (e) {}
    }, wait);
  }

  function check() {
    if (done) return;
    if (ready && pending <= 0) { finish(); return; }
    if (!shown && pending > 0 && Date.now() - t0 >= SHOW_DELAY) show();
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
    setTimeout(check, 100);
  });
  iv = setInterval(function () {
    if (done) { try { clearInterval(iv); } catch (e) {} return; }
    check();
  }, 100);
  setTimeout(finish, MAX_MS); // pengaman: overlay tidak pernah menggantung selamanya
})();
