/* m-admin.js — Modul admin: Beranda (W-20 tambahan), Cek Kesiapan (W-21), Peserta (W-22), Guru & Data Sekolah (W-23),
 * Jadwal Ujian (W-24), Cetak Dokumen (W-25), Pengaturan (W-27), dan Berita Acara (W-29).
 */
(function () {
  'use strict';
  var PN = window.PANEL, $ = PN.$, esc = PN.esc, ikon = PN.ikon;
  var JENIS_UJIAN = ['Ulangan Harian', 'UTS', 'UAS', 'PTS', 'PAS', 'PAT', 'Susulan', 'Remedial', 'Lainnya'];
  var A = { ds: null, ujian: null, cari: '', rombel: '', status: 'aktif', hal: 0, pilih: {}, lihatSandi: false };
  var admin = function () { return PN.P.peran === 'admin'; };

  function muatSekolah(segar) {
    if (A.ds && !segar) return Promise.resolve(A.ds);
    return PN.panggil('dataSekolah', {}).then(function (r) { if (!r.ok) throw new Error(r.pesan); A.ds = r.data; return A.ds; });
  }
  function muatUjian(segar) {
    if (A.ujian && !segar) return Promise.resolve(A.ujian);
    return PN.panggil('daftarUjian', {}).then(function (r) { if (!r.ok) throw new Error(r.pesan); A.ujian = r.data; return A.ujian; });
  }
  function galatHalaman(e) { PN.konten().innerHTML = '<section class="kartu-blok"><div class="kosong-isi">' + ikon('alert') + '<p><b>' + esc(e.message || e) + '</b></p></div></section>'; }
  function tanggalInput(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function waktuInput(ms) { var d = new Date(ms); return tanggalInput(ms) + 'T' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function dariWaktuInput(v) { var t = new Date(v).getTime(); return isNaN(t) ? 0 : t; }
  function pillStatusUjian(s) {
    var k = { Draf: 'pill-idle', Terjadwal: 'pill-info', Siap: 'pill-ok', Berlangsung: 'pill-warn', Selesai: 'pill-done', Dikoreksi: 'pill-done', Terverifikasi: 'pill-ok', Dipublikasi: 'pill-ok' }[s] || 'pill-idle';
    return '<span class="pill ' + k + '">' + esc(s) + '</span>';
  }
  function kopSekolah(s) {
    return '<div class="kop">' + (/^https:\/\//.test(s.logo || '') ? '<img src="' + esc(s.logo) + '" alt="">' : '') + '<div><h1>' + esc(s.nama || 'Nama Sekolah') + '</h1>' +
      '<p>' + esc([s.alamat, s.kabupaten, s.provinsi].filter(Boolean).join(', ')) + (s.npsn ? ' · NPSN ' + esc(s.npsn) : '') + '</p><p>Tahun Pelajaran ' + esc(s.tahun || '') + ' · Semester ' + esc(s.semester || '') + '</p></div></div>';
  }

  // =========================================================================
  // Beranda admin: langkah awal, ujian mendatang, masa sanggah (W-20, W-19 ringkas)
  // =========================================================================
  PN.BERANDA.admin = function () {
    var d = (PN.P.boot && PN.P.boot.data) || {}, L = d.langkah || {};
    var langkah = [
      ['identitas', L.identitas, 'Isi identitas sekolah', '#/pengaturan'],
      ['mapel', L.mapel && L.rombel && L.ruang, 'Tambahkan mapel, rombel, dan ruang', '#/staf/mapel'],
      ['guru', L.guru, 'Impor guru beserta mapel & rombel yang diampu', '#/staf'],
      ['peserta', L.peserta, 'Impor peserta dari Excel Dapodik', '#/peserta'],
      ['paket', L.paket_kunci, 'Guru mengunggah soal dan mengunci paket', '#/beranda'],
      ['ujian', L.ujian, 'Buat jadwal ujian, cetak kartu, jalankan Cek Kesiapan', '#/jadwal']
    ];
    var belum = langkah.filter(function (x) { return !x[1]; }).length;
    var h = '';
    if (belum) {
      h += '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Langkah awal</h2><p>' + (langkah.length - belum) + ' dari ' + langkah.length + ' langkah selesai</p></div></div><ol class="langkah-awal">' +
        langkah.map(function (x) {
          return '<li class="' + (x[1] ? 'selesai' : '') + '"><span class="tanda">' + (x[1] ? ikon('check') : '') + '</span><span>' + esc(x[2]) + '</span>' +
            (x[1] ? '' : '<a class="btn btn-secondary btn-sm" href="' + x[3] + '">Buka</a>') + '</li>';
        }).join('') + '</ol></section>';
    }
    if ((d.sanggah_segera || []).length) {
      h += '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Rekaman Jawaban segera dihapus</h2><p>Masa sanggah berakhir dalam 3 hari. Perpanjang bila sanggahan belum selesai.</p></div></div><div class="tugas">' +
        d.sanggah_segera.map(function (u) {
          return '<div class="tugas-item"><div><h3>' + esc(u.nama) + '</h3><p>Dihapus ' + PN.tanggalJam(u.sg) + '</p></div><button class="btn btn-secondary" data-perpanjang="' + esc(u.id) + '">Perpanjang 7 hari</button></div>';
        }).join('') + '</div></section>';
    }
    if ((d.ujian_mendatang || []).length) {
      h += '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Ujian mendatang</h2><p>Jalankan Cek Kesiapan sebelum hari ujian.</p></div><a class="btn btn-secondary btn-sm" href="#/jadwal">Semua jadwal</a></div><div class="tugas">' +
        d.ujian_mendatang.map(function (u) {
          return '<div class="tugas-item"><div><h3>' + esc(u.nama) + ' ' + pillStatusUjian(u.st) + '</h3><p>' + PN.tanggal(u.t) + '</p></div><a class="btn btn-primary" href="#/kesiapan/' + encodeURIComponent(u.id) + '">' + ikon('shield', 'ic-sm') + 'Cek Kesiapan</a></div>';
        }).join('') + '</div></section>';
    }
    return h;
  };
  PN.BERANDA.admin_pasang = function () {
    PN.konten().querySelectorAll('[data-perpanjang]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        PN.panggil('perpanjangSanggah', { id_ujian: b.getAttribute('data-perpanjang'), hari: 7 }).then(function (r) {
          if (!r.ok) { b.disabled = false; PN.toast(r.pesan, 'danger'); return; }
          PN.toast('Masa sanggah diperpanjang sampai ' + PN.tanggalJam(r.data.sanggah_sampai) + '.', 'ok'); PN.segarkanBoot();
        });
      };
    });
  };

  // =========================================================================
  // W-22 Peserta
  // =========================================================================
  function halamanPeserta() {
    PN.judul('Peserta');
    PN.konten().innerHTML = PN.bannerMode() + '<div class="kepala-bagian"><div><h2>Peserta didik</h2><p>Akun siswa dibuat otomatis saat impor: username dari NIS, password 6 karakter untuk kartu ujian.</p></div>' +
      '<div class="baris-aksi"><button class="btn btn-secondary" id="ps-tambah">' + ikon('plus', 'ic-sm') + 'Tambah</button><button class="btn btn-primary" id="ps-impor">' + ikon('upload', 'ic-sm') + 'Impor Excel Dapodik</button></div></div>' +
      '<section class="kartu-blok"><div class="bilah-saring"><label class="cari">' + ikon('search', 'ic-sm') + '<input class="input" id="ps-cari" placeholder="Cari nama, NIS, NISN, username…" value="' + esc(A.cari) + '"></label>' +
      '<select class="input" id="ps-rombel"><option value="">Semua rombel</option></select>' +
      '<select class="input" id="ps-status"><option value="aktif">Aktif</option><option value="nonaktif">Nonaktif</option><option value="">Semua</option></select>' +
      '<label class="sakelar"><input type="checkbox" id="ps-lihat"' + (A.lihatSandi ? ' checked' : '') + '><i></i><span class="kecil">Tampilkan password</span></label></div>' +
      '<div id="ps-massal" class="bilah-saring" hidden></div><div id="ps-tabel"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    $('ps-status').value = A.status;
    var t = null;
    $('ps-cari').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { A.cari = v.trim().toLowerCase(); A.hal = 0; renderPeserta(); }, 300); };
    $('ps-rombel').onchange = function () { A.rombel = this.value; A.hal = 0; renderPeserta(); };
    $('ps-status').onchange = function () { A.status = this.value; A.hal = 0; renderPeserta(); };
    $('ps-lihat').onchange = function () { A.lihatSandi = this.checked; renderPeserta(); };
    $('ps-impor').onclick = imporPeserta;
    $('ps-tambah').onclick = function () { ubahPeserta(null); };
    muatSekolah(true).then(function (ds) {
      $('ps-rombel').innerHTML = '<option value="">Semua rombel</option>' + ds.master.rombel.map(function (r) { return '<option' + (A.rombel === r.nama ? ' selected' : '') + '>' + esc(r.nama) + '</option>'; }).join('');
      renderPeserta();
    }, galatHalaman);
  }

  function saringPeserta() {
    return (A.ds ? A.ds.peserta : []).filter(function (p) {
      return (!A.rombel || p.rombel === A.rombel) && (!A.status || p.status === A.status) &&
        (!A.cari || (p.nama + ' ' + p.nis + ' ' + p.nisn + ' ' + p.username).toLowerCase().indexOf(A.cari) > -1);
    }).sort(function (a, b) { return a.rombel.localeCompare(b.rombel) || a.nama.localeCompare(b.nama); });
  }

  function renderPeserta() {
    var el = $('ps-tabel'); if (!el || !A.ds) return;
    var d = saringPeserta(), per = 50, hal = Math.min(A.hal, Math.max(0, Math.ceil(d.length / per) - 1));
    if (!d.length) { el.innerHTML = '<div class="kosong-isi">' + ikon('users') + '<p><b>' + (A.ds.peserta.length ? 'Tidak ada peserta yang cocok.' : 'Belum ada peserta.') + '</b></p><p>Impor dari file Excel ekspor Dapodik.</p></div>'; renderMassalPeserta(); return; }
    el.innerHTML = '<div class="tabel-gulir"><table class="tabel tabel-ringkas tabel-responsif"><thead><tr><th><input type="checkbox" class="kotak-cek" id="ps-semua" aria-label="Pilih semua"></th><th>Nama</th><th>Rombel</th><th>Username</th><th>Password kartu</th><th>Status</th><th></th></tr></thead><tbody>' +
      d.slice(hal * per, hal * per + per).map(function (p) {
        return '<tr class="' + (A.pilih[p.id] ? 'pilih' : '') + '"><td><input type="checkbox" class="kotak-cek" data-cek="' + esc(p.id) + '"' + (A.pilih[p.id] ? ' checked' : '') + ' aria-label="Pilih ' + esc(p.nama) + '"></td>' +
          '<td class="utama-sel"><b>' + esc(p.nama) + '</b><span class="sub">NIS ' + esc(p.nis || '-') + ' · NISN ' + esc(p.nisn || '-') + ' · ' + esc(p.jk || '-') + '</span></td>' +
          '<td data-l="Rombel">' + esc(p.rombel) + '</td><td data-l="Username" class="mono">' + esc(p.username) + '</td>' +
          '<td data-l="Password" class="mono">' + (A.lihatSandi ? esc(p.password || '') : '••••••') + '</td>' +
          '<td>' + (p.status === 'nonaktif' ? '<span class="pill pill-idle">Nonaktif</span>' : '<span class="pill pill-ok">Aktif</span>') + '</td>' +
          '<td class="aksi"><button class="btn btn-secondary btn-sm" data-ubah="' + esc(p.id) + '">' + ikon('edit', 'ic-sm') + 'Ubah</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="halaman-nav"><span>' + d.length + ' peserta · halaman ' + (hal + 1) + ' dari ' + Math.ceil(d.length / per) + '</span><span class="baris-aksi">' +
      '<button class="btn btn-secondary btn-sm" data-hal="' + (hal - 1) + '"' + (hal ? '' : ' disabled') + '>Sebelumnya</button><button class="btn btn-secondary btn-sm" data-hal="' + (hal + 1) + '"' + ((hal + 1) * per < d.length ? '' : ' disabled') + '>Berikutnya</button></span></div>';
    el.onclick = function (e) {
      var h = e.target.closest('[data-hal]'); if (h) { A.hal = Number(h.getAttribute('data-hal')); renderPeserta(); return; }
      var u = e.target.closest('[data-ubah]'); if (u) ubahPeserta(A.ds.peserta.filter(function (x) { return x.id === u.getAttribute('data-ubah'); })[0]);
    };
    el.onchange = function (e) {
      if (e.target.id === 'ps-semua') { d.slice(hal * per, hal * per + per).forEach(function (p) { if (e.target.checked) A.pilih[p.id] = 1; else delete A.pilih[p.id]; }); renderPeserta(); return; }
      var c = e.target.closest('[data-cek]'); if (!c) return;
      if (c.checked) A.pilih[c.getAttribute('data-cek')] = 1; else delete A.pilih[c.getAttribute('data-cek')];
      c.closest('tr').classList.toggle('pilih', c.checked); renderMassalPeserta();
    };
    renderMassalPeserta();
  }

  function renderMassalPeserta() {
    var el = $('ps-massal'); if (!el) return;
    var ids = Object.keys(A.pilih);
    el.hidden = !ids.length;
    el.innerHTML = '<b>' + ids.length + ' dipilih</b><span class="spasi"></span><button class="btn btn-secondary btn-sm" data-m="kartu">' + ikon('printer', 'ic-sm') + 'Cetak kartu</button>' +
      '<button class="btn btn-secondary btn-sm" data-m="reset">' + ikon('key', 'ic-sm') + 'Reset password</button><button class="btn btn-secondary btn-sm" data-m="nonaktif">Nonaktifkan</button>' +
      '<button class="btn btn-secondary btn-sm" data-m="aktif">Aktifkan</button><button class="btn btn-ghost btn-sm" data-m="batal">Batal</button>';
    el.onclick = function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return;
      var m = b.getAttribute('data-m'), daftar = A.ds.peserta.filter(function (p) { return A.pilih[p.id]; });
      if (m === 'batal') { A.pilih = {}; renderPeserta(); return; }
      if (m === 'kartu') { cetakKartu(daftar.map(function (p) { return { nama: p.nama, nis: p.nis, nisn: p.nisn, rombel: p.rombel, username: p.username, password: p.password }; })); return; }
      if (m === 'reset') {
        PN.konfirmasi('Reset password ' + ids.length + ' siswa?', '<p>Password kartu lama tidak berlaku lagi. Cetak ulang kartu siswa tersebut setelah ini.</p>', 'Reset password', true).then(function (ya) {
          if (!ya) return;
          PN.panggil('resetSandiPeserta', { ids: ids }).then(function (r) {
            if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
            A.ds.peserta.forEach(function (p) { if (r.data.password[p.id]) p.password = r.data.password[p.id]; });
            PN.toast('Password ' + ids.length + ' siswa direset. Cetak ulang kartunya.', 'ok', 6000); renderPeserta();
          });
        });
        return;
      }
      PN.panggil('simpanPeserta', { baris: ids.map(function (id) { return { id: id, status: m }; }) }).then(function (r) {
        if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
        A.ds.peserta.forEach(function (p) { if (A.pilih[p.id]) p.status = m; });
        A.pilih = {}; PN.toast(ids.length + ' peserta di' + (m === 'aktif' ? 'aktifkan.' : 'nonaktifkan.'), 'ok'); renderPeserta();
      });
    };
  }

  function ubahPeserta(p) {
    var rombel = A.ds.master.rombel;
    PN.modal('<div class="modal-kepala"><h2>' + (p ? 'Ubah peserta' : 'Tambah peserta') + '</h2></div><form class="modal-isi" id="up-form"><div class="grid-form">' +
      '<label class="field lebar-penuh"><span class="label">Nama</span><input class="input" name="nama" required value="' + esc(p ? p.nama : '') + '"></label>' +
      '<label class="field"><span class="label">NIS</span><input class="input" name="nis" value="' + esc(p ? p.nis : '') + '"></label>' +
      '<label class="field"><span class="label">NISN</span><input class="input" name="nisn" inputmode="numeric" value="' + esc(p ? p.nisn : '') + '"></label>' +
      '<label class="field"><span class="label">Jenis kelamin</span><select class="input" name="jk"><option value="">-</option><option' + (p && p.jk === 'L' ? ' selected' : '') + '>L</option><option' + (p && p.jk === 'P' ? ' selected' : '') + '>P</option></select></label>' +
      '<label class="field"><span class="label">Rombel</span><input class="input" name="rombel" list="up-rombel" value="' + esc(p ? p.rombel : A.rombel) + '"><datalist id="up-rombel">' + rombel.map(function (r) { return '<option value="' + esc(r.nama) + '">'; }).join('') + '</datalist></label>' +
      (p ? '<label class="field"><span class="label">Username</span><input class="input mono" name="username" value="' + esc(p.username) + '"></label>' : '') +
      '</div>' + (p ? '<p class="kecil muted">Password kartu: <b class="mono">' + esc(p.password || '') + '</b> · ganti lewat Reset password.</p>' : '') + '</form>' +
      '<div class="modal-kaki">' + (p ? '<button class="btn btn-ghost" data-buka="' + esc(p.username) + '">Buka kunci login</button>' : '') + '<button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>Simpan</button></div>');
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      var bk = e.target.closest('[data-buka]');
      if (bk) { PN.panggil('bukaKunci', { jenis: 's', username: bk.getAttribute('data-buka') }).then(function (r) { PN.toast(r.ok ? 'Kunci login dibuka.' : r.pesan, r.ok ? 'ok' : 'danger'); }); return; }
      if (!e.target.closest('[data-ok]')) return;
      var f = new FormData($('up-form')), o = { id: p ? p.id : '' };
      f.forEach(function (v, k) { o[k] = String(v).trim(); });
      if (!o.nama) { PN.toast('Nama wajib diisi.', 'warn'); return; }
      PN.panggil('simpanPeserta', { baris: [o] }).then(function (r) {
        if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
        PN.tutupModal();
        if (r.data.baru.length) PN.toast('Peserta ditambahkan: ' + r.data.baru[0].username + ' / ' + r.data.baru[0].password, 'ok', 8000); else PN.toast('Data peserta diperbarui.', 'ok');
        muatSekolah(true).then(renderPeserta);
      });
    };
  }

  /** Impor Excel Dapodik (F-31): baris judul dicari otomatis, kolom dicocokkan dengan nama, data ganda ditandai. */
  function imporPeserta() {
    PN.modal('<div class="modal-kepala"><h2>Impor peserta dari Excel Dapodik</h2><p>Unduh daftar peserta didik dari Dapodik (Excel), lalu pilih filenya di sini. Kolom yang dibaca: Nama, NIPD/NIS, NISN, JK, Rombel.</p></div>' +
      '<div class="modal-isi"><label class="zona-unggah" id="ip-zona">' + ikon('upload') + '<b>Pilih file .xlsx atau .csv</b><span class="muted">File .xls lama: buka di Excel lalu Simpan Sebagai .xlsx</span><input type="file" id="ip-file" hidden accept=".xlsx,.csv"></label><div id="ip-hasil" style="margin-top:14px"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok disabled>Impor</button></div>', 'penuh');
    var baris = null;
    $('ip-file').onchange = function () {
      var f = this.files[0]; if (!f) return;
      $('ip-hasil').innerHTML = '<div class="kerangka-muat"></div>';
      API.muatSkrip('./js/xlsx.js').then(function () { return XLSX.baca(f); }).then(function (sh) {
        var v = sh[0].baris, hi = -1, c = {};
        for (var i = 0; i < Math.min(v.length, 20); i++) {
          if (XLSX.cariKolom(v[i], ['Nama', 'Nama Peserta Didik', 'Nama Siswa']) > -1 && (XLSX.cariKolom(v[i], ['NISN']) > -1 || XLSX.cariKolom(v[i], ['NIPD', 'NIS']) > -1)) { hi = i; break; }
        }
        if (hi < 0) throw new Error('Baris judul kolom (Nama, NISN/NIPD) tidak ditemukan di 20 baris pertama.');
        var h = v[hi];
        c.nama = XLSX.cariKolom(h, ['Nama', 'Nama Peserta Didik', 'Nama Siswa']); c.nisn = XLSX.cariKolom(h, ['NISN']);
        c.nis = XLSX.cariKolom(h, ['NIPD', 'NIS', 'No Induk', 'Nomor Induk']); c.jk = XLSX.cariKolom(h, ['JK', 'L/P', 'Jenis Kelamin']);
        c.rombel = XLSX.cariKolom(h, ['Rombel', 'Rombel Saat Ini', 'Rombongan Belajar', 'Kelas']);
        baris = v.slice(hi + 1).filter(function (r) { return String(r[c.nama] || '').trim(); }).map(function (r) {
          var jk = String(r[c.jk] || '').trim().toUpperCase();
          return { nama: String(r[c.nama]).trim(), nisn: c.nisn > -1 ? String(r[c.nisn] || '').replace(/\D/g, '') : '', nis: c.nis > -1 ? String(r[c.nis] || '').trim() : '',
            jk: /^L|LAKI/.test(jk) ? 'L' : /^P|PEREMPUAN/.test(jk) ? 'P' : '', rombel: c.rombel > -1 ? String(r[c.rombel] || '').trim() : '' };
        });
        if (!baris.length) throw new Error('Tidak ada baris peserta.');
        var ada = {}; A.ds.peserta.forEach(function (p) { if (p.nisn) ada['n' + p.nisn] = 1; if (p.nis) ada['s' + p.nis] = 1; });
        var dilihat = {}, ganda = 0, lama = 0, tanpaNisn = 0, tanpaRombel = 0;
        baris.forEach(function (b) {
          var k = b.nisn || b.nis || b.nama + '|' + b.rombel;
          if (dilihat[k]) { b.ganda = true; ganda++; } dilihat[k] = 1;
          if ((b.nisn && ada['n' + b.nisn]) || (b.nis && ada['s' + b.nis])) { b.lama = true; lama++; }
          if (!b.nisn) tanpaNisn++; if (!b.rombel) tanpaRombel++;
        });
        $('ip-hasil').innerHTML = '<div class="ringkas-impor"><div><b>' + baris.length + '</b><span>baris terbaca</span></div><div><b>' + (baris.length - lama - ganda) + '</b><span>peserta baru</span></div>' +
          '<div><b>' + lama + '</b><span>sudah ada (diperbarui)</span></div><div class="' + (ganda ? 'kuning' : '') + '"><b>' + ganda + '</b><span>ganda di file (dilewati)</span></div>' +
          '<div class="' + (tanpaNisn ? 'kuning' : '') + '"><b>' + tanpaNisn + '</b><span>tanpa NISN</span></div></div>' +
          (tanpaRombel ? '<label class="field"><span class="label">' + tanpaRombel + ' baris tanpa rombel. Isi rombelnya:</span><input class="input" id="ip-rombel" placeholder="mis. VIII A"></label>' : '') +
          '<div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>Nama</th><th>NIS</th><th>NISN</th><th>JK</th><th>Rombel</th><th></th></tr></thead><tbody>' +
          baris.slice(0, 60).map(function (b) { return '<tr><td>' + esc(b.nama) + '</td><td class="mono">' + esc(b.nis) + '</td><td class="mono">' + esc(b.nisn) + '</td><td>' + esc(b.jk) + '</td><td>' + esc(b.rombel) + '</td><td>' + (b.ganda ? '<span class="pill pill-warn">ganda</span>' : b.lama ? '<span class="pill pill-info">diperbarui</span>' : '<span class="pill pill-ok">baru</span>') + '</td></tr>'; }).join('') +
          '</tbody></table></div>' + (baris.length > 60 ? '<p class="kecil muted">… dan ' + (baris.length - 60) + ' baris lain.</p>' : '');
        $('modal-isi').querySelector('[data-ok]').disabled = false;
        $('modal-isi').querySelector('[data-ok]').textContent = 'Impor ' + (baris.length - ganda) + ' peserta';
      }).catch(function (e) { $('ip-hasil').innerHTML = '<div class="alert alert-danger">' + ikon('alert') + '<span>' + esc(e.message) + '</span></div>'; });
    };
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      var ok = e.target.closest('[data-ok]'); if (!ok || !baris) return;
      var isiRombel = $('ip-rombel') ? $('ip-rombel').value.trim() : '';
      if ($('ip-rombel') && !isiRombel) { PN.toast('Isi rombel untuk baris yang belum punya rombel.', 'warn'); return; }
      ok.disabled = true; ok.innerHTML = '<span class="putar"></span>Mengimpor…';
      PN.panggil('imporPeserta', { baris: baris.filter(function (b) { return !b.ganda; }).map(function (b) { return { nama: b.nama, nis: b.nis, nisn: b.nisn, jk: b.jk, rombel: b.rombel || isiRombel }; }) }, { timeout: 120000 }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = 'Impor'; PN.toast(r.pesan, 'danger', 7000); return; }
        PN.tutupModal();
        PN.toast(r.data.baru + ' peserta baru, ' + r.data.diperbarui + ' diperbarui' + (r.data.rombel_baru ? ', ' + r.data.rombel_baru + ' rombel baru' : '') + '.', 'ok', 7000);
        PN.segarkanBoot();
        muatSekolah(true).then(function () { halamanPeserta(); });
      });
    };
  }

  /** Kartu ujian siap cetak: 2 kolom, berisi username & password (F-21). */
  function cetakKartu(daftar, rombel) {
    var s = (A.ds && A.ds._sekolah) || null;
    var jalan = s ? Promise.resolve(s) : PN.panggil('dokumen', { jenis: 'kartu', rombel: ['__tidak_ada__'] }).then(function (r) { if (!r.ok) throw new Error(r.pesan); return r.data.sekolah; });
    jalan.then(function (sek) {
      if (A.ds) A.ds._sekolah = sek;
      var per = 8, hal = [];
      for (var i = 0; i < daftar.length; i += per) hal.push(daftar.slice(i, i + per));
      var html = hal.map(function (g) {
        return '<div class="halaman"><div class="kartu-grid">' + g.map(function (p) {
          return '<div class="kartu"><h3>KARTU PESERTA UJIAN<br>' + esc(sek.nama || '') + '</h3><table class="tanpa-garis"><tr><td>Nama</td><td>: <b>' + esc(p.nama) + '</b></td></tr>' +
            '<tr><td>NIS / NISN</td><td>: ' + esc(p.nis || '-') + ' / ' + esc(p.nisn || '-') + '</td></tr><tr><td>Rombel</td><td>: ' + esc(p.rombel) + '</td></tr>' +
            '<tr><td>Username</td><td>: <span class="akun">' + esc(p.username) + '</span></td></tr><tr><td>Password</td><td>: <span class="akun">' + esc(p.password) + '</span></td></tr></table>' +
            '<p style="font-size:8.5pt;margin:2mm 0 0">Tahun Pelajaran ' + esc(sek.tahun || '') + '. Simpan kartu ini: dipakai untuk semua ujian dan melihat nilai. Token ruang dibacakan pengawas.</p></div>';
        }).join('') + '</div></div>';
      }).join('');
      PN.cetak(html, 'Kartu Ujian');
      if (rombel && rombel.length) PN.panggil('tandaiKartu', { rombel: rombel });
    }).catch(function (e) { PN.toast(e.message, 'danger'); });
  }

  // =========================================================================
  // W-23 Guru & data sekolah (tab: pengguna, rombel, mapel, ruang, pengampu)
  // =========================================================================
  function halamanStaf(bagian) {
    var tab = bagian[0] || 'pengguna';
    PN.judul('Guru & Data Sekolah');
    var tabs = [['pengguna', 'Guru & Staf'], ['pengampu', 'Pengampu'], ['rombel', 'Rombel'], ['mapel', 'Mapel'], ['ruang', 'Ruang']];
    PN.konten().innerHTML = PN.bannerMode() + '<nav class="tab-bar">' + tabs.map(function (t) { return '<a href="#/staf/' + t[0] + '" class="' + (tab === t[0] ? 'aktif' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav><div id="st-isi"><div class="kerangka-muat"></div></div>';
    muatSekolah(true).then(function () {
      if (tab === 'pengguna') tabPengguna();
      else if (tab === 'pengampu') tabPengampu();
      else tabMaster(tab);
    }, galatHalaman);
  }

  function tabPengguna() {
    var ds = A.ds, el = $('st-isi');
    var label = PN.LABEL_PERAN;
    el.innerHTML = '<div class="kepala-bagian"><div><h2>Akun guru, kepala sekolah, dan admin</h2><p>Password sementara tampil sekali dan wajib diganti saat login pertama. Peran pengawas ditetapkan per sesi di Jadwal.</p></div>' +
      '<div class="baris-aksi"><button class="btn btn-secondary" id="pg-template">' + ikon('download', 'ic-sm') + 'Template guru</button><button class="btn btn-secondary" id="pg-tambah">' + ikon('plus', 'ic-sm') + 'Tambah akun</button>' +
      '<button class="btn btn-primary" id="pg-impor">' + ikon('upload', 'ic-sm') + 'Impor guru</button></div></div>' +
      '<section class="kartu-blok"><table class="tabel tabel-ringkas tabel-responsif"><thead><tr><th>Nama</th><th>Username</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th></th></tr></thead><tbody>' +
      ds.pengguna.sort(function (a, b) { return a.nama.localeCompare(b.nama); }).map(function (u) {
        return '<tr><td class="utama-sel"><b>' + esc(u.nama) + '</b><span class="sub">' + (u.nip ? 'NIP ' + esc(u.nip) : '') + '</span></td><td data-l="Username" class="mono">' + esc(u.username) + '</td>' +
          '<td data-l="Peran">' + u.peran.map(function (p) { return '<span class="chip">' + esc(label[p] || p) + '</span>'; }).join(' ') + '</td>' +
          '<td>' + (u.status === 'nonaktif' ? '<span class="pill pill-idle">Nonaktif</span>' : u.terkunci ? '<span class="pill pill-danger">' + ikon('lock') + 'Terkunci</span>' : u.harus_ganti ? '<span class="pill pill-warn">Belum ganti password</span>' : '<span class="pill pill-ok">Aktif</span>') + '</td>' +
          '<td data-l="Login">' + (u.login_terakhir ? PN.tanggalJam(u.login_terakhir) : '-') + '</td>' +
          '<td class="aksi"><button class="btn btn-secondary btn-sm" data-ubah="' + esc(u.id) + '">Ubah</button> <button class="btn btn-secondary btn-sm" data-reset="' + esc(u.id) + '">Reset password</button>' +
          (u.terkunci ? ' <button class="btn btn-ghost btn-sm" data-buka="' + esc(u.username) + '">Buka kunci</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    $('pg-tambah').onclick = function () { ubahPengguna(null); };
    $('pg-impor').onclick = imporGuru;
    $('pg-template').onclick = function () {
      API.muatSkrip('./js/xlsx.js').then(function () {
        return XLSX.tulis([{ nama: 'Guru', lebar: [32, 22, 18, 16, 24], baris: [['Nama', 'NIP', 'Peran', 'Mapel', 'Rombel'],
          ['Rina Susanti, S.Pd.', '198001012005012001', 'Guru', 'IPS', 'VIII A, VIII B'], ['Budi Hartono', '', 'Guru', 'MTK', 'VII A'], ['Nama Kepala Sekolah', '', 'Kepala sekolah', '', '']] },
          { nama: 'Petunjuk', kepala: false, lebar: [110], baris: [['Peran: Guru, Kepala sekolah, atau Admin (boleh lebih dari satu, pisahkan koma).'], ['Mapel diisi KODE mapel (lihat tab Mapel). Rombel diisi nama rombel, boleh lebih dari satu dipisah koma.'],
            ['Guru yang mengampu mapel berbeda di rombel berbeda ditulis dalam beberapa baris.'], ['Username diusulkan dari nama; password sementara tampil sekali setelah impor.']] }]);
      }).then(function (b) { API.unduh(b, 'Template_Guru_DigitalCBT.xlsx'); });
    };
    el.querySelector('table').onclick = function (e) {
      var b = e.target.closest('[data-ubah],[data-reset],[data-buka]'); if (!b) return;
      if (b.hasAttribute('data-ubah')) { ubahPengguna(ds.pengguna.filter(function (u) { return u.id === b.getAttribute('data-ubah'); })[0]); return; }
      if (b.hasAttribute('data-buka')) { PN.panggil('bukaKunci', { jenis: 't', username: b.getAttribute('data-buka') }).then(function (r) { PN.toast(r.ok ? 'Kunci login dibuka.' : r.pesan, r.ok ? 'ok' : 'danger'); if (r.ok) muatSekolah(true).then(tabPengguna); }); return; }
      var u = ds.pengguna.filter(function (x) { return x.id === b.getAttribute('data-reset'); })[0];
      PN.konfirmasi('Reset password ' + u.nama + '?', '<p>Password sementara baru dibuat dan semua sesi login akun ini berakhir.</p>', 'Reset password', true).then(function (ya) {
        if (!ya) return;
        PN.panggil('resetSandiStaf', { id: u.id }).then(function (r) { if (!r.ok) { PN.toast(r.pesan, 'danger'); return; } tampilAkunBaru([{ nama: u.nama, username: r.data.username, sandi: r.data.sandi }]); });
      });
    };
  }

  function tampilAkunBaru(akun) {
    var teks = akun.map(function (a) { return a.nama + '\t' + a.username + '\t' + a.sandi; }).join('\n');
    PN.modal('<div class="modal-kepala"><h2>Password sementara</h2><p>Hanya tampil sekali. Serahkan kepada pemilik akun; wajib diganti saat login pertama.</p></div><div class="modal-isi"><table class="tabel tabel-ringkas"><thead><tr><th>Nama</th><th>Username</th><th>Password sementara</th></tr></thead><tbody>' +
      akun.map(function (a) { return '<tr><td>' + esc(a.nama) + '</td><td class="mono">' + esc(a.username) + '</td><td class="mono"><b>' + esc(a.sandi) + '</b></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-salin>' + ikon('copy', 'ic-sm') + 'Salin</button><button class="btn btn-secondary" data-cetak>' + ikon('printer', 'ic-sm') + 'Cetak</button><button class="btn btn-primary" data-tutup>Selesai</button></div>', 'lebar');
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-salin]') && navigator.clipboard) navigator.clipboard.writeText(teks).then(function () { PN.toast('Disalin.', 'ok'); });
      if (e.target.closest('[data-cetak]')) PN.cetak('<div class="halaman"><h2>Akun Panel Staf Digital CBT</h2><table><thead><tr><th>Nama</th><th>Username</th><th>Password sementara</th></tr></thead><tbody>' +
        akun.map(function (a) { return '<tr><td>' + esc(a.nama) + '</td><td>' + esc(a.username) + '</td><td><b>' + esc(a.sandi) + '</b></td></tr>'; }).join('') + '</tbody></table><p>Password wajib diganti saat login pertama.</p></div>', 'Akun staf');
      if (e.target.closest('[data-tutup]')) { PN.tutupModal(); muatSekolah(true).then(tabPengguna); }
    };
  }

  function ubahPengguna(u) {
    var peran = u ? u.peran : ['guru'];
    PN.modal('<div class="modal-kepala"><h2>' + (u ? 'Ubah akun' : 'Tambah akun') + '</h2></div><form class="modal-isi" id="pg-form"><div class="grid-form">' +
      '<label class="field lebar-penuh"><span class="label">Nama lengkap</span><input class="input" name="nama" value="' + esc(u ? u.nama : '') + '"></label>' +
      '<label class="field"><span class="label">NIP</span><input class="input" name="nip" value="' + esc(u ? u.nip : '') + '"></label>' +
      '<label class="field"><span class="label">Username</span><input class="input mono" name="username" value="' + esc(u ? u.username : '') + '" placeholder="otomatis dari nama"></label>' +
      '<div class="field lebar-penuh"><span class="label">Peran</span><div class="baris-aksi">' + ['guru', 'kepsek', 'admin'].map(function (p) { return '<label class="sakelar"><input type="checkbox" name="peran" value="' + p + '"' + (peran.indexOf(p) > -1 ? ' checked' : '') + '><i></i>' + PN.LABEL_PERAN[p] + '</label>'; }).join('') + '</div></div>' +
      (u ? '<label class="field"><span class="label">Status</span><select class="input" name="status"><option value="aktif">Aktif</option><option value="nonaktif"' + (u.status === 'nonaktif' ? ' selected' : '') + '>Nonaktif</option></select></label>' : '') +
      '</div></form><div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>Simpan</button></div>');
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      if (!e.target.closest('[data-ok]')) return;
      var f = $('pg-form'), d = { id: u ? u.id : '', nama: f.nama.value.trim(), nip: f.nip.value.trim(), username: f.username.value.trim(),
        peran: Array.prototype.filter.call(f.querySelectorAll('[name="peran"]'), function (x) { return x.checked; }).map(function (x) { return x.value; }), status: f.status ? f.status.value : 'aktif' };
      PN.panggil('simpanPengguna', d).then(function (r) {
        if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
        PN.tutupModal();
        if (r.data.sandi) tampilAkunBaru([{ nama: d.nama, username: r.data.username, sandi: r.data.sandi }]);
        else { PN.toast('Akun diperbarui.', 'ok'); muatSekolah(true).then(tabPengguna); }
      });
    };
  }

  function imporGuru() {
    PN.modal('<div class="modal-kepala"><h2>Impor guru &amp; pengampu</h2><p>Kolom: Nama, NIP, Peran, Mapel (kode), Rombel. Mapel dan rombel harus sudah ada di tab Mapel dan Rombel.</p></div>' +
      '<div class="modal-isi"><label class="zona-unggah">' + ikon('upload') + '<b>Pilih file .xlsx atau .csv</b><input type="file" id="ig-file" hidden accept=".xlsx,.csv"></label><div id="ig-hasil" style="margin-top:14px"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok disabled>Impor</button></div>', 'lebar');
    var baris = null;
    $('ig-file').onchange = function () {
      var f = this.files[0]; if (!f) return;
      API.muatSkrip('./js/xlsx.js').then(function () { return XLSX.baca(f); }).then(function (sh) {
        var v = sh[0].baris, h = v[0] || [];
        var c = { nama: XLSX.cariKolom(h, ['Nama']), nip: XLSX.cariKolom(h, ['NIP']), peran: XLSX.cariKolom(h, ['Peran']), mapel: XLSX.cariKolom(h, ['Mapel', 'Kode Mapel']), rombel: XLSX.cariKolom(h, ['Rombel', 'Kelas']) };
        if (c.nama < 0) throw new Error('Kolom Nama tidak ditemukan. Gunakan template guru.');
        baris = v.slice(1).filter(function (r) { return String(r[c.nama] || '').trim(); }).map(function (r) {
          var g = function (k) { return c[k] > -1 ? String(r[c[k]] || '').trim() : ''; };
          return { nama: g('nama'), nip: g('nip'), peran: g('peran') || 'Guru', mapel: g('mapel'), rombel: g('rombel') };
        });
        $('ig-hasil').innerHTML = '<p><b>' + baris.length + '</b> baris terbaca.</p><div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>Nama</th><th>Peran</th><th>Mapel</th><th>Rombel</th></tr></thead><tbody>' +
          baris.slice(0, 40).map(function (b) { return '<tr><td>' + esc(b.nama) + '</td><td>' + esc(b.peran) + '</td><td>' + esc(b.mapel) + '</td><td>' + esc(b.rombel) + '</td></tr>'; }).join('') + '</tbody></table></div>';
        $('modal-isi').querySelector('[data-ok]').disabled = !baris.length;
      }).catch(function (e) { $('ig-hasil').innerHTML = '<div class="alert alert-danger">' + ikon('alert') + '<span>' + esc(e.message) + '</span></div>'; });
    };
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      var ok = e.target.closest('[data-ok]'); if (!ok || !baris) return;
      ok.disabled = true; ok.innerHTML = '<span class="putar"></span>Mengimpor…';
      PN.panggil('imporGuru', { baris: baris }, { timeout: 120000 }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = 'Impor'; PN.toast(r.pesan, 'danger', 7000); return; }
        if (r.data.peringatan.length) PN.toast(r.data.peringatan.length + ' peringatan: ' + r.data.peringatan[0], 'warn', 9000);
        PN.segarkanBoot();
        if (r.data.akun.length) tampilAkunBaru(r.data.akun);
        else { PN.tutupModal(); PN.toast(r.data.diperbarui + ' akun diperbarui, ' + r.data.pengampu_baru + ' pengampu baru.', 'ok'); muatSekolah(true).then(tabPengguna); }
      });
    };
  }

  var KOLOM_MASTER = {
    rombel: { tabel: 'Rombel', judul: 'Rombel', kolom: [['nama', 'Nama rombel', 'text'], ['tingkat', 'Tingkat', 'number'], ['wali_kelas', 'Wali kelas', 'text']] },
    mapel: { tabel: 'Mapel', judul: 'Mata pelajaran', kolom: [['kode', 'Kode', 'text'], ['nama', 'Nama mapel', 'text'], ['kelompok', 'Kelompok', 'text'], ['batas_tuntas', 'Batas tuntas', 'number']] },
    ruang: { tabel: 'Ruang', judul: 'Ruang ujian', kolom: [['nama', 'Nama ruang', 'text'], ['kapasitas', 'Kapasitas', 'number'], ['jenis_perangkat', 'Perangkat', 'select:lab=Lab komputer,hp=HP siswa']] }
  };
  function tabMaster(tab) {
    var K = KOLOM_MASTER[tab]; if (!K) return tabPengguna();
    var rows = JSON.parse(JSON.stringify(A.ds.master[tab])), hapus = [];
    var el = $('st-isi');
    function render() {
      el.innerHTML = '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>' + K.judul + '</h2><p>' + rows.length + ' baris' + (tab === 'mapel' ? ' · batas tuntas dipakai rekap ketuntasan dan usulan remedial' : '') + '</p></div>' +
        '<div class="baris-aksi"><button class="btn btn-secondary" data-tambah>' + ikon('plus', 'ic-sm') + 'Tambah baris</button><button class="btn btn-primary" data-simpan>Simpan perubahan</button></div></div>' +
        '<div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr>' + K.kolom.map(function (k) { return '<th>' + k[1] + '</th>'; }).join('') + '<th></th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          return '<tr>' + K.kolom.map(function (k) {
            if (/^select:/.test(k[2])) return '<td><select class="input" data-i="' + i + '" data-k="' + k[0] + '">' + k[2].slice(7).split(',').map(function (o) { var p = o.split('='); return '<option value="' + p[0] + '"' + (r[k[0]] === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></td>';
            return '<td><input class="input" type="' + k[2] + '" data-i="' + i + '" data-k="' + k[0] + '" value="' + esc(r[k[0]] === undefined ? '' : r[k[0]]) + '"></td>';
          }).join('') + '<td class="aksi"><button class="tombol-ikon bahaya" data-hapus="' + i + '" aria-label="Hapus baris">' + ikon('trash', 'ic-sm') + '</button></td></tr>';
        }).join('') + '</tbody></table></div></section>';
    }
    render();
    el.oninput = el.onchange = function (e) { var x = e.target; if (x.hasAttribute('data-i')) { rows[Number(x.getAttribute('data-i'))][x.getAttribute('data-k')] = x.value; rows[Number(x.getAttribute('data-i'))]._ubah = 1; } };
    el.onclick = function (e) {
      if (e.target.closest('[data-tambah]')) { var o = { _ubah: 1 }; K.kolom.forEach(function (k) { o[k[0]] = k[0] === 'jenis_perangkat' ? 'lab' : ''; }); rows.push(o); render(); return; }
      var h = e.target.closest('[data-hapus]');
      if (h) { var r = rows.splice(Number(h.getAttribute('data-hapus')), 1)[0]; if (r.id) hapus.push(r.id); render(); return; }
      var s = e.target.closest('[data-simpan]');
      if (s) {
        s.disabled = true;
        PN.panggil('simpanMaster', { tabel: K.tabel, baris: rows.filter(function (r) { return r._ubah; }), hapus: hapus }).then(function (r) {
          s.disabled = false;
          if (!r.ok) { PN.toast(r.pesan, 'danger', 6000); return; }
          A.ds.master = r.data.master; PN.toast('Tersimpan.', 'ok'); PN.segarkanBoot();
          rows = JSON.parse(JSON.stringify(A.ds.master[tab])); hapus = []; render();
        });
      }
    };
  }

  function tabPengampu() {
    var m = A.ds.master, el = $('st-isi');
    var guru = A.ds.pengguna.filter(function (u) { return u.peran.indexOf('guru') > -1 && u.status !== 'nonaktif'; }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
    var nm = {}; m.mapel.forEach(function (x) { nm[x.id] = x.nama; });
    var nr = {}; m.rombel.forEach(function (x) { nr[x.id] = x.nama; });
    var per = {};
    m.pengampu.forEach(function (p) { (per[p.id_guru] = per[p.id_guru] || []).push(p); });
    el.innerHTML = '<section class="kartu-blok" style="padding:18px 20px"><h2 style="font-size:17px;margin-bottom:12px">Tambah pengampu</h2><div class="grid-form">' +
      '<label class="field"><span class="label">Guru</span><select class="input" id="pa-guru">' + guru.map(function (g) { return '<option value="' + esc(g.id) + '">' + esc(g.nama) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="label">Mapel</span><select class="input" id="pa-mapel">' + m.mapel.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.nama) + '</option>'; }).join('') + '</select></label></div>' +
      '<p class="label">Rombel</p><div class="pilih-grid">' + m.rombel.map(function (r) { return '<label class="pilih-kartu"><input type="checkbox" class="kotak-cek" value="' + esc(r.id) + '" data-rb>' + esc(r.nama) + '</label>'; }).join('') + '</div>' +
      '<div class="baris-aksi kanan" style="margin-top:14px"><button class="btn btn-primary" id="pa-tambah">' + ikon('plus', 'ic-sm') + 'Tambahkan</button></div></section>' +
      '<section class="kartu-blok"><table class="tabel tabel-ringkas"><thead><tr><th>Guru</th><th>Mapel &amp; rombel yang diampu</th></tr></thead><tbody>' +
      guru.map(function (g) {
        return '<tr><td><b>' + esc(g.nama) + '</b></td><td>' + ((per[g.id] || []).map(function (p) {
          return '<span class="chip" style="margin:2px">' + esc(nm[p.id_mapel] || p.id_mapel) + ' · ' + esc(nr[p.id_rombel] || p.id_rombel) +
            ' <button class="tombol-ikon" style="width:22px;height:22px;border:0" data-hapus="' + esc([p.id_guru, p.id_mapel, p.id_rombel].join('|')) + '" aria-label="Hapus">' + ikon('x', 'ic-sm') + '</button></span>';
        }).join('') || '<span class="muted kecil">Belum ada</span>') + '</td></tr>';
      }).join('') + '</tbody></table></section>';
    var simpan = function (d) {
      return PN.panggil('simpanMaster', d).then(function (r) {
        if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
        A.ds.master = r.data.master; PN.segarkanBoot(); tabPengampu();
      });
    };
    $('pa-tambah').onclick = function () {
      var rb = Array.prototype.filter.call(el.querySelectorAll('[data-rb]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (!rb.length) { PN.toast('Pilih minimal satu rombel.', 'warn'); return; }
      simpan({ tabel: 'Pengampu', baris: rb.map(function (r) { return { id_guru: $('pa-guru').value, id_mapel: $('pa-mapel').value, id_rombel: r }; }) });
    };
    el.querySelector('tbody').onclick = function (e) { var h = e.target.closest('[data-hapus]'); if (h) simpan({ tabel: 'Pengampu', baris: [], hapus: [h.getAttribute('data-hapus')] }); };
  }

  // =========================================================================
  // W-24 Jadwal ujian
  // =========================================================================
  function halamanJadwal(bagian) {
    if (bagian[0] && admin()) return editorJadwal(bagian[0] === 'baru' ? null : bagian[0]);
    PN.judul('Jadwal Ujian');
    PN.konten().innerHTML = PN.bannerMode() + '<div class="kepala-bagian"><div><h2>Jadwal ujian</h2><p>Ujian → sesi → ruang → peserta. File Rekaman Jawaban setiap sesi dibuat saat jadwal disimpan.</p></div>' +
      (admin() ? '<a class="btn btn-primary" href="#/jadwal/baru">' + ikon('plus', 'ic-sm') + 'Buat jadwal</a>' : '') + '</div><section class="kartu-blok"><div id="jd-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    PN.muat('ujian', 'daftarUjian', {}, function (d, c, g) {
      var el = $('jd-daftar'); if (!el) return;
      if (!d) { el.innerHTML = '<div class="kosong-isi"><p>' + esc(g ? g.pesan : 'Gagal memuat.') + '</p></div>'; return; }
      A.ujian = d;
      if (!d.ujian.length) { el.innerHTML = '<div class="kosong-isi">' + ikon('calendar') + '<p><b>Belum ada jadwal ujian.</b></p></div>'; return; }
      el.innerHTML = '<div class="kartu-ujian-list">' + d.ujian.map(function (u) {
        var n = u.sesi.reduce(function (a, s) { return a + s.jumlah; }, 0), buka = u.sesi.some(function (s) { return s.status !== 'Belum dibuka'; });
        return '<div class="kartu-ujian"><div><h3>' + esc(u.nama) + ' ' + pillStatusUjian(u.status) + '</h3><p>' + esc(u.jenis) + ' · ' + esc(u.mapel || '-') + ' · paket ' + esc(u.nama_paket || '-') + (u.paket_dikunci ? '' : ' <span class="pill pill-warn">belum dikunci</span>') + '</p>' +
          '<p>' + PN.tanggal(u.tanggal) + ' · ' + u.durasi + ' menit · ' + u.sesi.length + ' sesi · ' + n + ' peserta' + (u.sesi.some(function (s) { return !s.pengawas_id; }) ? ' · <span style="color:var(--warn)">ada sesi tanpa pengawas</span>' : '') + '</p></div>' +
          (admin() ? '<div class="baris-aksi"><a class="btn btn-secondary btn-sm" href="#/jadwal/' + encodeURIComponent(u.id) + '">' + ikon('edit', 'ic-sm') + (buka ? 'Pengawas' : 'Ubah') + '</a>' +
            (['Draf', 'Terjadwal', 'Siap'].indexOf(u.status) > -1 ? '<a class="btn btn-primary btn-sm" href="#/kesiapan/' + encodeURIComponent(u.id) + '">' + ikon('shield', 'ic-sm') + 'Cek Kesiapan</a>' : '') +
            (!buka ? '<button class="tombol-ikon bahaya" data-hapus="' + esc(u.id) + '" aria-label="Hapus jadwal">' + ikon('trash', 'ic-sm') + '</button>' : '') + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      el.onclick = function (e) {
        var h = e.target.closest('[data-hapus]'); if (!h) return;
        PN.konfirmasi('Hapus jadwal ujian?', '<p>Sesi, pembagian peserta, dan file Rekaman Jawaban (masih kosong) ikut dihapus.</p>', 'Hapus', true).then(function (ya) {
          if (!ya) return;
          PN.panggil('hapusUjian', { id: h.getAttribute('data-hapus') }).then(function (r) { if (!r.ok) { PN.toast(r.pesan, 'danger'); return; } PN.toast('Jadwal dihapus.', 'ok'); PN.lupakan('ujian'); A.ujian = null; halamanJadwal([]); PN.segarkanBoot(); });
        });
      };
    }, { simpan: false });
  }

  function editorJadwal(id) {
    PN.judul(id ? 'Ubah Jadwal' : 'Buat Jadwal', 'Jadwal Ujian');
    PN.konten().innerHTML = '<p><a class="btn btn-ghost btn-sm" href="#/jadwal">' + ikon('arrow-l', 'ic-sm') + 'Kembali</a></p><div id="je-isi"><div class="kerangka-muat"></div></div>';
    Promise.all([muatSekolah(), muatUjian(true)]).then(function () {
      var ds = A.ds, U = A.ujian;
      var lama = id ? U.ujian.filter(function (u) { return u.id === id; })[0] : null;
      if (id && !lama) throw new Error('Ujian tidak ditemukan.');
      var aktif = ds.peserta.filter(function (p) { return p.status !== 'nonaktif'; });
      var pesertaPeta = {}; ds.peserta.forEach(function (p) { pesertaPeta[p.id] = p; });
      var J = lama ? { id: lama.id, nama: lama.nama, jenis: lama.jenis, id_paket: lama.id_paket, durasi_menit: lama.durasi, id_ujian_induk: lama.induk } :
        { id: '', nama: '', jenis: 'PAS', id_paket: '', durasi_menit: 90, id_ujian_induk: '' };
      var sesi = lama ? lama.sesi.map(function (s) { return { id: s.id, id_ruang: s.id_ruang, mulai: s.mulai, selesai: s.selesai, pengawas_id: s.pengawas_id, id_paket: s.id_paket, peserta: (s.peserta || []).slice(), status: s.status }; }) : [];
      var rombelN = {}; aktif.forEach(function (p) { rombelN[p.rombel] = (rombelN[p.rombel] || 0) + 1; });
      var besok = new Date(); besok.setDate(besok.getDate() + 1); besok.setHours(7, 30, 0, 0);
      var el = $('je-isi');
      el.innerHTML = '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:14px">1. Ujian</h2><div class="grid-form">' +
        '<label class="field lebar-penuh"><span class="label">Nama ujian</span><input class="input" id="je-nama" value="' + esc(J.nama) + '" placeholder="PAS Ganjil IPS VIII"></label>' +
        '<label class="field"><span class="label">Jenis</span><select class="input" id="je-jenis">' + JENIS_UJIAN.map(function (j) { return '<option' + (J.jenis === j ? ' selected' : '') + '>' + j + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="label">Paket soal</span><select class="input" id="je-paket"><option value="">Pilih paket…</option>' + U.paket.map(function (p) { return '<option value="' + esc(p.id) + '"' + (J.id_paket === p.id ? ' selected' : '') + '>' + esc(p.nama) + ' (' + p.jumlah_soal + ' soal' + (p.status === 'Dikunci' ? '' : ', DRAF') + ')</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="label">Durasi (menit)</span><input class="input" type="number" min="5" max="300" id="je-durasi" value="' + J.durasi_menit + '"></label>' +
        '<label class="field" id="je-induk-f"><span class="label">Ujian induk</span><select class="input" id="je-induk"><option value="">-</option>' + U.ujian.filter(function (u) { return u.id !== J.id && ['Susulan', 'Remedial'].indexOf(u.jenis) < 0; }).map(function (u) { return '<option value="' + esc(u.id) + '"' + (J.id_ujian_induk === u.id ? ' selected' : '') + '>' + esc(u.nama) + '</option>'; }).join('') + '</select></label>' +
        '</div></section>' +
        '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:6px">2. Peserta, ruang, dan waktu</h2><p class="muted kecil" style="margin:0 0 14px">Pilih rombel (atau usulan susulan/remedial) dan ruang, lalu tekan <b>Bagi otomatis</b>. Hasilnya bisa diubah sebelum disimpan.</p>' +
        '<div id="je-pilih-peserta"></div>' +
        '<p class="label" style="margin-top:14px">Ruang</p><div class="pilih-grid">' + ds.master.ruang.map(function (r) { return '<label class="pilih-kartu"><input type="checkbox" class="kotak-cek" value="' + esc(r.id) + '" data-ruang><span>' + esc(r.nama) + '<small>' + r.kapasitas + ' kursi · ' + (r.jenis_perangkat === 'hp' ? 'HP siswa' : 'lab') + '</small></span></label>'; }).join('') + '</div>' +
        '<div class="grid-form" style="margin-top:14px"><label class="field"><span class="label">Mulai gelombang pertama</span><input class="input" type="datetime-local" id="je-mulai" value="' + waktuInput(sesi[0] ? sesi[0].mulai : besok.getTime()) + '"></label>' +
        '<label class="field"><span class="label">Jeda antargelombang (menit)</span><input class="input" type="number" min="0" max="240" id="je-jeda" value="15"></label>' +
        '<label class="field"><span class="label">Kelonggaran jam selesai (menit)</span><input class="input" type="number" min="0" max="120" id="je-longgar" value="15"></label></div>' +
        '<button class="btn btn-secondary" id="je-bagi">' + ikon('users', 'ic-sm') + 'Bagi otomatis</button></section>' +
        '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>3. Sesi</h2><p id="je-ringkas"></p></div></div><div id="je-sesi"></div></section>' +
        '<div class="bilah-simpan"><span class="teks" id="je-status"></span><button class="btn btn-primary" id="je-simpan">' + ikon('check', 'ic-sm') + 'Simpan jadwal</button></div>';
      var pilihan = {}; // id peserta → true (mode susulan/remedial)
      function renderPilihPeserta() {
        var jenis = $('je-jenis').value, khusus = jenis === 'Susulan' || jenis === 'Remedial';
        $('je-induk-f').style.display = khusus ? '' : 'none';
        var w = $('je-pilih-peserta');
        if (!khusus) {
          w.innerHTML = '<p class="label">Rombel</p><div class="pilih-grid">' + Object.keys(rombelN).sort().map(function (r) { return '<label class="pilih-kartu"><input type="checkbox" class="kotak-cek" value="' + esc(r) + '" data-rombel><span>' + esc(r) + '<small>' + rombelN[r] + ' peserta</small></span></label>'; }).join('') + '</div>';
          return;
        }
        w.innerHTML = '<div class="baris-aksi"><button class="btn btn-secondary btn-sm" id="je-usul">' + ikon('list', 'ic-sm') + 'Usulkan peserta ' + jenis.toLowerCase() + '</button><span class="kecil muted">' + Object.keys(pilihan).length + ' peserta dipilih</span></div><div id="je-usulan" style="margin-top:10px"></div>';
        $('je-usul').onclick = function () {
          var ind = $('je-induk').value;
          if (!ind) { PN.toast('Pilih ujian induk terlebih dahulu.', 'warn'); return; }
          PN.panggil('usulPeserta', { id_induk: ind, jenis: jenis }).then(function (r) {
            if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
            r.data.usulan.forEach(function (x) { pilihan[x.id] = true; });
            $('je-usulan').innerHTML = r.data.usulan.length ? '<table class="tabel tabel-ringkas"><thead><tr><th></th><th>Nama</th><th>Rombel</th><th>Alasan</th></tr></thead><tbody>' +
              r.data.usulan.map(function (x) { return '<tr><td><input type="checkbox" class="kotak-cek" checked data-usul="' + esc(x.id) + '"></td><td>' + esc(x.nama) + '</td><td>' + esc(x.rombel) + '</td><td>' + esc(x.alasan) + '</td></tr>'; }).join('') + '</tbody></table>' :
              '<p class="muted">Tidak ada usulan peserta.</p>';
            w.querySelector('.kecil').textContent = Object.keys(pilihan).length + ' peserta dipilih';
          });
        };
        w.onchange = function (e) { var c = e.target.closest('[data-usul]'); if (!c) return; if (c.checked) pilihan[c.getAttribute('data-usul')] = true; else delete pilihan[c.getAttribute('data-usul')]; w.querySelector('.kecil').textContent = Object.keys(pilihan).length + ' peserta dipilih'; };
      }
      function renderSesi() {
        var ruang = {}; ds.master.ruang.forEach(function (r) { ruang[r.id] = r; });
        var pg = U.pengawas || [];
        var total = sesi.reduce(function (a, s) { return a + s.peserta.length; }, 0);
        $('je-ringkas').textContent = sesi.length + ' sesi · ' + total + ' peserta';
        $('je-sesi').innerHTML = sesi.length ? '<div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>Ruang</th><th>Mulai</th><th>Selesai</th><th>Pengawas</th><th>Peserta</th><th></th></tr></thead><tbody>' +
          sesi.map(function (s, i) {
            var kunci = s.status && s.status !== 'Belum dibuka';
            var rb = {}; s.peserta.forEach(function (p) { var r = (pesertaPeta[p] || {}).rombel || '?'; rb[r] = (rb[r] || 0) + 1; });
            var lewat = ruang[s.id_ruang] && s.peserta.length > ruang[s.id_ruang].kapasitas;
            return '<tr><td><select class="input" data-s="' + i + '" data-k="id_ruang"' + (kunci ? ' disabled' : '') + '>' + ds.master.ruang.map(function (r) { return '<option value="' + esc(r.id) + '"' + (s.id_ruang === r.id ? ' selected' : '') + '>' + esc(r.nama) + '</option>'; }).join('') + '</select></td>' +
              '<td><input class="input" type="datetime-local" data-s="' + i + '" data-k="mulai" value="' + waktuInput(s.mulai) + '"' + (kunci ? ' disabled' : '') + '></td>' +
              '<td><input class="input" type="datetime-local" data-s="' + i + '" data-k="selesai" value="' + waktuInput(s.selesai) + '"' + (kunci ? ' disabled' : '') + '></td>' +
              '<td><select class="input" data-s="' + i + '" data-k="pengawas_id"><option value="">Belum ditugaskan</option>' + pg.map(function (g) { return '<option value="' + esc(g.id) + '"' + (s.pengawas_id === g.id ? ' selected' : '') + '>' + esc(g.nama) + '</option>'; }).join('') + '</select></td>' +
              '<td><b' + (lewat ? ' style="color:var(--danger)"' : '') + '>' + s.peserta.length + '</b><span class="sub kecil muted">' + Object.keys(rb).sort().map(function (k) { return esc(k) + ' ' + rb[k]; }).join(', ') + '</span>' + (kunci ? '<span class="pill pill-warn">' + esc(s.status) + '</span>' : '') + '</td>' +
              '<td class="aksi">' + (kunci ? '' : '<button class="tombol-ikon bahaya" data-hapus-sesi="' + i + '" aria-label="Hapus sesi">' + ikon('trash', 'ic-sm') + '</button>') + '</td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="kosong-isi"><p>Belum ada sesi. Pilih peserta dan ruang, lalu tekan Bagi otomatis.</p></div>';
      }
      $('je-jenis').onchange = renderPilihPeserta;
      renderPilihPeserta(); renderSesi();
      if (lama) lama.sesi.forEach(function (s) { var c = el.querySelector('[data-ruang][value="' + s.id_ruang + '"]'); if (c) c.checked = true; });
      $('je-bagi').onclick = function () {
        var jenis = $('je-jenis').value, khusus = jenis === 'Susulan' || jenis === 'Remedial';
        var dipilih;
        if (khusus) dipilih = aktif.filter(function (p) { return pilihan[p.id]; });
        else {
          var rb = Array.prototype.filter.call(el.querySelectorAll('[data-rombel]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
          dipilih = aktif.filter(function (p) { return rb.indexOf(p.rombel) > -1; });
        }
        var ruang = Array.prototype.filter.call(el.querySelectorAll('[data-ruang]'), function (x) { return x.checked; }).map(function (x) { return ds.master.ruang.filter(function (r) { return r.id === x.value; })[0]; });
        if (!dipilih.length) { PN.toast('Pilih rombel atau peserta terlebih dahulu.', 'warn'); return; }
        if (!ruang.length) { PN.toast('Pilih minimal satu ruang.', 'warn'); return; }
        var terkunci = sesi.filter(function (s) { return s.status && s.status !== 'Belum dibuka'; });
        if (terkunci.length) { PN.toast('Sesi yang sudah dibuka tidak bisa dibagi ulang.', 'warn'); return; }
        dipilih.sort(function (a, b) { return a.rombel.localeCompare(b.rombel) || a.nama.localeCompare(b.nama); });
        var durasi = Number($('je-durasi').value) || 90, jeda = Number($('je-jeda').value) || 0, longgar = Number($('je-longgar').value) || 0;
        var mulai = dariWaktuInput($('je-mulai').value);
        if (!mulai) { PN.toast('Isi waktu mulai.', 'warn'); return; }
        var kap = ruang.reduce(function (a, r) { return a + r.kapasitas; }, 0), gel = Math.ceil(dipilih.length / kap), k = 0;
        var lamaId = sesi.map(function (s) { return s.id; }).filter(Boolean);
        sesi = [];
        for (var g = 0; g < gel; g++) {
          var m0 = mulai + g * (durasi + jeda) * 60e3;
          ruang.forEach(function (r) {
            var ambil = dipilih.slice(k, k + r.kapasitas); k += ambil.length;
            if (ambil.length) sesi.push({ id: lamaId.shift() || '', id_ruang: r.id, mulai: m0, selesai: m0 + (durasi + longgar) * 60e3, pengawas_id: '', peserta: ambil.map(function (p) { return p.id; }) });
          });
        }
        renderSesi();
        PN.toast(dipilih.length + ' peserta dibagi ke ' + sesi.length + ' sesi (' + gel + ' gelombang).', 'ok');
      };
      $('je-sesi').onchange = function (e) {
        var x = e.target; if (!x.hasAttribute('data-s')) return;
        var s = sesi[Number(x.getAttribute('data-s'))], k = x.getAttribute('data-k');
        s[k] = k === 'mulai' || k === 'selesai' ? dariWaktuInput(x.value) : x.value;
        if (k === 'id_ruang') renderSesi();
      };
      $('je-sesi').onclick = function (e) { var h = e.target.closest('[data-hapus-sesi]'); if (h) { sesi.splice(Number(h.getAttribute('data-hapus-sesi')), 1); renderSesi(); } };
      $('je-simpan').onclick = function () {
        var d = { ujian: { id: J.id, nama: $('je-nama').value.trim(), jenis: $('je-jenis').value, id_paket: $('je-paket').value, durasi_menit: Number($('je-durasi').value), id_ujian_induk: $('je-induk').value },
          sesi: sesi.map(function (s) { return { id: s.id, id_ruang: s.id_ruang, mulai: s.mulai, selesai: s.selesai, pengawas_id: s.pengawas_id, id_paket: s.id_paket || '', peserta: s.peserta }; }) };
        if (!d.ujian.nama) { PN.toast('Isi nama ujian.', 'warn'); return; }
        if (!d.ujian.id_paket) { PN.toast('Pilih paket soal.', 'warn'); return; }
        var b = $('je-simpan'); b.disabled = true; b.innerHTML = '<span class="putar"></span>Menyimpan & membuat file Rekaman…';
        PN.panggil('simpanUjian', d, { timeout: 300000 }).then(function (r) {
          b.disabled = false; b.innerHTML = ikon('check', 'ic-sm') + 'Simpan jadwal';
          if (!r.ok) { PN.toast(r.pesan, 'danger', 8000); return; }
          PN.toast('Jadwal tersimpan: ' + r.data.sesi + ' sesi, ' + r.data.file_baru + ' file Rekaman dibuat.', 'ok', 6000);
          A.ujian = null; PN.lupakan('ujian'); PN.segarkanBoot();
          location.hash = '#/kesiapan/' + encodeURIComponent(r.data.id);
        });
      };
    }).catch(function (e) { $('je-isi').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
  }

  // =========================================================================
  // W-21 Cek Kesiapan
  // =========================================================================
  function halamanKesiapan(bagian) {
    PN.judul('Cek Kesiapan');
    PN.konten().innerHTML = PN.bannerMode() + '<section class="kartu-blok" style="padding:18px 20px"><div class="baris-aksi"><label class="field" style="margin:0;flex:1;min-width:240px"><span class="label">Ujian</span><select class="input" id="ck-ujian"><option value="">Memuat…</option></select></label>' +
      '<button class="btn btn-primary" id="ck-jalan" style="align-self:flex-end">' + ikon('shield', 'ic-sm') + 'Jalankan cek</button></div></section><section class="kartu-blok" id="ck-hasil" hidden></section>';
    muatUjian(true).then(function (U) {
      var daftar = U.ujian.filter(function (u) { return ['Draf', 'Terjadwal', 'Siap', 'Berlangsung'].indexOf(u.status) > -1; });
      $('ck-ujian').innerHTML = daftar.length ? daftar.map(function (u) { return '<option value="' + esc(u.id) + '"' + (bagian[0] === u.id ? ' selected' : '') + '>' + esc(u.nama) + ' · ' + PN.tanggal(u.tanggal) + ' (' + u.status + ')</option>'; }).join('') : '<option value="">Tidak ada ujian mendatang</option>';
      if (bagian[0]) jalankanCek();
    }, galatHalaman);
    $('ck-jalan').onclick = jalankanCek;
  }

  function jalankanCek() {
    var id = $('ck-ujian').value; if (!id) return;
    var el = $('ck-hasil'), b = $('ck-jalan');
    el.hidden = false; el.innerHTML = '<div style="padding:20px"><div class="kerangka-muat"></div><p class="muted kecil">Memeriksa paket, menyusun paket siswa (F-35), dan menguji koneksi…</p></div>';
    b.disabled = true;
    var t0 = performance.now();
    var ping = [0, 1, 2].reduce(function (p) { return p.then(function (arr) { var t = performance.now(); return API.panggil('ping', {}, '', { timeout: 20000 }).then(function (r) { arr.push(r.ok ? performance.now() - t : -1); return arr; }); }); }, Promise.resolve([]));
    Promise.all([PN.panggil('cekKesiapan', { id_ujian: id }, { timeout: 180000 }), ping]).then(function (r) {
      b.disabled = false;
      if (!r[0].ok) { el.innerHTML = '<div class="alert alert-danger" style="margin:16px">' + esc(r[0].pesan) + '</div>'; return; }
      var item = r[0].data.item.slice(), lat = r[1].filter(function (x) { return x > 0; }).sort(function (a, b) { return a - b; });
      var med = lat.length ? lat[Math.floor(lat.length / 2)] : -1;
      item.push({ kode: 'koneksi', status: med < 0 ? 'merah' : med > 5000 ? 'kuning' : 'ok', judul: 'Uji koneksi ke server', pesan: med < 0 ? 'Server tidak bisa dihubungi dari perangkat ini.' : 'Waktu tempuh rata-rata ' + (med / 1000).toFixed(1).replace('.', ',') + ' detik.' });
      var merah = item.filter(function (x) { return x.status === 'merah'; }).length, kuning = item.filter(function (x) { return x.status === 'kuning'; }).length;
      el.innerHTML = '<div class="kartu-blok-kepala"><div><h2>' + (merah ? merah + ' hal perlu diperbaiki' : kuning ? 'Siap, dengan ' + kuning + ' catatan' : 'Semua siap') + '</h2><p>Diperiksa ' + PN.jam(Date.now()) + ' · ' + Math.round((performance.now() - t0) / 100) / 10 + ' detik · status ujian: ' + esc(r[0].data.status) + '</p></div></div>' +
        '<ul class="cek-daftar">' + item.map(function (x) {
          return '<li class="' + x.status + '"><span class="tanda">' + ikon(x.status === 'ok' ? 'check' : x.status === 'kuning' ? 'alert' : 'x') + '</span><div><b>' + esc(x.judul) + '</b><small>' + esc(x.pesan) + '</small></div>' +
            (x.tautan && x.status !== 'ok' ? '<a class="btn btn-secondary btn-sm" href="' + esc(x.tautan) + '">Perbaiki</a>' : '<span></span>') + '</li>';
        }).join('') + '</ul>';
      A.ujian = null; PN.segarkanBoot();
    });
  }

  // =========================================================================
  // W-25 Cetak dokumen & W-29 Berita acara
  // =========================================================================
  function halamanCetak(bagian) {
    var tab = bagian[0] || 'kartu';
    PN.judul('Cetak Dokumen');
    var tabs = [['kartu', 'Kartu ujian'], ['hadir', 'Daftar hadir'], ['pengawas', 'Jadwal pengawas'], ['berita', 'Berita acara']];
    PN.konten().innerHTML = '<nav class="tab-bar">' + tabs.map(function (t) { return '<a href="#/cetak/' + t[0] + '" class="' + (tab === t[0] ? 'aktif' : '') + '">' + t[1] + '</a>'; }).join('') + '</nav><section class="kartu-blok" style="padding:20px" id="ct-isi"><div class="kerangka-muat"></div></section>';
    var el = $('ct-isi');
    if (tab === 'kartu') {
      muatSekolah(true).then(function (ds) {
        var n = {}; ds.peserta.forEach(function (p) { if (p.status !== 'nonaktif') n[p.rombel] = (n[p.rombel] || 0) + 1; });
        el.innerHTML = '<p class="muted" style="margin-top:0">Kartu berisi username dan password siswa untuk semua ujian tahun ini. Rombel yang sudah dicetak ditandai otomatis untuk Cek Kesiapan.</p><div class="pilih-grid">' +
          Object.keys(n).sort().map(function (r) { var t = ds.kartu_dicetak[r]; return '<label class="pilih-kartu"><input type="checkbox" class="kotak-cek" value="' + esc(r) + '" data-r><span>' + esc(r) + '<small>' + n[r] + ' siswa' + (t ? ' · dicetak ' + PN.tanggal(t) : ' · belum dicetak') + '</small></span></label>'; }).join('') +
          '</div><div class="baris-aksi kanan" style="margin-top:16px"><button class="btn btn-primary" id="ct-cetak">' + ikon('printer', 'ic-sm') + 'Cetak kartu</button></div>';
        $('ct-cetak').onclick = function () {
          var rb = Array.prototype.filter.call(el.querySelectorAll('[data-r]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
          if (!rb.length) { PN.toast('Pilih rombel.', 'warn'); return; }
          PN.panggil('dokumen', { jenis: 'kartu', rombel: rb }).then(function (r) {
            if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
            A.ds._sekolah = r.data.sekolah;
            cetakKartu(r.data.peserta, rb);
          });
        };
      }, galatHalaman);
      return;
    }
    muatUjian(true).then(function (U) {
      var opsiUjian = U.ujian.map(function (u) { return '<option value="' + esc(u.id) + '">' + esc(u.nama) + ' · ' + PN.tanggal(u.tanggal) + '</option>'; }).join('');
      el.innerHTML = '<div class="grid-form"><label class="field"><span class="label">Ujian</span><select class="input" id="ct-ujian">' + opsiUjian + '</select></label>' +
        (tab !== 'pengawas' ? '<label class="field"><span class="label">Sesi</span><select class="input" id="ct-sesi"></select></label>' : '') + '</div>' +
        '<div class="baris-aksi kanan"><button class="btn btn-primary" id="ct-buka">' + ikon(tab === 'berita' ? 'file' : 'printer', 'ic-sm') + (tab === 'berita' ? 'Buka berita acara' : 'Cetak') + '</button></div>';
      var isiSesi = function () {
        if (!$('ct-sesi')) return;
        var u = U.ujian.filter(function (x) { return x.id === $('ct-ujian').value; })[0];
        $('ct-sesi').innerHTML = u ? u.sesi.map(function (s) { return '<option value="' + esc(s.id) + '">' + esc(s.ruang) + ' · ' + PN.jam(s.mulai) + ' (' + s.jumlah + ' peserta)</option>'; }).join('') : '';
      };
      $('ct-ujian').onchange = isiSesi; isiSesi();
      $('ct-buka').onclick = function () {
        if (tab === 'berita') { PN.beritaAcara($('ct-sesi').value); return; }
        if (tab === 'hadir') cetakHadir($('ct-sesi').value);
        if (tab === 'pengawas') cetakPengawas($('ct-ujian').value);
      };
    }, galatHalaman);
  }

  function cetakHadir(idSesi) {
    PN.panggil('dokumen', { jenis: 'hadir', id_sesi: idSesi }).then(function (r) {
      if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
      var d = r.data, s = d.sesi;
      PN.cetak('<div class="halaman">' + kopSekolah(d.sekolah) + '<h2>Daftar Hadir Peserta Ujian</h2><table class="tanpa-garis" style="margin-bottom:8px"><tr><td>Ujian</td><td>: ' + esc(s.nama_ujian) + '</td><td>Ruang</td><td>: ' + esc(s.ruang) + '</td></tr>' +
        '<tr><td>Mapel</td><td>: ' + esc(s.mapel) + '</td><td>Waktu</td><td>: ' + PN.tanggal(s.mulai) + ', ' + PN.jam(s.mulai) + '–' + PN.jam(s.selesai) + '</td></tr></table>' +
        '<table><thead><tr><th style="width:8mm">No</th><th style="width:24mm">NIS</th><th>Nama</th><th style="width:20mm">Rombel</th><th style="width:40mm">Tanda tangan</th></tr></thead><tbody>' +
        d.peserta.map(function (p, i) { return '<tr><td class="tengah">' + (i + 1) + '</td><td>' + esc(p.nis) + '</td><td>' + esc(p.nama) + '</td><td>' + esc(p.rombel) + '</td><td>' + (i % 2 ? '<span style="padding-left:18mm">' + (i + 1) + '.</span>' : (i + 1) + '.') + '</td></tr>'; }).join('') +
        '</tbody></table><div class="ttd"><div></div><div>Pengawas,<div class="ruang"></div><b>' + esc(s.pengawas || '……………………………') + '</b></div></div></div>', 'Daftar Hadir ' + s.ruang);
    });
  }

  function cetakPengawas(idUjian) {
    PN.panggil('dokumen', { jenis: 'pengawas', id_ujian: idUjian }).then(function (r) {
      if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
      var u = r.data.ujian;
      PN.cetak('<div class="halaman">' + kopSekolah(r.data.sekolah) + '<h2>Jadwal Pengawas · ' + esc(u.nama) + '</h2><table><thead><tr><th>No</th><th>Hari, tanggal</th><th>Jam</th><th>Ruang</th><th>Pengawas</th><th>Peserta</th></tr></thead><tbody>' +
        u.sesi.map(function (s, i) { return '<tr><td class="tengah">' + (i + 1) + '</td><td>' + PN.tanggalPanjang(s.mulai) + '</td><td>' + PN.jam(s.mulai) + '–' + PN.jam(s.selesai) + '</td><td>' + esc(s.ruang) + '</td><td>' + esc(s.pengawas || '-') + '</td><td class="tengah">' + s.jumlah + '</td></tr>'; }).join('') +
        '</tbody></table><div class="ttd"><div></div><div>Kepala Sekolah,<div class="ruang"></div><b>' + esc(r.data.sekolah.kepsek || '……………………………') + '</b><br>NIP ' + esc(r.data.sekolah.nip_kepsek || '') + '</div></div></div>', 'Jadwal Pengawas');
    });
  }

  /** W-29 Berita acara: kehadiran otomatis, pengawas menulis catatan kejadian, lalu mencetak. */
  PN.beritaAcara = function (idSesi) {
    PN.modal('<div class="modal-kepala"><h2>Berita acara</h2></div><div class="modal-isi" id="ba-isi"><div class="kerangka-muat"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-tutup>Tutup</button><button class="btn btn-secondary" data-simpan disabled>Simpan catatan</button><button class="btn btn-primary" data-cetak disabled>' + ikon('printer', 'ic-sm') + 'Cetak</button></div>', 'lebar');
    var data = null;
    PN.panggil('dokumen', { jenis: 'berita', id_sesi: idSesi }).then(function (r) {
      if (!r.ok) { $('ba-isi').innerHTML = '<div class="alert alert-danger">' + esc(r.pesan) + '</div>'; return; }
      data = r.data;
      var s = data.sesi, hadir = data.peserta.filter(function (p) { return p.kehadiran === 'Hadir'; }), tidak = data.peserta.filter(function (p) { return p.kehadiran === 'Tidak hadir'; });
      $('ba-isi').innerHTML = '<p><b>' + esc(s.nama_ujian) + '</b> · ' + esc(s.mapel) + ' · ' + esc(s.ruang) + ' · ' + PN.tanggal(s.mulai) + ' ' + PN.jam(s.mulai) + '–' + PN.jam(s.selesai) + '</p>' +
        (s.status !== 'Ditutup' ? '<div class="alert alert-warn">' + ikon('alert') + '<span>Sesi belum ditutup. Jumlah hadir terisi lengkap setelah sesi ditutup.</span></div>' : '') +
        '<div class="ringkas-impor" style="margin-top:12px"><div><b>' + data.peserta.length + '</b><span>terdaftar</span></div><div><b>' + hadir.length + '</b><span>hadir</span></div><div class="' + (tidak.length ? 'kuning' : '') + '"><b>' + tidak.length + '</b><span>tidak hadir</span></div></div>' +
        (tidak.length ? '<p class="kecil">Tidak hadir: ' + tidak.map(function (p) { return esc(p.nama) + ' (' + esc(p.rombel) + ')'; }).join(', ') + '</p>' : '') +
        '<label class="field"><span class="label">Catatan kejadian selama ujian</span><textarea class="input" id="ba-catatan" rows="5" placeholder="Contoh: Ujian berjalan tertib. Pukul 08.20 listrik padam 5 menit; peserta melanjutkan setelah listrik menyala.">' + esc(s.berita_acara) + '</textarea></label>';
      $('modal-isi').querySelector('[data-simpan]').disabled = false;
      $('modal-isi').querySelector('[data-cetak]').disabled = false;
    });
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-tutup]')) { PN.tutupModal(); return; }
      if (!data) return;
      var catatan = $('ba-catatan') ? $('ba-catatan').value.trim() : '';
      if (e.target.closest('[data-simpan]')) {
        PN.panggil('simpanBeritaAcara', { id_sesi: idSesi, catatan: catatan }).then(function (r) { PN.toast(r.ok ? 'Catatan berita acara tersimpan.' : r.pesan, r.ok ? 'ok' : 'danger'); });
        return;
      }
      if (e.target.closest('[data-cetak]')) {
        PN.panggil('simpanBeritaAcara', { id_sesi: idSesi, catatan: catatan });
        var s = data.sesi, hadir = data.peserta.filter(function (p) { return p.kehadiran === 'Hadir'; }), tidak = data.peserta.filter(function (p) { return p.kehadiran === 'Tidak hadir'; });
        PN.cetak('<div class="halaman">' + kopSekolah(data.sekolah) + '<h2>Berita Acara Pelaksanaan Ujian</h2>' +
          '<p>Pada hari ini, ' + PN.tanggalPanjang(s.mulai) + ', pukul ' + PN.jam(s.mulai) + ' sampai ' + PN.jam(s.selesai) + ', telah diselenggarakan <b>' + esc(s.nama_ujian) + '</b> mata pelajaran <b>' + esc(s.mapel) + '</b> berbasis komputer (Digital CBT) di ruang <b>' + esc(s.ruang) + '</b>.</p>' +
          '<table class="tanpa-garis"><tr><td style="width:60mm">Jumlah peserta terdaftar</td><td>: ' + data.peserta.length + ' orang</td></tr><tr><td>Jumlah peserta hadir</td><td>: ' + hadir.length + ' orang</td></tr><tr><td>Jumlah peserta tidak hadir</td><td>: ' + tidak.length + ' orang</td></tr></table>' +
          (tidak.length ? '<p>Peserta tidak hadir: ' + tidak.map(function (p) { return esc(p.nama) + ' (' + esc(p.rombel) + ')'; }).join(', ') + '.</p>' : '') +
          '<p><b>Catatan selama pelaksanaan ujian:</b></p><div style="border:1px solid #000;min-height:40mm;padding:3mm;white-space:pre-wrap">' + esc(catatan || '-') + '</div>' +
          '<p>Berita acara ini dibuat dengan sesungguhnya.</p><div class="ttd"><div></div><div>' + esc(data.sekolah.kabupaten || '') + ', ' + PN.tanggal(s.mulai) + '<br>Pengawas,<div class="ruang"></div><b>' + esc(s.pengawas || '……………………………') + '</b></div></div></div>', 'Berita Acara ' + s.ruang);
      }
    };
  };

  // =========================================================================
  // W-27 Pengaturan
  // =========================================================================
  var SAKELAR = [['sakelar_baca_pdf_otomatis', 'Baca PDF otomatis', 'Mati: PDF langsung dibuka dalam mode Potong soal.'],
    ['sakelar_konversi_rumus', 'Konversi rumus Equation Editor', 'Mati: rumus ditulis $…$ atau soal dipotong dari PDF.'],
    ['sakelar_stimulus_dua_panel', 'Stimulus dua panel', 'Mati: stimulus tampil di atas soal seperti di HP.'],
    ['sakelar_analisis_butir', 'Analisis butir', 'Mati: analisis tidak dihitung saat verifikasi.'],
    ['sakelar_beranda_kepsek', 'Beranda kepala sekolah', 'Mati: menu kepala sekolah disembunyikan.'],
    ['sakelar_halaman_nilai', 'Halaman nilai siswa', 'Mati: nilai disampaikan lewat lembar hasil per siswa.']];
  var SUMBER_ERAPOR = { no: 'Nomor urut', nisn: 'NISN', nis: 'NIS', nama: 'Nama', rombel: 'Rombel', nilai: 'Nilai akhir (sesuai aturan remedial)', nilai_asli: 'Nilai ujian', nilai_remedial: 'Nilai remedial', mapel: 'Mapel', kosong: '(kolom kosong)' };
  var PROFIL_BAWAAN = [{ s: 'no', j: 'No' }, { s: 'nisn', j: 'NISN' }, { s: 'nama', j: 'Nama Peserta Didik' }, { s: 'nilai', j: 'Nilai' }];

  function halamanPengaturan() {
    PN.judul('Pengaturan');
    PN.konten().innerHTML = '<div id="pt-isi"><div class="kerangka-muat"></div></div>';
    PN.panggil('pengaturan', {}).then(function (r) {
      if (!r.ok) { galatHalaman(r.pesan); return; }
      var v = r.data.nilai;
      var profil = []; try { profil = JSON.parse(v.profil_ekspor_erapor || '[]'); } catch (e) { profil = []; }
      if (!Array.isArray(profil) || !profil.length) profil = PROFIL_BAWAAN.slice();
      var f = function (k, label, tipe, hint, attr) {
        return '<label class="field"><span class="label">' + label + '</span><input class="input" data-k="' + k + '" type="' + (tipe || 'text') + '" value="' + esc(v[k]) + '"' + (attr || '') + '>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</label>';
      };
      $('pt-isi').innerHTML = '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:14px">Identitas sekolah</h2><div class="grid-form">' +
        f('nama_sekolah', 'Nama sekolah') + f('npsn', 'NPSN') + f('alamat', 'Alamat') + f('kabupaten', 'Kabupaten/kota') + f('provinsi', 'Provinsi') +
        f('kepsek_nama', 'Nama kepala sekolah') + f('kepsek_nip', 'NIP kepala sekolah') + f('tahun_pelajaran', 'Tahun pelajaran') +
        '<label class="field"><span class="label">Semester</span><select class="input" data-k="semester"><option' + (v.semester === 'Ganjil' ? ' selected' : '') + '>Ganjil</option><option' + (v.semester === 'Genap' ? ' selected' : '') + '>Genap</option></select></label>' +
        f('logo', 'Alamat logo (https)', 'url', 'Kosongkan untuk memakai monogram nama sekolah.') +
        '<label class="field"><span class="label">Warna utama</span><input class="input" type="color" data-k="warna_utama" value="' + esc(v.warna_utama || '#1E3A8A') + '" style="height:44px;padding:4px"></label>' +
        '<label class="field"><span class="label">Motif layar masuk</span><select class="input" data-k="motif_layar_masuk"><option value="polos">Polos</option><option value="songket"' + (v.motif_layar_masuk === 'songket' ? ' selected' : '') + '>Songket</option></select></label></div></section>' +
        '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:14px">Pelaksanaan ujian</h2><div class="grid-form">' +
        f('masa_tenggang_menit', 'Masa tenggang pengumpulan (menit)', 'number', 'Pengumpulan terlambat masih diterima selama ini.') +
        f('masa_sanggah_hari', 'Masa sanggah (hari)', 'number', 'Rekaman Jawaban dihapus setelah ini, dihitung dari publikasi nilai.') +
        f('batas_karakter_esai', 'Batas karakter jawaban esai', 'number') + f('batas_sering_keluar', 'Batas "sering keluar halaman"', 'number') +
        f('jeda_kumpul_detik', 'Jeda acak pengumpulan otomatis (detik)', 'number') + f('sinkron_min_detik', 'Sinkron tercepat (detik)', 'number') + f('sinkron_maks_detik', 'Sinkron terlama (detik)', 'number') +
        '</div></section>' +
        '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:6px">Sakelar fitur</h2><p class="muted kecil" style="margin:0 0 14px">Matikan sementara fitur pendukung yang bermasalah menjelang ujian; jalur cadangannya otomatis dipakai.</p><div class="grid-form">' +
        SAKELAR.map(function (s) { return '<div class="field"><label class="sakelar"><input type="checkbox" data-k="' + s[0] + '"' + (v[s[0]] === '1' ? ' checked' : '') + '><i></i>' + s[1] + '</label><span class="hint">' + s[2] + '</span></div>'; }).join('') + '</div></section>' +
        '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:6px">Ekspor e-Rapor</h2><p class="muted kecil" style="margin:0 0 14px">Urutan dan nama kolom file Excel per rombel dan mapel. Sesuaikan dengan format impor nilai e-Rapor SMP yang dipakai sekolah.</p>' +
        '<label class="field" style="max-width:420px"><span class="label">Nilai yang diekspor bila ada remedial</span><select class="input" data-k="aturan_nilai_remedial">' +
        [['remedial', 'Nilai remedial'], ['tertinggi', 'Nilai tertinggi (ujian atau remedial)'], ['kkm', 'Nilai remedial, paling tinggi sama dengan batas tuntas']].map(function (o) { return '<option value="' + o[0] + '"' + (v.aturan_nilai_remedial === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
        '<div id="pt-profil"></div><button class="btn btn-ghost btn-sm" id="pt-tambah-kolom">' + ikon('plus', 'ic-sm') + 'Tambah kolom</button></section>' +
        '<section class="kartu-blok" style="padding:20px"><h2 style="font-size:17px;margin-bottom:6px">Cadangan, arsip &amp; alat</h2><p class="muted kecil" style="margin:0 0 14px">Cadangan harian, arsip per semester, data contoh, dan impor dari versi lama ada di menu tersendiri.</p>' +
        '<a class="btn btn-secondary" href="#/arsip">' + ikon('archive', 'ic-sm') + 'Buka Arsip &amp; Cadangan</a></section>' +
        '<div class="bilah-simpan"><span class="teks" id="pt-status"></span><button class="btn btn-primary" id="pt-simpan">' + ikon('check', 'ic-sm') + 'Simpan pengaturan</button></div>';
      function renderProfil() {
        $('pt-profil').innerHTML = profil.map(function (k, i) {
          return '<div class="baris-opsi" style="grid-template-columns:30px 1fr 1fr auto"><span class="no muted tebal">' + (i + 1) + '</span><select class="input" data-p="' + i + '" data-pk="s">' + Object.keys(SUMBER_ERAPOR).map(function (s) { return '<option value="' + s + '"' + (k.s === s ? ' selected' : '') + '>' + SUMBER_ERAPOR[s] + '</option>'; }).join('') + '</select>' +
            '<input class="input" data-p="' + i + '" data-pk="j" value="' + esc(k.j) + '" placeholder="Judul kolom"><span class="baris-aksi"><button class="tombol-ikon" data-naik="' + i + '"' + (i ? '' : ' disabled') + '>' + ikon('up', 'ic-sm') + '</button><button class="tombol-ikon bahaya" data-hapus="' + i + '"' + (profil.length > 1 ? '' : ' disabled') + '>' + ikon('trash', 'ic-sm') + '</button></span></div>';
        }).join('');
      }
      renderProfil();
      $('pt-profil').onchange = $('pt-profil').oninput = function (e) { var x = e.target; if (x.hasAttribute('data-p')) profil[Number(x.getAttribute('data-p'))][x.getAttribute('data-pk')] = x.value; };
      $('pt-profil').onclick = function (e) {
        var n = e.target.closest('[data-naik]'), h = e.target.closest('[data-hapus]');
        if (n) { var i = Number(n.getAttribute('data-naik')); profil.splice(i - 1, 0, profil.splice(i, 1)[0]); renderProfil(); }
        if (h) { profil.splice(Number(h.getAttribute('data-hapus')), 1); renderProfil(); }
      };
      $('pt-tambah-kolom').onclick = function () { profil.push({ s: 'kosong', j: '' }); renderProfil(); };
      $('pt-simpan').onclick = function () {
        var nilai = {};
        $('pt-isi').querySelectorAll('[data-k]').forEach(function (x) { nilai[x.getAttribute('data-k')] = x.type === 'checkbox' ? (x.checked ? '1' : '0') : x.value.trim(); });
        nilai.profil_ekspor_erapor = JSON.stringify(profil.filter(function (k) { return k.j || k.s === 'kosong'; }));
        var b = $('pt-simpan'); b.disabled = true;
        PN.panggil('simpanPengaturan', { nilai: nilai }).then(function (x) {
          b.disabled = false;
          if (!x.ok) { PN.toast(x.pesan, 'danger', 6000); return; }
          PN.toast('Pengaturan disimpan.', 'ok');
          try { localStorage.removeItem('cbt_info'); } catch (e) { /* abaikan */ }
          PN.segarkanBoot();
        });
      };
    });
  }

  // =========================================================================
  // Arsip & Cadangan (v1.1): arsip per semester, cadangan harian, alat operator
  // =========================================================================
  function halamanArsip() {
    PN.judul('Arsip & Cadangan');
    PN.konten().innerHTML = PN.bannerMode() +
      '<div class="kepala-bagian"><div><h2>Arsip per semester</h2><p>Setelah semua ujian satu semester selesai dan masa sanggahnya lewat, pindahkan datanya ke arsip agar database tetap ringan.</p></div></div>' +
      '<div id="ar-periode"><div class="kartu-blok" style="padding:20px"><div class="kerangka-muat"></div></div></div>' +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Arsip tersimpan</h2><p>Setiap arsip adalah satu Google Sheets di folder Drive <b>Arsip</b>. Unduh Excel bila perlu dibuka di komputer lain.</p></div><span id="ar-folder"></span></div><div id="ar-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>' +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Cadangan harian</h2><p>Setiap malam (pukul 01.00–02.00) server menyalin seluruh database ke folder Drive <b>Cadangan</b>. Hanya 14 salinan terbaru yang disimpan (± 2 minggu). Salinan ini dipakai bila ada data yang terhapus atau rusak.</p></div>' +
      '<button class="btn btn-secondary" id="ar-cadangkan">' + ikon('download', 'ic-sm') + 'Cadangkan sekarang</button></div><div id="ar-cadangan"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>' +
      '<section class="kartu-blok"><details class="alat-lanjut"><summary><div><h2>Alat lanjutan</h2><p>Data contoh, kosongkan cache, impor dari versi lama, dan alamat database.</p></div>' + ikon('chev-d') + '</summary><div id="ar-alat" class="alat-isi"><div class="kerangka-muat"></div></div></details></section>';
    muatArsip();
    muatAlat();
    $('ar-cadangkan').onclick = function () {
      var b = this; b.disabled = true; b.innerHTML = '<span class="putar"></span>Membuat cadangan…';
      PN.panggil('cadangkan', {}, { timeout: 180000 }).then(function (x) {
        b.disabled = false; b.innerHTML = ikon('download', 'ic-sm') + 'Cadangkan sekarang';
        PN.toast(x.ok ? 'Cadangan dibuat: ' + x.data.nama : x.pesan, x.ok ? 'ok' : 'danger', 6000);
        if (x.ok) muatAlat();
      });
    };
  }

  function muatArsip() {
    PN.panggil('daftarArsip', {}, { timeout: 120000 }).then(function (r) {
      if (!$('ar-periode')) return;
      if (!r.ok) { $('ar-periode').innerHTML = '<div class="alert alert-warn">' + ikon('alert') + '<span>' + esc(r.pesan) + '</span></div>'; $('ar-daftar').innerHTML = ''; return; }
      var d = r.data;
      $('ar-folder').innerHTML = d.folder ? '<a class="btn btn-ghost btn-sm" href="' + esc(d.folder) + '" target="_blank" rel="noopener">' + ikon('file', 'ic-sm') + 'Buka folder Arsip</a>' : '';
      $('ar-periode').innerHTML = !d.periode.length ? '<section class="kartu-blok"><div class="kosong-isi">' + ikon('archive') + '<p><b>Belum ada ujian.</b></p></div></section>' :
        d.periode.map(function (g) {
          return '<section class="kartu-blok kartu-periode"><div class="kartu-blok-kepala"><div><h2>Semester ' + esc(g.label) + '</h2><p>' + g.siap.length + ' ujian siap diarsipkan' + (g.belum.length ? ' · ' + g.belum.length + ' belum bisa' : '') + '</p></div>' +
            (g.siap.length ? '<button class="btn btn-primary" data-arsipkan="' + esc(g.kunci) + '">' + ikon('archive', 'ic-sm') + 'Arsipkan semester ini</button>' : '<span class="pill pill-idle">Belum ada yang siap</span>') + '</div>' +
            '<div class="periode-isi">' +
            (g.siap.length ? '<div><p class="label">Siap diarsipkan</p><ul class="daftar-ringkas">' + g.siap.map(function (u) {
              return '<li><span class="pill pill-ok">' + ikon('check', 'ic-sm') + '</span><div><b>' + esc(u.nama) + '</b><small>' + esc(u.mapel || '-') + ' · ' + esc(u.jenis) + ' · ' + PN.tanggal(u.tanggal) + ' · ' + u.nilai + ' nilai</small></div></li>';
            }).join('') + '</ul></div>' : '') +
            (g.belum.length ? '<div><p class="label">Belum bisa diarsipkan</p><ul class="daftar-ringkas">' + g.belum.map(function (u) {
              return '<li><span class="pill pill-warn">' + ikon('clock', 'ic-sm') + '</span><div><b>' + esc(u.nama) + '</b><small>' + esc(u.alasan) + '</small></div></li>';
            }).join('') + '</ul></div>' : '') + '</div></section>';
        }).join('');
      $('ar-daftar').innerHTML = !d.arsip.length ? '<div class="kosong-isi">' + ikon('archive') + '<p><b>Belum ada arsip.</b></p><p>Arsip pertama biasanya dibuat setelah semester ganjil selesai.</p></div>' :
        '<table class="tabel tabel-ringkas tabel-responsif"><thead><tr><th>Semester</th><th>Dibuat</th><th class="kanan">Ujian</th><th class="kanan">Nilai</th><th></th></tr></thead><tbody>' +
        d.arsip.map(function (a) {
          return '<tr><td class="utama-sel"><b>' + esc(a.label) + '</b><span class="sub">oleh ' + esc(a.oleh || '-') + '</span></td><td data-l="Dibuat">' + PN.tanggalJam(a.dibuat) + '</td>' +
            '<td class="kanan tnum" data-l="Ujian">' + a.ujian + '</td><td class="kanan tnum" data-l="Nilai">' + a.nilai + '</td>' +
            '<td class="aksi"><button class="btn btn-secondary btn-sm" data-unduh-arsip="' + esc(a.id) + '">' + ikon('download', 'ic-sm') + 'Unduh Excel</button>' +
            '<a class="btn btn-ghost btn-sm" href="' + esc(a.url) + '" target="_blank" rel="noopener">Buka</a></td></tr>';
        }).join('') + '</tbody></table>';
      $('ar-periode').onclick = function (e) { var b = e.target.closest('[data-arsipkan]'); if (b) arsipkan(b.getAttribute('data-arsipkan'), b); };
      $('ar-daftar').onclick = function (e) { var b = e.target.closest('[data-unduh-arsip]'); if (b) unduhArsip(b.getAttribute('data-unduh-arsip'), b); };
    });
  }

  function arsipkan(kunci, tombol) {
    tombol.disabled = true; var lama = tombol.innerHTML; tombol.innerHTML = '<span class="putar"></span>Memeriksa…';
    PN.panggil('arsipkan', { periode: kunci, pindai: true }, { timeout: 120000 }).then(function (r) {
      tombol.disabled = false; tombol.innerHTML = lama;
      if (!r.ok) { PN.toast(r.pesan, 'danger', 7000); return; }
      var d = r.data, j = d.jumlah;
      PN.modal('<div class="modal-kepala"><h2>Arsipkan semester ' + esc(d.label) + '?</h2><p>Data berikut disalin ke spreadsheet arsip, diperiksa ulang, lalu dihapus dari database utama.</p></div><div class="modal-isi">' +
        '<ul class="daftar-jumlah">' +
        [['Ujian', j.Ujian], ['Sesi', j.Sesi], ['Daftar peserta sesi', j.PesertaSesi], ['Nilai', j.Nilai], ['Nilai esai', j.KoreksiEsai], ['Analisis butir', j.AnalisisButir], ['Log aktivitas semester ini', j.LogAudit]].map(function (x) {
          return '<li><span>' + x[0] + '</span><b class="tnum">' + x[1] + ' baris</b></li>';
        }).join('') + '</ul>' +
        '<div class="alert alert-info" style="margin-top:14px">' + ikon('info') + '<span>Bank soal, paket, peserta, guru, dan pengaturan <b>tidak</b> ikut diarsipkan. Setelah diarsipkan, nilai semester ini tidak lagi tampil di beranda siswa, tetapi tetap bisa diunduh dari arsip.</span></div>' +
        (d.belum.length ? '<div class="alert alert-warn" style="margin-top:10px">' + ikon('alert') + '<span>' + d.belum.length + ' ujian lain di semester ini belum siap dan tidak ikut diarsipkan sekarang.</span></div>' : '') +
        '</div><div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>' + ikon('archive', 'ic-sm') + 'Arsipkan</button></div>', 'lebar');
      $('modal-isi').onclick = function (e) {
        if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
        var ok = e.target.closest('[data-ok]'); if (!ok) return;
        ok.disabled = true; ok.innerHTML = '<span class="putar"></span>Mengarsipkan… (bisa 1–3 menit)';
        PN.panggil('arsipkan', { periode: kunci }, { timeout: 330000 }).then(function (x) {
          if (!x.ok) { ok.disabled = false; ok.innerHTML = ikon('archive', 'ic-sm') + 'Arsipkan'; PN.toast(x.pesan, 'danger', 8000); return; }
          PN.modal('<div class="modal-kepala"><h2>Arsip ' + esc(x.data.label) + ' selesai</h2><p>' + x.data.jumlah.Ujian + ' ujian dan ' + x.data.jumlah.Nilai + ' nilai dipindahkan ke arsip.</p></div>' +
            '<div class="modal-kaki"><a class="btn btn-secondary" href="' + esc(x.data.url) + '" target="_blank" rel="noopener">Buka arsip</a><button class="btn btn-primary" data-tutup>Selesai</button></div>');
          $('modal-isi').onclick = function (ev) { if (ev.target.closest('[data-tutup]')) PN.tutupModal(); };
          PN.segarkanBoot(); muatArsip();
        });
      };
    });
  }

  function unduhArsip(id, tombol) {
    tombol.disabled = true;
    Promise.all([PN.panggil('bacaArsip', { id: id }, { timeout: 120000 }), API.muatSkrip('./js/xlsx.js')]).then(function (h) {
      tombol.disabled = false;
      var r = h[0];
      if (!r.ok) { PN.toast(r.pesan, 'danger', 7000); return; }
      return XLSX.tulis(r.data.lembar.map(function (l) { return { nama: l.nama, baris: l.baris.length ? l.baris : [['(kosong)']] }; })).then(function (b) {
        API.unduh(b, 'Arsip_CBT_' + r.data.label.replace(/[^\w]+/g, '_') + '.xlsx');
      });
    }, function () { tombol.disabled = false; PN.toast('Gagal memuat pengolah Excel. Periksa koneksi.', 'danger'); });
  }

  function muatAlat() {
    PN.panggil('alatAdmin', { aksi: 'info' }, { timeout: 60000 }).then(function (r) {
      if (!$('ar-cadangan')) return;
      if (!r.ok) { $('ar-cadangan').innerHTML = '<div class="kosong-isi"><p>' + esc(r.pesan) + '</p></div>'; $('ar-alat').innerHTML = ''; return; }
      var d = r.data;
      $('ar-cadangan').innerHTML = !d.cadangan.length ? '<div class="kosong-isi">' + ikon('download') + '<p><b>Belum ada cadangan.</b></p><p>Cadangan pertama dibuat otomatis malam ini, atau tekan Cadangkan sekarang.</p></div>' :
        '<ul class="daftar-ringkas" style="padding:6px 22px 18px">' + d.cadangan.slice(0, 5).map(function (c, i) {
          return '<li><span class="pill ' + (i ? 'pill-idle' : 'pill-ok') + '">' + ikon('check', 'ic-sm') + '</span><div><b>' + PN.tanggalJam(c.t) + '</b><small>' + esc(c.nama) + (i ? '' : ' · terbaru') + '</small></div></li>';
        }).join('') + '</ul>';
      $('ar-alat').innerHTML =
        '<div class="alat-baris"><div><b>Alamat database</b><small>Spreadsheet tempat semua data tersimpan. Jangan mengubah nama kolom di dalamnya.</small></div><div class="baris-aksi">' +
          (d.database ? '<a class="btn btn-secondary btn-sm" href="' + esc(d.database) + '" target="_blank" rel="noopener">Buka database</a>' : '') +
          (d.folder ? '<a class="btn btn-ghost btn-sm" href="' + esc(d.folder) + '" target="_blank" rel="noopener">Buka folder Drive</a>' : '') + '</div></div>' +
        '<div class="alat-baris"><div><b>Data contoh</b><small>' + (d.data_contoh ? 'Sudah dibuat. Hapus barisnya di database sebelum dipakai sungguhan.' : '2 rombel, 64 siswa fiktif, 2 guru, 11 soal, dan 2 sesi hari ini untuk latihan.') + '</small></div>' +
          '<button class="btn btn-secondary btn-sm" id="al-contoh"' + (d.data_contoh ? ' disabled' : '') + '>Buat data contoh</button></div>' +
        '<div class="alat-baris"><div><b>Kosongkan cache</b><small>Pakai bila data di layar tidak sesuai dengan isi spreadsheet setelah diubah langsung di Google Sheets.</small></div><button class="btn btn-secondary btn-sm" id="al-cache">Kosongkan cache</button></div>' +
        '<div class="alat-baris kolom"><div><b>Impor dari versi lama</b><small>Ambil peserta, guru, bank soal, dan data lain dari spreadsheet Digital CBT versi sebelumnya. Spreadsheet lama hanya dibaca. Aman diulang.</small></div>' +
          '<div class="baris-aksi" style="width:100%"><input class="input" id="al-sumber" placeholder="Tempel alamat spreadsheet lama (https://docs.google.com/…)" style="flex:1;min-width:220px"><button class="btn btn-secondary" id="al-pindai">Pindai dulu</button></div><div id="al-hasil"></div></div>' +
        '<p class="muted kecil" style="margin:6px 0 0">Versi aplikasi dan catatan kecepatan ada di menu <a href="#/akun">Akun Saya → Tentang aplikasi</a>.</p>';
      $('al-contoh').onclick = function () {
        var b = this;
        PN.konfirmasi('Buat data contoh?', '<p>Akan dibuat 2 rombel, 64 siswa fiktif, 2 guru, 11 soal, satu paket, dan 2 sesi hari ini. Cocok untuk latihan sebelum data sungguhan diimpor.</p>', 'Buat').then(function (ya) {
          if (!ya) return;
          b.disabled = true; b.innerHTML = '<span class="putar"></span>Membuat…';
          PN.panggil('alatAdmin', { aksi: 'contoh' }, { timeout: 300000 }).then(function (x) {
            b.innerHTML = 'Buat data contoh';
            if (!x.ok) { b.disabled = false; PN.toast(x.pesan, 'danger', 7000); return; }
            PN.modal('<div class="modal-kepala"><h2>' + esc(x.data.judul) + '</h2></div><div class="modal-isi"><pre class="pesan-pre">' + esc(x.data.pesan) + '</pre></div><div class="modal-kaki"><button class="btn btn-primary" data-tutup>Selesai</button></div>', 'lebar');
            $('modal-isi').onclick = function (e) { if (e.target.closest('[data-tutup]')) PN.tutupModal(); };
            PN.segarkanBoot(); muatAlat();
          });
        });
      };
      $('al-cache').onclick = function () {
        var b = this; b.disabled = true;
        PN.panggil('alatAdmin', { aksi: 'cache' }).then(function (x) { b.disabled = false; PN.toast(x.ok ? x.data.pesan : x.pesan, x.ok ? 'ok' : 'danger', 6000); });
      };
      $('al-pindai').onclick = function () {
        var src = $('al-sumber').value.trim(), b = this;
        if (!src) { PN.toast('Tempel alamat spreadsheet versi lama.', 'warn'); return; }
        b.disabled = true; b.innerHTML = '<span class="putar"></span>Memindai…';
        PN.panggil('imporVersiLama', { sumber: src, tulis: false }, { timeout: 300000 }).then(function (x) {
          b.disabled = false; b.textContent = 'Pindai dulu';
          if (!x.ok) { $('al-hasil').innerHTML = '<div class="alert alert-danger" style="margin-top:10px">' + ikon('alert') + '<span>' + esc(x.pesan) + '</span></div>'; return; }
          $('al-hasil').innerHTML = '<div class="alert alert-info" style="margin-top:10px">' + ikon('info') + '<span><b>Hasil pindai: ' + esc(x.data.nama) + '</b></span></div><pre class="pesan-pre">' + esc(x.data.laporan) + '</pre>' +
            '<button class="btn btn-primary" id="al-tulis">Tulis data ini ke database</button>';
          $('al-tulis').onclick = function () {
            var t = this; t.disabled = true; t.innerHTML = '<span class="putar"></span>Mengimpor…';
            PN.panggil('imporVersiLama', { sumber: src, tulis: true }, { timeout: 330000 }).then(function (y) {
              t.disabled = false; t.textContent = 'Tulis data ini ke database';
              if (!y.ok) { PN.toast(y.pesan, 'danger', 8000); return; }
              $('al-hasil').innerHTML = '<div class="alert alert-ok" style="margin-top:10px">' + ikon('check-c') + '<span><b>Impor selesai.</b> Boleh diulang tepat sebelum pindah versi untuk mengambil data terbaru.</span></div><pre class="pesan-pre">' + esc(y.data.laporan) + '</pre>';
              PN.segarkanBoot();
            });
          };
        });
      };
    });
  }

  PN.daftar('peserta', halamanPeserta);
  PN.daftar('staf', halamanStaf);
  PN.daftar('jadwal', halamanJadwal);
  PN.daftar('kesiapan', halamanKesiapan);
  PN.daftar('cetak', halamanCetak);
  PN.daftar('pengaturan', halamanPengaturan);
  PN.daftar('arsip', halamanArsip);
  window.MADMIN = { pillStatusUjian: pillStatusUjian, kopSekolah: kopSekolah, PROFIL_BAWAAN: PROFIL_BAWAAN };
})();
