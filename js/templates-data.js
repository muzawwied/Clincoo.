// ===== Clincoo Templates — data & aksi fitur template (dipakai index.html & akun/favorit.html) =====
// Dibuat otomatis dari preview-shots/, jangan diedit manual.
var ClincooTemplates = (function () {
  'use strict';

  // Path dasar sesuai lokasi halaman (root vs /akun/)
  var inAkun = location.pathname.indexOf('/akun/') !== -1;
  var IMG_BASE = inAkun ? '../assets/templates/' : 'assets/templates/';
  var WS_URL = inAkun ? '../proyek/workspace.html' : 'proyek/workspace.html';
  var API_BASE = (location.hostname.indexOf('github.io') !== -1 ? 'https://clincoo-be2.pages.dev/api' : '/api');

  var list = {
  "portfolio": {
    "name": "Portfolio Profesional",
    "desc": "Desain minimalis dan elegan untuk menampilkan karya, resume, dan informasi kontak Anda agar lebih menonjol."
  },
  "dashboard": {
    "name": "Dashboard Admin",
    "desc": "Template analitik lengkap dengan tata letak grid, grafik interaktif, dan sidebar navigasi yang responsif."
  },
  "landing": {
    "name": "Landing Page Bisnis",
    "desc": "Halaman konversi tinggi dengan struktur untuk hero section, fitur unggulan, dan tabel pricing yang rapi."
  }
};
  var files = {
  "portfolio": {
    "index.html": "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Raka Pratama — Portfolio</title>\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&family=Fraunces:opsz,wght@9..144,600;9..144,700&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"css/style.css\">\n</head>\n<body>\n<header class=\"nav\">\n  <span class=\"logo\">Raka<span>.</span></span>\n  <nav>\n    <a href=\"#karya\">Karya</a>\n    <a href=\"#riwayat\">Riwayat</a>\n    <a href=\"#kontak\" class=\"btn\">Hubungi Saya</a>\n  </nav>\n</header>\n\n<section class=\"hero\">\n  <div class=\"hero-inner\">\n    <p class=\"eyebrow\">Halo, saya Raka 👋</p>\n    <h1>Saya merancang <em>pengalaman digital</em> yang terasa manusiawi.</h1>\n    <p class=\"sub\">Product Designer berbasis di Jakarta. 6+ tahun membantu brand & startup membangun produk yang disukai penggunanya.</p>\n    <div class=\"hero-cta\">\n      <a href=\"#karya\" class=\"btn dark\">Lihat Karya</a>\n      <a href=\"#kontak\" class=\"btn ghost\">Unduh CV</a>\n    </div>\n    <div class=\"hero-stats\">\n      <div><strong>6+</strong><span>Tahun pengalaman</span></div>\n      <div><strong>40+</strong><span>Proyek selesai</span></div>\n      <div><strong>12</strong><span>Penghargaan desain</span></div>\n    </div>\n  </div>\n</section>\n\n<section id=\"karya\" class=\"section\">\n  <div class=\"section-head\">\n    <h2>Karya Terpilih</h2>\n    <p>Beberapa proyek yang paling membentuk cara saya berpikir.</p>\n  </div>\n  <div class=\"grid works\">\n    <article class=\"work\">\n      <div class=\"thumb t1\"></div>\n      <div class=\"work-meta\"><span class=\"tag\">Aplikasi Mobile</span><h3>Arus — Banking Ulang</h3><p>Desain ulang aplikasi banking dengan 2,1 jt pengguna aktif.</p></div>\n    </article>\n    <article class=\"work\">\n      <div class=\"thumb t2\"></div>\n      <div class=\"work-meta\"><span class=\"tag\">Web Platform</span><h3>Lokal — Marketplace Kriya</h3><p>Identitas & platform untuk perajin lokal Indonesia.</p></div>\n    </article>\n    <article class=\"work\">\n      <div class=\"thumb t3\"></div>\n      <div class=\"work-meta\"><span class=\"tag\">Design System</span><h3>Saturn DS</h3><p>Design system multi-brand untuk grup fintech.</p></div>\n    </article>\n    <article class=\"work\">\n      <div class=\"thumb t4\"></div>\n      <div class=\"work-meta\"><span class=\"tag\">Brand & Web</span><h3>Kopi Senja</h3><p>Situs & identitas visual untuk jaringan kedai kopi.</p></div>\n    </article>\n  </div>\n</section>\n\n<section id=\"riwayat\" class=\"section alt\">\n  <div class=\"section-head\">\n    <h2>Riwayat</h2>\n    <p>Jalur singkat yang membawa saya ke sini.</p>\n  </div>\n  <div class=\"timeline\">\n    <div class=\"tl-item\">\n      <span class=\"tl-year\">2023 — Sekarang</span>\n      <h3>Lead Product Designer · Arus</h3>\n      <p>Membimbing tim desain dan memimpin redesign aplikasi utama.</p>\n    </div>\n    <div class=\"tl-item\">\n      <span class=\"tl-year\">2020 — 2023</span>\n      <h3>Senior UI/UX Designer · Lokal</h3>\n      <p>Membangun pengalaman belanja kriya dari nol hingga 500 rb pengguna.</p>\n    </div>\n    <div class=\"tl-item\">\n      <span class=\"tl-year\">2018 — 2020</span>\n      <h3>Product Designer · Studio Sembilan</h3>\n      <p>Berbagai proyek brand & digital untuk klien F&amp;B dan retail.</p>\n    </div>\n  </div>\n</section>\n\n<section id=\"kontak\" class=\"section\">\n  <div class=\"contact-card\">\n    <h2>Punya ide menarik?<br>Mari wujudkan bersama.</h2>\n    <p>Ceritakan proyekmu — biasanya saya membalas dalam 1×24 jam.</p>\n    <a href=\"mailto:halo@rakapratama.id\" class=\"btn dark\">halo@rakapratama.id</a>\n  </div>\n</section>\n\n<footer class=\"footer\">© 2026 Raka Pratama · Dibuat dengan teliti di Jakarta</footer>\n<script src=\"js/script.js\"></script>\n</body>\n</html>\n",
    "css/style.css": ":root{--ink:#141414;--muted:#6b6b6b;--line:#ececec;--bg:#fafaf9;--card:#ffffff;--accent:#141414}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:'Inter',sans-serif;background:var(--bg);color:var(--ink);line-height:1.6}\nh1,h2{font-family:'Fraunces',serif;letter-spacing:-.02em}\nh1{font-size:clamp(2.2rem,5vw,3.6rem);line-height:1.15;font-weight:600}\nh2{font-size:clamp(1.6rem,3vw,2.2rem);font-weight:600}\nem{font-style:italic}\n.nav{display:flex;justify-content:space-between;align-items:center;padding:1.1rem 6vw;position:sticky;top:0;background:rgba(250,250,249,.85);backdrop-filter:blur(12px);z-index:10;border-bottom:1px solid var(--line)}\n.logo{font-family:'Fraunces',serif;font-size:1.4rem;font-weight:700}\n.logo span{color:#c2410c}\nnav{display:flex;gap:2rem;align-items:center}\nnav a{color:var(--muted);text-decoration:none;font-size:.92rem;font-weight:500}\nnav a:hover{color:var(--ink)}\n.btn{display:inline-block;padding:.7rem 1.4rem;border-radius:999px;background:var(--accent);color:#fff!important;text-decoration:none;font-size:.9rem;font-weight:600;border:1px solid var(--accent);transition:.25s}\n.btn.dark:hover{transform:translateY(-2px)}\n.btn.ghost{background:transparent;color:var(--ink)!important;border:1px solid var(--line)}\n.hero{padding:9vh 6vw 6vh}\n.eyebrow{color:#c2410c;font-weight:600;font-size:.9rem;margin-bottom:1rem}\n.hero h1{max-width:22ch}\n.sub{color:var(--muted);max-width:52ch;margin-top:1.2rem;font-size:1.05rem}\n.hero-cta{display:flex;gap:1rem;margin-top:2rem;flex-wrap:wrap}\n.hero-stats{display:flex;gap:3rem;margin-top:3.5rem;flex-wrap:wrap}\n.hero-stats strong{font-family:'Fraunces',serif;font-size:1.8rem;display:block}\n.hero-stats span{color:var(--muted);font-size:.85rem}\n.section{padding:5rem 6vw}\n.section-head{margin-bottom:2.5rem}\n.section-head p{color:var(--muted);margin-top:.4rem}\n.section.alt{background:var(--card);border-block:1px solid var(--line)}\n.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:1.5rem}\n.work{background:var(--card);border:1px solid var(--line);border-radius:1.25rem;overflow:hidden;transition:.3s}\n.work:hover{transform:translateY(-6px);box-shadow:0 20px 40px rgba(0,0,0,.08)}\n.thumb{height:180px}\n.t1{background:linear-gradient(135deg,#fde68a,#f59e0b)}\n.t2{background:linear-gradient(135deg,#a7f3d0,#10b981)}\n.t3{background:linear-gradient(135deg,#bfdbfe,#3b82f6)}\n.t4{background:linear-gradient(135deg,#e9d5ff,#8b5cf6)}\n.work-meta{padding:1.2rem 1.3rem 1.5rem}\n.tag{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#c2410c}\n.work-meta h3{font-size:1.05rem;margin:.35rem 0 .3rem;font-weight:600}\n.work-meta p{color:var(--muted);font-size:.9rem}\n.timeline{display:flex;flex-direction:column;gap:1.8rem;border-left:2px solid var(--line);padding-left:1.6rem;margin-left:.3rem}\n.tl-item{position:relative}\n.tl-item::before{content:\"\";position:absolute;left:calc(-1.6rem - 7px);top:.45rem;width:12px;height:12px;border-radius:50%;background:var(--ink);border:3px solid var(--bg)}\n.tl-year{font-size:.8rem;font-weight:700;color:#c2410c}\n.tl-item h3{font-family:'Inter',sans-serif;font-size:1.05rem;margin:.2rem 0}\n.tl-item p{color:var(--muted);font-size:.92rem;max-width:60ch}\n.contact-card{text-align:center;padding:4rem 2rem;background:var(--card);border:1px solid var(--line);border-radius:1.5rem}\n.contact-card h2{margin-bottom:.8rem}\n.contact-card p{color:var(--muted);margin-bottom:1.8rem}\n.footer{padding:2rem 6vw;color:var(--muted);font-size:.85rem;text-align:center;border-top:1px solid var(--line)}\n@media(max-width:640px){nav a:not(.btn){display:none}.hero-stats{gap:1.6rem}}\n",
    "js/script.js": "// Reveal halus saat elemen masuk viewport\ndocument.addEventListener('DOMContentLoaded', function () {\n  var items = document.querySelectorAll('.work, .tl-item, .contact-card');\n  if (!('IntersectionObserver' in window)) return;\n  var io = new IntersectionObserver(function (entries) {\n    entries.forEach(function (e) {\n      if (e.isIntersecting) {\n        e.target.style.opacity = '1';\n        e.target.style.transform = 'none';\n        io.unobserve(e.target);\n      }\n    });\n  }, { threshold: 0.15 });\n  items.forEach(function (el) {\n    el.style.opacity = '0';\n    el.style.transform = 'translateY(24px)';\n    el.style.transition = 'opacity .6s ease, transform .6s ease';\n    io.observe(el);\n  });\n});\n"
  },
  "dashboard": {
    "index.html": "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Nimbus — Dashboard Admin</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"css/style.css\">\n</head>\n<body>\n<div class=\"layout\">\n  <aside class=\"sidebar\">\n    <div class=\"brand\">◈ Nimbus</div>\n    <nav>\n      <a class=\"active\">Dashboard</a>\n      <a>Transaksi</a>\n      <a>Pelanggan</a>\n      <a>Produk</a>\n      <a>Laporan</a>\n      <a>Pengaturan</a>\n    </nav>\n    <div class=\"sidebar-foot\">\n      <div class=\"avatar\">AD</div>\n      <div><strong>Admin Demo</strong><span>admin@nimbus.id</span></div>\n    </div>\n  </aside>\n  <main class=\"main\">\n    <header class=\"topbar\">\n      <div>\n        <h1>Dashboard</h1>\n        <p>Selamat datang kembali, Admin — berikut ringkasan hari ini.</p>\n      </div>\n      <button class=\"btn\">+ Laporan Baru</button>\n    </header>\n    <section class=\"stats\">\n      <article class=\"stat\"><span>Pendapatan</span><strong>Rp 84,2 jt</strong><i class=\"up\">▲ 12,4%</i></article>\n      <article class=\"stat\"><span>Transaksi</span><strong>1.284</strong><i class=\"up\">▲ 8,1%</i></article>\n      <article class=\"stat\"><span>Pengguna Baru</span><strong>312</strong><i class=\"down\">▼ 2,3%</i></article>\n      <article class=\"stat\"><span>Rata-rata Belanja</span><strong>Rp 65 rb</strong><i class=\"up\">▲ 4,6%</i></article>\n    </section>\n    <section class=\"panels\">\n      <article class=\"panel chart-panel\">\n        <header><h2>Penjualan 12 Bulan</h2><span class=\"pill\">2026</span></header>\n        <div class=\"chart\">\n          <div style=\"--h:35%\"><span>Jan</span></div>\n          <div style=\"--h:55%\"><span>Feb</span></div>\n          <div style=\"--h:42%\"><span>Mar</span></div>\n          <div style=\"--h:68%\"><span>Apr</span></div>\n          <div style=\"--h:50%\"><span>Mei</span></div>\n          <div style=\"--h:74%\"><span>Jun</span></div>\n          <div style=\"--h:62%\"><span>Jul</span></div>\n          <div style=\"--h:82%\"><span>Ags</span></div>\n          <div style=\"--h:58%\"><span>Sep</span></div>\n          <div style=\"--h:90%\"><span>Okt</span></div>\n          <div style=\"--h:70%\"><span>Nov</span></div>\n          <div style=\"--h:96%\"><span>Des</span></div>\n        </div>\n      </article>\n      <article class=\"panel\">\n        <header><h2>Traffic</h2><span class=\"pill\">Live</span></header>\n        <div class=\"donut\"><div class=\"donut-ring\"></div>\n          <div class=\"donut-legend\">\n            <div><i class=\"dot d1\"></i>Organik <b>46%</b></div>\n            <div><i class=\"dot d2\"></i>Sosial <b>31%</b></div>\n            <div><i class=\"dot d3\"></i>Referral <b>23%</b></div>\n          </div>\n        </div>\n      </article>\n    </section>\n    <section class=\"panel\">\n      <header><h2>Transaksi Terbaru</h2><button class=\"btn ghost\">Lihat Semua</button></header>\n      <table>\n        <thead><tr><th>ID</th><th>Pelanggan</th><th>Status</th><th>Total</th></tr></thead>\n        <tbody>\n          <tr><td>#TRX-0912</td><td>Sinta Larasati</td><td><span class=\"status paid\">Lunas</span></td><td>Rp 1.250.000</td></tr>\n          <tr><td>#TRX-0911</td><td>Bima Nugraha</td><td><span class=\"status proc\">Diproses</span></td><td>Rp 890.000</td></tr>\n          <tr><td>#TRX-0910</td><td>Dewi Anggraini</td><td><span class=\"status paid\">Lunas</span></td><td>Rp 2.100.000</td></tr>\n          <tr><td>#TRX-0909</td><td>Fajar Wicaksono</td><td><span class=\"status fail\">Gagal</span></td><td>Rp 340.000</td></tr>\n          <tr><td>#TRX-0908</td><td>Nadia Puspita</td><td><span class=\"status proc\">Diproses</span></td><td>Rp 780.000</td></tr>\n        </tbody>\n      </table>\n    </section>\n  </main>\n</div>\n<script src=\"js/script.js\"></script>\n</body>\n</html>\n",
    "css/style.css": ":root{--bg:#0f1117;--panel:#171a23;--line:#242836;--ink:#e8eaf2;--muted:#8a90a6;--acc:#6366f1}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:'Inter',sans-serif;background:var(--bg);color:var(--ink)}\n.layout{display:flex;min-height:100vh}\n.sidebar{width:240px;flex-shrink:0;background:var(--panel);border-right:1px solid var(--line);display:flex;flex-direction:column;padding:1.4rem 1rem}\n.brand{font-weight:800;font-size:1.15rem;padding:0 .6rem 1.6rem}\n.brand{color:var(--ink)}\n.sidebar nav{display:flex;flex-direction:column;gap:.3rem;flex:1}\n.sidebar nav a{padding:.65rem .8rem;border-radius:.7rem;color:var(--muted);font-size:.9rem;font-weight:500;cursor:pointer;transition:.2s}\n.sidebar nav a:hover{background:rgba(255,255,255,.05);color:var(--ink)}\n.sidebar nav a.active{background:var(--acc);color:#fff}\n.sidebar-foot{display:flex;gap:.7rem;align-items:center;border-top:1px solid var(--line);padding-top:1rem}\n.avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#a855f7);display:grid;place-items:center;font-size:.75rem;font-weight:700;color:#fff}\n.sidebar-foot strong{display:block;font-size:.82rem}\n.sidebar-foot span{font-size:.72rem;color:var(--muted)}\n.main{flex:1;padding:1.6rem 2rem;min-width:0}\n.topbar{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem}\n.topbar h1{font-size:1.35rem;font-weight:700}\n.topbar p{color:var(--muted);font-size:.85rem;margin-top:.15rem}\n.btn{background:var(--acc);color:#fff;border:none;border-radius:.7rem;padding:.6rem 1rem;font-weight:600;font-size:.85rem;cursor:pointer}\n.btn.ghost{background:transparent;border:1px solid var(--line);color:var(--muted)}\n.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.2rem}\n.stat{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:1.1rem 1.2rem}\n.stat span{color:var(--muted);font-size:.8rem;font-weight:500}\n.stat strong{display:block;font-size:1.45rem;font-weight:700;margin:.3rem 0 .35rem}\n.stat i{font-style:normal;font-size:.75rem;font-weight:600}\n.up{color:#34d399}.down{color:#f87171}\n.panels{display:grid;grid-template-columns:2fr 1fr;gap:1rem;margin-bottom:1.2rem}\n.panel{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:1.2rem}\n.panel header{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.2rem}\n.panel h2{font-size:.95rem;font-weight:600}\n.pill{font-size:.7rem;font-weight:600;color:var(--acc);background:rgba(99,102,241,.15);padding:.25rem .6rem;border-radius:999px}\n.chart{display:flex;align-items:flex-end;gap:.6rem;height:180px}\n.chart div{flex:1;background:linear-gradient(180deg,#818cf8,var(--acc));border-radius:.4rem .4rem 0 0;height:calc(var(--h));position:relative;min-height:6px;transition:.3s}\n.chart div:hover{filter:brightness(1.25)}\n.chart span{position:absolute;bottom:-1.3rem;left:50%;transform:translateX(-50%);font-size:.62rem;color:var(--muted)}\n.donut{display:flex;align-items:center;gap:1.4rem}\n.donut-ring{width:110px;height:110px;border-radius:50%;background:conic-gradient(#6366f1 0 46%,#22d3ee 46% 77%,#f59e0b 77% 100%);position:relative;flex-shrink:0}\n.donut-ring::after{content:\"\";position:absolute;inset:22%;background:var(--panel);border-radius:50%}\n.donut-legend{display:flex;flex-direction:column;gap:.5rem;font-size:.8rem;color:var(--muted)}\n.donut-legend b{color:var(--ink);float:right;margin-left:.5rem}\n.dot{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:.4rem}\n.d1{background:#6366f1}.d2{background:#22d3ee}.d3{background:#f59e0b}\ntable{width:100%;border-collapse:collapse;font-size:.85rem}\nth{text-align:left;color:var(--muted);font-weight:500;font-size:.75rem;text-transform:uppercase;letter-spacing:.05em;padding:.6rem .5rem;border-bottom:1px solid var(--line)}\ntd{padding:.75rem .5rem;border-bottom:1px solid var(--line)}\ntr:last-child td{border-bottom:none}\n.status{font-size:.72rem;font-weight:600;padding:.25rem .6rem;border-radius:999px}\n.paid{background:rgba(52,211,153,.15);color:#34d399}\n.proc{background:rgba(99,102,241,.15);color:#818cf8}\n.fail{background:rgba(248,113,113,.15);color:#f87171}\n@media(max-width:900px){.panels{grid-template-columns:1fr}.sidebar{display:none}}\n",
    "js/script.js": "// Animasi bar chart saat dashboard dibuka\ndocument.addEventListener('DOMContentLoaded', function () {\n  var bars = document.querySelectorAll('.chart div');\n  bars.forEach(function (b, i) {\n    var target = b.style.height;\n    b.style.height = '6px';\n    b.style.transition = 'height .7s cubic-bezier(.22,1,.36,1) ' + (i * 40) + 'ms';\n    requestAnimationFrame(function () { setTimeout(function () { b.style.height = target; }, 60); });\n  });\n});\n"
  },
  "landing": {
    "index.html": "<!DOCTYPE html>\n<html lang=\"id\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>Kirana — Satu alat untuk seluruh operasional bisnismu</title>\n<link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n<link rel=\"stylesheet\" href=\"css/style.css\">\n</head>\n<body>\n<header class=\"nav\">\n  <span class=\"logo\">Kirana</span>\n  <nav><a href=\"#fitur\">Fitur</a><a href=\"#harga\">Harga</a><a href=\"#testimoni\">Testimoni</a></nav>\n  <a href=\"#cta\" class=\"btn\">Coba Gratis</a>\n</header>\n\n<section class=\"hero\">\n  <span class=\"badge\">✨ Dipakai 4.300+ UMKM di Indonesia</span>\n  <h1>Kelola bisnismu<br>tanpa drama.</h1>\n  <p class=\"sub\">Kasir, stok, pelanggan, dan laporan — semua dalam satu aplikasi sederhana. Mulai gratis, tanpa kartu kredit.</p>\n  <form class=\"hero-form\" onsubmit=\"return false\">\n    <input type=\"email\" placeholder=\"Email bisnismu\">\n    <button class=\"btn big\" type=\"submit\">Mulai Gratis →</button>\n  </form>\n  <div class=\"hero-shot\"><div class=\"shot-top\"><i></i><i></i><i></i></div>\n    <div class=\"shot-body\">\n      <div class=\"shot-side\"><b></b><b class=\"w60\"></b><b class=\"w40\"></b><b class=\"w70\"></b><b class=\"w50\"></b></div>\n      <div class=\"shot-main\"><b class=\"row r1\"></b><b class=\"row r2\"></b><b class=\"row r3\"></b><b class=\"row r4\"></b><b class=\"row r5\"></b></div>\n    </div>\n  </div>\n</section>\n\n<section id=\"fitur\" class=\"section\">\n  <div class=\"section-head\"><h2>Semua yang bisnismu butuh</h2><p>Tanpa fitur rumit yang tidak pernah kamu pakai.</p></div>\n  <div class=\"features\">\n    <article><div class=\"ic\">🧾</div><h3>Kasir Instan</h3><p>Transaksi 3 detik — scan, bayar, selesai. Bisa offline.</p></article>\n    <article><div class=\"ic\">📦</div><h3>Stok Otomatis</h3><p>Stok berkurang otomatis tiap penjualan. Peringatan stok menipis.</p></article>\n    <article><div class=\"ic\">👥</div><h3>Pelanggan & Loyalitas</h3><p>Data pelanggan terkumpul otomatis, siap untuk promo berikutnya.</p></article>\n    <article><div class=\"ic\">📊</div><h3>Laporan Harian</h3><p>Pendapatan, produk terlaris, dan tren — dikirim tiap pagi.</p></article>\n    <article><div class=\"ic\">🏷️</div><h3>Promo Fleksibel</h3><p>Diskon, bundling, dan voucher tanpa perlu jago Excel.</p></article>\n    <article><div class=\"ic\">🔄</div><h3>Multi Cabang</h3><p>Semua cabang tersediasinkan dalam satu dasbor.</p></article>\n  </div>\n</section>\n\n<section id=\"testimoni\" class=\"section alt\">\n  <div class=\"section-head\"><h2>Mereka sudah lebih tenang</h2></div>\n  <div class=\"quotes\">\n    <figure><p>“Laporan harianannya bikin saya tau produk mana yang harus restok. Simpel banget.”</p><figcaption><strong>Rina</strong> — Toko Kue Rina, Bandung</figcaption></figure>\n    <figure><p>“Dulu catat manual sekarang 5 menit beres. Tim saya langsung paham tanpa training.”</p><figcaption><strong>Mas Agus</strong> — Kopi Terang, Yogyakarta</figcaption></figure>\n    <figure><p>“Fitur loyalitasnya naikin pembeli balik sampai 30%. Worth banget.”</p><figcaption><strong>Sari</strong> — Butik Sari, Surabaya</figcaption></figure>\n  </div>\n</section>\n\n<section id=\"harga\" class=\"section\">\n  <div class=\"section-head\"><h2>Harga jujur, tanpa kejutan</h2><p>Batalkan kapan saja.</p></div>\n  <div class=\"pricing\">\n    <article class=\"plan\">\n      <h3>Pemula</h3><strong>Rp 0</strong><span>/bulan, selamanya</span>\n      <ul><li>✓ 1 gerai</li><li>✓ 200 transaksi/bulan</li><li>✓ Laporan dasar</li></ul>\n      <a href=\"#cta\" class=\"btn ghost\">Mulai</a>\n    </article>\n    <article class=\"plan best\">\n      <span class=\"tag\">Paling populer</span>\n      <h3>Bisnis</h3><strong>Rp 79rb</strong><span>/bulan</span>\n      <ul><li>✓ 3 gerai</li><li>✓ Transaksi tanpa batas</li><li>✓ Laporan lengkap & promo</li><li>✓ Dukungan prioritas</li></ul>\n      <a href=\"#cta\" class=\"btn\">Coba 14 hari</a>\n    </article>\n    <article class=\"plan\">\n      <h3>Perusahaan</h3><strong>Rp 199rb</strong><span>/bulan</span>\n      <ul><li>✓ Gerai tanpa batas</li><li>✓ API & integrasi</li><li>✓ Manajer akun khusus</li></ul>\n      <a href=\"#cta\" class=\"btn ghost\">Hubungi kami</a>\n    </article>\n  </div>\n</section>\n\n<section id=\"cta\" class=\"cta\">\n  <h2>Siap bikin operasionalmu lebih tenang?</h2>\n  <p>Bergabung dengan ribuan pemilik bisnis yang sudah hemat waktu 2 jam setiap hari.</p>\n  <a href=\"#\" class=\"btn big\">Mulai Gratis Sekarang →</a>\n</section>\n<footer>© 2026 Kirana · hello@kirana.id · Jakarta</footer>\n<script src=\"js/script.js\"></script>\n</body>\n</html>\n",
    "css/style.css": ":root{--ink:#101418;--muted:#5b6470;--line:#e7ebef;--bg:#fff;--soft:#f6f8fa;--acc:#0e9f6e;--dark:#0b1220}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{font-family:'Inter',sans-serif;color:var(--ink);background:var(--bg);line-height:1.6}\n.nav{display:flex;justify-content:space-between;align-items:center;padding:1rem 6vw;position:sticky;top:0;background:rgba(255,255,255,.85);backdrop-filter:blur(10px);z-index:10;border-bottom:1px solid var(--line)}\n.logo{font-weight:800;font-size:1.2rem}\nnav{display:flex;gap:1.8rem}\nnav a{color:var(--muted);text-decoration:none;font-size:.9rem;font-weight:500}\n.btn{display:inline-block;background:var(--acc);color:#fff;text-decoration:none;font-weight:700;border-radius:.8rem;padding:.7rem 1.3rem;font-size:.9rem;transition:.25s;border:1px solid var(--acc)}\n.btn:hover{transform:translateY(-2px);box-shadow:0 12px 24px rgba(14,159,110,.35)}\n.btn.ghost{background:transparent;color:var(--ink);border-color:var(--line)}\n.btn.big{padding:.95rem 1.8rem;font-size:1rem;border-radius:1rem}\n.hero{text-align:center;padding:5.5rem 6vw 3rem;background:linear-gradient(180deg,#f0faf5,#fff)}\n.badge{display:inline-block;background:#fff;border:1px solid var(--line);border-radius:999px;padding:.45rem 1rem;font-size:.8rem;font-weight:600;color:var(--muted);box-shadow:0 4px 14px rgba(0,0,0,.05)}\n.hero h1{font-size:clamp(2.4rem,6vw,4rem);letter-spacing:-.03em;line-height:1.08;margin:1.2rem 0 .8rem;font-weight:800}\n.sub{color:var(--muted);max-width:44ch;margin:0 auto 2rem;font-size:1.05rem}\n.hero-form{display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap;margin-bottom:3rem}\n.hero-form input{padding:.95rem 1.2rem;border:1px solid var(--line);border-radius:1rem;font-size:.95rem;width:280px;outline:none;font-family:inherit}\n.hero-form input:focus{border-color:var(--acc)}\n.hero-shot{max-width:760px;margin:0 auto;background:#fff;border:1px solid var(--line);border-radius:1.2rem;box-shadow:0 30px 80px rgba(16,24,40,.18);overflow:hidden;text-align:left}\n.shot-top{display:flex;gap:.4rem;padding:.8rem 1rem;border-bottom:1px solid var(--line)}\n.shot-top i{width:.7rem;height:.7rem;border-radius:50%;background:#e7ebef}\n.shot-body{display:flex;min-height:300px}\n.shot-side{width:26%;border-right:1px solid var(--line);padding:1rem .8rem;display:flex;flex-direction:column;gap:.7rem;background:var(--soft)}\n.shot-side b{height:.8rem;border-radius:999px;background:#e2e8ee}\n.shot-main{flex:1;padding:1.2rem;display:flex;flex-direction:column;gap:1rem}\n.row{display:block;border-radius:.6rem;background:linear-gradient(90deg,#d8f3e8,#f3fbf7)}\n.r1{height:64px}.r2{height:44px}.r3{height:84px}.r4{height:36px}.r5{height:52px}\n.w60{width:60%}.w40{width:40%}.w70{width:70%}.w50{width:50%}\n.section{padding:4.5rem 6vw}\n.section-head{text-align:center;margin-bottom:2.5rem}\n.section-head h2{font-size:clamp(1.6rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em}\n.section-head p{color:var(--muted);margin-top:.4rem}\n.section.alt{background:var(--soft)}\n.features{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.1rem;max-width:1000px;margin:0 auto}\n.features article{background:#fff;border:1px solid var(--line);border-radius:1.1rem;padding:1.4rem;transition:.25s}\n.features article:hover{transform:translateY(-5px);box-shadow:0 16px 32px rgba(16,24,40,.08)}\n.ic{font-size:1.6rem;margin-bottom:.7rem}\n.features h3{font-size:1rem;font-weight:700;margin-bottom:.3rem}\n.features p{color:var(--muted);font-size:.88rem}\n.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.1rem;max-width:1000px;margin:0 auto}\nfigure{background:#fff;border:1px solid var(--line);border-radius:1.1rem;padding:1.5rem}\nfigure p{font-size:.95rem;font-weight:500}\nfigcaption{margin-top:1rem;font-size:.82rem;color:var(--muted)}\nfigcaption strong{color:var(--ink)}\n.pricing{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1.2rem;max-width:920px;margin:0 auto;align-items:start}\n.plan{border:1px solid var(--line);border-radius:1.3rem;padding:1.8rem;text-align:center;background:#fff}\n.plan.best{background:var(--dark);color:#fff;border-color:var(--dark);transform:scale(1.04);position:relative}\n.plan h3{font-size:.95rem;font-weight:700;color:var(--muted)}\n.plan.best h3{color:#9fb2c8}\n.plan strong{display:block;font-size:2.2rem;font-weight:800;margin:.5rem 0 .1rem;letter-spacing:-.02em}\n.plan span{font-size:.82rem;color:var(--muted)}\n.plan.best span{color:#9fb2c8}\n.plan ul{list-style:none;margin:1.3rem 0;text-align:left;font-size:.9rem;display:flex;flex-direction:column;gap:.55rem}\n.plan.best ul{color:#d7e0ec}\n.tag{position:absolute;top:-0.7rem;left:50%;transform:translateX(-50%);background:var(--acc);color:#fff;font-size:.7rem;font-weight:700;padding:.3rem .8rem;border-radius:999px}\n.cta{text-align:center;background:var(--dark);color:#fff;padding:4.5rem 6vw}\n.cta h2{font-size:clamp(1.6rem,3.4vw,2.4rem);font-weight:800;letter-spacing:-.02em}\n.cta p{color:#9fb2c8;margin:.6rem 0 1.8rem}\nfooter{text-align:center;padding:2rem;color:var(--muted);font-size:.85rem;border-top:1px solid var(--line)}\n@media(max-width:640px){.hero-form input{width:100%}.shot-side{display:none}.plan.best{transform:none}}\n",
    "js/script.js": "// Efek muncul halus untuk section saat discroll\ndocument.addEventListener('DOMContentLoaded', function () {\n  var els = document.querySelectorAll('.features article, figure, .plan');\n  if (!('IntersectionObserver' in window)) return;\n  var io = new IntersectionObserver(function (entries) {\n    entries.forEach(function (e) {\n      if (e.isIntersecting) { e.target.style.opacity = 1; e.target.style.transform = ''; io.unobserve(e.target); }\n    });\n  }, { threshold: 0.15 });\n  els.forEach(function (el, i) {\n    el.style.opacity = 0;\n    el.style.transform = 'translateY(20px)';\n    el.style.transition = 'opacity .5s ease ' + (i % 3) * 80 + 'ms, transform .5s ease ' + (i % 3) * 80 + 'ms';\n    io.observe(el);\n  });\n});\n"
  }
};

  // ---------- util ----------
  function sizeLabel(content) {
    var b = new Blob([content || '']).size;
    if (b > 1024 * 1024) return (b / (1024 * 1024)).toFixed(2) + ' MB';
    if (b > 1024) return (b / 1024).toFixed(1) + ' KB';
    return b + ' B';
  }

  // Replikasi wsUnflatten (chat.html) supaya struktur file identik dengan buatan chat
  function unflatten(flat) {
    var data = { 'root': [] };
    function ensureChain(folderKey) {
      if (folderKey === 'root') return;
      var parts = folderKey.split('/').filter(Boolean);
      var parent = 'root', cum = '';
      parts.forEach(function (part) {
        cum = cum ? cum + '/' + part : part;
        if (!Array.isArray(data[parent])) data[parent] = [];
        if (!data[parent].some(function (i) { return i && i.type === 'folder' && i.name.toLowerCase() === part.toLowerCase(); })) {
          data[parent].push({ type: 'folder', name: part, path: cum, fileCount: 0, previewText: 'Folder' });
        }
        if (!Array.isArray(data[cum])) data[cum] = [];
        parent = cum;
      });
    }
    (flat || []).forEach(function (f) {
      var p = String((f && f.path) || '').trim();
      var content = (f && f.content) || '';
      if (p.slice(-1) === '/') { ensureChain(p.slice(0, -1)); return; }
      var parts = p.split('/').filter(Boolean);
      var name = parts.pop();
      if (!name) return;
      var folderKey = parts.length ? parts.join('/') : 'root';
      ensureChain(folderKey);
      if (!Array.isArray(data[folderKey])) data[folderKey] = [];
      if (!data[folderKey].some(function (i) { return i.path.toLowerCase() === p.toLowerCase(); })) {
        data[folderKey].push({ type: 'file', name: name, size: sizeLabel(content), path: p, content: content });
      }
    });
    return data;
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById('clincoo-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'clincoo-toast';
      toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-medium shadow-lg transition-all duration-300 opacity-0 translate-y-2';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    requestAnimationFrame(function () { toast.classList.remove('opacity-0', 'translate-y-2'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.classList.add('opacity-0', 'translate-y-2'); }, 2600);
  }

  function closeAllOptionPopups() {
    document.querySelectorAll('.option-popup').forEach(function (popup) {
      popup.classList.remove('opacity-100', 'visible', 'translate-y-0');
      popup.classList.add('opacity-0', 'invisible', 'translate-y-2');
    });
  }

  // ---------- favorit & laporan ----------
  function getFavorites() {
    try { return JSON.parse(localStorage.getItem('clincoo_template_favorites') || '[]'); } catch (e) { return []; }
  }
  function isFavorite(key) { return getFavorites().indexOf(key) !== -1; }
  function favorite(key, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    closeAllOptionPopups();
    if (!list[key]) return;
    try {
      var favs = getFavorites();
      if (favs.indexOf(key) === -1) {
        favs.push(key);
        localStorage.setItem('clincoo_template_favorites', JSON.stringify(favs));
        showToast('Template "' + list[key].name + '" disimpan ke favorit.');
      } else {
        showToast('Template ini sudah ada di favorit.');
      }
    } catch (e) {}
    if (typeof refreshFavoriteList === 'function') { try { refreshFavoriteList(); } catch (e) {} }
  }
  function unfavorite(key, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    closeAllOptionPopups();
    try {
      var favs = getFavorites().filter(function (k) { return k !== key; });
      localStorage.setItem('clincoo_template_favorites', JSON.stringify(favs));
      showToast('Template dihapus dari favorit.');
    } catch (e) {}
    if (typeof refreshFavoriteList === 'function') { try { refreshFavoriteList(); } catch (e) {} }
  }
  function report(key, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    closeAllOptionPopups();
    if (!list[key]) return;
    try {
      var reports = JSON.parse(localStorage.getItem('clincoo_template_reports') || '[]');
      if (reports.indexOf(key) === -1) {
        reports.push(key);
        localStorage.setItem('clincoo_template_reports', JSON.stringify(reports));
      }
    } catch (e) {}
    showToast('Terima kasih, laporanmu sudah kami terima.');
  }

  // ---------- GUNAKAN TEMPLATE: pasang file web jadi langsung ----------
  function use(key, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    closeAllOptionPopups();
    var t = list[key];
    var site = files[key];
    if (!t || !site) return;

    var pid = 'proj_' + Date.now();
    var newProject = { id: pid, title: t.name, prompt: t.desc, updatedAt: new Date().toISOString() };

    // 1) Daftar proyek (lokal + D1)
    var projects = [];
    try {
      var stored = localStorage.getItem('clincoo_projects');
      if (stored) projects = JSON.parse(stored);
    } catch (e) {}
    projects.unshift(newProject);
    try {
      localStorage.setItem('clincoo_projects', JSON.stringify(projects));
      if (typeof pushProjectsToServer === 'function') {
        pushProjectsToServer(projects);
      } else {
        fetch(API_BASE + '/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'replace_all', projects: projects })
        }).catch(function () {});
      }
    } catch (e) {}

    // 2) Pasang file web template ke workspace proyek baru
    var flat = [];
    Object.keys(site).forEach(function (path) { flat.push({ path: path, content: site[path] }); });
    try {
      localStorage.setItem('clincoo_workspace_files_' + pid, JSON.stringify(unflatten(flat)));
    } catch (e) {}

    // 3) Sinkron file ke D1 (per-akun) — fire & forget, workspace akan menarik saat dibuka
    try {
      fetch(API_BASE + '/project-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: pid, files: flat })
      }).catch(function () {});
    } catch (e) {}

    // 4) Buka workspace — websitenya sudah jadi
    try { localStorage.setItem('clincoo_current_project_id', pid); } catch (e) {}
    window.location.href = WS_URL + '?id=' + pid;
  }

  // ---------- LIHAT PREVIEW: screenshot web asli ----------
  function preview(key, event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    closeAllOptionPopups();
    var t = list[key];
    if (!t) return;
    var modal = document.getElementById('template-preview-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'template-preview-modal';
    modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4';
    modal.style.background = 'rgba(0,0,0,0.45)';
    var box = document.createElement('div');
    box.className = 'w-full max-w-lg bg-white border border-gray-100 rounded-2xl shadow-xl p-4 flex flex-col gap-4';
    var head = document.createElement('div');
    head.className = 'flex items-center justify-between';
    var title = document.createElement('h3');
    title.className = 'font-semibold text-gray-900 text-base';
    title.textContent = t.name;
    var closeBtn = document.createElement('button');
    closeBtn.className = 'p-1.5 text-gray-400 hover:text-black hover:bg-gray-50 rounded-lg transition-colors';
    closeBtn.setAttribute('aria-label', 'Tutup');
    closeBtn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>';
    closeBtn.addEventListener('click', function () { modal.remove(); });
    head.appendChild(title);
    head.appendChild(closeBtn);
    var imgWrap = document.createElement('div');
    imgWrap.className = 'w-full aspect-video bg-gray-50 rounded-xl overflow-hidden';
    var img = document.createElement('img');
    img.src = IMG_BASE + key + '.png';
    img.alt = 'Pratinjau ' + t.name;
    img.className = 'w-full h-full object-cover';
    imgWrap.appendChild(img);
    var desc = document.createElement('p');
    desc.className = 'text-sm text-gray-500 leading-relaxed';
    desc.textContent = t.desc;
    var useBtn = document.createElement('button');
    useBtn.className = 'w-full bg-black text-white text-sm font-semibold py-2.5 rounded-xl hover:opacity-90 transition-opacity';
    useBtn.textContent = 'Gunakan Template';
    useBtn.addEventListener('click', function () { use(key, null); });
    box.appendChild(head);
    box.appendChild(imgWrap);
    box.appendChild(desc);
    box.appendChild(useBtn);
    modal.appendChild(box);
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });
  }

  return {
    list: list,
    files: files,
    imgBase: IMG_BASE,
    getFavorites: getFavorites,
    isFavorite: isFavorite,
    favorite: favorite,
    unfavorite: unfavorite,
    report: report,
    use: use,
    preview: preview,
    showToast: showToast
  };
})();

// Alias global — dipakai atribut onclick di kartu template
function useTemplate(key, event) { ClincooTemplates.use(key, event); }
function previewTemplate(key, event) { ClincooTemplates.preview(key, event); }
function favoriteTemplate(key, event) { ClincooTemplates.favorite(key, event); }
function reportTemplate(key, event) { ClincooTemplates.report(key, event); }
