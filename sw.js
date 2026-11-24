/* sw.js — Service worker Digital CBT (skill gas-pwa-github).
 * - Tampilan aplikasi disimpan di perangkat, sehingga halaman langsung terbuka (tanpa menunggu server)
 *   dan tetap bisa dimuat ulang saat sinyal hilang di tengah ujian (menutup risiko PRD 7.6).
 * - Panggilan API Apps Script TIDAK PERNAH disimpan di cache.
 * - Strategi stale-while-revalidate: tampil dari cache, pembaruan diunduh di latar belakang
 *   dan dipakai pada pembukaan berikutnya. Naikkan VERSI setiap rilis.
 * - Pustaka di vendor/ (KaTeX, mammoth, pdf.js) tidak di-precache; disimpan saat pertama dipakai.
 * - Rilis baru (VERSI berubah) dipasang di latar; halaman memuat ulang sendiri bila aman (API.pasangPWA).
 */
var VERSI = 'cbt-v1.1.0';
// Hanya berkas yang dibutuhkan semua perangkat. Modul panel staf (m-*.js, impor, xlsx) disimpan saat pertama dipakai,
// sehingga HP siswa tidak mengunduh kode yang tidak dipakainya.
var INTI = [
  './', './index.html', './ujian.html', './manifest.webmanifest',
  './css/base.css', './css/masuk.css', './css/ujian.css', './css/panel.css', './css/modul.css',
  './js/config.js', './js/api.js', './js/ujian.js', './js/panel.js',
  './vendor/fonts/plus-jakarta-sans.woff2',
  './icons/logo.webp', './icons/logo-emblem.webp', './icons/favicon-64.png',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-180.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSI).then(function (c) {
    // cache: 'reload' melewati cache HTTP GitHub Pages (±10 menit) agar semua file berasal dari rilis yang sama
    return c.addAll(INTI.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { if (k !== VERSI && k.indexOf('cbt-') === 0) return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function apakahApi(url) {
  return /(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname) || /\/exec$/.test(url.pathname) || /\/__uji/.test(url.pathname);
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (apakahApi(url)) return; // selalu langsung ke jaringan

  if (url.origin !== self.location.origin) return;

  e.respondWith(caches.open(VERSI).then(function (c) {
    var kunci = req.mode === 'navigate' ? new Request(url.origin + url.pathname) : req;
    return c.match(kunci, { ignoreSearch: req.mode === 'navigate' }).then(function (hit) {
      var segar = fetch(req).then(function (res) {
        if (res.ok) c.put(kunci, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || segar;
    });
  }));
});
