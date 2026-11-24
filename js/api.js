/* api.js — Klien REST API Apps Script bersama (skill gas-pro-api, gas-scale-turbo).
 * - POST wajib Content-Type text/plain agar tidak memicu preflight CORS.
 * - Respons non-JSON (halaman galat Google saat kuota penuh) dikenali sebagai "SIBUK", bukan kegagalan.
 * - Jam server dari setiap respons dipakai untuk mengoreksi jam perangkat (F-39).
 */
(function () {
  'use strict';
  var CFG = window.CBT_CONFIG || {};
  var API = { url: String(CFG.GAS_URL || ''), offset: 0, rttTerbaik: Infinity, latensi: 0, versiServer: '' };

  API.siap = function () { return /^https?:\/\//.test(API.url) && !/GANTI_DENGAN/.test(API.url); };
  /** Jam server perkiraan (ms). */
  API.sekarang = function () { return Date.now() + API.offset; };

  function catatJam(w, t0, t1) {
    if (!w) return;
    var rtt = t1 - t0;
    // Pakai sampel dengan waktu tempuh terpendek: paling akurat untuk selisih jam
    if (rtt <= API.rttTerbaik + 250) {
      API.offset = Math.round(w - (t0 + rtt / 2));
      API.rttTerbaik = Math.min(API.rttTerbaik, rtt);
    }
  }

  /**
   * Panggil aksi server. Selalu resolve (tidak pernah throw): { ok, data, kode, pesan }.
   * kode jaringan: JARINGAN (tanpa sinyal), WAKTU (habis waktu), SIBUK (server penuh).
   */
  API.riwayat = [];
  API.panggil = function (aksi, data, tiket, opsi) {
    opsi = opsi || {};
    if (!API.siap()) return Promise.resolve({ ok: false, kode: 'KONFIG', pesan: 'Alamat server belum diatur di js/config.js.' });
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opsi.timeout || 30000);
    var t0 = Date.now();
    return fetch(API.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ a: aksi, d: data || {}, t: tiket || '' }),
      redirect: 'follow', cache: 'no-store', credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      return res.text().then(function (teks) {
        var t1 = Date.now();
        API.latensi = t1 - t0;
        var j;
        try { j = JSON.parse(teks); } catch (e) {
          return { ok: false, kode: 'SIBUK', pesan: 'Server sedang sibuk. Mencoba lagi otomatis…' };
        }
        catatJam(j.w, t0, t1);
        if (j.v) API.versiServer = j.v;
        // Catatan kecepatan 30 panggilan terakhir: total di perangkat vs waktu kerja server (Akun Saya → Kecepatan)
        API.riwayat.unshift({ a: aksi, t: t0, total: t1 - t0, server: j.ms || 0, ok: !!j.ok });
        if (API.riwayat.length > 30) API.riwayat.length = 30;
        return j;
      });
    }).catch(function (e) {
      var habis = e && e.name === 'AbortError';
      return {
        ok: false, kode: habis ? 'WAKTU' : 'JARINGAN',
        pesan: navigator.onLine === false ? 'Tidak ada sinyal internet.' : (habis ? 'Server terlalu lama menjawab.' : 'Tidak bisa terhubung ke server.')
      };
    }).then(function (r) { clearTimeout(timer); return r; });
  };

  /** Galat sementara yang aman diulang otomatis. */
  API.bolehUlang = function (r) {
    return !!r && !r.ok && (r.kode === 'SIBUK' || r.kode === 'JARINGAN' || r.kode === 'WAKTU' || r.kode === 'GALAT');
  };

  /** Jeda ulang dengan backoff eksponensial + acak (5 s, 10 s, 20 s, … maks 60 s). */
  API.jedaUlang = function (percobaan) {
    var dasar = Math.min(60000, 5000 * Math.pow(2, Math.max(0, percobaan - 1)));
    return Math.round(dasar * (0.7 + Math.random() * 0.6));
  };

  API.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /** Inisial logo dari nama sekolah, mis. "SMP Negeri 3 Batipuh" → "3B". */
  API.monogram = function (nama) {
    nama = String(nama || '').trim();
    var angka = (nama.match(/\d+/) || [''])[0];
    var kata = nama.replace(/\d+/g, ' ').split(/\s+/).filter(function (w) { return w && !/^(smp|sma|smk|sd|mts|negeri|swasta|n)$/i.test(w); });
    if (angka && kata.length) return (angka + kata[kata.length - 1][0]).toUpperCase().slice(0, 3);
    return (kata.slice(0, 2).map(function (w) { return w[0]; }).join('') || 'CBT').toUpperCase();
  };

  /** Terapkan identitas sekolah: nama, motif songket/polos, warna utama. */
  API.terapkanSekolah = function (info) {
    if (!info) return;
    document.documentElement.setAttribute('data-motif', info.motif_layar_masuk === 'songket' ? 'songket' : 'polos');
    var w = String(info.warna_utama || '');
    // Warna bawaan lama (#1E3A8A) dan baru (#1F4FC4) memakai tema merek; warna lain dari Pengaturan menggantikannya
    if (/^#[0-9a-f]{6}$/i.test(w) && ['#1E3A8A', '#1F4FC4'].indexOf(w.toUpperCase()) < 0) {
      var gelap = '#' + [1, 3, 5].map(function (i) { return Math.round(parseInt(w.substr(i, 2), 16) * 0.72).toString(16).padStart(2, '0'); }).join('');
      document.documentElement.style.setProperty('--primary', w);
      document.documentElement.style.setProperty('--primary-dark', gelap);
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', ['#1E3A8A', '#1F4FC4', ''].indexOf(w.toUpperCase()) < 0 ? w : '#0B2266');
  };

  /** Info sekolah: tampil dari cache perangkat, disegarkan di latar belakang paling sering 12 jam sekali. */
  API.infoSekolah = function (cb) {
    var simpan = null;
    try { simpan = JSON.parse(localStorage.getItem('cbt_info') || 'null'); } catch (e) { /* abaikan */ }
    if (simpan && simpan.data) cb(simpan.data);
    if (!simpan || Date.now() - simpan.t > 12 * 3600e3) {
      API.panggil('infoPublik', {}, '', { timeout: 15000 }).then(function (r) {
        if (!r.ok) return;
        try { localStorage.setItem('cbt_info', JSON.stringify({ t: Date.now(), data: r.data })); } catch (e) { /* abaikan */ }
        cb(r.data);
      });
    }
  };

  /** Daftarkan service worker & tombol pasang aplikasi (skill gas-pwa-github). */
  API.pasangPWA = function (tombol) {
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      var daftar = function () { navigator.serviceWorker.register('./sw.js').catch(function () { /* abaikan */ }); };
      if (document.readyState === 'complete') daftar(); else window.addEventListener('load', daftar);
      // Rilis baru terpasang: muat ulang otomatis bila aman (bukan di tengah ujian), selain itu tawarkan tombol
      var adaPengendali = !!navigator.serviceWorker.controller, sudah = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!adaPengendali || sudah) return;
        sudah = true;
        if (typeof API.bolehMuatUlang === 'function' && API.bolehMuatUlang()) { location.reload(); return; }
        if (document.getElementById('versi-baru')) return;
        var b = document.createElement('div');
        b.id = 'versi-baru'; b.className = 'versi-baru';
        b.innerHTML = '<span>Versi baru aplikasi sudah siap.</span><button type="button" class="btn btn-primary btn-sm">Muat ulang</button>';
        b.querySelector('button').onclick = function () { location.reload(); };
        document.body.appendChild(b);
      });
    }
    if (!tombol) return;
    var prompt = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); prompt = e; tombol.hidden = false; });
    tombol.addEventListener('click', function () {
      if (!prompt) return;
      prompt.prompt();
      prompt.userChoice.then(function () { prompt = null; tombol.hidden = true; });
    });
    window.addEventListener('appinstalled', function () { tombol.hidden = true; });
  };

  /** Bersihkan HTML soal sebelum ditampilkan di panel (lapis kedua setelah server). */
  var _bersih = {};
  API.bersihHtml = function (html) {
    html = String(html || '');
    if (_bersih[html] !== undefined) return _bersih[html];
    var t = document.createElement('template');
    t.innerHTML = html;
    t.content.querySelectorAll('script,iframe,object,embed,link,meta,style,form,input,button,textarea,select,base,frame,frameset').forEach(function (n) { n.remove(); });
    t.content.querySelectorAll('*').forEach(function (el) {
      Array.prototype.slice.call(el.attributes).forEach(function (a) {
        var n = a.name.toLowerCase();
        if (n.indexOf('on') === 0 || ((n === 'href' || n === 'src' || n === 'xlink:href' || n === 'action') && /^\s*(javascript|vbscript|data:text)/i.test(a.value))) el.removeAttribute(a.name);
      });
    });
    var out = t.innerHTML;
    if (html.length < 20000) _bersih[html] = out;
    return out;
  };

  /** Muat skrip/stylesheet dari folder vendor sekali saja. */
  var _muat = {};
  API.muatSkrip = function (src) {
    if (_muat[src]) return _muat[src];
    _muat[src] = new Promise(function (ok, gagal) {
      var el;
      if (/\.css$/.test(src)) { el = document.createElement('link'); el.rel = 'stylesheet'; el.href = src; el.onload = ok; el.onerror = ok; }
      else { el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = function () { delete _muat[src]; gagal(new Error('Gagal memuat ' + src)); }; }
      document.head.appendChild(el);
    });
    return _muat[src];
  };
  API.katex = function () {
    return Promise.all([API.muatSkrip('./vendor/katex/katex.min.css'), API.muatSkrip('./vendor/katex/katex.min.js')]);
  };

  /** Unduh Blob sebagai file. */
  API.unduh = function (blob, nama) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nama;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 8000);
  };

  window.API = API;
})();
