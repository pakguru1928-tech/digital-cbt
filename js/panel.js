/* panel.js — Panel staf SPA (PRD F-41, 7.4; skill gas-scale-turbo bagian 4).
 * - Pindah menu tidak memanggil server (< 200 ms).
 * - Satu panggilan bootstrap per peran; data tampil dulu dari perangkat, lalu disegarkan diam-diam.
 * - Optimistic UI: tindakan pengawas langsung terlihat, dibatalkan otomatis bila server menolak.
 * - Polling 30 detik hanya saat tab terlihat; melambat ke 60 detik saat tidak ada interaksi.
 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = API.esc;
  var KUNCI = 'cbt_staf_v1';
  var LABEL_PERAN = { admin: 'Admin', guru: 'Guru', kepsek: 'Kepala sekolah' };
  // Menu per peran (PRD 8.4). Item dengan p (pendek) dipakai di menu bawah HP; empat pertama tampil, sisanya di "Lainnya".
  var MENU = {
    admin: [{ r: 'beranda', l: 'Beranda', i: 'home' }, { r: 'kesiapan', l: 'Cek Kesiapan', p: 'Kesiapan', i: 'shield' },
      { r: 'jadwal', l: 'Jadwal Ujian', p: 'Jadwal', i: 'calendar' }, { r: 'peserta', l: 'Peserta', i: 'users' },
      { r: 'staf', l: 'Guru & Data Sekolah', p: 'Guru', i: 'user' }, { r: 'cetak', l: 'Cetak Dokumen', p: 'Cetak', i: 'printer' },
      { r: 'pantau', l: 'Pemantauan Ruang', p: 'Pantau', i: 'monitor' }, { r: 'nilai', l: 'Nilai & e-Rapor', p: 'Nilai', i: 'chart' },
      { r: 'laporan', l: 'Laporan', i: 'file' }, { r: 'arsip', l: 'Arsip & Cadangan', p: 'Arsip', i: 'archive' }, { r: 'pengaturan', l: 'Pengaturan', i: 'gear' }, { r: 'akun', l: 'Akun Saya', p: 'Akun', i: 'key' }],
    guru: [{ r: 'beranda', l: 'Beranda', i: 'home' }, { r: 'bank', l: 'Bank Soal', i: 'book' }, { r: 'paket', l: 'Paket Ujian', p: 'Paket', i: 'layers' },
      { r: 'nilai', l: 'Nilai & Koreksi', p: 'Nilai', i: 'chart' }, { r: 'laporan', l: 'Laporan', i: 'file' },
      { r: 'pantau', l: 'Panel Pengawas', p: 'Pengawas', i: 'monitor', tugas: true }, { r: 'akun', l: 'Akun Saya', p: 'Akun', i: 'key' }],
    kepsek: [{ r: 'beranda', l: 'Beranda', i: 'home' }, { r: 'laporan', l: 'Laporan', i: 'file' }, { r: 'jadwal', l: 'Jadwal Ujian', p: 'Jadwal', i: 'calendar' },
      { r: 'akun', l: 'Akun Saya', p: 'Akun', i: 'key' }]
  };
  var VERSI_TAMPILAN = '1.1.0';
  var MODUL = {};      // halaman dari modul lain: MODUL[rute] = function (bagian) {}
  var BERANDA = {};    // tambahan beranda per peran dari modul: BERANDA[peran] = function () → html, BERANDA[peran + '_pasang'] = function () {}
  var P = { token: '', pengguna: null, peran: '', boot: null, sandiLama: '', timer: null, interaksi: Date.now(), pantau: null, ringkasan: null };

  // =========================================================================
  // Sesi & panggilan server
  // =========================================================================
  function simpanSesi() {
    try { localStorage.setItem(KUNCI, JSON.stringify({ token: P.token, pengguna: P.pengguna, peran: P.peran })); } catch (e) { /* abaikan */ }
  }
  function muatSesi() { try { return JSON.parse(localStorage.getItem(KUNCI) || 'null'); } catch (e) { return null; } }
  function kedaluwarsa(t) {
    try {
      var b = String(t).split('.')[0].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b)))).x || 0;
    } catch (e) { return 0; }
  }

  // Daftar yang sering dibuka disimpan di perangkat: halaman langsung tampil dari simpanan, lalu
  // diperbarui diam-diam dari server. Simpanan dibuang setiap kali ada perubahan data (aksi tulis).
  var BACA_CEPAT = { dataSekolah: 1, daftarUjian: 1, daftarPaket: 1, bankSoal: 1, pengaturan: 1, rekapSekolah: 1, daftarArsip: 1 };
  // Data berisi password kartu siswa atau isi soal hanya disimpan di memori (tidak di localStorage),
  // agar tidak tertinggal di komputer bersama bila guru lupa keluar.
  var HANYA_MEMORI = { dataSekolah: 1, bankSoal: 1 };
  var BACA_LAIN = /^(muatBanyak|bootstrap|statusRuang|ringkasanHariIni|rekapNilai|detailJawaban|ambilSoal|ambilGambar|dokumen|ambilJawabanEsai|bacaArsip|alatAdmin|cekKesiapan|usulPeserta|arsipkan|imporVersiLama|ping)$/;
  var _inflight = {}, _cepat = {};
  function kunciCepat(aksi, data) { return 'cbt_c_' + (P.pengguna ? P.pengguna.id : '') + '_' + P.peran + '_' + aksi + '_' + JSON.stringify(data || {}); }
  function ambilCepat(k) {
    if (_cepat[k]) return _cepat[k];
    try { var v = JSON.parse(localStorage.getItem(k) || 'null'); if (v) _cepat[k] = v; return v; } catch (e) { return null; }
  }
  function simpanCepat(k, r, aksi) {
    r._t = Date.now();
    _cepat[k] = r;
    if (HANYA_MEMORI[aksi]) return;
    try { var t = JSON.stringify(r); if (t.length < 1500000) localStorage.setItem(k, t); } catch (e) { /* penuh: cukup di memori */ }
  }

  // Pramuat: daftar untuk semua menu peran ini diambil dalam SATU panggilan setelah masuk dan setelah
  // setiap perubahan data, sehingga membuka menu tidak perlu menunggu server.
  var PRAMUAT = {
    admin: ['dataSekolah', 'daftarUjian', 'pengaturan', 'rekapSekolah', 'daftarArsip'],
    guru: ['bankSoal', 'daftarPaket', 'daftarUjian', 'rekapSekolah'],
    kepsek: ['daftarUjian', 'rekapSekolah']
  };
  var _pramuatTimer = null, _pramuatJalan = false;
  function pramuat() {
    if (!P.token || !P.peran || _pramuatJalan) return;
    var daftar = (PRAMUAT[P.peran] || []).filter(function (a) { return !_cepat[kunciCepat(a, {})]; });
    if (!daftar.length) return;
    _pramuatJalan = true;
    var token = P.token;
    API.panggil('muatBanyak', { panggilan: daftar.map(function (a) { return { a: a, d: {} }; }) }, token, { timeout: 60000 }).then(function (r) {
      _pramuatJalan = false;
      if (r.tk) { P.token = r.tk; simpanSesi(); }
      if (!r.ok || P.token !== (r.tk || token)) return;
      (r.data.hasil || []).forEach(function (h) {
        if (h.ok && !_cepat[kunciCepat(h.a, h.d)]) simpanCepat(kunciCepat(h.a, h.d), { ok: true, data: h.data, ms: r.ms }, h.a);
      });
    });
  }
  function jadwalPramuat(jeda) {
    clearTimeout(_pramuatTimer);
    _pramuatTimer = setTimeout(pramuat, jeda || 2500);
  }
  function buangCepat() {
    _cepat = {};
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('cbt_c_') === 0) localStorage.removeItem(k); }); } catch (e) { /* abaikan */ }
  }

  function panggil(aksi, data, opsi) {
    var cepat = BACA_CEPAT[aksi] && !(opsi && opsi.segar);
    var baca = cepat || BACA_LAIN.test(aksi) || aksi === 'aturToken';
    var k = aksi + '|' + JSON.stringify(data || {});
    if (/^(bootstrap|statusRuang|ringkasanHariIni)$/.test(aksi) && _inflight[k]) return _inflight[k]; // permintaan kembar menumpang
    var kc = cepat ? kunciCepat(aksi, data) : '', ada = cepat ? ambilCepat(kc) : null, hal = location.hash;
    if (ada && ada._t && Date.now() - ada._t < 60000) return Promise.resolve(ada);   // baru diambil (<1 menit): tanpa ke server
    var p = (_inflight[k] && cepat) ? _inflight[k] : API.panggil(aksi, data, P.token, opsi).then(function (r) {
      delete _inflight[k];
      if (r.tk) { P.token = r.tk; simpanSesi(); }
      statusServer(r);
      if (!r.ok && r.kode === 'SESI_STAF') keluarLokal('Sesi berakhir karena lama tidak aktif. Silakan masuk lagi.');
      if (!r.ok && r.kode === 'HARUS_GANTI') tampilGanti();
      if (r.ok && !baca) { buangCepat(); jadwalPramuat(); }      // ada perubahan: simpanan kedaluwarsa, pramuat ulang di latar
      if (r.ok && cepat) {
        var lama = ambilCepat(kc);
        simpanCepat(kc, r, aksi);
        if (ada && lama && JSON.stringify(lama.data) !== JSON.stringify(r.data) && location.hash === hal) dataBaruTersedia();
      }
      return r;
    });
    if (cepat || /^(bootstrap|statusRuang|ringkasanHariIni)$/.test(aksi)) _inflight[k] = p;
    if (ada) return Promise.resolve(ada);                       // tampil seketika dari simpanan
    return p;
  }

  // Data terbaru datang setelah halaman tampil dari simpanan: segarkan otomatis bila pengguna belum
  // mengetik/mengklik apa pun di halaman ini; bila sudah, tawarkan tombol agar isian tidak hilang.
  var _sentuh = false;
  function dataBaruTersedia() {
    if (!$('modal').hidden) { tawarkanSegar(); return; }
    if (!_sentuh) { rute(true); return; }
    tawarkanSegar();
  }
  function tawarkanSegar() {
    if ($('chip-segar')) return;
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'chip-segar'; b.className = 'chip-segar';
    b.innerHTML = ikon('refresh', 'ic-sm') + 'Data terbaru tersedia · Tampilkan';
    b.onclick = function () { b.remove(); rute(true); };
    document.body.appendChild(b);
  }

  // Ringkasan kecepatan di perangkat (dibaca di halaman Akun Saya): median total, server, dan jaringan
  var _ukur = [];
  function catatUkur(srv, total) { _ukur.push([srv, total]); if (_ukur.length > 60) _ukur.shift(); }
  function median(a) { if (!a.length) return 0; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function ringkasUkur() {
    if (!_ukur.length) return null;
    var srv = _ukur.map(function (x) { return x[0]; }), tot = _ukur.map(function (x) { return x[1]; });
    return { n: _ukur.length, total: median(tot), server: median(srv), jaringan: Math.max(0, median(tot) - median(srv)) };
  }

  function statusServer(r) {
    var el = $('status-server'); if (!el) return;
    var b = el.querySelector('b');
    if (r.ok) {
      b.className = 'pill pill-ok'; b.innerHTML = '<i class="titik-status"></i>Normal · ' + (API.latensi / 1000).toFixed(1).replace('.', ',') + ' dtk';
      // Pengukur: waktu kerja server (r.ms) dibanding total, agar terlihat mana yang lambat
      var srv = Number(r.ms) || 0;
      el.title = 'Panggilan terakhir: total ' + (API.latensi / 1000).toFixed(1) + ' dtk = server ' + (srv / 1000).toFixed(1) + ' dtk + jaringan/Google ' + (Math.max(0, API.latensi - srv) / 1000).toFixed(1) + ' dtk';
      catatUkur(srv, API.latensi);
    }
    else if (r.kode === 'SIBUK') { b.className = 'pill pill-warn'; b.innerHTML = '<i class="titik-status"></i>Sibuk'; }
    else if (r.kode === 'JARINGAN' || r.kode === 'WAKTU') { b.className = 'pill pill-danger'; b.innerHTML = '<i class="titik-status"></i>Terputus'; }
  }

  // =========================================================================
  // Utilitas tampilan
  // =========================================================================
  function ikon(n, kls) { return '<svg class="ic ' + (kls || '') + '"><use href="#i-' + n + '"/></svg>'; }
  function jam(ms) { if (!ms) return '-'; var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + '.' + ('0' + d.getMinutes()).slice(-2); }
  function jamDetik(ms) { var d = new Date(ms); return jam(ms) + '.' + ('0' + d.getSeconds()).slice(-2); }
  function tanggalPanjang(ms) { return new Date(ms).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  function lalu(ms, kini) {
    if (!ms) return '-';
    var m = Math.floor(((kini || Date.now()) - ms) / 60000);
    return m < 1 ? 'baru saja' : m < 60 ? m + ' mnt lalu' : jam(ms);
  }
  function inisial(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function toast(pesan, jenis, ms) {
    var el = document.createElement('div');
    el.className = 'toast ' + (jenis || '');
    el.textContent = pesan;
    $('toast').appendChild(el);
    setTimeout(function () { el.remove(); }, ms || 4000);
  }
  function modal(html, kelas) {
    $('modal-isi').className = 'modal' + (kelas ? ' ' + kelas : '');
    $('modal-isi').onclick = null;
    $('modal-isi').innerHTML = html; $('modal').hidden = false;
    var b = $('modal-isi').querySelector('[data-fokus], .btn'); if (b) setTimeout(function () { b.focus(); }, 30);
  }
  function tutupModal() { $('modal').hidden = true; $('modal-isi').innerHTML = ''; $('modal-isi').className = 'modal'; if (PANEL.tutupModalHook) { var f = PANEL.tutupModalHook; PANEL.tutupModalHook = null; f(); } }
  function konfirmasi(judul, isi, label, bahaya) {
    return new Promise(function (ok) {
      modal('<div class="modal-kepala"><h2 style="font-size:19px">' + esc(judul) + '</h2></div><div class="modal-isi">' + isi + '</div>' +
        '<div class="modal-kaki"><button type="button" class="btn btn-secondary" data-jawab="0">Batal</button>' +
        '<button type="button" class="btn ' + (bahaya ? 'btn-danger' : 'btn-primary') + '" data-jawab="1" data-fokus>' + esc(label) + '</button></div>');
      $('modal-isi').onclick = function (e) {
        var b = e.target.closest('[data-jawab]'); if (!b) return;
        tutupModal(); ok(b.getAttribute('data-jawab') === '1');
      };
    });
  }
  function terapkanInfo(info) {
    if (!info) return;
    API.terapkanSekolah(info);
    document.querySelectorAll('[data-sekolah="nama"]').forEach(function (el) { el.textContent = info.nama_sekolah || 'Digital CBT'; });
    document.querySelectorAll('[data-sekolah="kabupaten"]').forEach(function (el) { el.textContent = info.kabupaten || 'Panel staf'; });
    document.querySelectorAll('[data-sekolah="logo"]').forEach(function (el) {
      if (/^https:\/\//.test(info.logo || '')) el.innerHTML = '<img alt="" src="' + esc(info.logo) + '">';
      else el.textContent = API.monogram(info.nama_sekolah);
    });
  }
  function galat(idEl, pesan) { var el = $(idEl); el.hidden = !pesan; el.querySelector('span').textContent = pesan || ''; }

  // =========================================================================
  // W-09 Login & ganti password pertama
  // =========================================================================
  // Halaman masuk tunggal: pilihan "Siswa" atau "Guru & Staf" diingat di perangkat
  var KUNCI_MODE = 'cbt_mode', KUNCI_AKUN = 'cbt_akun';
  function modeMasuk() { return document.querySelector('.pilih-peran').getAttribute('data-mode') || 'siswa'; }
  function aturMode(m) {
    var el = document.querySelector('.pilih-peran');
    el.setAttribute('data-mode', m);
    el.querySelectorAll('[data-mode]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-mode') === m)); });
    $('in-user').placeholder = m === 'siswa' ? 'Lihat kartu ujian, contoh: 2025081' : 'Contoh: rina.s';
    $('in-pass').placeholder = m === 'siswa' ? '6 karakter dari kartu ujian' : 'Password Anda';
    $('bantuan-siswa').hidden = m !== 'siswa'; $('bantuan-staf').hidden = m === 'siswa';
    try { localStorage.setItem(KUNCI_MODE, m); } catch (e) { /* abaikan */ }
    galat('masuk-galat', '');
  }

  function tampilLogin(pesan, mode) {
    $('kerangka').hidden = true; $('layar-masuk').hidden = false;
    $('form-masuk').hidden = false; $('form-ganti').hidden = true;
    var m = mode; if (!m) { try { m = localStorage.getItem(KUNCI_MODE); } catch (e) { m = ''; } }
    aturMode(m === 'staf' ? 'staf' : 'siswa');
    galat('masuk-galat', pesan || '');
    document.title = 'Digital CBT · Ujian Online';
    setTimeout(function () { if (window.innerWidth > 900) $('in-user').focus(); }, 50);
  }

  function pesanJaringan(r) { return r.kode === 'JARINGAN' || r.kode === 'WAKTU' ? 'Tidak bisa terhubung ke server. Periksa koneksi internet, lalu coba lagi.' : r.pesan; }

  function prosesMasuk(e) {
    e.preventDefault();
    galat('masuk-galat', '');
    var u = $('in-user').value.trim(), p = $('in-pass').value, siswa = modeMasuk() === 'siswa';
    if (!u || !p) { galat('masuk-galat', siswa ? 'Isi username dan password sesuai kartu ujian.' : 'Isi username dan password.'); return; }
    if (siswa && !cekPenyimpanan()) { galat('masuk-galat', 'Penyimpanan browser tidak tersedia. Keluar dari mode penyamaran (incognito) atau pakai Chrome, lalu masuk lagi.'); return; }
    var btn = $('btn-masuk'), label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="putar"></span>Memeriksa…';
    var percobaan = 0;
    (function coba() {
      API.panggil(siswa ? 'masukAkunSiswa' : 'masukStaf', { u: u, p: p }, '', { timeout: 30000 }).then(function (r) {
        if (!r.ok && r.kode === 'SIBUK' && percobaan < 4) { percobaan++; btn.innerHTML = '<span class="putar"></span>Server sibuk, mencoba lagi…'; setTimeout(coba, API.jedaUlang(percobaan)); return; }
        btn.disabled = false; btn.innerHTML = label;
        if (!r.ok) { galat('masuk-galat', pesanJaringan(r)); return; }
        $('in-pass').value = '';
        if (siswa) {
          try { sessionStorage.setItem(KUNCI_AKUN, JSON.stringify({ ts: r.data.ts, data: r.data, t: Date.now() })); } catch (er) { /* abaikan */ }
          btn.disabled = true; btn.innerHTML = '<span class="putar"></span>Membuka beranda…';
          location.href = './ujian.html';
          return;
        }
        P.token = r.data.token; P.pengguna = r.data.pengguna; P.peran = r.data.pengguna.peran[0];
        simpanSesi();
        if (P.pengguna.harus_ganti) { P.sandiLama = p; tampilGanti(); } else masukPanel();
      });
    })();
  }

  function cekPenyimpanan() {
    try { localStorage.setItem('cbt_uji', '1'); var ok = localStorage.getItem('cbt_uji') === '1'; localStorage.removeItem('cbt_uji'); sessionStorage.setItem('cbt_uji', '1'); sessionStorage.removeItem('cbt_uji'); return ok; }
    catch (e) { return false; }
  }

  /** Siswa yang sedang ujian (mis. aplikasi tertutup) langsung kembali ke ruang ujian. */
  function ujianBerjalan() {
    try {
      var st = JSON.parse(localStorage.getItem('cbt_ujian_v1') || 'null');
      return !!(st && st.v === 1 && /^(konfirmasi|mengerjakan|terkunci)$/.test(st.status) && !(st.tiketX && Date.now() > st.tiketX && st.status !== 'terkunci'));
    } catch (e) { return false; }
  }

  function tampilGanti() {
    $('kerangka').hidden = true; $('layar-masuk').hidden = false;
    $('form-masuk').hidden = true; $('form-ganti').hidden = false;
    $('f-lama').hidden = !!P.sandiLama;
    galat('ganti-galat', '');
    cekAturan();
    setTimeout(function () { (P.sandiLama ? $('in-baru') : $('in-lama')).focus(); }, 50);
  }

  function cekAturan(prefix) {
    prefix = prefix || '';
    var baru = $(prefix + 'in-baru').value, ulang = $(prefix + 'in-ulang').value;
    var lama = prefix ? $(prefix + 'in-lama').value : (P.sandiLama || $('in-lama').value);
    var u = P.pengguna ? P.pengguna.username : '';
    var hasil = { panjang: baru.length >= 8, user: !!baru && baru.toLowerCase() !== u, lama: !!baru && baru !== lama, sama: !!baru && baru === ulang };
    var daftar = $(prefix + 'aturan-sandi');
    Object.keys(hasil).forEach(function (k) { daftar.querySelector('[data-aturan="' + k + '"]').classList.toggle('ok', hasil[k]); });
    var semua = Object.keys(hasil).every(function (k) { return hasil[k]; }) && !!lama;
    $(prefix + 'btn-ganti').disabled = !semua;
    return semua;
  }

  function prosesGanti(e, prefix) {
    e.preventDefault();
    prefix = prefix || '';
    if (!cekAturan(prefix)) return;
    var lama = prefix ? $(prefix + 'in-lama').value : (P.sandiLama || $('in-lama').value);
    var btn = $(prefix + 'btn-ganti');
    btn.disabled = true; btn.innerHTML = '<span class="putar"></span>Menyimpan…';
    panggil('gantiPassword', { lama: lama, baru: $(prefix + 'in-baru').value }).then(function (r) {
      btn.innerHTML = prefix ? 'Simpan password' : 'Simpan &amp; lanjut';
      if (!r.ok) { btn.disabled = false; galat(prefix + 'ganti-galat', r.pesan); return; }
      P.token = r.data.token; P.sandiLama = ''; P.pengguna.harus_ganti = false; simpanSesi();
      [prefix + 'in-lama', prefix + 'in-baru', prefix + 'in-ulang'].forEach(function (id) { if ($(id)) $(id).value = ''; });
      toast('Password berhasil diganti.', 'ok');
      if (!prefix) masukPanel(); else cekAturan(prefix);
    });
  }

  function keluarLokal(pesan) {
    berhentiPoll();
    P = { token: '', pengguna: null, peran: '', boot: null, sandiLama: '', timer: null, interaksi: Date.now(), pantau: null, ringkasan: null };
    try {
      localStorage.removeItem(KUNCI);
      Object.keys(localStorage).forEach(function (k) { if (/^cbt_(boot|c|d)_/.test(k)) localStorage.removeItem(k); });
    } catch (e) { /* abaikan */ }
    history.replaceState(null, '', location.pathname);
    tampilLogin(pesan, 'staf');
  }

  // =========================================================================
  // Kerangka panel & bootstrap SWR
  // =========================================================================
  function kunciBoot() { return 'cbt_boot_' + P.pengguna.id + '_' + P.peran; }

  function masukPanel() {
    $('layar-masuk').hidden = true; $('kerangka').hidden = false;
    $('nama-pengguna').textContent = P.pengguna.nama;
    $('avatar').textContent = inisial(P.pengguna.nama);
    $('samping-peran').textContent = LABEL_PERAN[P.peran] || P.peran;
    var peran = P.pengguna.peran || [];
    $('ganti-peran').hidden = peran.length < 2;
    $('pilih-peran').innerHTML = peran.map(function (x) { return '<option value="' + x + '"' + (x === P.peran ? ' selected' : '') + '>' + LABEL_PERAN[x] + '</option>'; }).join('');
    try { P.boot = JSON.parse(localStorage.getItem(kunciBoot()) || 'null'); } catch (e) { P.boot = null; }
    bangunMenu();
    $('konten').innerHTML = '<div class="kartu-blok" style="padding:24px"><div class="kerangka-muat"></div></div>';
    muatModul().then(function () { rute(); }, function () {
      $('konten').innerHTML = '<section class="kartu-blok"><div class="kosong-isi">' + ikon('wifi-off') + '<p><b>Sebagian halaman gagal dimuat.</b></p><p>Periksa koneksi internet, lalu muat ulang halaman.</p></div></section>';
    });
    segarkanBoot();
  }

  // Modul halaman panel dimuat sekali setelah staf masuk (tersimpan di perangkat oleh service worker)
  var _modul = null, _modulSiap = false;
  function muatModul() {
    if (!_modul) {
      _modul = Promise.all(['./js/m-soal.js', './js/m-admin.js', './js/m-nilai.js'].map(function (f) { return API.muatSkrip(f); }))
        .then(function () { _modulSiap = true; }, function (e) { _modul = null; throw e; });
    }
    return _modul;
  }

  function segarkanBoot() {
    return panggil('bootstrap', { peran: P.peran }).then(function (r) {
      if (!r.ok) { if (r.kode !== 'SESI_STAF' && r.kode !== 'HARUS_GANTI') toast(r.pesan || 'Gagal memuat data.', 'danger'); return; }
      var lama = JSON.stringify(P.boot);
      P.boot = r.data;
      try { localStorage.setItem(kunciBoot(), JSON.stringify(P.boot)); } catch (e) { /* abaikan */ }
      if (P.boot.sekolah) terapkanInfo(P.boot.sekolah);
      bangunMenu();
      if (lama !== JSON.stringify(P.boot) && halaman() !== 'akun' && !(P.pantau && P.pantau.id)) rute();
      jadwalPramuat(300);
    });
  }

  function menuPeran() {
    var tugas = P.boot && P.boot.tugas_pengawas && P.boot.tugas_pengawas.length;
    return (MENU[P.peran] || []).filter(function (m) { return !m.tugas || tugas; });
  }

  function bangunMenu() {
    var aktif = halaman();
    var item = menuPeran();
    var tugas = P.boot && P.boot.tugas_pengawas ? P.boot.tugas_pengawas.filter(function (t) { return t.status === 'Token aktif'; }).length : 0;
    var html = item.map(function (m) {
      var lencana = m.r === 'pantau' && tugas ? '<span class="lencana">' + tugas + '</span>' : '';
      return '<a href="#/' + m.r + '" class="' + (aktif === m.r ? 'aktif' : '') + '">' + ikon(m.i) + '<span>' + m.l + '</span>' + lencana + '</a>';
    }).join('');
    $('menu').innerHTML = html;
    var utama = item.length > 5 ? item.slice(0, 4) : item, sisa = item.length > 5 ? item.slice(4) : [];
    $('menu-bawah').style.setProperty('--n', utama.length + (sisa.length ? 1 : 0));
    $('menu-bawah').innerHTML = utama.map(function (m) {
      return '<a href="#/' + m.r + '" class="' + (aktif === m.r ? 'aktif' : '') + '">' + ikon(m.i) + '<span>' + (m.p || m.l) + '</span></a>';
    }).join('') + (sisa.length ? '<a href="#" data-lainnya class="' + (sisa.some(function (m) { return m.r === aktif; }) ? 'aktif' : '') + '">' + ikon('menu') + '<span>Lainnya</span></a>' : '');
    var l = $('menu-bawah').querySelector('[data-lainnya]');
    if (l) l.onclick = function (e) {
      e.preventDefault();
      modal('<div class="modal-kepala"><h2 style="font-size:18px">Menu lainnya</h2></div><div class="modal-isi"><nav class="menu menu-lainnya">' +
        sisa.map(function (m) { return '<a href="#/' + m.r + '" class="' + (aktif === m.r ? 'aktif' : '') + '">' + ikon(m.i) + '<span>' + m.l + '</span></a>'; }).join('') +
        '</nav></div><div class="modal-kaki"><button type="button" class="btn btn-secondary" data-tutup>Tutup</button></div>');
      $('modal-isi').onclick = function (ev) { if (ev.target.closest('a,[data-tutup]')) tutupModal(); };
    };
  }

  function halaman() { return (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'beranda'; }

  function rute(segar) {
    if (!_modulSiap || !P.pengguna) return;   // menunggu modul halaman selesai dimuat
    _sentuh = false;
    var chip = $('chip-segar'); if (chip) chip.remove();
    var gulir = segar ? window.scrollY : 0;
    berhentiPoll();
    var bagian = location.hash.replace(/^#\/?/, '').split('/');
    var h = bagian[0] || 'beranda';
    if (!menuPeran().some(function (m) { return m.r === h; }) && !(h === 'pantau' && bagian[1]) && !(MODUL[h] && MODUL[h].tersembunyi)) h = 'beranda';
    bangunMenu();
    P.pantau = null;
    if (PANEL.tinggalkan) { var t = PANEL.tinggalkan; PANEL.tinggalkan = null; try { t(); } catch (e) { /* abaikan */ } }
    if (h === 'beranda') halamanBeranda();
    else if (h === 'pantau' && bagian[1]) halamanPantau(decodeURIComponent(bagian[1]));
    else if (h === 'pantau') halamanDaftarSesi();
    else if (h === 'akun') halamanAkun();
    else if (MODUL[h]) {
      try { MODUL[h](bagian.slice(1).map(decodeURIComponent)); }
      catch (e) { console.error(e); $('konten').innerHTML = '<section class="kartu-blok"><div class="kosong-isi">' + ikon('alert') + '<p><b>Halaman gagal dibuka.</b></p><p>' + esc(e.message) + '</p></div></section>'; }
    }
    if (h === 'pantau' && bagian[1]) { /* halaman pemantauan sudah padat */ } else pasangPanduan(h, bagian);
    $('konten').scrollTop = 0; window.scrollTo(0, gulir);
  }

  // Panduan singkat per halaman untuk pengguna baru; bisa ditutup dan tidak muncul lagi di perangkat ini
  var PANDUAN = {
    'guru:bank': ['Menyusun soal', ['Tekan <b>Unggah Soal</b> dan pilih file Word, PDF, atau Excel. Bisa juga <b>Tulis Soal</b> satu per satu.',
      'Periksa hasilnya. Soal bertanda <b>merah</b> wajib diperbaiki; klik huruf pilihan untuk menandai kunci jawaban.',
      'Tekan <b>Simpan ke Bank Soal</b>. Soal di bank bisa dipakai berulang untuk paket mana pun.']],
    'guru:paket': ['Menyiapkan paket ujian', ['Tekan <b>Buat paket</b>, lalu pilih soal dari bank.', 'Atur urutan, bobot, dan pengacakan bila perlu.',
      'Tekan <b>Kunci paket</b>. Paket yang dikunci siap dijadwalkan admin dan tidak bisa diubah lagi (buat salinannya bila perlu).']],
    'guru:nilai': ['Dari ujian sampai nilai', ['Nilai pilihan ganda dihitung <b>otomatis</b> setelah sesi ditutup.', 'Bila ada esai, tekan <b>Nilai esai</b> dan beri skor sesuai rubrik.',
      'Periksa rekap, tekan <b>Verifikasi</b>, lalu <b>Publikasikan</b> agar siswa bisa melihat nilainya.']],
    'guru:pantau': ['Tugas pengawas', ['Buka sesi yang Anda awasi, lalu tekan <b>Buka Token</b>.', 'Bacakan token kepada siswa. Siswa masuk, menekan <b>Mulai ujian</b>, dan mengisi token.',
      'Pantau kartu siswa. Bila ada kendala, ketuk kartu siswa itu untuk tindakan (tambah waktu, reset login). Tutup sesi setelah waktu habis.']],
    'admin:peserta': ['Menyiapkan akun siswa', ['Unduh data siswa dari Dapodik dalam format Excel.', 'Tekan <b>Impor Excel Dapodik</b>. Akun dibuat otomatis: username dari NIS, password 6 karakter.',
      'Centang siswa, lalu tekan <b>Cetak kartu</b> dan bagikan kartu ujian.']],
    'admin:staf': ['Menyiapkan guru & data sekolah', ['Isi tab <b>Mapel</b>, <b>Rombel</b>, dan <b>Ruang</b>.', 'Unduh template, isi daftar guru beserta mapel dan rombel yang diampu, lalu tekan <b>Impor guru</b>.',
      'Cetak atau salin password sementara guru; guru wajib menggantinya saat pertama masuk.']],
    'admin:jadwal': ['Menjadwalkan ujian', ['Tekan <b>Buat jadwal</b>, pilih paket yang sudah dikunci guru, durasi, dan rombel.', 'Pilih ruang, lalu tekan <b>Bagi otomatis</b> untuk membagi siswa ke sesi dan ruang. Tentukan pengawas.',
      'Tekan <b>Simpan</b>, lalu buka <b>Cek Kesiapan</b> sampai semuanya hijau.']],
    'admin:kesiapan': ['Sebelum hari ujian', ['Pilih ujian, lalu periksa setiap butir. Butir kuning/merah menunjukkan apa yang masih kurang.', 'Cetak kartu dan daftar hadir di <b>Cetak Dokumen</b>.',
      'Pada hari ujian, pengawas membuka token di Panel Pengawas.']],
    'admin:arsip': ['Arsip semester', ['Tunggu sampai semua ujian semester ini dipublikasikan dan masa sanggahnya lewat.', 'Tekan <b>Arsipkan semester ini</b>. Data ujian disalin ke spreadsheet arsip, diperiksa, lalu dihapus dari database utama.',
      'Bank soal, paket, peserta, dan guru tetap ada untuk semester berikutnya. Arsip bisa diunduh sebagai Excel kapan saja.']],
    'admin:nilai': ['Nilai & e-Rapor', ['Guru mapel memverifikasi dan mempublikasikan nilai.', 'Tekan <b>Ekspor e-Rapor</b> untuk mengunduh file per rombel.', 'Susunan kolom file diatur di <b>Pengaturan → Ekspor e-Rapor</b>.']]
  };
  function panduanHtml(kunci) {
    var p = PANDUAN[kunci]; if (!p) return '';
    try { if (localStorage.getItem('cbt_panduan_' + kunci)) return ''; } catch (e) { /* abaikan */ }
    return '<aside class="panduan" data-panduan="' + kunci + '"><span class="panduan-ikon">' + ikon('info') + '</span><div><h3>Panduan singkat: ' + p[0] + '</h3><ol>' +
      p[1].map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ol></div>' +
      '<button type="button" class="panduan-tutup" aria-label="Tutup panduan" title="Tutup panduan">' + ikon('x', 'ic-sm') + '</button></aside>';
  }
  function pasangPanduan(h, bagian) {
    var kunci = P.peran + ':' + h;
    if (!PANDUAN[kunci] || (bagian[1] && h !== 'staf')) return;
    var html = panduanHtml(kunci); if (!html) return;
    var k = $('konten'), banner = k.querySelector(':scope > .banner');
    if (banner) banner.insertAdjacentHTML('afterend', html); else k.insertAdjacentHTML('afterbegin', html);
  }

  function judul(t, remah) { $('judul-halaman').textContent = t; $('remah').textContent = remah || 'Panel Staf · ' + (LABEL_PERAN[P.peran] || ''); document.title = t + ' · Digital CBT'; }

  // Polling adaptif
  function mulaiPoll(fn) {
    berhentiPoll();
    var n = 0;
    P.timer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      n++;
      if (Date.now() - P.interaksi > 5 * 60e3 && n % 2) return; // diam > 5 menit: tiap 60 detik
      fn();
    }, 30000);
  }
  function berhentiPoll() { if (P.timer) clearInterval(P.timer); P.timer = null; }

  // =========================================================================
  // Beranda per peran (W-10 guru, W-20 admin, W-31 kepala sekolah)
  // =========================================================================
  function bannerMode() {
    if (!P.boot || !P.boot.mode_ujian) return '';
    var n = P.boot.ringkasan ? P.boot.ringkasan.total.sesi_berjalan : (P.boot.tugas_pengawas || []).filter(function (t) { return t.status === 'Token aktif'; }).length;
    return '<div class="banner">' + ikon('lock') + '<div><b>Mode ujian aktif' + (n ? ' — ' + n + ' sesi sedang berlangsung.' : '.') + '</b> ' +
      'Impor soal, koreksi, laporan, dan cadangan manual dibuka kembali setelah semua sesi selesai.</div></div>';
  }

  function kartuTugas() {
    var t = (P.boot && P.boot.tugas_pengawas) || [];
    if (!t.length) return '';
    return '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Tugas Mengawasi Hari Ini</h2><p>Panel pengawas terbuka 30 menit sebelum sesi dimulai.</p></div></div><div class="tugas">' +
      t.map(function (s) {
        var buka = s.terbuka || Date.now() >= s.mulai - 30 * 60e3;
        return '<div class="tugas-item"><div><h3>Anda mengawasi ' + esc(s.ruang) + '</h3><p>' + jam(s.mulai) + '–' + jam(s.selesai) + ' · ' + esc(s.mapel) + ' · ' + esc(s.nama_ujian) +
          ' · ' + s.jumlah_peserta + ' peserta</p></div><div style="display:flex;gap:10px;align-items:center">' + pillSesi(s.status, s.status === 'Token aktif') +
          (buka ? '<a class="btn btn-primary" href="#/pantau/' + encodeURIComponent(s.id) + '">' + ikon('monitor', 'ic-sm') + 'Buka Panel Pengawas</a>' :
            '<span class="chip">Terbuka pukul ' + jam(s.mulai - 30 * 60e3) + '</span>') + '</div></div>';
      }).join('') + '</div></section>';
  }

  function pillSesi(status, tokenAktif) {
    if (status === 'Token aktif') return tokenAktif === false ? '<span class="pill pill-warn">' + ikon('lock') + 'Token ditutup</span>' : '<span class="pill pill-ok"><i class="titik-status"></i>Token aktif</span>';
    if (status === 'Ditutup') return '<span class="pill pill-dark">Ditutup</span>';
    return '<span class="pill pill-idle">Belum dibuka</span>';
  }

  function halamanBeranda() {
    var peran = P.peran;
    judul(peran === 'guru' ? 'Beranda Guru' : peran === 'kepsek' ? 'Pemantauan Asesmen Sekolah' : 'Beranda Admin');
    if (!P.boot) { $('konten').innerHTML = '<div class="kartu-blok" style="padding:24px"><div class="kerangka-muat" style="width:40%"></div><br><div class="kerangka-muat"></div></div>'; return; }
    var h = bannerMode();
    if (peran === 'guru') {
      h += kartuTugas() + (BERANDA.guru ? BERANDA.guru() : '');
      $('konten').innerHTML = h;
      if (BERANDA.guru_pasang) BERANDA.guru_pasang();
      return;
    }
    h += (peran === 'kepsek' ? '<p><span class="pill pill-warn">' + ikon('eye') + 'Mode lihat saja</span></p>' : '') + kartuTugas() +
      '<div class="kepala-bagian"><div><h2>Pelaksanaan Hari Ini</h2><p>' + tanggalPanjang(P.boot.sekarang || Date.now()) + '</p></div>' +
      '<div class="segar"><span id="waktu-segar">Diperbarui ' + jamDetik(Date.now()) + ' · otomatis tiap 30 detik</span>' +
      '<button type="button" class="btn btn-secondary" id="btn-segar">' + ikon('refresh', 'ic-sm') + 'Segarkan</button></div></div>' +
      '<div id="ringkasan-isi"></div>' + (BERANDA[peran] ? BERANDA[peran]() : '');
    $('konten').innerHTML = h;
    if (BERANDA[peran + '_pasang']) BERANDA[peran + '_pasang']();
    P.ringkasan = P.boot.ringkasan;
    renderRingkasan();
    $('btn-segar').onclick = muatRingkasan;
    mulaiPoll(muatRingkasan);
  }

  function muatRingkasan() {
    var b = $('btn-segar'); if (b) b.disabled = true;
    panggil('ringkasanHariIni', {}).then(function (r) {
      if (b) b.disabled = false;
      if (!r.ok || halaman() !== 'beranda') return;
      P.ringkasan = r.data; P.boot.ringkasan = r.data;
      renderRingkasan();
      var w = $('waktu-segar'); if (w) w.textContent = 'Diperbarui ' + jamDetik(Date.now()) + ' · otomatis tiap 30 detik';
    });
  }

  function renderRingkasan() {
    var R = P.ringkasan, el = $('ringkasan-isi');
    if (!el || !R) return;
    var t = R.total, admin = P.peran === 'admin';
    var h = '<div class="kartu-angka">' +
      '<div class="angka"><div class="angka-kepala">Sesi Berjalan' + ikon('play') + '</div><b>' + t.sesi_berjalan + '</b><small>dari ' + R.sesi.length + ' sesi hari ini</small></div>' +
      '<div class="angka ok"><div class="angka-kepala">Peserta Aktif' + ikon('users') + '</div><b>' + t.peserta_aktif + '</b><small>' + (t.sinyal_lama ? t.sinyal_lama + ' sinyal terakhir > 5 menit' : 'semua tersambung') + '</small></div>' +
      '<div class="angka done"><div class="angka-kepala">Selesai' + ikon('check-c') + '</div><b>' + t.selesai + '</b><small>kode bukti tercatat</small></div>' +
      '<div class="angka warn"><div class="angka-kepala">Belum Login' + ikon('user-x') + '</div><b>' + t.belum_login + '</b><small>di sesi yang sedang berjalan</small></div></div>';
    h += '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Sesi Hari Ini</h2><p>' + t.terdaftar + ' peserta terjadwal</p></div></div>';
    if (!R.sesi.length) {
      h += '<div class="kosong-isi">' + ikon('calendar') + '<p><b>Belum ada sesi ujian hari ini.</b></p></div>';
    } else {
      h += '<table class="tabel tabel-responsif"><thead><tr><th>Sesi &amp; Jam</th><th>Ruang</th><th>Pengawas</th><th>Status</th><th class="kanan">Hadir / Total</th><th class="kanan">Selesai</th>' + (admin ? '<th></th>' : '') + '</tr></thead><tbody>' +
        R.sesi.map(function (s) {
          return '<tr><td class="utama-sel"><b>' + jam(s.mulai) + '–' + jam(s.selesai) + '</b><span class="sub">' + esc(s.mapel) + ' · ' + esc(s.nama_ujian) + '</span></td>' +
            '<td data-l="Ruang">' + esc(s.ruang) + '</td><td data-l="Pengawas">' + esc(s.pengawas || '-') + '</td><td>' + pillSesi(s.status, s.token_aktif) + '</td>' +
            '<td class="kanan tnum" data-l="Hadir"><b>' + s.hadir + '</b> / ' + s.jumlah + '</td><td class="kanan tnum" data-l="Selesai">' + s.selesai_n + '</td>' +
            (admin ? '<td class="kanan"><a class="btn btn-secondary btn-sm" href="#/pantau/' + encodeURIComponent(s.id) + '">' + ikon('monitor', 'ic-sm') + 'Pantau</a></td>' : '') + '</tr>';
        }).join('') + '</tbody></table>';
    }
    el.innerHTML = h + '</section>';
  }

  function halamanDaftarSesi() {
    judul(P.peran === 'guru' ? 'Panel Pengawas' : 'Pemantauan Ruang');
    var daftar = P.peran === 'admin' ? ((P.boot && P.boot.ringkasan && P.boot.ringkasan.sesi) || []) : ((P.boot && P.boot.tugas_pengawas) || []);
    $('konten').innerHTML = bannerMode() + '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Pilih Sesi</h2><p>Sesi ujian hari ini</p></div></div>' +
      (daftar.length ? '<div class="tugas">' + daftar.map(function (s) {
        return '<div class="tugas-item"><div><h3>' + esc(s.ruang) + ' · ' + jam(s.mulai) + '–' + jam(s.selesai) + '</h3><p>' + esc(s.mapel) + ' · ' + esc(s.nama_ujian) + '</p></div>' +
          '<div style="display:flex;gap:10px;align-items:center">' + pillSesi(s.status, s.token_aktif) + '<a class="btn btn-primary" href="#/pantau/' + encodeURIComponent(s.id) + '">Buka</a></div></div>';
      }).join('') + '</div>' : '<div class="kosong-isi">' + ikon('calendar') + '<p><b>Belum ada sesi ujian hari ini.</b></p></div>') + '</section>';
  }

  // =========================================================================
  // W-28 Panel pengawas
  // =========================================================================
  var LABEL_ST = {
    belum: ['pill-idle', 'user-x', 'Belum login'], aktif: ['pill-ok', '', 'Aktif'], sinyal: ['pill-warn', 'wifi-off', 'Sinyal > 5 mnt'],
    keluar: ['pill-danger', 'alert', 'Sering keluar'], selesai: ['pill-done', 'check', 'Selesai']
  };
  function golongan(x, d) {
    if (x.s === 'belum') return 'belum';
    if (x.s === 'selesai' || x.s === 'dikumpulkan' || x.s === 'terlambat') return 'selesai';
    if (x.k >= d.batas_sering_keluar) return 'keluar';
    if (kini(d) - x.t > 5 * 60e3) return 'sinyal';
    return 'aktif';
  }
  function kini(d) { return d.sekarang + (Date.now() - P.pantau.diterima); }
  function pillSt(x, d) {
    var g = golongan(x, d), L = LABEL_ST[g];
    var label = x.s === 'dikumpulkan' ? 'Dikumpulkan pengawas' : x.s === 'terlambat' ? 'Terlambat' : L[2];
    return '<span class="pill ' + (x.s === 'terlambat' ? 'pill-warn' : L[0]) + '">' + (L[1] ? ikon(L[1]) : '<i class="titik-status"></i>') + label + '</span>';
  }

  function halamanPantau(id) {
    judul('Panel Pengawas', 'Pemantauan Ruang');
    P.pantau = { id: id, data: null, pilih: null, saring: 'semua', cari: '', aksi: null, menit: 10 };
    $('konten').innerHTML = '<div id="p-info" class="pantau-info"><div class="kerangka-muat" style="width:50%"></div></div>' +
      '<div class="pantau-atas"><div id="p-token" class="kartu-token"><div class="kerangka-muat"></div></div><div id="p-rekap" class="rekap"><div class="kerangka-muat"></div></div></div>' +
      '<div class="pantau-badan"><section class="matriks-wadah"><div class="matriks-kepala"><h3 id="p-judul-matriks">Peserta</h3>' +
      '<label class="cari">' + ikon('search', 'ic-sm') + '<input class="input" id="p-cari" placeholder="Cari nama / NIS…" autocomplete="off"></label></div><div class="matriks" id="p-matriks"></div></section>' +
      '<aside class="detail" id="p-detail" aria-label="Detail peserta"><div class="detail-kosong">Pilih kartu peserta untuk melihat rincian dan tindakan.</div></aside></div>' +
      '<div class="tirai" id="p-tirai" hidden></div>' +
      '<div class="bilah-bawah" id="p-bawah"></div>';
    var cariT = null;
    $('p-cari').addEventListener('input', function () { var v = this.value; clearTimeout(cariT); cariT = setTimeout(function () { P.pantau.cari = v.trim().toLowerCase(); renderMatriks(); }, 300); });
    $('p-tirai').onclick = tutupDetail;
    muatStatus();
    mulaiPoll(muatStatus);
  }

  function muatStatus() {
    if (!P.pantau) return;
    var id = P.pantau.id;
    return panggil('statusRuang', { id_sesi: id }).then(function (r) {
      if (!P.pantau || P.pantau.id !== id) return;
      if (!r.ok) {
        if (!P.pantau.data) $('konten').innerHTML = '<section class="kartu-blok"><div class="kosong-isi">' + ikon('alert') + '<p><b>' + esc(r.pesan) + '</b></p><p><a class="btn btn-secondary" href="#/beranda">Kembali ke Beranda</a></p></div></section>';
        else toast(r.pesan || 'Gagal memperbarui data.', 'warn');
        return;
      }
      P.pantau.data = r.data; P.pantau.diterima = Date.now();
      renderPantau();
    });
  }

  function renderPantau() {
    var d = P.pantau.data, s = d.sesi;
    $('p-info').innerHTML = '<h2>' + esc(s.ruang) + ' <span class="muted" style="font-weight:500;font-size:15px">' + jam(s.mulai) + '–' + jam(s.selesai) + ' · ' + esc(s.mapel) + ' · ' + esc(s.nama_ujian) + '</span> ' +
      pillSesi(s.status, !!s.token) + '</h2><span class="segar">' + ikon('refresh', 'ic-sm') + 'Diperbarui ' + jamDetik(Date.now()) + ' · otomatis tiap 30 detik</span>';
    renderToken(); renderRekap(); renderMatriks(); renderDetail(); renderBawah();
  }

  function renderToken() {
    var s = P.pantau.data.sesi, h = '<div class="kartu-token-kepala"><span>Token Ruang Ujian</span>' + (s.token ? '<span class="pill pill-warn">Berlaku sampai ' + jam(s.berlaku || s.selesai) + '</span>' : '') + '</div>';
    if (s.status === 'Ditutup') h += '<div class="token-besar mati">Sesi sudah ditutup</div>';
    else if (s.token) {
      h += '<div class="token-besar"><span id="p-token-teks">' + esc(s.token) + '</span><button type="button" id="btn-salin" aria-label="Salin token">' + ikon('copy') + '</button></div>' +
        '<div class="token-aksi"><button type="button" class="btn btn-secondary" data-token="ganti">' + ikon('refresh', 'ic-sm') + 'Ganti Token</button>' +
        '<button type="button" class="btn btn-danger-outline" data-token="tutup">' + ikon('lock', 'ic-sm') + 'Tutup Token</button></div>' +
        '<p class="hint">Bacakan token ini kepada siswa. Siswa yang sudah masuk tidak terpengaruh bila token diganti.</p>';
    } else {
      h += '<div class="token-besar mati">' + (s.status === 'Token aktif' ? 'Token ditutup — siswa baru tidak bisa masuk' : 'Token belum dibuka') + '</div>' +
        '<button type="button" class="btn btn-primary btn-lg btn-block" data-token="' + (s.status === 'Token aktif' ? 'ganti' : 'buka') + '">' + ikon('unlock', 'ic-sm') + (s.status === 'Token aktif' ? 'Buka Token Baru' : 'Buka Token') + '</button>' +
        '<p class="hint">' + (s.paket_dikunci ? 'Saat token dibuka, paket soal disiapkan di server agar login siswa cepat.' : '<b style="color:var(--danger)">Paket soal sesi ini belum dikunci guru.</b>') + '</p>';
    }
    $('p-token').innerHTML = h;
    $('p-token').onclick = aksiToken;
  }

  function aksiToken(e) {
    if (e.target.closest('#btn-salin')) {
      var t = P.pantau.data.sesi.token;
      (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Token disalin.', 'ok', 2000); }, function () { /* abaikan */ });
      return;
    }
    var b = e.target.closest('[data-token]'); if (!b) return;
    var aksi = b.getAttribute('data-token');
    var lanjut = aksi === 'buka' ? Promise.resolve(true) :
      konfirmasi(aksi === 'ganti' ? 'Ganti token ruang?' : 'Tutup token ruang?',
        aksi === 'ganti' ? '<p>Token lama langsung tidak berlaku. Siswa yang sudah masuk tetap bisa mengerjakan.</p>' : '<p>Siswa yang belum masuk tidak akan bisa masuk sampai token dibuka lagi. Siswa yang sudah masuk tetap bisa mengerjakan.</p>',
        aksi === 'ganti' ? 'Ganti Token' : 'Tutup Token', aksi === 'tutup');
    lanjut.then(function (ya) {
      if (!ya) return;
      b.disabled = true; b.innerHTML = '<span class="putar"></span>' + (aksi === 'buka' ? 'Menyiapkan paket…' : 'Memproses…');
      panggil('aturToken', { id_sesi: P.pantau.id, aksi: aksi }, { timeout: 60000 }).then(function (r) {
        if (!r.ok) { toast(r.pesan, 'danger', 6000); renderToken(); return; }
        Object.assign(P.pantau.data.sesi, r.data.sesi);
        if (P.boot) P.boot.mode_ujian = true;
        renderPantau();
        toast(aksi === 'tutup' ? 'Token ditutup.' : 'Token aktif: ' + r.data.sesi.token, 'ok');
      });
    });
  }

  function hitungGolongan() {
    var d = P.pantau.data, n = { semua: d.peserta.length, belum: 0, aktif: 0, sinyal: 0, keluar: 0, selesai: 0 };
    d.peserta.forEach(function (x) { n[golongan(x, d)]++; });
    return n;
  }

  function renderRekap() {
    var n = hitungGolongan(), sar = P.pantau.saring;
    var tombol = function (k, label, ic) {
      return '<button type="button" class="s-' + k + '" data-saring="' + k + '" aria-pressed="' + (sar === k) + '"><span>' + (ic ? ikon(ic, 'ic-sm') : '<i class="titik-status"></i>') + label + '</span><b>' + n[k] + '</b></button>';
    };
    $('p-rekap').innerHTML = '<div class="rekap-kepala"><h3>Rekapitulasi Kehadiran &amp; Status</h3><span class="chip">Total ' + n.semua + ' siswa</span></div>' +
      '<div class="saring">' + tombol('belum', 'Belum login', 'user-x') + tombol('aktif', 'Aktif', '') + tombol('sinyal', 'Sinyal > 5 mnt', 'wifi-off') +
      tombol('keluar', 'Sering keluar', 'alert') + tombol('selesai', 'Selesai', 'check') + '</div>' +
      '<p class="hint">' + ikon('info', 'ic-sm') + 'Ketuk angka untuk menyaring. Merah berarti keluar halaman ' + P.pantau.data.batas_sering_keluar + ' kali atau lebih.</p>';
    $('p-rekap').onclick = function (e) {
      var b = e.target.closest('[data-saring]'); if (!b) return;
      var k = b.getAttribute('data-saring');
      P.pantau.saring = P.pantau.saring === k ? 'semua' : k;
      renderRekap(); renderMatriks();
    };
  }

  function renderMatriks() {
    var d = P.pantau.data; if (!d) return;
    var sar = P.pantau.saring, q = P.pantau.cari;
    var daftar = d.peserta.filter(function (x) {
      if (sar !== 'semua' && golongan(x, d) !== sar) return false;
      return !q || x.nama.toLowerCase().indexOf(q) > -1 || String(x.nis).indexOf(q) > -1;
    });
    $('p-judul-matriks').textContent = 'Peserta Ruang ' + d.sesi.ruang + ' (' + daftar.length + (sar !== 'semua' || q ? ' dari ' + d.peserta.length : '') + ')';
    $('p-matriks').innerHTML = daftar.length ? daftar.map(function (x) {
      var g = golongan(x, d), pct = x.n ? Math.round(x.j / x.n * 100) : 0;
      return '<button type="button" class="siswa st-' + g + '" data-p="' + esc(x.p) + '" aria-pressed="' + (P.pantau.pilih === x.p) + '">' +
        (x.tb ? '<span class="tambah">+' + x.tb + ' mnt</span>' : '') +
        '<span class="siswa-nama">' + esc(x.nama) + '</span><span class="siswa-nis">NIS ' + esc(x.nis) + '</span>' + pillSt(x, d) +
        '<span class="siswa-progres"><span class="siswa-progres-label"><span>Jawaban</span><b>' + x.j + '/' + x.n + '</b></span><span class="batang"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="siswa-kaki"><span class="' + (x.k >= d.batas_sering_keluar ? 'bahaya' : '') + '">Keluar: ' + x.k + '</span><span>' + (x.t ? jam(x.t) : '--') + '</span></span></button>';
    }).join('') : '<p class="detail-kosong">Tidak ada peserta yang cocok.</p>';
    $('p-matriks').onclick = function (e) {
      var b = e.target.closest('.siswa'); if (!b) return;
      P.pantau.pilih = b.getAttribute('data-p'); P.pantau.aksi = null;
      renderMatriks(); renderDetail(true);
    };
  }

  function bukaDetail() { if (window.matchMedia('(max-width: 1279px)').matches) { $('p-detail').classList.add('terbuka'); $('p-tirai').hidden = false; } }
  function tutupDetail() { $('p-detail').classList.remove('terbuka'); $('p-tirai').hidden = true; }

  function renderDetail(buka) {
    var d = P.pantau.data, el = $('p-detail');
    var x = d.peserta.filter(function (y) { return y.p === P.pantau.pilih; })[0];
    if (!x) { el.innerHTML = '<div class="detail-kosong">Pilih kartu peserta untuk melihat rincian dan tindakan.</div>'; return; }
    // Jangan menimpa isian alasan yang sedang diketik saat data disegarkan
    if (!buka && P.pantau.aksi && el.querySelector('textarea')) return;
    var aktif = x.s === 'aktif', sekarang = kini(d), aksi = P.pantau.aksi;
    var h = '<div class="detail-kepala"><h3>' + ikon('user', 'ic-sm') + 'Detail Peserta</h3><button type="button" class="input-aksi detail-tutup" data-tutup-detail aria-label="Tutup">' + ikon('x') + '</button></div>' +
      '<div class="detail-identitas"><b>' + esc(x.nama) + '</b><span>NIS ' + esc(x.nis) + ' · Kelas ' + esc(x.rombel || '-') + '</span></div>' +
      '<div class="detail-baris"><span>Status</span>' + pillSt(x, d) + '</div>' +
      '<div class="detail-baris"><span>Kemajuan</span><b>' + x.j + ' / ' + x.n + ' soal' + (x.n ? ' (' + Math.round(x.j / x.n * 100) + '%)' : '') + '</b></div>' +
      '<div class="detail-baris"><span>Keluar halaman</span><b style="' + (x.k >= d.batas_sering_keluar ? 'color:var(--danger)' : '') + '">' + x.k + ' kali</b></div>' +
      '<div class="detail-baris"><span>Sinyal terakhir</span><b>' + (x.t ? lalu(x.t, sekarang) : '-') + '</b></div>' +
      '<div class="detail-baris"><span>Mulai · batas waktu</span><b>' + (x.m ? jam(x.m) + ' · ' + jam(x.b) + (x.tb ? ' (+' + x.tb + ' mnt)' : '') : '-') + '</b></div>' +
      (x.kb ? '<div class="detail-baris"><span>Kode bukti</span><b class="mono">' + esc(x.kb) + '</b></div>' : '') +
      (x.reset ? '<p class="alert alert-info" style="margin-top:10px">' + ikon('info') + '<span>Login sudah direset. Siswa bisa masuk dari perangkat lain dengan token ruang.</span></p>' : '');
    h += '<div class="detail-aksi">' +
      '<button type="button" class="aksi-tombol" data-aksi="reset"' + (aktif ? '' : ' disabled') + '>' + ikon('refresh') + '<span><b>Reset Login</b><small>Pindah perangkat atau perangkat mati</small></span></button>' +
      '<div class="aksi-tombol" style="flex-direction:column;align-items:stretch' + (aktif ? '' : ';opacity:.5') + '"><span style="display:flex;gap:12px">' + ikon('timer-plus') + '<span><b>Tambah Waktu</b><small>Hanya untuk siswa ini</small></span></span>' +
      '<span class="pilih-menit">' + [5, 10, 15].map(function (m) { return '<button type="button" data-menit="' + m + '"' + (aktif ? '' : ' disabled') + ' aria-pressed="' + (aksi === 'tambah' && P.pantau.menit === m) + '">+' + m + '</button>'; }).join('') + '</span></div>' +
      '<button type="button" class="aksi-tombol bahaya" data-aksi="paksa"' + (aktif ? '' : ' disabled') + '>' + ikon('send') + '<span><b>Kumpulkan Paksa</b><small>Kunci jawaban yang sudah tersinkron</small></span></button></div>';
    if (aksi) {
      var label = { reset: 'Reset login ' + x.nama, tambah: 'Tambah waktu ' + P.pantau.menit + ' menit untuk ' + x.nama, paksa: 'Kumpulkan paksa jawaban ' + x.nama }[aksi];
      h += '<div class="konfirmasi-aksi"><h4>' + ikon('shield', 'ic-sm') + esc(label) + '</h4><label class="field" style="margin:0"><span class="label">Alasan tindakan *</span>' +
        '<textarea class="input" id="p-alasan" placeholder="Wajib diisi untuk berita acara, mis. Komputer PC-14 restart."></textarea></label>' +
        '<p class="hint">' + ikon('info', 'ic-sm') + 'Tercatat otomatis di log audit sekolah.</p>' +
        '<div class="baris-tombol"><button type="button" class="btn btn-secondary btn-sm" data-batal>Batal</button><button type="button" class="btn ' + (aksi === 'paksa' ? 'btn-danger' : 'btn-primary') + ' btn-sm" data-konfirmasi>Konfirmasi</button></div></div>';
    }
    el.innerHTML = h;
    if (aksi) setTimeout(function () { var t = $('p-alasan'); if (t) t.focus(); }, 30);
    el.onclick = function (e) {
      if (e.target.closest('[data-tutup-detail]')) { tutupDetail(); return; }
      var m = e.target.closest('[data-menit]');
      if (m) { P.pantau.aksi = 'tambah'; P.pantau.menit = Number(m.getAttribute('data-menit')); renderDetail(true); return; }
      var a = e.target.closest('[data-aksi]');
      if (a && !a.disabled) { P.pantau.aksi = a.getAttribute('data-aksi'); renderDetail(true); return; }
      if (e.target.closest('[data-batal]')) { P.pantau.aksi = null; renderDetail(true); return; }
      if (e.target.closest('[data-konfirmasi]')) jalankanTindakan(x);
    };
    if (buka) bukaDetail();
  }

  function jalankanTindakan(x) {
    var alasan = ($('p-alasan').value || '').trim();
    if (alasan.length < 5) { toast('Tulis alasan tindakan (minimal 5 huruf).', 'warn'); $('p-alasan').focus(); return; }
    var aksi = P.pantau.aksi, menit = P.pantau.menit;
    var cadangan = Object.assign({}, x);
    // Optimistic UI: tampilan langsung berubah, dibatalkan bila server menolak
    if (aksi === 'tambah') { x.b += menit * 60e3; x.tb += menit; }
    if (aksi === 'paksa') { x.s = 'dikumpulkan'; }
    if (aksi === 'reset') { x.reset = true; }
    P.pantau.aksi = null;
    renderMatriks(); renderDetail(true); renderRekap();
    panggil('tindakanPengawas', { id_sesi: P.pantau.id, id_peserta: x.p, aksi: aksi, menit: menit, alasan: alasan }).then(function (r) {
      if (!r.ok) {
        Object.assign(x, cadangan);
        renderMatriks(); renderDetail(true); renderRekap();
        toast(r.pesan || 'Tindakan gagal. Coba lagi.', 'danger', 6000);
        return;
      }
      Object.assign(x, { s: r.data.s, b: r.data.b, tb: r.data.tb, reset: r.data.reset, kb: r.data.kb });
      renderMatriks(); renderDetail(true); renderRekap();
      toast({ reset: 'Login ' + x.nama + ' direset.', tambah: 'Waktu ' + x.nama + ' ditambah ' + menit + ' menit.', paksa: 'Jawaban ' + x.nama + ' dikumpulkan.' }[aksi], 'ok');
    });
  }

  function renderBawah() {
    var s = P.pantau.data.sesi, n = hitungGolongan();
    var tBerita = '<button type="button" class="btn btn-secondary" id="btn-berita">' + ikon('file', 'ic-sm') + 'Berita Acara</button>';
    $('p-bawah').innerHTML = s.status === 'Ditutup' ? '<p>' + ikon('check-c', 'ic-sm') + ' Sesi sudah ditutup. Kehadiran tercatat otomatis.</p>' + tBerita :
      '<p>Pastikan semua peserta telah mengumpulkan sebelum menutup sesi.</p><div style="display:flex;gap:10px;flex-wrap:wrap">' + tBerita + '<button type="button" class="btn btn-danger-outline" id="btn-tutup-sesi"' + (s.status === 'Token aktif' ? '' : ' disabled') + '>' + ikon('door', 'ic-sm') + 'Tutup Sesi Ujian</button></div>';
    $('btn-berita').onclick = function () { if (PANEL.beritaAcara) PANEL.beritaAcara(P.pantau.id); };
    var b = $('btn-tutup-sesi');
    if (b) b.onclick = function () {
      var masih = n.aktif + n.sinyal + n.keluar;
      konfirmasi('Tutup sesi ujian?', '<div class="ringkas-tutup"><div><b>' + (n.semua - n.belum) + '</b><span>Hadir</span></div><div><b>' + masih + '</b><span>Masih mengerjakan</span></div><div><b>' + n.belum + '</b><span>Tidak hadir</span></div></div>' +
        (masih ? '<p class="alert alert-warn">' + ikon('alert') + '<span>Peserta yang masih mengerjakan tetap bisa menyelesaikan sampai waktunya habis.</span></p>' : '') +
        '<p>Token tidak berlaku lagi dan peserta yang belum login tercatat <b>Tidak hadir</b>.</p>', 'Tutup Sesi', true).then(function (ya) {
        if (!ya) return;
        b.disabled = true; b.innerHTML = '<span class="putar"></span>Menutup…';
        panggil('tutupSesi', { id_sesi: P.pantau.id }).then(function (r) {
          if (!r.ok) { toast(r.pesan, 'danger', 6000); renderBawah(); return; }
          toast('Sesi ditutup: ' + r.data.hadir + ' hadir, ' + r.data.tidak_hadir + ' tidak hadir.', 'ok', 6000);
          muatStatus(); segarkanBoot();
        });
      });
    };
  }

  // =========================================================================
  // Akun saya
  // =========================================================================
  function halamanAkun() {
    judul('Akun Saya');
    var pg = P.pengguna;
    $('konten').innerHTML = '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>' + esc(pg.nama) + '</h2><p>Username <b class="mono">' + esc(pg.username) + '</b> · Peran: ' +
      pg.peran.map(function (x) { return LABEL_PERAN[x]; }).join(', ') + '</p></div></div>' +
      '<form class="form-akun" id="a-form" novalidate><h3 style="font-size:16px;margin-bottom:14px">Ganti password</h3>' +
      '<label class="field"><span class="label">Password lama</span><input class="input" id="a-in-lama" type="password" autocomplete="current-password"></label>' +
      '<label class="field"><span class="label">Password baru</span><input class="input" id="a-in-baru" type="password" autocomplete="new-password"></label>' +
      '<label class="field"><span class="label">Ulangi password baru</span><input class="input" id="a-in-ulang" type="password" autocomplete="new-password"></label>' +
      '<ul class="aturan-sandi" id="a-aturan-sandi"><li data-aturan="panjang">Minimal 8 karakter</li><li data-aturan="user">Tidak sama dengan username</li><li data-aturan="lama">Berbeda dari password lama</li><li data-aturan="sama">Kedua isian sama</li></ul>' +
      '<div class="alert alert-danger" id="a-ganti-galat" hidden>' + ikon('alert') + '<span></span></div>' +
      '<button type="submit" class="btn btn-primary" id="a-btn-ganti" disabled>Simpan password</button>' +
      '<p class="hint" style="margin-top:14px">' + ikon('info', 'ic-sm') + 'Setelah diganti, sesi Anda di perangkat lain otomatis berakhir.</p></form></section>' +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Panduan singkat</h2><p>Kotak panduan di setiap halaman yang sudah Anda tutup bisa ditampilkan lagi.</p></div>' +
      '<button class="btn btn-secondary btn-sm" id="a-panduan">' + ikon('refresh', 'ic-sm') + 'Tampilkan lagi semua panduan</button></div></section>' +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Tentang aplikasi &amp; kecepatan</h2><p>Digital CBT · tampilan ' + esc(VERSI_TAMPILAN) + ' · server ' + esc(API.versiServer || '-') +
      '. Tabel di bawah mencatat lama setiap permintaan ke server di perangkat ini: <b>Total</b> dirasakan pengguna, <b>Server</b> adalah waktu kerja Apps Script; selisihnya waktu jaringan dan antrean Google.</p></div>' +
      '<button class="btn btn-secondary btn-sm" id="a-ukur">' + ikon('refresh', 'ic-sm') + 'Perbarui</button></div><div id="a-riwayat"></div></section>';
    function riwayat() {
      var r = API.riwayat || [];
      if (!r.length) { $('a-riwayat').innerHTML = '<div class="kosong-isi"><p>Belum ada catatan. Buka beberapa menu lalu kembali ke sini.</p></div>'; return; }
      var rata = function (k) { return r.reduce(function (a, x) { return a + x[k]; }, 0) / r.length / 1000; };
      $('a-riwayat').innerHTML = '<p style="padding:0 22px" class="kecil">Rata-rata ' + r.length + ' permintaan terakhir: total <b>' + rata('total').toFixed(1).replace('.', ',') + ' dtk</b>, di server <b>' + rata('server').toFixed(1).replace('.', ',') + ' dtk</b>.</p>' +
        '<div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>Waktu</th><th>Permintaan</th><th class="kanan">Total</th><th class="kanan">Server</th><th>Hasil</th></tr></thead><tbody>' +
        r.map(function (x) {
          return '<tr><td class="tnum">' + jam(x.t) + '</td><td class="mono kecil">' + esc(x.a) + '</td><td class="kanan tnum">' + (x.total / 1000).toFixed(1).replace('.', ',') + ' dtk</td><td class="kanan tnum">' +
            (x.server / 1000).toFixed(1).replace('.', ',') + ' dtk</td><td>' + (x.ok ? '<span class="pill pill-ok">Berhasil</span>' : '<span class="pill pill-warn">Gagal</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    riwayat();
    $('a-ukur').onclick = riwayat;
    $('a-panduan').onclick = function () {
      try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('cbt_panduan_') === 0) localStorage.removeItem(k); }); } catch (e) { /* abaikan */ }
      toast('Panduan akan tampil lagi di setiap halaman.', 'ok');
    };
    ['a-in-lama', 'a-in-baru', 'a-in-ulang'].forEach(function (id) { $(id).addEventListener('input', function () { cekAturan('a-'); }); });
    $('a-form').addEventListener('submit', function (e) { prosesGanti(e, 'a-'); });
  }

  // =========================================================================
  // Pemasangan
  // =========================================================================
  function pasangUmum() {
    $('form-masuk').addEventListener('submit', prosesMasuk);
    $('form-ganti').addEventListener('submit', function (e) { prosesGanti(e, ''); });
    ['in-lama', 'in-baru', 'in-ulang'].forEach(function (id) { $(id).addEventListener('input', function () { cekAturan(''); }); });
    $('btn-batal-ganti').addEventListener('click', function () { keluarLokal(''); });
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lihat]'); if (!b) return;
      var el = $(b.getAttribute('data-lihat')), lihat = el.type === 'password';
      el.type = lihat ? 'text' : 'password';
      b.innerHTML = ikon(lihat ? 'eye-off' : 'eye');
    });
    $('btn-keluar').addEventListener('click', function () {
      konfirmasi('Keluar dari panel?', '<p>Pastikan pekerjaan sudah tersimpan. Bila memakai komputer bersama, selalu tekan Keluar setelah selesai.</p>', 'Keluar').then(function (ya) {
        if (!ya) return;
        panggil('keluarStaf', {});
        keluarLokal('');
      });
    });
    $('pilih-peran').addEventListener('change', function () {
      P.peran = this.value; simpanSesi();
      location.hash = '#/beranda';
      masukPanel();
    });
    $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) tutupModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) tutupModal(); });
    ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { P.interaksi = Date.now(); }, { passive: true }); });
    window.addEventListener('hashchange', function () { if (P.token && !$('kerangka').hidden) rute(); });
    ['input', 'keydown', 'change'].forEach(function (ev) { $('konten').addEventListener(ev, function () { _sentuh = true; }, true); });
    $('konten').addEventListener('click', function (e) {
      if (!e.target.closest('.panduan-tutup')) { if (e.target.closest('button,a,input,select,textarea,label,[data-p]')) _sentuh = true; return; }
      var b = e.target.closest('.panduan-tutup'); if (!b) return;
      var a = b.closest('.panduan');
      try { localStorage.setItem('cbt_panduan_' + a.getAttribute('data-panduan'), '1'); } catch (er) { /* abaikan */ }
      a.remove();
    });
    document.addEventListener('visibilitychange', function () {
      // Kembali ke tab: segarkan segera bila data sudah lebih dari 30 detik
      if (document.visibilityState !== 'visible' || !P.token) return;
      if (P.pantau && P.pantau.diterima && Date.now() - P.pantau.diterima > 30000) muatStatus();
      else if (halaman() === 'beranda' && $('ringkasan-isi')) muatRingkasan();
    });
  }

  // =========================================================================
  // Antarmuka untuk modul halaman (m-soal.js, m-admin.js, m-nilai.js)
  // =========================================================================
  var _gambar = {}, _antreGambar = {}, _timerGambar = null;
  /** Muat gambar <img data-gid> di dalam elemen (gambar soal privat lewat server, di-cache di memori). */
  function muatGambar(el) {
    if (!el) return;
    el.querySelectorAll('img[data-gid]').forEach(function (img) {
      var id = img.getAttribute('data-gid');
      if (img.getAttribute('src')) return;
      if (_gambar[id]) { img.src = _gambar[id]; return; }
      img.classList.add('memuat');
      _antreGambar[id] = 1;
    });
    if (Object.keys(_antreGambar).length && !_timerGambar) _timerGambar = setTimeout(ambilAntre, 30);
  }
  function ambilAntre() {
    _timerGambar = null;
    var ids = Object.keys(_antreGambar).slice(0, 40);
    ids.forEach(function (k) { delete _antreGambar[k]; });
    if (!ids.length) return;
    panggil('ambilGambar', { ids: ids }).then(function (r) {
      if (!r.ok) return;
      Object.keys(r.data.gambar).forEach(function (k) { if (r.data.gambar[k]) _gambar[k] = r.data.gambar[k]; });
      (r.data.sisa || []).forEach(function (k) { _antreGambar[k] = 1; });
      document.querySelectorAll('img[data-gid]').forEach(function (img) {
        var g = _gambar[img.getAttribute('data-gid')];
        if (g && !img.getAttribute('src')) { img.src = g; img.classList.remove('memuat'); }
      });
      if (Object.keys(_antreGambar).length) _timerGambar = setTimeout(ambilAntre, 30);
    });
  }

  /** Data per halaman: tampil dulu dari memori/perangkat, lalu disegarkan diam-diam (SWR, PRD 7.4). */
  var _data = {};
  function muat(kunci, aksi, d, render, opsi) {
    opsi = opsi || {};
    var kp = 'cbt_d_' + P.pengguna.id + '_' + kunci;
    var ada = _data[kunci];
    if (HANYA_MEMORI[aksi]) opsi.simpan = false;
    if (!ada && opsi.simpan !== false) { try { ada = JSON.parse(localStorage.getItem(kp) || 'null'); } catch (e) { ada = null; } }
    if (ada) render(ada, true);
    if (ada && opsi.segar === false) return Promise.resolve(ada);
    return panggil(aksi, d || {}).then(function (r) {
      if (!r.ok) { if (!ada) render(null, false, r); else if (r.kode !== 'SESI_STAF') toast(r.pesan || 'Gagal memuat data.', 'warn'); return null; }
      var baru = JSON.stringify(r.data) !== JSON.stringify(ada);
      _data[kunci] = r.data;
      if (opsi.simpan !== false) { try { localStorage.setItem(kp, JSON.stringify(r.data)); } catch (e) { /* penuh: cukup di memori */ } }
      if (baru || !ada) render(r.data, false);
      return r.data;
    });
  }
  function lupakan(kunci) {
    Object.keys(_data).forEach(function (k) { if (k.indexOf(kunci) === 0) delete _data[k]; });
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('cbt_d_' + (P.pengguna ? P.pengguna.id : '') + '_' + kunci) === 0) localStorage.removeItem(k); }); } catch (e) { /* abaikan */ }
  }

  /** Tampilkan halaman cetak (kop sekolah dsb.) lalu buka dialog cetak browser. */
  function cetak(html, judulDok) {
    var w = $('area-cetak');
    w.innerHTML = html;
    var lama = document.title;
    if (judulDok) document.title = judulDok;
    var gambar = w.querySelectorAll('img');
    var tunggu = Array.prototype.map.call(gambar, function (im) { return im.complete ? Promise.resolve() : new Promise(function (ok) { im.onload = im.onerror = ok; }); });
    Promise.all(tunggu).then(function () {
      setTimeout(function () { window.print(); document.title = lama; }, 60);
    });
  }

  function tanggal(ms) { return ms ? new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'; }
  function tanggalJam(ms) { return ms ? tanggal(ms) + ' ' + jam(ms) : '-'; }
  function angka(n, d) { return n === null || n === undefined || isNaN(n) ? '-' : Number(n).toLocaleString('id-ID', { maximumFractionDigits: d === undefined ? 2 : d }); }

  window.PANEL = {
    get P() { return P; }, $: $, esc: esc, ikon: ikon, jam: jam, tanggal: tanggal, tanggalJam: tanggalJam, tanggalPanjang: tanggalPanjang, lalu: lalu, angka: angka, inisial: inisial,
    panggil: panggil, toast: toast, modal: modal, tutupModal: tutupModal, konfirmasi: konfirmasi, judul: judul, bannerMode: bannerMode,
    halaman: halaman, mulaiPoll: mulaiPoll, berhentiPoll: berhentiPoll, segarkanBoot: segarkanBoot, muat: muat, lupakan: lupakan,
    muatGambar: muatGambar, cetak: cetak, pillSesi: pillSesi, MODUL: MODUL, BERANDA: BERANDA, LABEL_PERAN: LABEL_PERAN,
    daftar: function (r, fn, opsi) { MODUL[r] = fn; if (opsi && opsi.tersembunyi) fn.tersembunyi = true; },
    konten: function () { return $('konten'); }, rute: function () { rute(); }
  };

  // Muat ulang otomatis saat rilis baru hanya bila sedang di layar masuk (tidak ada isian yang hilang)
  API.bolehMuatUlang = function () { return !$('layar-masuk').hidden && !$('in-user').value && !$('in-pass').value; };

  function mulai() {
    if (ujianBerjalan()) { location.replace('./ujian.html'); return; }
    pasangUmum();
    document.querySelectorAll('.pilih-peran [data-mode]').forEach(function (b) {
      b.addEventListener('click', function () { aturMode(b.getAttribute('data-mode')); $('in-user').focus(); });
    });
    API.pasangPWA($('btn-pasang'));
    API.infoSekolah(terapkanInfo);
    if (!API.siap()) $('masuk-konfig').hidden = false;
    var s = muatSesi();
    var flash = ''; try { flash = sessionStorage.getItem('cbt_pesan') || ''; sessionStorage.removeItem('cbt_pesan'); } catch (e) { /* abaikan */ }
    if (flash) { tampilLogin(flash, 'siswa'); return; }
    if (s && s.token && kedaluwarsa(s.token) > Date.now() && s.pengguna) {
      P.token = s.token; P.pengguna = s.pengguna; P.peran = s.peran || s.pengguna.peran[0];
      if (s.pengguna.harus_ganti) tampilGanti(); else masukPanel();
    } else {
      if (s) keluarLokal('Sesi berakhir karena lama tidak aktif. Silakan masuk lagi.');
      else tampilLogin();
    }
  }

  // Modul halaman dimuat setelah panel.js; mulai setelah semuanya siap.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mulai); else setTimeout(mulai, 0);
})();
