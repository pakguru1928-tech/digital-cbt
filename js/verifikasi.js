/* verifikasi.js — Alat verifikasi Tahap 1 (PRD 9.2): cek perangkat/server dan uji baca file soal. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.API ? API.esc : function (s) { return String(s); };
  var BERKAS = []; // { id, file, hasil, galat, nilai:{teks,gambar,pangkat,rumus,tabel}, catatan }
  var CEK = [];    // { id, judul, status, teks, rinci }
  var PUSTAKA = 'mammoth 1.13.0, JSZip 3.10.2, pdf.js 6.5.438, KaTeX 0.19.1, konverter OMML buatan sendiri';
  var JENIS_LABEL = { PG: 'Pilihan ganda', PGK: 'PG kompleks', BS: 'Benar–salah', JODOH: 'Menjodohkan', ISIAN: 'Isian singkat', ESAI: 'Uraian' };

  function toast(pesan, jenis) {
    var el = document.createElement('div');
    el.className = 'toast ' + (jenis || '');
    el.textContent = pesan;
    $('toast-wadah').appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }
  function angka(n) { return Number(n || 0).toLocaleString('id-ID'); }
  function ukuran(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB'; }
  function detik(ms) { return (ms / 1000).toFixed(1).replace('.', ',') + ' dtk'; }

  // =========================================================================
  // 1. Cek perangkat & server
  // =========================================================================
  function setCek(id, status, teks, rinci) {
    var c = CEK.filter(function (x) { return x.id === id; })[0];
    c.status = status; c.teks = teks; c.rinci = rinci || '';
    var li = document.querySelector('[data-cek="' + id + '"]');
    if (li) li.innerHTML = htmlCek(c);
  }
  function htmlCek(c) {
    var pill = { ok: '<span class="pill pill-ok">Baik</span>', warn: '<span class="pill pill-warn">Perhatikan</span>', danger: '<span class="pill pill-danger">Gagal</span>', idle: '<span class="pill pill-idle">Dilewati</span>', putar: '' }[c.status] || '';
    return '<span class="titik ' + c.status + '"></span><div><b>' + esc(c.judul) + '</b><small>' + esc(c.teks) + (c.rinci ? ' · ' + esc(c.rinci) : '') + '</small></div>' + pill;
  }
  function daftarCek() {
    CEK = [
      { id: 'perangkat', judul: 'Perangkat & browser' },
      { id: 'modul', judul: 'Pembaca PDF (modul JavaScript)' },
      { id: 'ls', judul: 'Penyimpanan jawaban (localStorage)' },
      { id: 'idb', judul: 'Penyimpanan paket & gambar (IndexedDB)' },
      { id: 'kuota', judul: 'Ruang penyimpanan browser' },
      { id: 'pwa', judul: 'Pasang aplikasi (PWA)' },
      { id: 'server', judul: 'Server Apps Script (akses "Anyone")' },
      { id: 'jam', judul: 'Jam perangkat dibanding server' }
    ];
    CEK.forEach(function (c) { c.status = 'putar'; c.teks = 'Memeriksa…'; });
    $('cek-daftar').innerHTML = CEK.map(function (c) { return '<li data-cek="' + c.id + '">' + htmlCek(c) + '</li>'; }).join('');
  }

  function namaBrowser() {
    var u = navigator.userAgent, m;
    if ((m = u.match(/Edg\/(\d+)/))) return 'Edge ' + m[1];
    if ((m = u.match(/SamsungBrowser\/(\d+)/))) return 'Samsung Internet ' + m[1];
    if ((m = u.match(/OPR\/(\d+)/))) return 'Opera ' + m[1];
    if ((m = u.match(/Firefox\/(\d+)/))) return 'Firefox ' + m[1];
    if ((m = u.match(/Chrome\/(\d+)/))) return 'Chrome ' + m[1];
    if ((m = u.match(/Version\/(\d+).*Safari/))) return 'Safari ' + m[1];
    return 'Browser lain';
  }
  function namaPerangkat() {
    var u = navigator.userAgent, m;
    if ((m = u.match(/Android [\d.]+; ([^;)]+?)(?: Build|\))/))) return 'Android · ' + m[1].trim();
    if (/Android/.test(u)) return 'Android';
    if (/iPhone|iPad/.test(u)) return 'iOS';
    if (/Windows/.test(u)) return 'Windows';
    if (/Mac OS X/.test(u)) return 'macOS';
    if (/CrOS/.test(u)) return 'ChromeOS';
    if (/Linux/.test(u)) return 'Linux';
    return 'Tidak dikenal';
  }

  function jalankanCek() {
    daftarCek();
    setCek('perangkat', 'ok', namaPerangkat() + ' · ' + namaBrowser(), 'layar ' + screen.width + '×' + screen.height + ', rasio ' + (window.devicePixelRatio || 1));

    // Modul ES (pdf.js butuh import dinamis)
    try {
      new Function('return import("data:text/javascript,export default 1")')().then(function () {
        setCek('modul', 'ok', 'Didukung');
      }, function () { setCek('modul', 'danger', 'Tidak didukung. PDF tidak bisa dibaca di browser ini; Word tetap bisa.'); });
    } catch (e) { setCek('modul', 'danger', 'Tidak didukung. Perbarui browser.'); }

    // localStorage: 200 KB tulis-baca
    try {
      var t0 = performance.now(), isi = new Array(200 * 1024 + 1).join('x');
      localStorage.setItem('cbt_uji_ls', isi);
      var ok = (localStorage.getItem('cbt_uji_ls') || '').length === isi.length;
      localStorage.removeItem('cbt_uji_ls');
      setCek('ls', ok ? 'ok' : 'danger', ok ? 'Tulis-baca 200 KB berhasil' : 'Data terbaca tidak sama', Math.round(performance.now() - t0) + ' ms');
    } catch (e) {
      setCek('ls', 'danger', 'Tidak bisa dipakai (' + (e.name || 'galat') + '). Jangan pakai mode Samaran untuk ujian.');
    }

    // IndexedDB: 2 MB tulis-baca
    ujiIdb().then(function (r) { setCek('idb', 'ok', 'Tulis-baca 2 MB berhasil', r + ' ms'); },
      function (e) { setCek('idb', 'danger', 'Tidak bisa dipakai: ' + e + '. Paket soal tidak bisa disimpan; mode Samaran sering menjadi penyebabnya.'); });

    // Kuota
    if (navigator.storage && navigator.storage.estimate) {
      Promise.all([navigator.storage.estimate(), navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null)]).then(function (r) {
        var q = r[0].quota || 0, u = r[0].usage || 0;
        var teks = 'Tersedia ' + ukuran(q - u) + ' dari ' + ukuran(q);
        setCek('kuota', q - u < 50 * 1048576 ? 'warn' : 'ok', teks, r[1] === true ? 'penyimpanan permanen aktif' : 'penyimpanan biasa');
      }, function () { setCek('kuota', 'warn', 'Browser tidak memberi angka kuota'); });
    } else setCek('kuota', 'warn', 'Browser tidak memberi angka kuota');

    // PWA
    var sw = 'serviceWorker' in navigator;
    var terpasang = window.matchMedia && matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    setCek('pwa', sw ? 'ok' : 'warn', sw ? (terpasang ? 'Berjalan sebagai aplikasi terpasang' : 'Didukung; bisa dipasang dari menu browser') : 'Service worker tidak didukung: halaman tidak bisa dimuat ulang tanpa sinyal');

    // Server
    if (!window.API || !API.siap()) {
      setCek('server', 'idle', 'Alamat server belum diisi di js/config.js');
      setCek('jam', 'idle', 'Butuh server');
      return;
    }
    var t1 = performance.now();
    API.panggil('ping', {}, '', { timeout: 20000 }).then(function (r1) {
      var ms1 = Math.round(performance.now() - t1);
      if (!r1.ok) { setCek('server', 'danger', r1.pesan || 'Tidak bisa terhubung', 'kode ' + (r1.kode || '?')); setCek('jam', 'idle', 'Butuh server'); return; }
      var t2 = performance.now();
      return API.panggil('ping', {}, '', { timeout: 20000 }).then(function (r2) {
        var ms2 = Math.round(performance.now() - t2);
        var d = r1.data || {};
        var st = !d.siap ? 'warn' : ms2 > 4000 ? 'warn' : 'ok';
        setCek('server', st, (d.siap ? 'Terhubung tanpa login' : 'Terhubung, tetapi pasangAplikasi belum dijalankan') + ' · versi ' + (d.versi || r1.v || '?'),
          'panggilan pertama ' + angka(ms1) + ' ms, kedua ' + angka(ms2) + ' ms' + (d.mode_ujian ? ' · mode ujian aktif' : ''));
        var sel = Math.round(Math.abs(API.offset) / 1000);
        setCek('jam', sel > 120 ? 'warn' : 'ok', sel <= 2 ? 'Sesuai' : 'Selisih ' + sel + ' detik', sel > 120 ? 'tidak masalah untuk timer (memakai jam server), tetapi betulkan jam HP' : 'timer ujian memakai jam server');
      });
    });
  }

  function ujiIdb() {
    return new Promise(function (ok, gagal) {
      if (!window.indexedDB) { gagal('tidak tersedia'); return; }
      var t0 = performance.now(), nama = 'digital-cbt-uji', req;
      try { req = indexedDB.open(nama, 1); } catch (e) { gagal(e.name || 'galat'); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore('x'); };
      req.onerror = function () { gagal((req.error && req.error.name) || 'galat'); };
      req.onsuccess = function () {
        var db = req.result, isi = new Array(2 * 1024 * 1024 + 1).join('y');
        var tx = db.transaction('x', 'readwrite');
        tx.objectStore('x').put(isi, 'k');
        tx.oncomplete = function () {
          var g = db.transaction('x').objectStore('x').get('k');
          g.onsuccess = function () {
            var sama = g.result && g.result.length === isi.length;
            db.close();
            indexedDB.deleteDatabase(nama);
            sama ? ok(Math.round(performance.now() - t0)) : gagal('data terbaca tidak sama');
          };
          g.onerror = function () { db.close(); gagal('gagal membaca'); };
        };
        tx.onerror = tx.onabort = function () { db.close(); gagal((tx.error && tx.error.name) || 'gagal menulis'); };
      };
    });
  }

  // =========================================================================
  // 2. File soal
  // =========================================================================
  var BUTIR = [
    { k: 'teks', judul: 'Teks soal & opsi', ket: 'Kata, urutan, dan nomor sama dengan file asli' },
    { k: 'gambar', judul: 'Gambar', ket: 'Muncul di soal yang benar, tidak terpotong' },
    { k: 'pangkat', judul: 'Pangkat & indeks', ket: 'Contoh: m², H₂O, 10⁻³' },
    { k: 'rumus', judul: 'Rumus', ket: 'Pecahan, akar, simbol tampil benar' },
    { k: 'tabel', judul: 'Tabel', ket: 'Baris dan kolom utuh' }
  ];

  function jumlahButir(b, k) {
    var s = b.hasil.statistik;
    switch (k) {
      case 'teks': return b.hasil.soal.length;
      case 'gambar': return s.gambar;
      case 'pangkat': return s.pangkat + s.indeks;
      case 'rumus': return s.rumusWord + s.rumusLatex + s.rumusLama + s.rumusPdf;
      case 'tabel': return b.hasil.jenisFile === 'pdf' ? s.kemungkinanTabel : s.tabel;
    }
    return 0;
  }
  function otomatisButir(b, k) {
    var s = b.hasil.statistik, n = jumlahButir(b, k);
    switch (k) {
      case 'teks': {
        var bermasalah = b.hasil.soal.filter(function (x) { return x.masalah.length; }).length;
        return n ? angka(n) + ' soal terbaca' + (bermasalah ? ', ' + bermasalah + ' perlu dicek' : '') : 'Tidak ada soal yang dikenali';
      }
      case 'gambar': return n ? angka(n) + ' gambar' + (s.gambarMengambang ? ' (' + s.gambarMengambang + ' mengambang)' : '') + (s.gambarTakTampil ? ', ' + s.gambarTakTampil + ' tidak tampil' : '') + (s.ukuranGambarAsli ? ' · ' + ukuran(s.ukuranGambarAsli) + ' → ' + ukuran(s.ukuranGambar) : '') : 'Tidak ditemukan';
      case 'pangkat': return n ? angka(s.pangkat) + ' pangkat, ' + angka(s.indeks) + ' indeks' : 'Tidak ditemukan';
      case 'rumus': {
        if (!n) return 'Tidak ditemukan';
        var p = [];
        if (s.rumusWord) p.push(angka(s.rumusWord) + ' Equation');
        if (s.rumusLatex) p.push(angka(s.rumusLatex) + ' $…$');
        if (s.rumusGagal) p.push(angka(s.rumusGagal) + ' gagal tampil');
        if (s.rumusLama) p.push(angka(s.rumusLama) + ' objek lama tak terbaca');
        if (s.rumusPdf) p.push(angka(s.rumusPdf) + ' baris rumus di PDF');
        return p.join(', ');
      }
      case 'tabel': return n ? (b.hasil.jenisFile === 'pdf' ? angka(n) + ' tabel disusun ulang dari PDF' : angka(n) + ' tabel') : 'Tidak ditemukan';
    }
    return '';
  }
  function statusOtomatis(b, k) {
    var s = b.hasil.statistik;
    if (k === 'teks') return b.hasil.soal.length ? 'ok' : 'danger';
    if (k === 'gambar') return s.gambarTakTampil ? 'danger' : 'ok';
    if (k === 'rumus') return s.rumusGagal || s.rumusLama ? 'danger' : s.rumusPdf ? 'warn' : 'ok';
    if (k === 'tabel') return b.hasil.jenisFile === 'pdf' && s.kemungkinanTabel ? 'warn' : 'ok';
    return 'ok';
  }

  function vonis(b) {
    if (b.galat) return { kelas: 'pill-danger', teks: 'Gagal dibaca', kode: 'gagal' };
    var v = b.nilai;
    if (BUTIR.some(function (x) { return !v[x.k]; })) return { kelas: 'pill-idle', teks: 'Belum dicek', kode: 'belum' };
    if (['teks', 'gambar', 'pangkat'].some(function (k) { return v[k] === 'tidak'; })) return { kelas: 'pill-danger', teks: 'Tidak lolos', kode: 'tidak' };
    if (v.rumus === 'tidak' || v.tabel === 'tidak') return { kelas: 'pill-warn', teks: 'Lolos dengan Potong soal', kode: 'potong' };
    return { kelas: 'pill-ok', teks: 'Lolos', kode: 'lolos' };
  }

  function tambahFile(files) {
    var baru = Array.prototype.slice.call(files).filter(function (f) { return /\.(docx|pdf|doc)$/i.test(f.name); });
    if (!baru.length) { toast('Pilih file .docx atau .pdf.', 'warn'); return; }
    var antre = Promise.resolve();
    baru.forEach(function (f) {
      var b = { id: 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), file: f, hasil: null, galat: null, nilai: {}, catatan: '', progres: 'Menunggu…' };
      BERKAS.push(b);
      $('daftar-berkas').insertAdjacentHTML('beforeend', '<article class="berkas" id="' + b.id + '"></article>');
      gambarBerkas(b);
      antre = antre.then(function () {
        b.progres = 'Membaca…'; gambarBerkas(b);
        return CBTImpor.baca(f, { onProgres: function (t) { b.progres = t; var el = document.querySelector('#' + b.id + ' .progres'); if (el) el.textContent = t; } })
          .then(function (h) {
            b.hasil = h;
            BUTIR.forEach(function (x) { if (!jumlahButir(b, x.k) && x.k !== 'teks') b.nilai[x.k] = 'na'; });
          }, function (e) { b.galat = (e && e.message) || String(e); })
          .then(function () { gambarBerkas(b); perbaruiBawah(); });
      });
    });
    perbaruiBawah();
  }

  function gambarBerkas(b) {
    var el = $(b.id);
    if (!el) return;
    var f = b.file, jenis = /\.pdf$/i.test(f.name) ? 'PDF' : 'Word';
    var kepala = '<div class="berkas-kepala"><div><h3>' + esc(f.name) + '</h3><span class="muted">' + jenis + ' · ' + ukuran(f.size) +
      (b.hasil ? ' · dibaca ' + detik(b.hasil.waktuMs) + (b.hasil.statistik.halaman ? ' · ' + b.hasil.statistik.halaman + ' halaman' : '') : '') + '</span></div>';
    if (!b.hasil && !b.galat) {
      el.innerHTML = kepala + '<div class="kanan"><span class="titik putar"></span><span class="muted progres">' + esc(b.progres) + '</span></div></div>';
      return;
    }
    var v = vonis(b);
    kepala += '<div class="kanan"><span class="pill ' + v.kelas + '" data-vonis>' + v.teks + '</span><button class="btn btn-ghost btn-sm" data-hapus type="button" aria-label="Hapus file ini">Hapus</button></div></div>';
    if (b.galat) {
      el.innerHTML = kepala + '<div class="berkas-isi"><div class="alert alert-danger">' + esc(b.galat) + '</div></div>';
      return;
    }
    var h = b.hasil, s = h.statistik;
    var perJenis = {};
    h.soal.forEach(function (x) { perJenis[x.jenis] = (perJenis[x.jenis] || 0) + 1; });
    var bermasalah = h.soal.filter(function (x) { return x.masalah.length; });
    var stat = [
      ['Soal', s.soal, ''],
      ['Stimulus', Object.keys(h.stimulus).length, ''],
      ['Gambar', s.gambar, s.gambarTakTampil ? 'buruk' : ''],
      ['Pangkat/indeks', s.pangkat + s.indeks, ''],
      ['Rumus', s.rumusWord + s.rumusLatex, s.rumusGagal ? 'buruk' : ''],
      ['Rumus gagal/lama', s.rumusGagal + s.rumusLama, s.rumusGagal + s.rumusLama ? 'buruk' : ''],
      ['Tabel', h.jenisFile === 'pdf' ? s.kemungkinanTabel : s.tabel, h.jenisFile === 'pdf' && s.kemungkinanTabel ? 'awas' : ''],
      ['Soal perlu dicek', bermasalah.length, bermasalah.length ? 'awas' : '']
    ].map(function (x) { return '<div class="stat ' + x[2] + '"><b>' + angka(x[1]) + '</b><span>' + x[0] + '</span></div>'; }).join('');
    var jenisTeks = Object.keys(perJenis).map(function (k) { return k + ' ' + perJenis[k]; }).join(' · ');
    var peringatan = h.peringatan.map(function (p) { return '<div class="alert alert-warn">' + esc(p) + '</div>'; }).join('');
    var catatan = (h.catatan || []).length ? '<div class="muted" style="font-size:13px">' + h.catatan.map(esc).join(' · ') + '</div>' : '';
    var baris = BUTIR.map(function (x) {
      var n = jumlahButir(b, x.k), st = statusOtomatis(b, x.k), nilai = b.nilai[x.k] || '';
      var nama = b.id + '-' + x.k;
      var opsi = [['ya', 'Ya', 'ya'], ['tidak', 'Tidak', 'tidak'], ['na', 'Tidak ada', 'na']].map(function (o) {
        return '<label><input type="radio" name="' + nama + '" value="' + o[0] + '"' + (nilai === o[0] ? ' checked' : '') + ' data-butir="' + x.k + '"><span class="' + o[2] + '">' + o[1] + '</span></label>';
      }).join('');
      return '<tr><td><b>' + x.judul + '</b><small>' + x.ket + '</small></td><td><span class="titik ' + st + '" style="display:inline-block;vertical-align:-1px;margin:0 6px 0 0"></span>' + esc(otomatisButir(b, x.k)) + '</td><td><div class="pilih" role="radiogroup" aria-label="' + x.judul + ' sesuai?">' + opsi + '</div></td></tr>';
    }).join('');
    var chip = h.soal.map(function (x, i) {
      return '<a href="#' + b.id + '-s' + i + '" data-loncat="' + i + '" class="pill ' + (x.masalah.length ? 'pill-warn' : 'pill-idle') + '" title="' + esc(x.masalah.join(' ')) + '">' + x.no + '</a>';
    }).join('');
    var halamanPdf = h.jenisFile === 'pdf' ? '<div><button class="btn btn-secondary btn-sm" type="button" data-halaman>Lihat halaman 1 (uji render untuk Potong soal)</button><div data-wadah-halaman style="margin-top:10px"></div></div>' : '';
    el.innerHTML = kepala + '<div class="berkas-isi">' +
      '<div class="statistik">' + stat + '</div>' +
      (jenisTeks ? '<div class="muted" style="font-size:14px">Jenis: ' + esc(jenisTeks) + '</div>' : '') +
      peringatan + catatan +
      '<table class="gerbang"><thead><tr><th>Butir</th><th>Hasil otomatis</th><th>Sesuai dengan file asli?</th></tr></thead><tbody>' + baris + '</tbody></table>' +
      '<label class="field" style="margin:0"><span style="font-size:14px;font-weight:600">Catatan (bila ada yang salah, tulis nomor soalnya)</span><textarea class="catatan" data-catatan rows="2">' + esc(b.catatan) + '</textarea></label>' +
      (chip ? '<div><div class="muted" style="font-size:13px;margin-bottom:6px">Loncat ke soal (kuning = perlu dicek):</div><div class="ringkas-soal">' + chip + '</div></div>' : '') +
      halamanPdf +
      '<details class="pratinjau"><summary>Pratinjau soal seperti di ruang ujian</summary><div data-pratinjau></div></details>' +
      '</div>';
  }

  // --- Pratinjau soal (dirender saat dibuka saja) ---
  function htmlSoal(b, x, i, stimulusTampil) {
    var h = b.hasil, out = '';
    var kunci = x.kunciData;
    if (x.stimulus && !stimulusTampil[x.stimulus]) {
      var st = h.stimulus[x.stimulus];
      stimulusTampil[x.stimulus] = true;
      out += '<div class="stimulus-pv"><small>Stimulus untuk soal ' + st.dari + '–' + st.sampai + '</small><div class="isi-soal">' + st.html + '</div></div>';
    }
    out += '<div class="isi-soal">' + (x.isi || '') + '</div>';
    if (x.jenis === 'PG' || x.jenis === 'PGK') {
      out += '<ul class="opsi-pv">' + x.opsi.map(function (o) {
        var benar = x.jenis === 'PG' ? kunci === o.huruf : Array.isArray(kunci) && kunci.indexOf(o.huruf) > -1;
        return '<li class="' + (benar ? 'kunci' : '') + '"><b>' + o.huruf + '</b><div class="isi-soal">' + o.html + '</div></li>';
      }).join('') + '</ul>';
    } else if (x.jenis === 'BS') {
      out += '<table class="item-pv">' + x.item.map(function (it, j) {
        var k = Array.isArray(kunci) ? kunci[j] : '';
        return '<tr><td>(' + it.no + ')</td><td class="isi-soal">' + it.html + '</td><td class="k">' + (k === 'B' ? '<span class="pill pill-ok">Benar</span>' : k === 'S' ? '<span class="pill pill-danger">Salah</span>' : '<span class="pill pill-idle">?</span>') + '</td></tr>';
      }).join('') + '</table>';
    } else if (x.jenis === 'JODOH') {
      out += '<table class="item-pv">' + x.item.map(function (it) {
        var k = kunci && kunci[it.no];
        return '<tr><td>(' + it.no + ')</td><td class="isi-soal">' + it.html + '</td><td class="k">' + (k ? '<span class="pill pill-ok">→ ' + k + '</span>' : '<span class="pill pill-idle">?</span>') + '</td></tr>';
      }).join('') + '</table>';
      out += '<ul class="opsi-pv">' + x.opsi.map(function (o) { return '<li><b>' + o.huruf + '</b><div class="isi-soal">' + o.html + '</div></li>'; }).join('') + '</ul>';
    } else if (x.jenis === 'ISIAN') {
      out += '<div class="kunci-pv">Jawaban diterima: ' + (Array.isArray(kunci) && kunci.length ? kunci.map(function (k) { return '<code>' + esc(k) + '</code>'; }).join(' ') : '<i>belum ada</i>') + '</div>';
    } else if (x.jenis === 'ESAI') {
      out += '<div class="kunci-pv">' + (kunci && kunci.acuan ? 'Jawaban acuan: ' + esc(kunci.acuan) + '<br>' : '') +
        'Rubrik: ' + ((x.rubrik || []).length ? x.rubrik.map(function (r) { return esc(r.kriteria) + ' <code>' + (r.skor == null ? '?' : r.skor) + '</code>'; }).join(' · ') : '<i>belum ada</i>') +
        (x.skor_maks ? ' · skor maks <code>' + x.skor_maks + '</code>' : '') + '</div>';
    }
    if (x.masalah.length) out += '<ul class="masalah-pv">' + x.masalah.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    if (x.info.length) out += '<ul class="info-pv">' + x.info.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    var kepala = '<header><b>Soal ' + x.no + '</b><span class="pill pill-info">' + (JENIS_LABEL[x.jenis] || x.jenis) + (x.jenisDitebak && x.jenis !== 'PG' ? ' (ditebak)' : '') + '</span>' +
      (x.bobot !== 1 ? '<span>bobot ' + x.bobot + '</span>' : '') + (x.jenis === 'PG' && kunci ? '<span>kunci ' + kunci + '</span>' : '') + '</header>';
    return '<article class="soal-pv' + (x.masalah.length ? ' bermasalah' : '') + '" id="' + b.id + '-s' + i + '">' + kepala + out + '</article>';
  }

  function isiPratinjau(b, el) {
    var wadah = el.querySelector('[data-pratinjau]');
    if (!wadah || wadah.dataset.siap) return;
    var stim = {};
    wadah.innerHTML = b.hasil.soal.length ? b.hasil.soal.map(function (x, i) { return htmlSoal(b, x, i, stim); }).join('') : '<p class="muted">Tidak ada soal.</p>';
    wadah.dataset.siap = '1';
  }

  // --- Laporan ---
  function laporan() {
    var tgl = new Date();
    var baris = [];
    baris.push('LAPORAN VERIFIKASI IMPOR · Digital CBT Tahap 1');
    baris.push('Tanggal: ' + tgl.toLocaleString('id-ID'));
    baris.push('Perangkat: ' + namaPerangkat() + ' · ' + namaBrowser());
    baris.push('Pustaka: ' + PUSTAKA);
    baris.push('');
    baris.push('CEK PERANGKAT & SERVER');
    CEK.forEach(function (c) {
      var st = { ok: 'Baik', warn: 'Perhatikan', danger: 'GAGAL', idle: 'Dilewati', putar: 'Belum selesai' }[c.status] || '?';
      baris.push('- ' + c.judul + ': ' + st + ' · ' + c.teks + (c.rinci ? ' (' + c.rinci + ')' : ''));
    });
    baris.push('');
    var hitung = { lolos: 0, potong: 0, tidak: 0, belum: 0, gagal: 0 };
    baris.push('FILE SOAL (' + BERKAS.length + ')');
    BERKAS.forEach(function (b, i) {
      var v = vonis(b); hitung[v.kode]++;
      baris.push('');
      baris.push((i + 1) + '. ' + b.file.name + ' · ' + v.teks.toUpperCase());
      if (b.galat) { baris.push('   Galat: ' + b.galat); return; }
      if (!b.hasil) { baris.push('   Masih dibaca'); return; }
      var h = b.hasil, s = h.statistik, pj = {};
      h.soal.forEach(function (x) { pj[x.jenis] = (pj[x.jenis] || 0) + 1; });
      baris.push('   ' + (h.jenisFile === 'pdf' ? 'PDF ' + s.halaman + ' hlm' + (s.halamanScan ? ' (' + s.halamanScan + ' hasil scan)' : '') : 'Word') + ' · ' + ukuran(b.file.size) + ' · dibaca ' + detik(h.waktuMs) +
        ' · ' + s.soal + ' soal (' + Object.keys(pj).map(function (k) { return k + ' ' + pj[k]; }).join(', ') + ')');
      BUTIR.forEach(function (x) {
        var n = b.nilai[x.k];
        baris.push('   ' + x.judul + ': ' + ({ ya: 'Sesuai', tidak: 'TIDAK SESUAI', na: 'Tidak ada' }[n] || 'belum dicek') + ' · ' + otomatisButir(b, x.k));
      });
      (h.catatan || []).forEach(function (c) { baris.push('   · ' + c); });
      if (b.catatan.trim()) baris.push('   Catatan guru: ' + b.catatan.trim().replace(/\s*\n\s*/g, ' / '));
      h.peringatan.forEach(function (p) { baris.push('   ! ' + p); });
      var bm = h.soal.filter(function (x) { return x.masalah.length; });
      bm.slice(0, 12).forEach(function (x) { baris.push('   - Soal ' + x.no + ': ' + x.masalah.join(' ')); });
      if (bm.length > 12) baris.push('   - … dan ' + (bm.length - 12) + ' soal lain');
      if (h.gagalRumus && h.gagalRumus.length) baris.push('   Rumus gagal (LaTeX): ' + h.gagalRumus.slice(0, 5).join('  |  '));
    });
    baris.push('');
    baris.push('RINGKASAN GERBANG: ' + hitung.lolos + ' lolos, ' + hitung.potong + ' lolos dengan Potong soal, ' + hitung.tidak + ' tidak lolos, ' + hitung.belum + ' belum dicek, ' + hitung.gagal + ' gagal dibaca. Target: 10 file soal nyata.');
    return baris.join('\n');
  }

  function perbaruiBawah() {
    var n = BERKAS.length;
    $('btn-salin').disabled = $('btn-unduh').disabled = !n;
    if (!n) { $('ringkasan-bawah').textContent = 'Belum ada file.'; return; }
    var lolos = BERKAS.filter(function (b) { var k = vonis(b).kode; return k === 'lolos' || k === 'potong'; }).length;
    var belum = BERKAS.filter(function (b) { return vonis(b).kode === 'belum'; }).length;
    $('ringkasan-bawah').innerHTML = '<b>' + n + '</b> file · <b>' + lolos + '</b> lolos' + (belum ? ' · ' + belum + ' belum dicek' : '') + ' · target 10 file';
  }

  function salin(teks) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(teks);
    return new Promise(function (ok, gagal) {
      var ta = document.createElement('textarea');
      ta.value = teks; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? ok() : gagal(); } catch (e) { gagal(e); }
      ta.remove();
    });
  }

  // =========================================================================
  // Peristiwa
  // =========================================================================
  function pasang() {
    var zona = $('zona'), input = $('input-file');
    input.addEventListener('change', function () { tambahFile(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach(function (n) { zona.addEventListener(n, function (e) { e.preventDefault(); zona.classList.add('seret'); }); });
    ['dragleave', 'drop'].forEach(function (n) { zona.addEventListener(n, function (e) { e.preventDefault(); zona.classList.remove('seret'); }); });
    zona.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files) tambahFile(e.dataTransfer.files); });
    $('btn-cek').addEventListener('click', jalankanCek);

    var daftar = $('daftar-berkas');
    daftar.addEventListener('change', function (e) {
      var t = e.target, art = t.closest('.berkas'), b = art && BERKAS.filter(function (x) { return x.id === art.id; })[0];
      if (!b) return;
      if (t.dataset.butir) {
        b.nilai[t.dataset.butir] = t.value;
        var v = vonis(b), p = art.querySelector('[data-vonis]');
        if (p) { p.className = 'pill ' + v.kelas; p.textContent = v.teks; }
        perbaruiBawah();
      }
    });
    daftar.addEventListener('input', function (e) {
      if (!e.target.dataset.hasOwnProperty('catatan')) return;
      var art = e.target.closest('.berkas'), b = BERKAS.filter(function (x) { return x.id === art.id; })[0];
      if (b) b.catatan = e.target.value;
    });
    daftar.addEventListener('toggle', function (e) {
      if (e.target.matches && e.target.matches('details.pratinjau') && e.target.open) {
        var art = e.target.closest('.berkas'), b = BERKAS.filter(function (x) { return x.id === art.id; })[0];
        if (b) isiPratinjau(b, art);
      }
    }, true);
    daftar.addEventListener('click', function (e) {
      var t = e.target.closest('button, a'), art = e.target.closest('.berkas');
      if (!t || !art) return;
      var b = BERKAS.filter(function (x) { return x.id === art.id; })[0];
      if (!b) return;
      if (t.hasAttribute('data-hapus')) {
        BERKAS.splice(BERKAS.indexOf(b), 1); art.remove(); perbaruiBawah();
      } else if (t.hasAttribute('data-loncat')) {
        e.preventDefault();
        var d = art.querySelector('details.pratinjau');
        d.open = true; isiPratinjau(b, art);
        var s = document.getElementById(b.id + '-s' + t.dataset.loncat);
        if (s) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (t.hasAttribute('data-halaman')) {
        t.disabled = true; t.textContent = 'Merender…';
        var w = art.querySelector('[data-wadah-halaman]');
        CBTImpor.renderHalamanPdf(b.file, 1, Math.min(1000, w.clientWidth * (window.devicePixelRatio || 1))).then(function (r) {
          r.canvas.className = 'halaman-pdf'; r.canvas.style.width = '100%';
          w.innerHTML = ''; w.appendChild(r.canvas);
          w.insertAdjacentHTML('beforeend', '<div class="muted" style="font-size:13px;margin-top:6px">Dirender dalam ' + angka(r.ms) + ' ms. Halaman ini yang nanti dipakai untuk Potong soal.</div>');
          t.remove();
        }, function (er) { t.disabled = false; t.textContent = 'Coba lagi'; w.innerHTML = '<div class="alert alert-danger">' + esc(er.message || er) + '</div>'; });
      }
    });

    $('btn-salin').addEventListener('click', function () {
      salin(laporan()).then(function () { toast('Laporan disalin. Tempel ke chat.', 'ok'); }, function () { toast('Tidak bisa menyalin otomatis. Gunakan Unduh laporan.', 'warn'); });
    });
    $('btn-unduh').addEventListener('click', function () {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([laporan()], { type: 'text/plain;charset=utf-8' }));
      a.download = 'laporan-verifikasi-impor-' + new Date().toISOString().slice(0, 10) + '.txt';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
    window.addEventListener('beforeunload', function (e) {
      if (BERKAS.some(function (b) { return Object.keys(b.nilai).length; })) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  pasang();
  jalankanCek();
  // Siapkan KaTeX lebih awal agar file pertama terbaca cepat
  if (window.CBTImpor) CBTImpor.muatKatex();
  window.__VERIFIKASI = { berkas: BERKAS, laporan: laporan, cek: function () { return CEK; } };
})();
