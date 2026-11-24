/* ujian.js — Mesin ujian di perangkat siswa (PRD prinsip 1 "server tipis", F-01–F-11, F-36–F-42).
 *
 * Setiap klik diproses di perangkat (< 100 ms) dan langsung tersimpan di localStorage.
 * Paket soal disimpan di IndexedDB. Server hanya dihubungi saat login, unduh paket,
 * sinkronisasi berkala 2–3 menit, dan pengumpulan.
 */
(function () {
  'use strict';
  // Tautan lama ujian.html?p=nilai: nilai kini ada di beranda siswa setelah masuk
  if (/[?&]p=nilai\b/.test(location.search)) { location.replace('./index.html'); return; }
  var $ = function (id) { return document.getElementById(id); };
  var KUNCI = 'cbt_ujian_v1', KUNCI_DEV = 'cbt_dev';
  var HURUF = 'ABCDEFGHIJ';
  var SKALA = [0.875, 1, 1.125, 1.25, 1.4];
  var LABEL = { PG: 'Pilihan Ganda', PGK: 'PG Kompleks', BS: 'Benar-Salah', JODOH: 'Menjodohkan', ISIAN: 'Isian Singkat', ESAI: 'Uraian' };
  var S = null;          // keadaan ujian (tersimpan di localStorage)
  var PAKET = null;      // paket soal (IndexedDB)
  var SOAL = {};         // id → soal
  var GAMBAR = {};       // id gambar → data URI
  var INFO = null;       // identitas sekolah
  var esc = API.esc;

  // =========================================================================
  // Penyimpanan perangkat
  // =========================================================================
  function simpan() {
    try { localStorage.setItem(KUNCI, JSON.stringify(S)); return true; }
    catch (e) { toast('Penyimpanan perangkat penuh atau diblokir. Panggil pengawas.', 'danger', 8000); return false; }
  }
  function muat() { try { return JSON.parse(localStorage.getItem(KUNCI) || 'null'); } catch (e) { return null; } }
  function hapusState() { try { localStorage.removeItem(KUNCI); } catch (e) { /* abaikan */ } }

  function cekLocalStorage() {
    try { localStorage.setItem('cbt_uji', '1'); var ok = localStorage.getItem('cbt_uji') === '1'; localStorage.removeItem('cbt_uji'); return ok; }
    catch (e) { return false; }
  }

  var IDB = (function () {
    var memori = {}, dbP = null;
    function buka() {
      if (dbP) return dbP;
      dbP = new Promise(function (ok) {
        try {
          var req = indexedDB.open('digital-cbt', 1);
          req.onupgradeneeded = function () { req.result.createObjectStore('data'); };
          req.onsuccess = function () { ok(req.result); };
          req.onerror = function () { ok(null); };
          setTimeout(function () { ok(null); }, 3000);
        } catch (e) { ok(null); }
      });
      return dbP;
    }
    function tx(mode, fn) {
      return buka().then(function (db) {
        if (!db) return null;
        return new Promise(function (ok) {
          try {
            var t = db.transaction('data', mode), st = t.objectStore('data'), r = fn(st);
            t.oncomplete = function () { ok(r ? r.result : undefined); };
            t.onerror = t.onabort = function () { ok(null); };
          } catch (e) { ok(null); }
        });
      });
    }
    return {
      tersedia: function () { return buka().then(function (db) { return !!db; }); },
      get: function (k) { return tx('readonly', function (s) { return s.get(k); }).then(function (v) { return v != null ? v : (memori[k] || null); }); },
      put: function (k, v) { memori[k] = v; return tx('readwrite', function (s) { return s.put(v, k); }); },
      del: function (k) { delete memori[k]; return tx('readwrite', function (s) { return s.delete(k); }); }
    };
  })();

  function idPerangkat() {
    var d = null;
    try { d = localStorage.getItem(KUNCI_DEV); } catch (e) { /* abaikan */ }
    if (!d) {
      var a = new Uint8Array(16), h = 'abcdefghjkmnpqrstuvwxyz23456789';
      (window.crypto || window.msCrypto).getRandomValues(a);
      d = Array.prototype.map.call(a, function (b) { return h[b % h.length]; }).join('');
      try { localStorage.setItem(KUNCI_DEV, d); } catch (e) { /* abaikan */ }
    }
    return d;
  }

  function isiTiket(t) {
    try {
      var b = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b))));
    } catch (e) { return {}; }
  }

  // =========================================================================
  // Tampilan umum
  // =========================================================================
  function tampil(id) {
    ['layar-beranda', 'layar-konfirmasi', 'layar-ujian', 'layar-kumpul', 'layar-blokir'].forEach(function (x) { $(x).hidden = x !== id; });
    window.scrollTo(0, 0);
  }

  function toast(pesan, jenis, ms) {
    var el = document.createElement('div');
    el.className = 'toast ' + (jenis || '');
    el.setAttribute('role', 'status');
    el.textContent = pesan;
    $('toast').appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 4500);
  }

  function bukaModal(id) {
    var m = $(id); m.hidden = false;
    var f = m.querySelector('[data-fokus]') || m.querySelector('button');
    if (f) setTimeout(function () { f.focus(); }, 30);
  }
  function tutupModal(id) { $(id).hidden = true; }
  function tutupSemuaModal() { ['modal-ringkasan', 'modal-konfirmasi', 'modal-gambar', 'modal-token'].forEach(tutupModal); tutupLaci(); }

  function terapkanInfo(info) {
    INFO = info || INFO;
    if (!INFO) return;
    API.terapkanSekolah(INFO);
    var tahun = INFO.tahun_pelajaran ? 'Tahun Pelajaran ' + INFO.tahun_pelajaran + (INFO.semester ? ' · Semester ' + INFO.semester : '') : '';
    document.querySelectorAll('[data-sekolah="nama"]').forEach(function (el) { el.textContent = INFO.nama_sekolah || 'Digital CBT'; });
    document.querySelectorAll('[data-sekolah="kabupaten"]').forEach(function (el) { el.textContent = INFO.kabupaten || ''; });
    document.querySelectorAll('[data-sekolah="tahun"]').forEach(function (el) { el.textContent = tahun; });
    document.querySelectorAll('[data-sekolah="logo"]').forEach(function (el) {
      if (/^https:\/\//.test(INFO.logo || '')) el.innerHTML = '<img alt="" src="' + esc(INFO.logo) + '">';
      else el.textContent = API.monogram(INFO.nama_sekolah);
    });
  }

  function fmtJam(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), d = s % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (d < 10 ? '0' : '') + d;
  }
  function jamLokal(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2); }
  function inisial(nama) { return String(nama || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }

  // =========================================================================
  // W-01 Login
  // =========================================================================
  var selToken = [];
  function pasangToken() {
    selToken = Array.prototype.slice.call(document.querySelectorAll('.token-sel'));
    selToken.forEach(function (el, i) {
      el.addEventListener('input', function () {
        var v = el.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (v.length > 1) { isiTokenDari(i, v); return; }
        el.value = v;
        if (v && i < 5) selToken[i + 1].focus();
      });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Backspace' && !el.value && i > 0) { selToken[i - 1].focus(); selToken[i - 1].value = ''; e.preventDefault(); }
        else if (e.key === 'ArrowLeft' && i > 0) selToken[i - 1].focus();
        else if (e.key === 'ArrowRight' && i < 5) selToken[i + 1].focus();
      });
      el.addEventListener('paste', function (e) {
        var t = (e.clipboardData || window.clipboardData).getData('text');
        e.preventDefault(); isiTokenDari(i, t);
      });
      el.addEventListener('focus', function () { el.select(); });
    });
  }
  function isiTokenDari(i, teks) {
    var v = String(teks).toUpperCase().replace(/[^A-Z0-9]/g, '').split('');
    for (var k = i; k < 6 && v.length; k++) selToken[k].value = v.shift();
    selToken[Math.min(5, k)].focus();
  }
  function nilaiToken() { return selToken.map(function (el) { return el.value; }).join(''); }

  function galatMasuk(pesan) {
    var el = $('masuk-galat');
    el.hidden = !pesan;
    el.querySelector('span').textContent = pesan || '';
  }

  // =========================================================================
  // Beranda siswa: akun dari halaman masuk tunggal (sessionStorage, hilang saat tab ditutup)
  // =========================================================================
  var KUNCI_AKUN = 'cbt_akun', AKUN = null;
  function muatAkun() { try { return JSON.parse(sessionStorage.getItem(KUNCI_AKUN) || 'null'); } catch (e) { return null; } }
  function simpanAkun() { try { sessionStorage.setItem(KUNCI_AKUN, JSON.stringify(AKUN)); } catch (e) { /* abaikan */ } }
  function keluarAkun(pesan) {
    try { sessionStorage.removeItem(KUNCI_AKUN); if (pesan) sessionStorage.setItem('cbt_pesan', pesan); } catch (e) { /* abaikan */ }
    location.replace('./index.html');
  }

  function salam() {
    var h = new Date(API.sekarang()).getHours();
    return h < 11 ? 'Selamat pagi,' : h < 15 ? 'Selamat siang,' : h < 18 ? 'Selamat sore,' : 'Selamat malam,';
  }
  function tglPanjang(ms) { return new Date(ms).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function tglPendek(ms) { return ms ? new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }

  function keBeranda(segarkan) {
    AKUN = muatAkun();
    if (!AKUN || !AKUN.ts) { keluarAkun(''); return; }
    tampil('layar-beranda');
    renderBeranda(AKUN.data);
    if (segarkan || !AKUN.t || Date.now() - AKUN.t > 60000) perbaruiBeranda();
  }

  function perbaruiBeranda() {
    var b = $('btn-perbarui'); b.disabled = true; b.innerHTML = '<span class="putar"></span>Memperbarui…';
    API.panggil('berandaSiswa', {}, AKUN.ts, { timeout: 20000 }).then(function (r) {
      b.disabled = false; b.innerHTML = '<svg class="ic ic-sm"><use href="#i-refresh"/></svg>Perbarui';
      if (!r.ok) {
        if (r.kode === 'AKUN' || r.kode === 'NONAKTIF') { keluarAkun(r.pesan); return; }
        toast(r.kode === 'JARINGAN' || r.kode === 'WAKTU' ? 'Tidak bisa terhubung ke server. Data di layar mungkin belum terbaru.' : r.pesan, 'warn');
        return;
      }
      AKUN.data = r.data; AKUN.t = Date.now(); simpanAkun();
      if (!$('layar-beranda').hidden) renderBeranda(r.data);
    });
  }

  function renderBeranda(d) {
    var p = d.peserta || {};
    $('b-avatar').textContent = inisial(p.nama);
    $('b-nama').textContent = p.nama || '-';
    $('b-salam').textContent = salam();
    $('b-rombel').textContent = 'Kelas ' + (p.rombel || '-');
    $('b-nisn').hidden = !p.nisn; $('b-nisn').textContent = 'NISN ' + (p.nisn || '');
    $('b-tanggal').textContent = tglPanjang(API.sekarang());
    var uj = d.ujian || [];
    $('b-ujian').innerHTML = !uj.length
      ? '<div class="bs-kosong"><span class="bs-kosong-ikon"><svg class="ic"><use href="#i-calendar"/></svg></span><b>Tidak ada ujian untuk Anda hari ini.</b><p>Jadwal ujian tampil di sini pada hari pelaksanaan.</p></div>'
      : uj.map(function (u) {
        var label, kelas, tombol;
        if (u.status === 'selesai') { label = 'Selesai'; kelas = 'pill-ok'; tombol = '<div class="bs-kode"><small>Kode bukti</small><b class="mono">' + esc(u.kode_bukti || '-') + '</b></div>'; }
        else if (u.status === 'aktif') { label = 'Sedang dikerjakan'; kelas = 'pill-warn'; tombol = '<button type="button" class="btn btn-primary" data-mulai="' + esc(u.id) + '"><svg class="ic ic-sm"><use href="#i-play"/></svg>Lanjutkan</button>'; }
        else if (u.ruang_ditutup) { label = 'Ruang ditutup'; kelas = 'pill-idle'; tombol = '<span class="bs-catatan">Lapor ke pengawas bila Anda belum ujian.</span>'; }
        else { label = u.ruang_dibuka ? 'Ruang dibuka' : 'Menunggu pengawas'; kelas = u.ruang_dibuka ? 'pill-info' : 'pill-idle';
          tombol = '<button type="button" class="btn btn-primary" data-mulai="' + esc(u.id) + '"><svg class="ic ic-sm"><use href="#i-play"/></svg>Mulai ujian</button>'; }
        return '<article class="bs-ujian' + (u.status === 'selesai' ? ' selesai' : '') + '"><div class="bs-ujian-waktu"><b>' + jamLokal(u.mulai) + '</b><small>' + jamLokal(u.selesai) + '</small></div>' +
          '<div class="bs-ujian-isi"><span class="pill ' + kelas + '">' + label + '</span><h3>' + esc(u.mapel || u.ujian) + '</h3>' +
          '<p>' + esc(u.ujian) + '</p><ul class="bs-meta"><li><svg class="ic ic-sm"><use href="#i-door"/></svg>' + esc(u.ruang || '-') + '</li><li><svg class="ic ic-sm"><use href="#i-clock"/></svg>' + (u.durasi || '-') + ' menit</li>' +
          '<li><svg class="ic ic-sm"><use href="#i-list"/></svg>' + (u.jumlah_soal || '-') + ' soal</li></ul></div><div class="bs-ujian-aksi">' + tombol + '</div></article>';
      }).join('');
    var n = d.nilai;
    $('b-nilai').innerHTML = !n ? '<div class="bs-kosong"><span class="bs-kosong-ikon emas"><svg class="ic"><use href="#i-star"/></svg></span><b>' + esc(d.nilai_info || 'Nilai belum tersedia.') + '</b></div>'
      : !n.length ? '<div class="bs-kosong"><span class="bs-kosong-ikon emas"><svg class="ic"><use href="#i-star"/></svg></span><b>Belum ada nilai yang dipublikasikan.</b><p>Nilai tampil setelah guru memverifikasi dan mempublikasikannya.</p></div>'
      : n.map(function (x) {
        var lewat = x.sanggah_sampai && x.sanggah_sampai < API.sekarang();
        return '<article class="bs-nilai"><div class="bs-nilai-angka"><b>' + angkaNilai(x.nilai) + '</b>' + (x.remedial !== null && x.remedial !== undefined ? '<small>Remedial ' + angkaNilai(x.remedial) + '</small>' : '') + '</div>' +
          '<div class="bs-nilai-isi"><h3>' + esc(x.mapel || '-') + '</h3><p>' + esc(x.ujian) + ' · ' + tglPendek(x.tanggal) + '</p>' +
          '<p class="bs-nilai-kaki">Kode bukti <b class="mono">' + esc(x.kode || '-') + '</b>' + (x.sanggah_sampai ? ' · ' + (lewat ? 'masa sanggah berakhir' : 'sanggah sampai ' + tglPendek(x.sanggah_sampai)) : '') + '</p></div></article>';
      }).join('');
  }
  function angkaNilai(v) { return v === null || v === undefined || isNaN(v) ? '-' : (Math.round(Number(v) * 100) / 100).toLocaleString('id-ID'); }

  function bukaToken(idSesi) {
    var u = ((AKUN && AKUN.data && AKUN.data.ujian) || []).filter(function (x) { return x.id === idSesi; })[0];
    $('mt-info').textContent = u ? (u.mapel || u.ujian) + ' · ' + (u.ruang || '') + '. Token dibacakan oleh pengawas.' : 'Token dibacakan oleh pengawas.';
    selToken.forEach(function (el) { el.value = ''; });
    galatMasuk('');
    $('modal-token').hidden = false;
    setTimeout(function () { selToken[0].focus(); }, 60);
  }

  function prosesMasuk(e) {
    if (e) e.preventDefault();
    galatMasuk('');
    var tk = nilaiToken();
    if (tk.length !== 6) { galatMasuk('Token ruang terdiri atas 6 karakter. Minta pengawas membacakan ulang.'); selToken[Math.min(tk.length, 5)].focus(); return; }
    if (!cekLocalStorage()) { galatMasuk('Penyimpanan browser tidak tersedia. Keluar dari mode penyamaran atau ganti ke Chrome, lalu masuk lagi.'); return; }
    AKUN = muatAkun();
    if (!AKUN) { keluarAkun('Silakan masuk lagi.'); return; }
    var btn = $('btn-masuk'), label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="putar"></span>Memeriksa…';
    var dev = idPerangkat(), percobaan = 0;
    (function coba() {
      API.panggil('mulaiUjian', { tk: tk, dev: dev }, AKUN.ts, { timeout: 30000 }).then(function (r) {
        if (!r.ok && r.kode === 'SIBUK' && percobaan < 4) {
          percobaan++;
          btn.innerHTML = '<span class="putar"></span>Server sibuk, mencoba lagi…';
          setTimeout(coba, API.jedaUlang(percobaan));
          return;
        }
        btn.disabled = false; btn.innerHTML = label;
        if (!r.ok) {
          if (r.kode === 'AKUN' || r.kode === 'NONAKTIF') { keluarAkun(r.pesan); return; }
          galatMasuk(r.kode === 'JARINGAN' || r.kode === 'WAKTU' ? 'Tidak bisa terhubung ke server. Periksa sinyal, lalu tekan Masuk lagi.' : r.pesan);
          if (r.kode === 'TOKEN') { selToken.forEach(function (el) { el.value = ''; }); selToken[0].focus(); }
          return;
        }
        $('modal-token').hidden = true;
        var d = r.data;
        if (d.selesai) {
          S = { v: 1, status: 'selesai', peserta: d.peserta, ujian: d.ujian, sesi: d.sesi, kode: d.selesai.kode_bukti, olehPengawas: d.selesai.oleh_pengawas, waktuKumpul: 0 };
          simpan(); tampilSelesai(); return;
        }
        buatState(d, dev);
        simpan();
        tampilKonfirmasi();
      });
    })();
  }

  function buatState(d, dev) {
    var lama = muat();
    S = {
      v: 1, status: 'konfirmasi', tiket: d.tiket, tiketX: isiTiket(d.tiket).x || 0, dev: dev,
      peserta: d.peserta, ujian: d.ujian, sesi: d.sesi, aturan: d.aturan || {}, paket: d.paket, benih: d.benih,
      mulai: d.mulai, batas: d.batas, offset: API.offset,
      urutan: null, uo: {}, jawaban: {}, ragu: {}, idx: 0, skala: 1,
      seq: 0, seqKirim: 0, keluar: 0, kirimTerakhir: 0, peringatan: {}
    };
    if (d.lanjut) {
      S.jawaban = d.lanjut.jawaban || {};
      (d.lanjut.ragu || []).forEach(function (id) { S.ragu[id] = true; });
      if (Array.isArray(d.lanjut.urutan_soal) && d.lanjut.urutan_soal.length) S.urutan = d.lanjut.urutan_soal;
      S.uo = d.lanjut.urutan_opsi || {};
      S.keluar = d.lanjut.keluar || 0;
      S.seq = S.seqKirim = d.lanjut.seq || 0;
    }
    // Jawaban di perangkat ini lebih baru daripada di server (mis. masuk ulang setelah tiket kedaluwarsa)
    if (lama && lama.jawaban && lama.peserta && lama.sesi && lama.peserta.username === d.peserta.username &&
        lama.sesi.id === d.sesi.id && (lama.seq || 0) > S.seq) {
      ['jawaban', 'ragu', 'urutan', 'uo', 'keluar', 'seq', 'idx', 'skala'].forEach(function (k) { if (lama[k] !== undefined) S[k] = lama[k]; });
    }
  }

  // =========================================================================
  // W-02 Konfirmasi data dan cek perangkat (F-02, F-40)
  // =========================================================================
  function setCek(nama, status, label, pesan) {
    var li = document.querySelector('[data-cek="' + nama + '"]');
    var kelas = { ok: 'pill-ok', gagal: 'pill-danger', warn: 'pill-warn', proses: 'pill-idle' }[status];
    var ikon = status === 'ok' ? '<svg class="ic"><use href="#i-check"/></svg>' : status === 'gagal' ? '<svg class="ic"><use href="#i-x"/></svg>' :
      status === 'warn' ? '<svg class="ic"><use href="#i-alert"/></svg>' : '<span class="putar"></span>';
    li.className = status === 'gagal' ? 'gagal' : status === 'warn' ? 'peringatan' : '';
    li.innerHTML = '<span>' + esc(li.firstElementChild.textContent) + '</span><span class="pill ' + kelas + '">' + ikon + esc(label) + '</span>' +
      (pesan ? '<span class="pesan-cek">' + esc(pesan) + '</span>' : '');
  }

  var cekOk = { simpan: false, paket: false }, timerKonf = null;
  function tampilKonfirmasi() {
    tampil('layar-konfirmasi');
    var p = S.peserta, u = S.ujian;
    $('k-avatar').textContent = inisial(p.nama);
    $('k-nama').textContent = p.nama;
    $('k-rombel').textContent = 'Kelas ' + (p.rombel || '-');
    $('k-nisn').textContent = p.nisn ? 'NISN ' + p.nisn : 'NIS ' + (p.nis || '-');
    $('k-mapel').textContent = u.mapel || '-';
    $('k-ujian').textContent = u.nama || '-';
    $('k-durasi').textContent = (u.durasi || 0) + ' menit';
    $('k-jumlah').textContent = (u.jumlah_soal || 0) + ' soal';
    clearInterval(timerKonf);
    var segarkan = function () { $('k-sisa').textContent = Math.max(0, Math.floor((S.batas - API.sekarang()) / 60000)) + ' menit'; };
    segarkan(); timerKonf = setInterval(segarkan, 15000);

    cekOk = { simpan: false, paket: false };
    var lsOk = cekLocalStorage();
    IDB.tersedia().then(function (idb) {
      if (!lsOk) setCek('simpan', 'gagal', 'Tidak tersedia', 'Keluar dari mode penyamaran atau ganti ke Chrome, lalu masuk lagi.');
      else if (!idb) { setCek('simpan', 'warn', 'Terbatas', 'Ujian tetap bisa dikerjakan. Jangan muat ulang halaman saat sinyal hilang.'); cekOk.simpan = true; }
      else { setCek('simpan', 'ok', 'Siap'); cekOk.simpan = true; }
      perbaruiTombolMulai();
    });
    var modern = 'fetch' in window && 'Promise' in window && window.CSS && CSS.supports && CSS.supports('display', 'grid');
    var chrome = (navigator.userAgent.match(/Chrom(e|ium)\/(\d+)/) || [])[2];
    if (!modern) setCek('browser', 'gagal', 'Terlalu lama', 'Perbarui browser atau gunakan Chrome versi terbaru.');
    else if (chrome && Number(chrome) < 80) setCek('browser', 'warn', 'Versi lama', 'Ujian bisa berjalan, tetapi sebaiknya perbarui Chrome.');
    else setCek('browser', 'ok', 'Siap');
    setCek('koneksi', navigator.onLine === false ? 'warn' : 'ok', navigator.onLine === false ? 'Terputus' : 'Siap',
      navigator.onLine === false ? 'Soal tetap bisa dikerjakan bila paket sudah terunduh.' : '');
    setCek('paket', 'proses', 'Mengunduh');
    muatPaket(function (n, total) {
      setCek('paket', 'ok', 'Siap · ' + PAKET.soal.length + ' soal' + (total ? ' · gambar ' + n + '/' + total : ''));
    }).then(function () {
      cekOk.paket = true;
      setCek('paket', 'ok', 'Siap · ' + PAKET.soal.length + ' soal');
      perbaruiTombolMulai();
    }).catch(function () { /* blokir sudah ditangani */ });
  }

  function perbaruiTombolMulai() { $('btn-mulai').disabled = !(cekOk.simpan && cekOk.paket); }

  // =========================================================================
  // Paket soal: unduh bertahap (teks dulu, gambar menyusul) dan simpan di IndexedDB (F-36)
  // =========================================================================
  function kunciPaket() { return 'pk_' + S.paket.id + '_' + S.paket.versi; }
  function kunciGambar() { return 'gb_' + S.paket.id + '_' + S.paket.versi; }

  function muatPaket(onGambar) {
    return IDB.get(kunciPaket()).then(function (pk) {
      if (pk && pk.soal) return pk;
      return new Promise(function (ok, gagal) {
        var n = 0;
        (function coba() {
          API.panggil('ambilPaket', { bagian: 'teks' }, S.tiket, { timeout: 45000 }).then(function (r) {
            if (r.ok) { IDB.put(kunciPaket(), r.data); ok(r.data); return; }
            if (r.kode === 'TIKET' || r.kode === 'PINDAH') { blokir(r.kode, r.pesan); gagal(r); return; }
            n++;
            if ($('layar-konfirmasi').hidden === false) setCek('paket', 'warn', 'Mencoba lagi…', r.pesan);
            setTimeout(coba, API.jedaUlang(n));
          });
        })();
      });
    }).then(function (pk) {
      PAKET = pk;
      SOAL = {};
      PAKET.soal.forEach(function (q) { SOAL[q.id] = q; });
      siapkanUrutan();
      if (JSON.stringify(PAKET).indexOf('katex') > -1) muatKatex();
      muatGambar(onGambar);
      return PAKET;
    });
  }

  function muatKatex() {
    if (document.getElementById('css-katex')) return;
    var l = document.createElement('link');
    l.id = 'css-katex'; l.rel = 'stylesheet';
    l.href = './vendor/katex/katex.min.css'; // disimpan sendiri: tidak bergantung CDN yang bisa diblokir jaringan sekolah (PRD 7.6)
    document.head.appendChild(l);
  }

  function muatGambar(onGambar) {
    if (!PAKET.gambar || !PAKET.gambar.length) return;
    IDB.get(kunciGambar()).then(function (g) {
      GAMBAR = g || {};
      terapkanGambar(document);
      var total = PAKET.gambar.length;
      var perlu = urutkanGambar(PAKET.gambar.filter(function (id) { return !GAMBAR[id]; }));
      var n = 0;
      (function ambil() {
        if (onGambar) onGambar(total - perlu.length, total);
        if (!perlu.length || !S || !S.tiket) return;
        API.panggil('ambilPaket', { bagian: 'gambar', ids: perlu }, S.tiket, { timeout: 60000 }).then(function (r) {
          if (!r.ok) { if (API.bolehUlang(r)) { n++; setTimeout(ambil, API.jedaUlang(n)); } return; }
          Object.keys(r.data.gambar || {}).forEach(function (k) { if (r.data.gambar[k]) GAMBAR[k] = r.data.gambar[k]; });
          perlu = r.data.sisa || [];
          IDB.put(kunciGambar(), GAMBAR);
          terapkanGambar(document);
          ambil();
        });
      })();
    });
  }

  /** Gambar soal yang sedang dibuka didahulukan. */
  function urutkanGambar(ids) {
    if (!S.urutan) return ids;
    var posisi = {};
    S.urutan.forEach(function (sid, i) {
      var q = SOAL[sid]; if (!q) return;
      var teks = JSON.stringify(q) + (q.st && PAKET.stimulus[q.st] ? PAKET.stimulus[q.st].html : '');
      (teks.match(/data-gid=\\?"([A-Za-z0-9_-]+)/g) || []).forEach(function (m) {
        var id = m.replace(/.*"/, '');
        var jarak = (i - (S.idx || 0) + S.urutan.length) % S.urutan.length;
        if (posisi[id] === undefined || jarak < posisi[id]) posisi[id] = jarak;
      });
    });
    return ids.slice().sort(function (a, b) { return (posisi[a] || 0) - (posisi[b] || 0); });
  }

  function terapkanGambar(root) {
    (root || document).querySelectorAll('img[data-gid]').forEach(function (img) {
      var u = GAMBAR[img.getAttribute('data-gid')];
      if (u && img.getAttribute('src') !== u) { img.setAttribute('src', u); img.classList.remove('memuat'); }
    });
  }

  // Pengacakan per siswa: deterministik dari benih server, kelompok stimulus tetap berurutan (F-03, F-45)
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function acak(arr, rnd) {
    for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
    return arr;
  }
  function siapkanUrutan() {
    var ids = PAKET.soal.map(function (q) { return q.id; });
    var valid = Array.isArray(S.urutan) && S.urutan.length === ids.length && S.urutan.every(function (id) { return SOAL[id]; });
    var rnd = mulberry32(S.benih || 1);
    if (!valid) {
      var unit = [];
      PAKET.soal.forEach(function (q) {
        var akhir = unit[unit.length - 1];
        if (q.st && akhir && SOAL[akhir[0]].st === q.st) akhir.push(q.id); else unit.push([q.id]);
      });
      if (PAKET.acak_soal) acak(unit, rnd);
      S.urutan = [].concat.apply([], unit);
    }
    PAKET.soal.forEach(function (q) {
      var acakIni = PAKET.acak_opsi && !q.tetap;
      if ((q.jenis === 'PG' || q.jenis === 'PGK') && !S.uo[q.id]) {
        var o = q.opsi.map(function (x) { return x.id; });
        S.uo[q.id] = acakIni ? acak(o, rnd) : o;
      }
      if (q.jenis === 'JODOH' && !S.uo[q.id + ':k']) {
        var k = q.kanan.map(function (x) { return x.id; });
        S.uo[q.id + ':k'] = acakIni ? acak(k, rnd) : k;
      }
    });
    if (S.idx >= S.urutan.length) S.idx = 0;
    simpan();
  }

  // =========================================================================
  // Pembersih HTML soal (pertahanan berlapis; impor juga membersihkan di sisi guru)
  // =========================================================================
  var _bersih = {};
  function bersih(html) {
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
    t.content.querySelectorAll('img[data-gid]').forEach(function (img) {
      img.removeAttribute('src'); img.classList.add('memuat');
      if (!img.getAttribute('alt')) img.setAttribute('alt', 'Gambar soal');
    });
    return (_bersih[html] = t.innerHTML);
  }
  function teksPolos(html) { var d = document.createElement('div'); d.innerHTML = bersih(html); return (d.textContent || '').trim(); }

  // =========================================================================
  // W-03 / W-04 Ruang ujian
  // =========================================================================
  function mulaiUjian() {
    clearInterval(timerKonf);
    S.status = 'mengerjakan';
    simpan();
    tampil('layar-ujian');
    $('u-mapel').textContent = [S.ujian.mapel, S.ujian.nama].filter(Boolean).join(' · ');
    $('u-peserta').innerHTML = esc(S.peserta.nama) + ' <span class="mono muted">(' + esc(S.peserta.username) + ')</span>';
    terapkanSkala();
    bangunKisi();
    render(S.idx || 0);
    tick();
    setStatus(navigator.onLine === false ? 'tunggu' : 'ok');
    // Sinkron pertama diberi jeda acak 20–90 detik agar login massal tidak langsung diikuti tulis massal
    var pertama = S.kirimTerakhir ? Math.max(5000, intervalAcak() - (Date.now() - S.kirimTerakhir)) : 20000 + Math.random() * 70000;
    jadwalSinkron(pertama);
    history.pushState({ ujian: 1 }, '');
  }

  function jumlahTerjawab() {
    var n = 0;
    S.urutan.forEach(function (id) { if (terjawab(SOAL[id], S.jawaban[id])) n++; });
    return n;
  }
  function terjawab(q, v) {
    if (!q || v === undefined || v === null) return false;
    switch (q.jenis) {
      case 'PG': return !!v;
      case 'PGK': return Array.isArray(v) && v.length > 0;
      case 'BS': return !!v && q.pernyataan.every(function (p) { return v[p.id]; });
      case 'JODOH': return !!v && q.kiri.every(function (k) { return v[k.id]; });
      default: return String(v).trim().length > 0;
    }
  }

  function bangunKisi() {
    var h = '';
    S.urutan.forEach(function (id, i) {
      h += '<button type="button" class="ubin' + (SOAL[id].st ? ' stim' : '') + '" data-i="' + i + '" role="listitem" aria-label="Soal ' + (i + 1) + '">' + (i + 1) + '</button>';
    });
    $('kisi').innerHTML = h;
    $('panel-total').textContent = S.urutan.length + ' butir';
    S.urutan.forEach(function (_, i) { perbaruiUbin(i); });
    perbaruiHitung();
  }

  function perbaruiUbin(i) {
    var el = $('kisi').children[i]; if (!el) return;
    var id = S.urutan[i];
    var j = terjawab(SOAL[id], S.jawaban[id]), r = !!S.ragu[id];
    el.classList.toggle('jawab', j && !r);
    el.classList.toggle('ragu', r);
    el.classList.toggle('aktif', i === S.idx);
    el.setAttribute('aria-label', 'Soal ' + (i + 1) + (r ? ', ragu-ragu' : j ? ', dijawab' : ', kosong'));
  }

  function perbaruiHitung() {
    var j = 0, r = 0;
    S.urutan.forEach(function (id) { if (S.ragu[id]) r++; else if (terjawab(SOAL[id], S.jawaban[id])) j++; });
    var k = S.urutan.length - j - r;
    $('h-jawab').textContent = 'Dijawab ' + j;
    $('h-ragu').textContent = 'Ragu ' + r;
    $('h-kosong').textContent = 'Kosong ' + k;
    $('u-posisi').textContent = (S.idx + 1) + '/' + S.urutan.length;
  }

  var stimTampil = null;
  function render(i) {
    var lama = S.idx;
    S.idx = Math.max(0, Math.min(i, S.urutan.length - 1));
    var id = S.urutan[S.idx], q = SOAL[id];
    $('soal-nomor').textContent = 'Soal ' + (S.idx + 1) + ' dari ' + S.urutan.length;
    $('soal-jenis').textContent = LABEL[q.jenis] || q.jenis;

    // Stimulus bersama: panel kiri di komputer, kartu terlipat di atas soal di HP (F-45)
    var badan = $('u-badan'), stim = q.st && PAKET.stimulus[q.st];
    $('u-stimulus').hidden = !stim;
    badan.classList.toggle('ada-stimulus', !!stim && S.aturan.stimulus_dua_panel !== false);
    badan.classList.toggle('stim-atas', !!stim && S.aturan.stimulus_dua_panel === false);
    if (stim && stimTampil !== q.st) {
      var nomor = [];
      S.urutan.forEach(function (sid, k) { if (SOAL[sid].st === q.st) nomor.push(k + 1); });
      $('stim-label').textContent = 'Stimulus untuk soal ' + (nomor.length > 1 ? nomor[0] + '–' + nomor[nomor.length - 1] : nomor[0]);
      $('stim-judul').textContent = stim.judul || '';
      $('stim-isi').innerHTML = bersih(stim.html);
      $('u-stimulus').scrollTop = 0;
      terapkanGambar($('u-stimulus'));
    }
    stimTampil = stim ? q.st : null;

    $('soal-isi').innerHTML = bersih(q.html);
    $('soal-jawab').innerHTML = htmlJawaban(q);
    terapkanGambar($('u-soal'));
    pasangInputTeks(q);

    var ragu = !!S.ragu[id];
    $('btn-ragu').setAttribute('aria-pressed', String(ragu));
    $('btn-sebelum').disabled = S.idx === 0;
    var akhir = S.idx === S.urutan.length - 1;
    $('btn-berikut').innerHTML = akhir ? 'Periksa &amp; Selesai<svg class="ic ic-sm"><use href="#i-chev-r"/></svg>' : 'Berikutnya<svg class="ic ic-sm"><use href="#i-chev-r"/></svg>';
    $('u-soal').scrollTop = 0;
    if (window.matchMedia('(max-width: 1023px)').matches) $('u-badan').scrollTop = 0;
    if (lama !== S.idx) perbaruiUbin(lama);
    perbaruiUbin(S.idx);
    perbaruiHitung();
    simpan();
  }

  function htmlJawaban(q) {
    var v = S.jawaban[q.id];
    if (q.jenis === 'PG' || q.jenis === 'PGK') {
      var ganda = q.jenis === 'PGK';
      var urut = S.uo[q.id] || q.opsi.map(function (o) { return o.id; });
      var peta = {}; q.opsi.forEach(function (o) { peta[o.id] = o; });
      var bergambar = q.opsi.length > 0 && q.opsi.every(function (o) { return /<img/i.test(o.html); });
      var pilih = ganda ? (Array.isArray(v) ? v : []) : [v];
      var h = ganda ? '<p class="pill pill-warn petunjuk-jenis"><svg class="ic"><use href="#i-info"/></svg>Pilih lebih dari satu jawaban</p>' : '';
      h += '<div class="opsi-daftar' + (ganda ? ' ganda' : '') + (bergambar ? ' bergambar' : '') + '" role="' + (ganda ? 'group' : 'radiogroup') + '">';
      urut.forEach(function (oid, k) {
        if (!peta[oid]) return;
        h += '<button type="button" class="opsi" role="' + (ganda ? 'checkbox' : 'radio') + '" aria-checked="' + (pilih.indexOf(oid) > -1) +
          '" data-o="' + esc(oid) + '"><span class="opsi-huruf">' + HURUF[k] + '</span><span class="opsi-isi konten">' + bersih(peta[oid].html) + '</span></button>';
      });
      return h + '</div>';
    }
    if (q.jenis === 'BS') {
      v = v || {};
      var b = '<table class="bs-tabel"><thead><tr><th>Pernyataan</th><th class="k">Benar</th><th class="k">Salah</th></tr></thead><tbody>';
      q.pernyataan.forEach(function (p, k) {
        b += '<tr><td><b>' + (k + 1) + '.</b> ' + bersih(p.html) + '</td>';
        ['B', 'S'].forEach(function (x) {
          b += '<td class="k"><button type="button" class="bs-pilih" role="radio" aria-checked="' + (v[p.id] === x) + '" data-p="' + esc(p.id) + '" data-v="' + x +
            '" aria-label="Pernyataan ' + (k + 1) + ' ' + (x === 'B' ? 'Benar' : 'Salah') + '"><svg class="ic ic-sm"><use href="#i-check"/></svg></button>' +
            '<span class="bs-label">' + (x === 'B' ? 'Benar' : 'Salah') + '</span></td>';
        });
        b += '</tr>';
      });
      return b + '</tbody></table>';
    }
    if (q.jenis === 'JODOH') {
      v = v || {};
      var kanan = (S.uo[q.id + ':k'] || q.kanan.map(function (x) { return x.id; }));
      var pk = {}; q.kanan.forEach(function (x) { pk[x.id] = x; });
      var dipakai = {}; Object.keys(v).forEach(function (k) { dipakai[v[k]] = k; });
      var j = '';
      q.kiri.forEach(function (kr, k) {
        var opsi = '<option value="">Pilih pasangan…</option>';
        kanan.forEach(function (rid, n) {
          if (!pk[rid]) return;
          var lain = dipakai[rid] && dipakai[rid] !== kr.id;
          opsi += '<option value="' + esc(rid) + '"' + (v[kr.id] === rid ? ' selected' : '') + '>' + HURUF[n] + '. ' + esc(teksPolos(pk[rid].html)) + (lain ? ' (sudah dipilih)' : '') + '</option>';
        });
        j += '<div class="jodoh-baris' + (v[kr.id] ? ' terisi' : '') + '"><span class="jodoh-no">' + (k + 1) + '</span><div class="konten">' + bersih(kr.html) + '</div>' +
          '<select class="input' + (v[kr.id] ? ' terpilih' : '') + '" data-k="' + esc(kr.id) + '" aria-label="Pasangan untuk pernyataan ' + (k + 1) + '">' + opsi + '</select></div>';
      });
      return j;
    }
    if (q.jenis === 'ISIAN') {
      return '<label class="field isian-wrap"><span class="label">Jawaban Anda:</span><input class="input" id="in-isian" maxlength="200" autocomplete="off" spellcheck="false" value="' +
        esc(v || '') + '"><span class="hint">Ketik jawaban dengan jelas. Huruf besar atau kecil tidak berpengaruh.</span></label>';
    }
    var batas = S.aturan.batas_esai || 2000;
    return '<label class="field esai-wrap"><span class="label">Jawaban Anda:</span><textarea class="input" id="in-esai" maxlength="' + batas + '" rows="8">' + esc(v || '') + '</textarea>' +
      '<span class="esai-kaki"><span class="hint">Tersimpan otomatis di perangkat setiap kali Anda berhenti mengetik.</span><span class="esai-hitung" id="esai-hitung"></span></span></label>';
  }

  var timerKetik = null;
  function pasangInputTeks(q) {
    var el = $('in-isian') || $('in-esai');
    if (!el) return;
    var batas = S.aturan.batas_esai || 2000;
    var hitung = function () {
      var c = $('esai-hitung'); if (!c) return;
      c.textContent = el.value.length.toLocaleString('id-ID') + ' / ' + batas.toLocaleString('id-ID') + ' karakter';
      c.classList.toggle('penuh', el.value.length >= batas);
    };
    hitung();
    var simpanTeks = function () { clearTimeout(timerKetik); ubah(q.id, el.value); };
    el.addEventListener('input', function () { hitung(); clearTimeout(timerKetik); timerKetik = setTimeout(simpanTeks, 500); });
    el.addEventListener('blur', simpanTeks);
  }

  /** Satu-satunya pintu perubahan jawaban: simpan lokal seketika, tandai untuk dikirim. */
  function ubah(id, nilai) {
    if (S.status !== 'mengerjakan') return;
    var kosong = nilai === '' || nilai === null || nilai === undefined || (Array.isArray(nilai) && !nilai.length) ||
      (typeof nilai === 'object' && !Array.isArray(nilai) && !Object.keys(nilai).length);
    var lama = JSON.stringify(S.jawaban[id]);
    if (kosong) delete S.jawaban[id]; else S.jawaban[id] = nilai;
    if (JSON.stringify(S.jawaban[id]) === lama) return;
    S.seq++;
    simpan();
    perbaruiUbin(S.idx);
    perbaruiHitung();
  }

  function klikJawaban(e) {
    if (S.status !== 'mengerjakan') return;
    var id = S.urutan[S.idx], q = SOAL[id];
    var o = e.target.closest('.opsi');
    if (o) {
      var oid = o.getAttribute('data-o');
      if (q.jenis === 'PG') {
        ubah(id, oid);
        $('soal-jawab').querySelectorAll('.opsi').forEach(function (b) { b.setAttribute('aria-checked', String(b === o)); });
      } else {
        var arr = Array.isArray(S.jawaban[id]) ? S.jawaban[id].slice() : [];
        var k = arr.indexOf(oid);
        if (k > -1) arr.splice(k, 1); else arr.push(oid);
        ubah(id, arr);
        o.setAttribute('aria-checked', String(k < 0));
      }
      return;
    }
    var b = e.target.closest('.bs-pilih');
    if (b) {
      var v = Object.assign({}, S.jawaban[id] || {});
      v[b.getAttribute('data-p')] = b.getAttribute('data-v');
      ubah(id, v);
      b.closest('tr').querySelectorAll('.bs-pilih').forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
      return;
    }
    var img = e.target.closest('.konten img');
    if (img && img.getAttribute('src') && !e.target.closest('.opsi')) perbesar(img);
  }

  function ubahJodoh(e) {
    var sel = e.target.closest('select[data-k]');
    if (!sel) return;
    var id = S.urutan[S.idx];
    var v = Object.assign({}, S.jawaban[id] || {});
    if (sel.value) v[sel.getAttribute('data-k')] = sel.value; else delete v[sel.getAttribute('data-k')];
    ubah(id, v);
    $('soal-jawab').innerHTML = htmlJawaban(SOAL[id]); // segarkan label "(sudah dipilih)"
    var baru = $('soal-jawab').querySelector('select[data-k="' + sel.getAttribute('data-k') + '"]');
    if (baru) baru.focus();
  }

  function perbesar(img) {
    $('gambar-besar').src = img.getAttribute('src');
    $('gambar-besar').alt = img.alt || '';
    bukaModal('modal-gambar');
  }

  function toggleRagu() {
    if (S.status !== 'mengerjakan') return;
    var id = S.urutan[S.idx];
    if (S.ragu[id]) delete S.ragu[id]; else S.ragu[id] = true;
    S.seq++;
    simpan();
    $('btn-ragu').setAttribute('aria-pressed', String(!!S.ragu[id]));
    perbaruiUbin(S.idx); perbaruiHitung();
  }

  function terapkanSkala() {
    var k = SKALA.indexOf(S.skala); if (k < 0) { S.skala = 1; k = 1; }
    $('layar-ujian').style.setProperty('--skala', S.skala);
    document.querySelectorAll('.ukuran button').forEach(function (b) {
      b.classList.toggle('aktif', b.getAttribute('data-ukuran') === '0' && S.skala === 1);
    });
  }
  function ubahSkala(arah) {
    var k = SKALA.indexOf(S.skala);
    k = arah === 0 ? 1 : Math.max(0, Math.min(SKALA.length - 1, k + arah));
    S.skala = SKALA[k];
    simpan(); terapkanSkala();
  }

  // Laci daftar soal (HP/tablet)
  function bukaLaci() { $('u-panel').classList.add('terbuka'); $('u-tirai').hidden = false; history.pushState({ laci: 1 }, ''); }
  function tutupLaci() { if (!$('u-panel').classList.contains('terbuka')) return; $('u-panel').classList.remove('terbuka'); $('u-tirai').hidden = true; }

  // =========================================================================
  // Timer dari batas waktu server + jam terkoreksi (F-07, F-39)
  // =========================================================================
  var timerTick = null;
  function sisaMs() { return S.batas - API.sekarang(); }
  function tick() {
    clearTimeout(timerTick);
    if (!S || S.status !== 'mengerjakan') return;
    var s = sisaMs();
    $('u-sisa').textContent = fmtJam(s);
    var el = $('u-timer');
    el.classList.toggle('warn', s <= 10 * 60e3 && s > 5 * 60e3);
    el.classList.toggle('bahaya', s <= 5 * 60e3);
    [10, 5].forEach(function (m) {
      if (s <= m * 60e3 && s > (m - 1) * 60e3 && !S.peringatan[m]) {
        S.peringatan[m] = true; simpan();
        toast('Sisa waktu ' + m + ' menit. Periksa kembali jawaban Anda.', m === 5 ? 'danger' : 'warn', 7000);
      }
    });
    if (!$('modal-ringkasan').hidden) $('ringkas-sisa').textContent = fmtJam(s);
    if (s <= 0) { kunci(true); return; }
    timerTick = setTimeout(tick, 1000 - (API.sekarang() % 1000) + 10);
  }

  // =========================================================================
  // Sinkronisasi berkala di latar belakang, idempoten (F-09, F-37)
  // =========================================================================
  var timerSinkron = null, sinkronJalan = false, gagalBeruntun = 0;
  function intervalAcak() {
    var a = Number(S.aturan.sinkron_min || 120), b = Number(S.aturan.sinkron_maks || 180);
    return (a + Math.random() * Math.max(0, b - a)) * 1000;
  }
  function jadwalSinkron(ms) { clearTimeout(timerSinkron); S.sinkronBerikut = Date.now() + ms; timerSinkron = setTimeout(sinkron, ms); }

  function setStatus(s) {
    var el = $('u-simpan'); if (!el) return;
    el.className = 'u-simpan pill s-' + s;
    var ikon = s === 'kirim' ? '<span class="putar"></span>' : s === 'tunggu' ? '<svg class="ic"><use href="#i-wifi-off"/></svg>' : '<svg class="ic"><use href="#i-check"/></svg>';
    el.innerHTML = ikon + '<span>' + (s === 'kirim' ? 'Menyimpan…' : s === 'tunggu' ? 'Menunggu sinyal…' : 'Tersimpan') + '</span>';
    el.title = S && S.kirimTerakhir ? 'Jawaban tersimpan di perangkat. Terakhir terkirim ke server pukul ' + jamLokal(S.kirimTerakhir) + '.' : 'Jawaban tersimpan di perangkat.';
  }

  function payload() {
    return {
      q: S.seq, j: S.jawaban, r: Object.keys(S.ragu).filter(function (k) { return S.ragu[k]; }),
      us: S.urutan, uo: S.uo, k: S.keluar, h: jumlahTerjawab(), n: S.urutan.length
    };
  }

  function sinkron() {
    if (sinkronJalan || !S || S.status !== 'mengerjakan') return;
    sinkronJalan = true;
    setStatus('kirim');
    var q = S.seq;
    API.panggil('sinkron', payload(), S.tiket, { timeout: 30000 }).then(function (r) {
      sinkronJalan = false;
      if (!S || S.status !== 'mengerjakan') return;
      if (r.ok) {
        var d = r.data || {};
        gagalBeruntun = 0;
        if (d.selesai) { selesai({ kode_bukti: d.kode_bukti, oleh_pengawas: d.oleh_pengawas }); return; }
        if (d.waktu_habis) { perbaruiBatas(d.batas); kunci(true); return; }
        if ((d.diterima || 0) >= q) S.seqKirim = Math.max(S.seqKirim, q);
        S.kirimTerakhir = Date.now(); S.offset = API.offset;
        perbaruiBatas(d.batas);
        simpan();
        setStatus('ok');
        jadwalSinkron(intervalAcak());
      } else if (r.kode === 'PINDAH' || r.kode === 'TIKET') {
        blokir(r.kode, r.pesan);
      } else {
        gagalBeruntun++;
        setStatus('tunggu');
        jadwalSinkron(API.jedaUlang(gagalBeruntun));
      }
    });
  }

  function perbaruiBatas(b) {
    if (!b || b <= S.batas + 1000) return;
    var menit = Math.round((b - S.batas) / 60000);
    S.batas = b;
    if (b - API.sekarang() > 10 * 60e3) S.peringatan = {};
    simpan(); tick();
    if (menit > 0) toast('Waktu ujian Anda ditambah ' + menit + ' menit oleh pengawas.', 'ok', 7000);
  }

  // =========================================================================
  // W-06 Ringkasan dan konfirmasi dua langkah (F-11)
  // =========================================================================
  function bukaRingkasan() {
    var kosong = [], ragu = [], j = 0;
    S.urutan.forEach(function (id, i) {
      if (S.ragu[id]) ragu.push(i); else if (terjawab(SOAL[id], S.jawaban[id])) j++; else kosong.push(i);
    });
    $('r-jawab').textContent = j; $('r-ragu').textContent = ragu.length; $('r-kosong').textContent = kosong.length;
    $('ringkas-sisa').textContent = fmtJam(sisaMs());
    var daftar = function (el, judul, arr, kelas) {
      el.className = 'ringkas-daftar ' + kelas;
      el.innerHTML = arr.length ? '<h3>' + judul + '</h3><div class="nomor">' + arr.map(function (i) { return '<button type="button" data-ke="' + i + '">' + (i + 1) + '</button>'; }).join('') + '</div>' : '';
    };
    daftar($('r-daftar-kosong'), '<svg class="ic ic-sm"><use href="#i-alert"/></svg>Soal belum dijawab (ketuk untuk membuka)', kosong, 'kosong');
    daftar($('r-daftar-ragu'), '<svg class="ic ic-sm"><use href="#i-info"/></svg>Soal ragu-ragu', ragu, 'ragu');
    $('konf-catatan').textContent = [kosong.length ? kosong.length + ' soal belum dijawab' : '', ragu.length ? ragu.length + ' soal ragu-ragu' : '']
      .filter(Boolean).join(' · ').replace(/^(.+)$/, 'Masih ada $1.');
    tutupLaci();
    bukaModal('modal-ringkasan');
  }

  // =========================================================================
  // Kunci & kumpulkan (F-07 jeda acak 0–90 detik, F-11, F-38)
  // =========================================================================
  var kumpulJalan = false, gagalKumpul = 0, timerKumpul = null;
  function kunci(otomatis) {
    if (!S || S.status !== 'mengerjakan') return;
    clearTimeout(timerSinkron); clearTimeout(timerTick); clearTimeout(timerKetik);
    var aktif = document.activeElement;
    if (aktif && (aktif.id === 'in-esai' || aktif.id === 'in-isian')) ubah(S.urutan[S.idx], aktif.value);
    S.status = 'terkunci';
    S.otomatis = !!otomatis;
    S.dikunci = otomatis ? Math.min(API.sekarang(), S.batas) : API.sekarang();
    var jeda = otomatis ? Math.random() * Number(S.aturan.jeda_kumpul || 90) * 1000 : 0;
    S.jedaTotal = jeda; S.jedaSampai = Date.now() + jeda;
    simpan();
    tutupSemuaModal();
    tampilKumpul();
    loopKumpul();
  }

  function tampilKumpul() {
    tampil('layar-kumpul');
    $('kumpul-ikon').className = 'kumpul-ikon';
    $('kumpul-ikon').innerHTML = '<svg class="ic ic-lg"><use href="#i-lock"/></svg>';
    $('kumpul-judul').textContent = 'Jawaban sudah dikunci';
    $('kumpul-teks').textContent = S.otomatis ? 'Waktu ujian habis. Perangkat Anda sedang mengamankan rekaman jawaban.' : 'Perangkat Anda sedang mengirim rekaman jawaban ke server.';
    $('kumpul-proses').hidden = false; $('kumpul-hasil').hidden = true;
    $('kumpul-info').hidden = !S.otomatis;
    $('kumpul-kaki').textContent = 'Peserta: ' + S.peserta.nama + ' (' + S.peserta.username + ') · Kelas ' + (S.peserta.rombel || '-');
  }

  function pillKumpul(kelas, isi) { var p = $('kumpul-pill'); p.className = 'pill ' + kelas; p.innerHTML = isi; }

  function loopKumpul() {
    clearTimeout(timerKumpul);
    if (!S || S.status !== 'terkunci' || kumpulJalan) return;
    var tunggu = S.jedaSampai - Date.now();
    if (tunggu > 0) {
      var p = S.jedaTotal ? (1 - tunggu / S.jedaTotal) : 1;
      $('kumpul-bar').style.width = Math.round(8 + p * 52) + '%';
      pillKumpul('pill-info', '<span class="putar"></span>Menunggu giliran kirim…');
      timerKumpul = setTimeout(loopKumpul, Math.min(tunggu, 1000));
      return;
    }
    kumpulJalan = true;
    $('kumpul-bar').style.width = '75%';
    pillKumpul('pill-info', '<span class="putar"></span>Mengirim…');
    var d = payload(); d.kunci = S.dikunci; d.oto = !!S.otomatis;
    API.panggil('kumpulkan', d, S.tiket, { timeout: 45000 }).then(function (r) {
      kumpulJalan = false;
      if (!S || S.status !== 'terkunci') return;
      if (r.ok) { selesai(r.data); return; }
      if (r.kode === 'PINDAH') { blokir(r.kode, r.pesan); return; }
      if (r.kode === 'TIKET') {
        pillKumpul('pill-danger', '<svg class="ic"><use href="#i-alert"/></svg>Sesi tidak sah. Jawaban aman di perangkat. Panggil pengawas.');
        timerKumpul = setTimeout(loopKumpul, 60000);
        return;
      }
      gagalKumpul++;
      pillKumpul('pill-warn', '<svg class="ic"><use href="#i-wifi-off"/></svg>Menunggu sinyal… mencoba lagi otomatis');
      timerKumpul = setTimeout(loopKumpul, API.jedaUlang(gagalKumpul));
    });
  }

  function selesai(d) {
    clearTimeout(timerSinkron); clearTimeout(timerTick); clearTimeout(timerKumpul);
    var pk = S.paket ? [kunciPaket(), kunciGambar()] : [];
    S.status = 'selesai';
    S.kode = d.kode_bukti || S.kode || '';
    S.terlambat = !!d.terlambat;
    S.olehPengawas = !!d.oleh_pengawas;
    S.waktuKumpul = d.waktu || API.sekarang();
    // F-38: soal dan jawaban dihapus dari perangkat setelah kode bukti diterima
    S.jawaban = {}; S.ragu = {}; S.urutan = null; S.uo = {}; S.tiket = '';
    simpan();
    pk.forEach(function (k) { IDB.del(k); });
    PAKET = null; GAMBAR = {};
    tampilSelesai();
  }

  function tampilSelesai() {
    tampil('layar-kumpul');
    $('kumpul-ikon').className = 'kumpul-ikon sukses';
    $('kumpul-ikon').innerHTML = '<svg class="ic ic-lg"><use href="#i-check-c"/></svg>';
    $('kumpul-judul').textContent = S.olehPengawas ? 'Jawaban dikumpulkan oleh pengawas' : 'Jawaban berhasil dikumpulkan';
    $('kumpul-teks').textContent = 'Terima kasih, ' + (S.peserta ? S.peserta.nama : '') + '. Server sudah menerima jawaban Anda.';
    $('kumpul-proses').hidden = true; $('kumpul-hasil').hidden = false;
    $('kode-bukti').textContent = S.kode || '------';
    $('kumpul-waktu').textContent = S.waktuKumpul ? 'Diterima server pukul ' + jamLokal(S.waktuKumpul) + ' · ' + (S.ujian ? [S.ujian.mapel, S.ujian.nama].filter(Boolean).join(' · ') : '') : '';
    $('kumpul-terlambat').hidden = !S.terlambat;
    $('kumpul-kaki').textContent = S.peserta ? 'Peserta: ' + S.peserta.nama + ' (' + S.peserta.username + ') · Kelas ' + (S.peserta.rombel || '-') : '';
  }

  function blokir(kode, pesan) {
    clearTimeout(timerSinkron); clearTimeout(timerTick); clearTimeout(timerKumpul);
    if (kode === 'PINDAH') {
      // Perangkat lain sudah mengambil alih: soal tidak boleh tertinggal di perangkat ini
      if (S && S.paket) { IDB.del(kunciPaket()); IDB.del(kunciGambar()); }
      S = { v: 1, status: 'blokir', blokir: { kode: kode, pesan: pesan }, peserta: S && S.peserta };
      simpan();
    } else if (S) {
      S.statusSebelum = S.status; S.status = 'perlu_login'; S.blokir = { kode: kode, pesan: pesan };
      simpan();
    }
    tampilBlokir(kode, pesan);
  }

  function tampilBlokir(kode, pesan) {
    tampil('layar-blokir');
    var pindah = kode === 'PINDAH';
    $('blokir-judul').textContent = pindah ? 'Login dipindahkan' : 'Perlu masuk ulang';
    $('blokir-teks').textContent = pindah ? (pesan || 'Login Anda sudah dipindahkan ke perangkat lain oleh pengawas.') :
      'Sesi ujian di perangkat ini berakhir. Jawaban Anda masih aman di perangkat. Tekan Masuk lagi, lalu isi token dari pengawas.';
    $('btn-keluar-blokir').innerHTML = pindah ? '<svg class="ic ic-sm"><use href="#i-logout"/></svg>Keluar dari perangkat ini' : 'Masuk lagi';
    $('btn-keluar-blokir').className = 'btn btn-block ' + (pindah ? 'btn-secondary' : 'btn-primary');
  }

  /** Setelah ujian selesai/diblokir: kembali ke beranda siswa, atau ke halaman masuk bila sesi akun sudah habis. */
  function keLogin() {
    if (muatAkun()) keBeranda(true);
    else keluarAkun('');
  }

  // =========================================================================
  // Pemasangan event
  // =========================================================================
  function pasang() {
    pasangToken();
    $('form-token').addEventListener('submit', prosesMasuk);
    $('btn-masuk').addEventListener('click', prosesMasuk);
    $('b-ujian').addEventListener('click', function (e) { var b = e.target.closest('[data-mulai]'); if (b) bukaToken(b.getAttribute('data-mulai')); });
    $('btn-perbarui').addEventListener('click', perbaruiBeranda);
    $('btn-keluar-akun').addEventListener('click', function () { keluarAkun(''); });
    $('btn-mulai').addEventListener('click', mulaiUjian);
    $('btn-bukan-saya').addEventListener('click', function () {
      if (!confirm('Keluar dari akun ini? Laporkan ke pengawas bahwa data tidak sesuai.')) return;
      clearInterval(timerKonf); hapusState(); S = null; keluarAkun('');
    });

    $('soal-jawab').addEventListener('click', klikJawaban);
    $('soal-jawab').addEventListener('change', ubahJodoh);
    $('soal-isi').addEventListener('click', klikJawaban);
    $('stim-isi').addEventListener('click', function (e) { var img = e.target.closest('img'); if (img && img.getAttribute('src')) perbesar(img); });
    $('btn-sebelum').addEventListener('click', function () { render(S.idx - 1); });
    $('btn-berikut').addEventListener('click', function () { if (S.idx >= S.urutan.length - 1) bukaRingkasan(); else render(S.idx + 1); });
    $('btn-ragu').addEventListener('click', toggleRagu);
    $('kisi').addEventListener('click', function (e) {
      var b = e.target.closest('.ubin');
      if (!b) return;
      render(Number(b.getAttribute('data-i')));
      if ($('u-panel').classList.contains('terbuka')) history.back();
    });
    document.querySelector('.ukuran').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) ubahSkala(Number(b.getAttribute('data-ukuran'))); });
    $('btn-daftar').addEventListener('click', bukaLaci);
    $('btn-tutup-laci').addEventListener('click', function () { history.back(); });
    $('u-tirai').addEventListener('click', function () { history.back(); });
    $('btn-lipat').addEventListener('click', function () {
      var s = $('u-stimulus'); s.classList.toggle('terlipat');
      var terlipat = s.classList.contains('terlipat');
      this.setAttribute('aria-expanded', String(!terlipat));
      this.querySelector('span').textContent = terlipat ? 'Buka' : 'Lipat';
    });
    $('btn-selesai').addEventListener('click', bukaRingkasan);
    $('btn-ke-konfirmasi').addEventListener('click', function () {
      tutupModal('modal-ringkasan'); $('cek-yakin').checked = false; $('btn-kumpulkan').disabled = true; bukaModal('modal-konfirmasi');
    });
    $('cek-yakin').addEventListener('change', function () { $('btn-kumpulkan').disabled = !this.checked; });
    $('btn-kumpulkan').addEventListener('click', function () { kunci(false); });
    $('r-daftar-kosong').addEventListener('click', lompatRingkasan);
    $('r-daftar-ragu').addEventListener('click', lompatRingkasan);
    document.querySelectorAll('[data-tutup]').forEach(function (b) { b.addEventListener('click', function () { b.closest('.lapis').hidden = true; }); });
    $('btn-keluar-selesai').addEventListener('click', function () { hapusState(); S = null; keLogin(); });
    $('btn-keluar-blokir').addEventListener('click', function () {
      if (S && S.status === 'perlu_login') { keLogin(); return; }   // jawaban di perangkat tetap disimpan
      hapusState(); S = null; keLogin();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { ['modal-gambar', 'modal-konfirmasi', 'modal-ringkasan', 'modal-token'].forEach(function (m) { if (!$(m).hidden) tutupModal(m); }); if ($('u-panel').classList.contains('terbuka')) history.back(); return; }
      if (!S || S.status !== 'mengerjakan' || $('layar-ujian').hidden) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || !$('modal-ringkasan').hidden || !$('modal-konfirmasi').hidden) return;
      if (e.key === 'ArrowRight' && S.idx < S.urutan.length - 1) render(S.idx + 1);
      if (e.key === 'ArrowLeft' && S.idx > 0) render(S.idx - 1);
    });

    // Tombol kembali Android: menutup laci/modal, tidak meninggalkan ujian
    window.addEventListener('popstate', function () {
      if (!S || (S.status !== 'mengerjakan' && S.status !== 'terkunci')) return;
      if ($('u-panel').classList.contains('terbuka')) { tutupLaci(); return; }
      var modal = ['modal-gambar', 'modal-konfirmasi', 'modal-ringkasan'].filter(function (m) { return !$(m).hidden; });
      history.pushState({ ujian: 1 }, '');
      if (modal.length) { tutupModal(modal[0]); return; }
      toast('Gunakan tombol di layar untuk berpindah soal.', '', 3000);
    });
    window.addEventListener('beforeunload', function (e) {
      if (S && (S.status === 'mengerjakan' || S.status === 'terkunci')) { simpan(); e.preventDefault(); e.returnValue = ''; }
    });

    // F-10: catat setiap kali siswa meninggalkan halaman ujian
    document.addEventListener('visibilitychange', function () {
      if (!S || S.status !== 'mengerjakan') return;
      if (document.visibilityState === 'hidden') { S.keluar++; S.seq++; S.keluarBaru = true; S.keluarT = Date.now(); simpan(); }
      else {
        tick();
        if (S.keluarBaru) { S.keluarBaru = false; simpan(); toast('Anda meninggalkan halaman ujian. Kejadian ini dicatat dan terlihat oleh pengawas.', 'warn', 6000); }
        if (S.sinkronBerikut && Date.now() > S.sinkronBerikut + 5000) jadwalSinkron(1000 + Math.random() * 4000);
      }
    });
    // Muat ulang/tutup halaman bukan "keluar halaman": batalkan catatan yang baru saja dibuat
    window.addEventListener('pagehide', function () {
      if (S && S.keluarBaru && Date.now() - (S.keluarT || 0) < 1500) { S.keluar = Math.max(0, S.keluar - 1); S.keluarBaru = false; simpan(); }
    });
    window.addEventListener('offline', function () {
      if (S && S.status === 'mengerjakan') { setStatus('tunggu'); toast('Sinyal terputus. Tetap kerjakan; jawaban tersimpan di perangkat dan dikirim otomatis saat sinyal kembali.', 'warn', 7000); }
    });
    window.addEventListener('online', function () {
      if (!S) return;
      if (S.status === 'mengerjakan' && gagalBeruntun) jadwalSinkron(1000 + Math.random() * 8000);
      if (S.status === 'terkunci' && !kumpulJalan) { gagalKumpul = 0; clearTimeout(timerKumpul); timerKumpul = setTimeout(loopKumpul, 500 + Math.random() * 3000); }
    });
  }

  function lompatRingkasan(e) {
    var b = e.target.closest('button[data-ke]');
    if (!b) return;
    tutupModal('modal-ringkasan');
    render(Number(b.getAttribute('data-ke')));
  }

  // =========================================================================
  // Mulai: pulihkan keadaan bila halaman dimuat ulang (F-08)
  // =========================================================================
  // Rilis baru: muat ulang otomatis hanya di beranda (bukan saat konfirmasi/ujian/pengumpulan)
  API.bolehMuatUlang = function () { return !$('layar-beranda').hidden && $('modal-token').hidden; };

  function mulai() {
    pasang();
    API.pasangPWA($('btn-pasang'));
    API.infoSekolah(terapkanInfo);
    var st = muat(), akun = muatAkun();
    // Perangkat bersama (lab): keadaan ujian milik siswa lain yang sudah selesai dibuang
    if (st && st.v === 1 && akun && akun.data && akun.data.peserta && st.peserta && st.peserta.username !== akun.data.peserta.username &&
        /^(selesai|perlu_login|blokir)$/.test(st.status)) { hapusState(); st = null; }
    if (!st || st.v !== 1) { keBeranda(false); return; }
    S = st;
    API.offset = S.offset || 0;
    if (S.status === 'selesai') {
      if (S.waktuKumpul && Date.now() - S.waktuKumpul > 12 * 3600e3) { hapusState(); S = null; keBeranda(false); return; }
      tampilSelesai(); return;
    }
    if (S.status === 'blokir') { tampilBlokir(S.blokir && S.blokir.kode, S.blokir && S.blokir.pesan); return; }
    if (S.status === 'perlu_login') { tampilBlokir('TIKET'); return; }
    if (S.tiketX && Date.now() > S.tiketX && S.status !== 'terkunci') { S.status = 'perlu_login'; simpan(); tampilBlokir('TIKET'); return; }
    if (S.status === 'konfirmasi') { tampilKonfirmasi(); return; }
    if (S.status === 'mengerjakan') {
      tampil('layar-ujian');
      muatPaket().then(mulaiUjian).catch(function () { /* sudah ditangani */ });
      return;
    }
    if (S.status === 'terkunci') { tampilKumpul(); loopKumpul(); return; }
    keBeranda(false);
  }

  mulai();
})();
