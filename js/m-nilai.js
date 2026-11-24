/* m-nilai.js — Nilai & verifikasi (W-17), Koreksi esai (W-30), Laporan & analisis (W-18),
 * Nilai & ekspor e-Rapor (W-26), dan Beranda kepala sekolah (W-31).
 * Statistik, grafik, dan file Excel dihitung di browser dari satu panggilan rekap (PRD 4.4, 8.5).
 */
(function () {
  'use strict';
  var PN = window.PANEL, $ = PN.$, esc = PN.esc, ikon = PN.ikon;
  var N = { rekap: {}, ujian: null };
  var WARNA = ['#3B5BDB', '#0D9488']; // divalidasi: CVD & kontras lulus (dataviz validate_palette)
  var ALUR = ['Selesai', 'Dikoreksi', 'Terverifikasi', 'Dipublikasi'];

  function muatUjian() {
    return PN.panggil('daftarUjian', {}).then(function (r) { if (!r.ok) throw new Error(r.pesan); N.ujian = r.data.ujian; return N.ujian; });
  }
  function muatRekap(id, segar) {
    if (N.rekap[id] && !segar) return Promise.resolve(N.rekap[id]);
    return PN.panggil('rekapNilai', { id_ujian: id }, { timeout: 180000 }).then(function (r) { if (!r.ok) throw new Error(r.pesan); N.rekap[id] = r.data; return r.data; });
  }
  function galat(e) { PN.konten().innerHTML = '<section class="kartu-blok"><div class="kosong-isi">' + ikon('alert') + '<p><b>' + esc(e.message || e) + '</b></p></div></section>'; }
  function f1(n) { return n === null || n === undefined || isNaN(n) ? '-' : (Math.round(n * 100) / 100).toLocaleString('id-ID'); }

  /** Nilai akhir yang dilaporkan sesuai aturan remedial di Pengaturan. */
  function nilaiAkhir(p, aturan, batas) {
    if (p.nilai === null) return null;
    if (p.remedial === null || p.remedial === undefined) return p.nilai;
    if (aturan === 'tertinggi') return Math.max(p.nilai, p.remedial);
    if (aturan === 'kkm') return Math.max(p.nilai, Math.min(p.remedial, batas));
    return p.remedial;
  }

  function statistik(rows, batas, aturan) {
    var v = rows.map(function (p) { return nilaiAkhir(p, aturan, batas); }).filter(function (x) { return x !== null; });
    if (!v.length) return { n: 0 };
    var jml = v.reduce(function (a, b) { return a + b; }, 0);
    return { n: v.length, rata: jml / v.length, min: Math.min.apply(null, v), maks: Math.max.apply(null, v), tuntas: v.filter(function (x) { return x >= batas; }).length };
  }

  function pillNilai(s) {
    var k = { 'Dikoreksi': 'pill-info', 'Menunggu esai': 'pill-warn', 'Terverifikasi': 'pill-ok', 'Dipublikasi': 'pill-done', 'Final': 'pill-dark' }[s] || 'pill-idle';
    return s ? '<span class="pill ' + k + '">' + esc(s) + '</span>' : '';
  }

  // =========================================================================
  // W-17 Nilai & verifikasi
  // =========================================================================
  function halamanNilai(bagian) {
    if (bagian[0] && bagian[1] === 'esai' && bagian[2]) return halamanEsai(bagian[0], bagian[2]);
    if (bagian[0]) return detailNilai(bagian[0]);
    PN.judul(PN.P.peran === 'admin' ? 'Nilai & e-Rapor' : 'Nilai & Koreksi');
    PN.konten().innerHTML = PN.bannerMode() + '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Ujian yang sudah selesai</h2><p>Koreksi otomatis berjalan setelah semua sesi ditutup dan masa tenggang berakhir.</p></div></div><div id="nl-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    muatUjian().then(function (u) {
      var d = u.filter(function (x) { return ['Selesai', 'Dikoreksi', 'Terverifikasi', 'Dipublikasi', 'Berlangsung'].indexOf(x.status) > -1; });
      $('nl-daftar').innerHTML = d.length ? '<div class="kartu-ujian-list">' + d.map(function (x) {
        return '<div class="kartu-ujian"><div><h3>' + esc(x.nama) + ' ' + window.MADMIN.pillStatusUjian(x.status) + '</h3><p>' + esc(x.jenis) + ' · ' + esc(x.mapel) + ' · ' + PN.tanggal(x.tanggal) + ' · ' +
          x.sesi.reduce(function (a, s) { return a + s.jumlah; }, 0) + ' peserta' + (x.sanggah_sampai ? ' · masa sanggah sampai ' + PN.tanggal(x.sanggah_sampai) : '') + '</p></div>' +
          '<div class="baris-aksi"><a class="btn btn-primary btn-sm" href="#/nilai/' + encodeURIComponent(x.id) + '">Buka</a></div></div>';
      }).join('') + '</div>' : '<div class="kosong-isi">' + ikon('chart') + '<p><b>Belum ada ujian yang selesai.</b></p></div>';
    }, galat);
  }

  function detailNilai(id) {
    PN.judul('Nilai Ujian', PN.P.peran === 'admin' ? 'Nilai & e-Rapor' : 'Nilai & Koreksi');
    PN.konten().innerHTML = PN.bannerMode() + '<p><a class="btn btn-ghost btn-sm" href="#/nilai">' + ikon('arrow-l', 'ic-sm') + 'Kembali</a></p><div id="nd-isi"><div class="kartu-blok" style="padding:20px"><div class="kerangka-muat"></div><p class="muted kecil">Menghitung nilai dari Rekaman Jawaban…</p></div></div>';
    muatRekap(id, true).then(function (R) { renderNilai(R); }, function (e) { $('nd-isi').innerHTML = '<div class="alert alert-danger">' + ikon('alert') + '<span>' + esc(e.message) + '</span></div>'; });
  }

  function renderNilai(R, rombel) {
    var U = R.ujian, guru = U.boleh_ubah, el = $('nd-isi'); if (!el) return;
    var semuaRombel = R.peserta.map(function (p) { return p.rombel; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
    var rows = R.peserta.filter(function (p) { return !rombel || p.rombel === rombel; }).sort(function (a, b) { return a.rombel.localeCompare(b.rombel) || a.nama.localeCompare(b.nama); });
    var st = statistik(rows, U.batas_tuntas, R.aturan_remedial);
    var menungguEsai = R.esai.reduce(function (a, e) { return a + e.belum; }, 0);
    var bolehVerif = guru && rows.some(function (p) { return p.status === 'Dikoreksi'; }) && !menungguEsai;
    var bolehPub = guru && rows.some(function (p) { return p.status === 'Terverifikasi'; });
    var langkah = ALUR.indexOf(U.status);
    el.innerHTML = '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>' + esc(U.nama) + '</h2><p>' + esc(U.jenis) + ' · ' + esc(U.mapel) + ' · batas tuntas ' + U.batas_tuntas + ' · ' + PN.tanggal(U.tanggal) +
      (U.sanggah_sampai ? ' · masa sanggah sampai ' + PN.tanggalJam(U.sanggah_sampai) : '') + '</p></div>' +
      '<div class="baris-aksi"><a class="btn btn-secondary btn-sm" href="#/laporan/' + encodeURIComponent(U.id) + '">' + ikon('chart', 'ic-sm') + 'Laporan</a>' +
      '<button class="btn btn-secondary btn-sm" id="nd-erapor">' + ikon('download', 'ic-sm') + 'Ekspor e-Rapor</button></div></div>' +
      '<ul class="status-langkah" style="padding:14px 20px 0">' + ALUR.map(function (s, i) { return '<li class="' + (i < langkah ? 'lewat' : i === langkah ? 'kini' : '') + '">' + s + '</li>'; }).join('') + '</ul>' +
      '<div class="alur-nilai">' +
      (U.boleh_koreksi && (guru || PN.P.peran === 'admin') ? '<button class="btn btn-secondary" id="nd-koreksi">' + ikon('refresh', 'ic-sm') + (R.peserta.some(function (p) { return p.nilai !== null; }) ? 'Hitung ulang nilai' : 'Koreksi sekarang') + '</button>' : '') +
      (guru ? '<button class="btn btn-primary" id="nd-verif"' + (bolehVerif ? '' : ' disabled') + '>' + ikon('check-c', 'ic-sm') + 'Verifikasi nilai</button>' +
        '<button class="btn btn-primary" id="nd-pub"' + (bolehPub ? '' : ' disabled') + '>' + ikon('send', 'ic-sm') + 'Publikasikan</button>' : '<span class="pill pill-warn">' + ikon('eye') + 'Lihat saja</span>') +
      '<span class="spasi"></span><select class="input pilih-sm" id="nd-rombel"><option value="">Semua rombel</option>' + semuaRombel.map(function (r) { return '<option' + (rombel === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></div>' +
      (menungguEsai ? '<div style="padding:0 20px 16px"><div class="alert alert-warn">' + ikon('edit') + '<span><b>' + menungguEsai + ' jawaban esai belum dinilai.</b> Nilai baru bisa diverifikasi setelah semua esai dinilai.</span></div></div>' : '') +
      (R.esai.length ? '<div class="tugas" style="padding-top:0">' + R.esai.map(function (e) {
        var sudah = e.total - e.belum;
        return '<div class="tugas-item"><div><h3>Esai soal ' + e.no + '</h3><p>' + sudah + ' dari ' + e.total + ' dinilai</p><div class="batang-progres" style="width:220px;margin-top:6px"><i style="width:' + (e.total ? Math.round(sudah / e.total * 100) : 100) + '%"></i></div></div>' +
          (guru ? '<a class="btn ' + (e.belum ? 'btn-primary' : 'btn-secondary') + '" href="#/nilai/' + encodeURIComponent(U.id) + '/esai/' + encodeURIComponent(e.id) + '">' + (e.belum ? 'Nilai esai' : 'Tinjau') + '</a>' : '') + '</div>';
      }).join('') + '</div>' : '') + '</section>' +
      '<div class="kartu-angka"><div class="angka"><div class="angka-kepala">Peserta dinilai' + ikon('users') + '</div><b>' + (st.n || 0) + '</b><small>dari ' + rows.length + ' terjadwal</small></div>' +
      '<div class="angka"><div class="angka-kepala">Rata-rata' + ikon('chart') + '</div><b>' + f1(st.rata) + '</b><small>terendah ' + f1(st.min) + ' · tertinggi ' + f1(st.maks) + '</small></div>' +
      '<div class="angka ok"><div class="angka-kepala">Tuntas' + ikon('check-c') + '</div><b>' + (st.n ? Math.round(st.tuntas / st.n * 100) + '%' : '-') + '</b><small>' + (st.tuntas || 0) + ' siswa ≥ ' + U.batas_tuntas + '</small></div>' +
      '<div class="angka warn"><div class="angka-kepala">Belum tuntas' + ikon('alert') + '</div><b>' + (st.n ? st.n - st.tuntas : 0) + '</b><small>calon peserta remedial</small></div></div>' +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Rekap nilai</h2><p>Klik nama untuk melihat jawaban' + (U.rekaman ? '' : ' (Rekaman Jawaban sudah dihapus)') + '</p></div><button class="btn btn-secondary btn-sm" id="nd-excel">' + ikon('download', 'ic-sm') + 'Unduh Excel</button></div>' +
      '<div class="tabel-gulir"><table class="tabel tabel-ringkas tabel-responsif"><thead><tr><th>Nama</th><th>Rombel</th><th>Kehadiran</th><th class="kanan">Nilai</th><th class="kanan">Remedial</th><th>Status</th><th>Kode bukti</th></tr></thead><tbody>' +
      rows.map(function (p) {
        var akhir = nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas);
        return '<tr data-p="' + esc(p.id) + '" style="cursor:' + (U.rekaman && p.nilai !== null ? 'pointer' : 'default') + '"><td class="utama-sel"><b>' + esc(p.nama) + '</b><span class="sub">NIS ' + esc(p.nis || '-') + '</span></td><td data-l="Rombel">' + esc(p.rombel) + '</td>' +
          '<td data-l="Hadir">' + (p.kehadiran === 'Tidak hadir' ? '<span class="pill pill-idle">Tidak hadir</span>' : p.kehadiran === 'Susulan' ? '<span class="pill pill-info">Susulan</span>' : p.kumpul === 'terlambat' ? '<span class="pill pill-warn">Terlambat</span>' : p.kumpul === 'dikumpulkan' ? '<span class="pill pill-info">Dikumpulkan pengawas</span>' : p.nilai !== null ? '<span class="pill pill-ok">Hadir</span>' : '-') +
          (p.keluar >= 3 ? ' <span class="pill pill-danger" title="Keluar halaman">' + p.keluar + '× keluar</span>' : '') + '</td>' +
          '<td class="kanan tnum" data-l="Nilai"><b class="' + (akhir === null ? '' : akhir >= U.batas_tuntas ? 'nilai-tuntas' : 'nilai-remed') + '">' + f1(p.nilai) + '</b></td><td class="kanan tnum" data-l="Remedial">' + f1(p.remedial) + '</td>' +
          '<td>' + pillNilai(p.status) + '</td><td class="mono kecil" data-l="Kode">' + esc(p.kode || '-') + '</td></tr>';
      }).join('') + '</tbody></table></div></section>' +
      (R.soal.length && R.soal[0].kunci !== undefined ? '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Soal &amp; kunci (dari snapshot paket)</h2><p>Bila kunci ternyata salah, ubah di sini selama masa sanggah: nilai semua siswa dihitung ulang dan perubahan tercatat di LogAudit.</p></div></div>' +
        '<table class="tabel tabel-ringkas"><thead><tr><th>No</th><th>Jenis</th><th>Kunci</th><th>Kesukaran</th><th>Daya beda</th><th></th></tr></thead><tbody>' +
        R.soal.map(function (q) {
          var a = R.analisis[q.id];
          return '<tr><td>' + q.no + '</td><td><span class="label-jenis">' + q.jenis + '</span></td><td class="kecil">' + esc(ringkasKunci(q)) + '</td>' +
            '<td class="tnum">' + (a ? f1(a.p) : '-') + '</td><td class="tnum">' + (a ? f1(a.d) + (a.d < 0.2 ? ' <span class="pill pill-warn">tinjau</span>' : '') : '-') + '</td>' +
            '<td class="aksi">' + (guru && U.rekaman && q.jenis !== 'ESAI' ? '<button class="btn btn-secondary btn-sm" data-kunci="' + esc(q.id) + '">Ubah kunci</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></section>' : '');
    $('nd-rombel').onchange = function () { renderNilai(R, this.value); };
    var aksi = function (btn, nama, data, pesan) {
      btn.disabled = true; var lama = btn.innerHTML; btn.innerHTML = '<span class="putar"></span>Memproses…';
      return PN.panggil(nama, data, { timeout: 240000 }).then(function (r) {
        btn.disabled = false; btn.innerHTML = lama;
        if (!r.ok) { PN.toast(r.pesan, 'danger', 7000); return; }
        PN.toast(pesan(r.data), 'ok', 6000);
        PN.segarkanBoot(); detailNilai(U.id);
      });
    };
    if ($('nd-koreksi')) $('nd-koreksi').onclick = function () { aksi(this, 'koreksi', { id_ujian: U.id }, function (d) { return d.peserta + ' siswa dikoreksi' + (d.menunggu_esai ? ', ' + d.menunggu_esai + ' menunggu penilaian esai.' : '.'); }); };
    if ($('nd-verif')) $('nd-verif').onclick = function () {
      var b = this;
      PN.konfirmasi('Verifikasi nilai?', '<p>Pastikan rekap dan kunci sudah benar. Setelah diverifikasi, nilai siap dipublikasikan kepada siswa.</p>', 'Verifikasi').then(function (ya) {
        if (ya) aksi(b, 'verifikasi', { id_ujian: U.id }, function (d) { return d.n + ' nilai diverifikasi' + (d.ujian_lengkap ? '. Analisis butir tersimpan.' : '. Rombel lain menunggu gurunya.'); });
      });
    };
    if ($('nd-pub')) $('nd-pub').onclick = function () {
      var b = this;
      PN.konfirmasi('Publikasikan nilai?', '<p>Siswa bisa melihat nilai di halaman nilai (bila diaktifkan). Masa sanggah mulai berjalan; Rekaman Jawaban dihapus setelah masa sanggah berakhir.</p>', 'Publikasikan').then(function (ya) {
        if (ya) aksi(b, 'publikasi', { id_ujian: U.id }, function (d) { return d.n + ' nilai dipublikasikan.'; });
      });
    };
    $('nd-excel').onclick = function () { unduhRekap(R, rows); };
    $('nd-erapor').onclick = function () { eksporERapor(R, rombel || ''); };
    el.querySelector('tbody').onclick = function (e) {
      var tr = e.target.closest('tr[data-p]'); if (!tr || !U.rekaman) return;
      var p = R.peserta.filter(function (x) { return x.id === tr.getAttribute('data-p'); })[0];
      if (p && p.nilai !== null) detailJawaban(U.id, p);
    };
    el.querySelectorAll('[data-kunci]').forEach(function (b) { b.onclick = function () { ubahKunci(R, R.soal.filter(function (q) { return q.id === b.getAttribute('data-kunci'); })[0]); }; });
  }

  function ringkasKunci(q) {
    var o = q.opsi || {}, k = q.kunci, H = 'ABCDEFGHIJ';
    var huruf = function (arr, id) { var i = (arr || []).map(function (x) { return x.id; }).indexOf(id); return i > -1 ? H[i] : '?'; };
    if (q.jenis === 'PG') return huruf(o.opsi, k);
    if (q.jenis === 'PGK') return (k || []).map(function (x) { return huruf(o.opsi, x); }).sort().join(', ');
    if (q.jenis === 'BS') return (o.pernyataan || []).map(function (p) { return (k || {})[p.id] || '?'; }).join(', ');
    if (q.jenis === 'JODOH') return (o.kiri || []).map(function (x, i) { return (i + 1) + '-' + huruf(o.kanan, (k || {})[x.id]); }).join(', ');
    if (q.jenis === 'ISIAN') return (k || []).join(' | ');
    return 'Rubrik (' + q.skor_maks + ')';
  }

  function ubahKunci(R, q) {
    var o = q.opsi || {}, k = JSON.parse(JSON.stringify(q.kunci)), H = 'ABCDEFGHIJ';
    var isi = function () {
      if (q.jenis === 'PG' || q.jenis === 'PGK') return '<div class="skor-pilih">' + (o.opsi || []).map(function (x, i) {
        var aktif = q.jenis === 'PG' ? k === x.id : (k || []).indexOf(x.id) > -1;
        return '<button type="button" class="' + (aktif ? 'aktif' : '') + '" data-o="' + esc(x.id) + '">' + H[i] + '</button>';
      }).join('') + '</div>';
      if (q.jenis === 'BS') return (o.pernyataan || []).map(function (p, i) { return '<p>(' + (i + 1) + ') <span class="skor-pilih" style="display:inline-flex"><button type="button" class="' + (k[p.id] === 'B' ? 'aktif' : '') + '" data-bs="' + esc(p.id) + '" data-v="B">B</button><button type="button" class="' + (k[p.id] === 'S' ? 'aktif' : '') + '" data-bs="' + esc(p.id) + '" data-v="S">S</button></span></p>'; }).join('');
      if (q.jenis === 'JODOH') return (o.kiri || []).map(function (x, i) { return '<p>(' + (i + 1) + ') → <select class="input" style="width:auto;display:inline-block" data-j="' + esc(x.id) + '">' + (o.kanan || []).map(function (y, j) { return '<option value="' + esc(y.id) + '"' + (k[x.id] === y.id ? ' selected' : '') + '>' + H[j] + '</option>'; }).join('') + '</select></p>'; }).join('');
      return '<label class="field"><span class="label">Jawaban diterima (pisahkan dengan |)</span><input class="input" data-isian value="' + esc((k || []).join(' | ')) + '"></label>';
    };
    PN.modal('<div class="modal-kepala"><h2>Ubah kunci soal ' + q.no + '</h2><p>Hanya mengubah snapshot paket ujian ini, bukan bank soal.</p></div><div class="modal-isi"><div class="isi-soal">' + API.bersihHtml(q.html || '') + '</div><div style="margin-top:14px" id="uk-isi">' + isi() + '</div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>Simpan &amp; hitung ulang</button></div>', 'lebar');
    PN.muatGambar($('modal-isi'));
    $('modal-isi').onclick = function (e) {
      var b = e.target.closest('[data-o]');
      if (b) { var id = b.getAttribute('data-o'); if (q.jenis === 'PG') k = id; else { k = k || []; var i = k.indexOf(id); if (i > -1) k.splice(i, 1); else k.push(id); } $('uk-isi').innerHTML = isi(); return; }
      var bs = e.target.closest('[data-bs]');
      if (bs) { k[bs.getAttribute('data-bs')] = bs.getAttribute('data-v'); $('uk-isi').innerHTML = isi(); return; }
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      if (!e.target.closest('[data-ok]')) return;
      $('modal-isi').querySelectorAll('[data-j]').forEach(function (s) { k[s.getAttribute('data-j')] = s.value; });
      var inp = $('modal-isi').querySelector('[data-isian]'); if (inp) k = inp.value.split('|').map(function (x) { return x.trim(); }).filter(String);
      var ok = e.target.closest('[data-ok]'); ok.disabled = true; ok.innerHTML = '<span class="putar"></span>Menghitung ulang…';
      PN.panggil('koreksiUlang', { id_ujian: R.ujian.id, id_soal: q.id, kunci: k }, { timeout: 240000 }).then(function (r) {
        if (!r.ok) { ok.disabled = false; ok.textContent = 'Simpan & hitung ulang'; PN.toast(r.pesan, 'danger', 7000); return; }
        PN.tutupModal(); PN.toast('Kunci diubah. ' + r.data.berubah + ' nilai yang sudah diverifikasi ikut berubah (tercatat di LogAudit).', 'ok', 7000);
        detailNilai(R.ujian.id);
      });
    };
  }

  function detailJawaban(idUjian, p) {
    PN.modal('<div class="modal-kepala"><h2>' + esc(p.nama) + '</h2><p>' + esc(p.rombel) + ' · nilai ' + f1(p.nilai) + ' · kode bukti ' + esc(p.kode || '-') + '</p></div><div class="modal-isi" id="dj-isi"><div class="kerangka-muat"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-tutup>Tutup</button></div>', 'penuh');
    $('modal-isi').onclick = function (e) { if (e.target.closest('[data-tutup]')) PN.tutupModal(); };
    Promise.all([PN.panggil('detailJawaban', { id_ujian: idUjian, id_peserta: p.id }, { timeout: 120000 }), API.katex()]).then(function (r) {
      if (!r[0].ok) { $('dj-isi').innerHTML = '<div class="alert alert-danger">' + esc(r[0].pesan) + '</div>'; return; }
      var d = r[0].data, H = 'ABCDEFGHIJ';
      $('dj-isi').innerHTML = d.soal.map(function (q) {
        var o = q.opsi || {}, j = q.jawaban, tampil;
        var huruf = function (arr, id) { var i = (arr || []).map(function (x) { return x.id; }).indexOf(id); return i > -1 ? H[i] : '?'; };
        if (j === null || j === '') tampil = '<i class="muted">tidak dijawab</i>';
        else if (q.jenis === 'PG') tampil = huruf(o.opsi, j);
        else if (q.jenis === 'PGK') tampil = j.map(function (x) { return huruf(o.opsi, x); }).sort().join(', ');
        else if (q.jenis === 'BS') tampil = (o.pernyataan || []).map(function (x) { return j[x.id] || '-'; }).join(', ');
        else if (q.jenis === 'JODOH') tampil = (o.kiri || []).map(function (x, i) { return (i + 1) + '-' + (j[x.id] ? huruf(o.kanan, j[x.id]) : '·'); }).join(', ');
        else tampil = '<span style="white-space:pre-wrap">' + esc(j) + '</span>';
        var skor = q.jenis === 'ESAI' ? (q.esai ? q.esai.skor + '/' + q.skor_maks : 'belum dinilai') : Math.round((q.skor || 0) * 100) + '%';
        var benar = q.jenis !== 'ESAI' && q.skor >= 1, salah = q.jenis !== 'ESAI' && !q.skor;
        return '<article class="kartu-soal ' + (salah ? 'merah' : !benar && q.jenis !== 'ESAI' ? 'kuning' : '') + '"><div class="kartu-soal-kepala"><b>Soal ' + q.no + '</b><span class="label-jenis">' + q.jenis + '</span>' +
          '<span class="' + (benar ? 'jawaban-benar' : salah ? 'jawaban-salah' : '') + '">Skor ' + skor + '</span></div>' +
          window.MSOAL.htmlSoal({ jenis: q.jenis, html: q.html, opsi: q.opsi, kunci: q.kunci, rubrik: q.rubrik, skor_maks: q.skor_maks }, { kunci: true }) +
          '<p style="margin-top:10px"><b>Jawaban siswa:</b> ' + tampil + '</p>' + (q.esai && q.esai.catatan ? '<p class="kecil muted">Catatan penilai: ' + esc(q.esai.catatan) + '</p>' : '') + '</article>';
      }).join('');
      PN.muatGambar($('dj-isi'));
    });
  }

  // =========================================================================
  // W-30 Koreksi esai per soal dengan rubrik
  // =========================================================================
  function halamanEsai(idUjian, idSoal) {
    PN.judul('Koreksi Esai', 'Nilai & Koreksi');
    var E = { hal: 0, i: 0, data: null, tampilNama: false, skor: {} };
    PN.konten().innerHTML = '<p><a class="btn btn-ghost btn-sm" href="#/nilai/' + encodeURIComponent(idUjian) + '">' + ikon('arrow-l', 'ic-sm') + 'Kembali ke rekap</a></p><div id="es-isi"><div class="kerangka-muat"></div></div>';
    function muatHal(h, segarkan) {
      return Promise.all([PN.panggil('ambilJawabanEsai', { id_ujian: idUjian, id_soal: idSoal, halaman: h, segarkan: !!segarkan }, { timeout: 180000 }), API.katex()]).then(function (r) {
        if (!r[0].ok) throw new Error(r[0].pesan);
        E.data = r[0].data; E.hal = r[0].data.halaman;
        return E.data;
      });
    }
    function render() {
      var d = E.data, el = $('es-isi');
      if (!d.total) { el.innerHTML = '<section class="kartu-blok"><div class="kosong-isi"><p><b>Tidak ada jawaban untuk soal ini.</b></p></div></section>'; return; }
      var a = d.jawaban[E.i], rub = d.soal.rubrik || [];
      var nilai = E.skor[a.id_peserta] || (a.nilai ? { kriteria: a.nilai.kriteria.slice(), catatan: a.nilai.catatan } : { kriteria: rub.map(function () { return null; }), catatan: '' });
      E.skor[a.id_peserta] = nilai;
      var urut = E.hal * 20 + E.i + 1, total = nilai.kriteria.reduce(function (s, x) { return s + (Number(x) || 0); }, 0);
      el.innerHTML = '<section class="kartu-blok" style="padding:16px 20px"><div class="baris-aksi"><b>Jawaban ' + urut + ' dari ' + d.total + '</b><span class="muted kecil">· ' + d.dinilai + ' dari ' + d.total + ' sudah dinilai</span>' +
        '<div class="batang-progres" style="flex:1;min-width:120px"><i style="width:' + Math.round(d.dinilai / d.total * 100) + '%"></i></div>' +
        '<label class="sakelar"><input type="checkbox" id="es-nama"' + (E.tampilNama ? ' checked' : '') + '><i></i><span class="kecil">Tampilkan nama</span></label></div></section>' +
        '<div class="esai-badan"><div><section class="kartu-blok" style="padding:18px 20px"><p class="label">Soal</p><div class="isi-soal">' + API.bersihHtml(d.soal.html) + '</div></section>' +
        '<p class="label">Jawaban ' + (E.tampilNama ? '<b>' + esc(a.nama) + '</b> · ' + esc(a.rombel) : '<span class="muted">(nama disembunyikan)</span>') + '</p>' +
        '<div class="esai-jawaban">' + esc(a.teks) + '</div></div>' +
        '<aside class="kartu-blok" style="padding:16px 18px;position:sticky;top:90px"><p class="label">Jawaban acuan</p><p class="kecil" style="white-space:pre-wrap">' + esc(d.soal.acuan || '-') + '</p>' +
        rub.map(function (r, k) {
          var maks = Number(r.skor) || 0, pilih = nilai.kriteria[k];
          var tombol = []; for (var s = 0; s <= maks; s++) tombol.push('<button type="button" class="' + (pilih === s ? 'aktif' : '') + '" data-kr="' + k + '" data-s="' + s + '">' + s + '</button>');
          return '<div class="kriteria"><p>' + esc(r.kriteria) + ' <span class="muted">(maks ' + maks + ')</span></p><div class="skor-pilih">' + tombol.join('') + '</div></div>';
        }).join('') +
        '<label class="field" style="margin-top:12px"><span class="label">Catatan (opsional)</span><textarea class="input" id="es-catatan" rows="2">' + esc(nilai.catatan || '') + '</textarea></label>' +
        '<p class="nilai-besar">Skor ' + total + ' / ' + d.soal.skor_maks + '</p>' +
        '<div class="baris-aksi"><button class="btn btn-secondary" id="es-prev"' + (urut > 1 ? '' : ' disabled') + '>Sebelumnya</button><span class="spasi"></span><button class="btn btn-primary" id="es-simpan">Simpan &amp; lanjut</button></div></aside></div>';
      PN.muatGambar(el);
      $('es-nama').onchange = function () { E.tampilNama = this.checked; render(); };
      el.querySelectorAll('[data-kr]').forEach(function (b) { b.onclick = function () { nilai.kriteria[Number(b.getAttribute('data-kr'))] = Number(b.getAttribute('data-s')); nilai.catatan = $('es-catatan').value; render(); }; });
      $('es-prev').onclick = function () { nilai.catatan = $('es-catatan').value; pindah(-1); };
      $('es-simpan').onclick = function () {
        nilai.catatan = $('es-catatan').value;
        if (nilai.kriteria.some(function (x) { return x === null || x === undefined; })) { PN.toast('Pilih skor untuk setiap kriteria.', 'warn'); return; }
        var sudahAda = !!a.nilai;
        a.nilai = { kriteria: nilai.kriteria.slice(), skor: total, catatan: nilai.catatan };
        if (!sudahAda) d.dinilai++;
        // simpan di latar belakang (optimistic); bila ditolak, tampilkan pesan dan kembalikan
        PN.panggil('simpanNilaiEsai', { id_ujian: idUjian, id_soal: idSoal, nilai: [{ id_peserta: a.id_peserta, kriteria: nilai.kriteria, catatan: nilai.catatan }] }, { timeout: 120000 }).then(function (r) {
          if (!r.ok) { if (!sudahAda) { a.nilai = null; d.dinilai--; } PN.toast('Nilai ' + (E.tampilNama ? a.nama : 'jawaban ' + urut) + ' gagal disimpan: ' + r.pesan, 'danger', 8000); return; }
          if (r.data.koreksi) PN.toast('Semua esai sudah dinilai. Nilai akhir dihitung ulang.', 'ok', 7000);
        });
        pindah(1);
      };
    }
    function pindah(arah) {
      var d = E.data, idx = E.i + arah;
      if (idx >= 0 && idx < d.jawaban.length) { E.i = idx; render(); window.scrollTo(0, 0); return; }
      var h = E.hal + arah;
      if (h < 0) return;
      if (h >= d.jumlah_halaman) { PN.toast('Itu jawaban terakhir. ' + d.dinilai + ' dari ' + d.total + ' sudah dinilai.', d.dinilai >= d.total ? 'ok' : 'warn'); return; }
      $('es-isi').innerHTML = '<div class="kerangka-muat"></div>';
      muatHal(h).then(function () { E.i = arah > 0 ? 0 : E.data.jawaban.length - 1; render(); }, function (e) { $('es-isi').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
    }
    muatHal(0).then(function () {
      var d = E.data, k = d.jawaban.map(function (a) { return !a.nilai; }).indexOf(true);
      E.i = k > -1 ? k : 0; render();
    }, function (e) { $('es-isi').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
  }

  // =========================================================================
  // Unduhan Excel: rekap & e-Rapor (F-29, F-30)
  // =========================================================================
  function unduhRekap(R, rows) {
    var U = R.ujian;
    API.muatSkrip('./js/xlsx.js').then(function () {
      var soal = R.soal;
      var data = [['No', 'NIS', 'NISN', 'Nama', 'Rombel', 'Kehadiran', 'Skor', 'Nilai', 'Remedial', 'Nilai akhir', 'Tuntas', 'Status', 'Kode bukti'].concat(soal.map(function (q) { return 'S' + q.no; }))]
        .concat(rows.map(function (p, i) {
          var a = nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas);
          return [i + 1, p.nis, p.nisn, p.nama, p.rombel, p.kehadiran || '', p.skor === null ? '' : p.skor, p.nilai === null ? '' : p.nilai, p.remedial === null ? '' : p.remedial,
            a === null ? '' : a, a === null ? '' : (a >= U.batas_tuntas ? 'Ya' : 'Tidak'), p.status, p.kode].concat(soal.map(function (q) { return p.per && p.per[q.id] !== undefined && p.per[q.id] !== null ? Math.round(p.per[q.id] * 100) / 100 : ''; }));
        }));
      var analisis = [['No soal', 'Jenis', 'Bobot', 'Tingkat kesukaran (p)', 'Daya pembeda (D)', 'Kategori']].concat(soal.map(function (q) { var a = R.analisis[q.id] || {}; return [q.no, q.jenis, q.bobot, a.p === undefined ? '' : a.p, a.d === undefined ? '' : a.d, a.kategori || '']; }));
      var perRombel = [['Rombel', 'Dinilai', 'Rata-rata', 'Terendah', 'Tertinggi', 'Tuntas', '% Tuntas']];
      rows.map(function (p) { return p.rombel; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort().forEach(function (rb) {
        var s = statistik(rows.filter(function (p) { return p.rombel === rb; }), U.batas_tuntas, R.aturan_remedial);
        perRombel.push([rb, s.n, s.n ? Math.round(s.rata * 100) / 100 : '', s.n ? s.min : '', s.n ? s.maks : '', s.n ? s.tuntas : '', s.n ? Math.round(s.tuntas / s.n * 100) : '']);
      });
      return XLSX.tulis([{ nama: 'Rekap Nilai', baris: data, lebar: [5, 10, 13, 32, 10, 12, 8, 8, 9, 10, 8, 14, 10] }, { nama: 'Per Rombel', baris: perRombel }, { nama: 'Analisis Butir', baris: analisis, lebar: [8, 8, 8, 20, 18, 26] }]);
    }).then(function (b) { API.unduh(b, 'Rekap_' + U.nama.replace(/[^\w]+/g, '_') + '.xlsx'); });
  }

  function eksporERapor(R, rombelAwal) {
    var U = R.ujian;
    var profil = []; try { profil = JSON.parse(R.profil_erapor || '[]'); } catch (e) { profil = []; }
    if (!Array.isArray(profil) || !profil.length) profil = window.MADMIN ? window.MADMIN.PROFIL_BAWAAN : [{ s: 'no', j: 'No' }, { s: 'nisn', j: 'NISN' }, { s: 'nama', j: 'Nama Peserta Didik' }, { s: 'nilai', j: 'Nilai' }];
    var rombel = R.peserta.map(function (p) { return p.rombel; }).filter(function (v, i, a) { return v && a.indexOf(v) === i; }).sort();
    PN.modal('<div class="modal-kepala"><h2>Ekspor nilai untuk e-Rapor</h2><p>Satu file Excel per rombel dan mapel, disusun menurut profil ekspor di Pengaturan.</p></div><div class="modal-isi">' +
      '<label class="field"><span class="label">Rombel</span><select class="input" id="er-rombel">' + rombel.map(function (r) { return '<option' + (rombelAwal === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select></label><div id="er-cek"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>' + ikon('download', 'ic-sm') + 'Unduh</button></div>', 'lebar');
    function cek() {
      var rb = $('er-rombel').value, rows = R.peserta.filter(function (p) { return p.rombel === rb; });
      var tanpaNisn = rows.filter(function (p) { return !p.nisn; }), tanpaNilai = rows.filter(function (p) { return p.nilai === null; });
      $('er-cek').innerHTML = (tanpaNisn.length ? '<div class="alert alert-warn">' + ikon('alert') + '<span>' + tanpaNisn.length + ' siswa tanpa NISN: ' + esc(tanpaNisn.map(function (p) { return p.nama; }).join(', ')) + '. Lengkapi di menu Peserta agar e-Rapor mengenalinya.</span></div>' : '') +
        (tanpaNilai.length ? '<div class="alert alert-warn" style="margin-top:8px">' + ikon('alert') + '<span>' + tanpaNilai.length + ' siswa tanpa nilai (tidak hadir/belum susulan): ' + esc(tanpaNilai.map(function (p) { return p.nama; }).slice(0, 12).join(', ')) + (tanpaNilai.length > 12 ? ', …' : '') + '.</span></div>' : '') +
        (!tanpaNisn.length && !tanpaNilai.length ? '<div class="alert alert-ok">' + ikon('check-c') + '<span>' + rows.length + ' siswa lengkap NISN dan nilainya.</span></div>' : '') +
        (rows.some(function (p) { return p.nilai !== null && ['Terverifikasi', 'Dipublikasi', 'Final'].indexOf(p.status) < 0; }) ? '<p class="kecil muted">Catatan: sebagian nilai belum diverifikasi.</p>' : '');
    }
    cek(); $('er-rombel').onchange = cek;
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) { PN.tutupModal(); return; }
      if (!e.target.closest('[data-ok]')) return;
      var rb = $('er-rombel').value;
      var rows = R.peserta.filter(function (p) { return p.rombel === rb; }).sort(function (a, b) { return a.nama.localeCompare(b.nama); });
      var nilaiDari = function (p, s, i) {
        var a = nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas);
        return { no: i + 1, nisn: p.nisn, nis: p.nis, nama: p.nama, rombel: p.rombel, nilai: a === null ? '' : Math.round(a), nilai_asli: p.nilai === null ? '' : p.nilai,
          nilai_remedial: p.remedial === null ? '' : p.remedial, mapel: U.mapel, kosong: '' }[s];
      };
      API.muatSkrip('./js/xlsx.js').then(function () {
        return XLSX.tulis([{ nama: rb, baris: [profil.map(function (k) { return k.j; })].concat(rows.map(function (p, i) { return profil.map(function (k) { return nilaiDari(p, k.s, i); }); })) }]);
      }).then(function (b) { API.unduh(b, 'eRapor_' + U.mapel.replace(/[^\w]+/g, '_') + '_' + rb.replace(/[^\w]+/g, '_') + '.xlsx'); PN.tutupModal(); });
    };
  }

  // =========================================================================
  // W-18 Laporan & analisis
  // =========================================================================
  function halamanLaporan(bagian) {
    if (bagian[0]) return laporanUjian(bagian[0]);
    PN.judul('Laporan');
    PN.konten().innerHTML = PN.bannerMode() + (PN.P.peran === 'kepsek' ? '<p><span class="pill pill-warn">' + ikon('eye') + 'Mode lihat saja</span></p>' : '') +
      '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Rekap nilai &amp; ketuntasan per ujian</h2><p>Rata-rata dan persentase tuntas per rombel. Buka ujian untuk grafik, analisis butir, dan hasil per siswa.</p></div></div><div id="lp-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    PN.panggil('rekapSekolah', {}, { timeout: 120000 }).then(function (r) {
      var el = $('lp-daftar'); if (!el) return;
      if (!r.ok) { el.innerHTML = '<div class="kosong-isi"><p>' + esc(r.pesan) + '</p></div>'; return; }
      el.innerHTML = tabelRekapSekolah(r.data.ujian);
    });
  }

  function tabelRekapSekolah(ujian) {
    var ada = ujian.filter(function (u) { return u.rombel.length; });
    if (!ada.length) return '<div class="kosong-isi">' + ikon('chart') + '<p><b>Belum ada nilai.</b></p></div>';
    return '<div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>Ujian</th><th>Mapel</th><th>Rombel</th><th class="kanan">Dinilai</th><th class="kanan">Rata-rata</th><th class="kanan">Tuntas</th><th></th></tr></thead><tbody>' +
      ada.map(function (u) {
        return u.rombel.map(function (rb, i) {
          var pct = Math.round(rb.tuntas / rb.n * 100);
          return '<tr>' + (i ? '<td></td><td></td>' : '<td><b>' + esc(u.nama) + '</b><span class="sub">' + esc(u.jenis) + ' · ' + PN.tanggal(u.tanggal) + ' · ' + esc(u.status) + '</span></td><td>' + esc(u.mapel) + '<span class="sub">KKTP ' + u.batas_tuntas + '</span></td>') +
            '<td>' + esc(rb.rombel) + '</td><td class="kanan tnum">' + rb.n + '</td><td class="kanan tnum"><b>' + f1(rb.rata) + '</b></td>' +
            '<td class="kanan tnum"><span class="' + (pct >= 75 ? 'nilai-tuntas' : 'nilai-remed') + '">' + pct + '%</span></td>' +
            '<td class="aksi">' + (i ? '' : '<a class="btn btn-secondary btn-sm" href="#/laporan/' + encodeURIComponent(u.id) + '">Buka</a>') + '</td></tr>';
        }).join('');
      }).join('') + '</tbody></table></div>';
  }

  function svgHistogram(nilai) {
    var kel = []; for (var i = 0; i < 10; i++) kel.push(0);
    nilai.forEach(function (v) { kel[Math.min(9, Math.floor(v / 10))]++; });
    var maks = Math.max.apply(null, kel.concat([1])), W = 540, H = 230, kiri = 34, bawah = 30, atas = 16, lebar = (W - kiri - 10) / 10, bw = Math.min(24, lebar - 10);
    var y = function (n) { return atas + (H - atas - bawah) * (1 - n / maks); };
    var grid = [0, 0.5, 1].map(function (t) { var n = Math.round(maks * t); return '<line x1="' + kiri + '" x2="' + W + '" y1="' + y(n) + '" y2="' + y(n) + '" stroke="#E2E8F0"/><text x="' + (kiri - 6) + '" y="' + (y(n) + 4) + '" text-anchor="end">' + n + '</text>'; }).join('');
    var batang = kel.map(function (n, i) {
      var x = kiri + i * lebar + (lebar - bw) / 2, h = H - bawah - y(n);
      var path = n ? 'M' + x + ',' + (H - bawah) + 'V' + (y(n) + 4) + 'q0,-4 4,-4h' + (bw - 8) + 'q4,0 4,4V' + (H - bawah) + 'z' : '';
      return '<g><title>Nilai ' + (i * 10) + '–' + (i === 9 ? 100 : i * 10 + 9) + ': ' + n + ' siswa</title>' + (path ? '<path d="' + path + '" fill="' + WARNA[0] + '"/>' : '') +
        '<rect x="' + (kiri + i * lebar) + '" y="' + atas + '" width="' + lebar + '" height="' + (H - atas - bawah) + '" fill="transparent"/>' +
        (n ? '<text class="label-nilai" x="' + (x + bw / 2) + '" y="' + (y(n) - 4) + '" text-anchor="middle">' + n + '</text>' : '') +
        '<text x="' + (x + bw / 2) + '" y="' + (H - bawah + 16) + '" text-anchor="middle">' + (i * 10) + '</text></g>';
    }).join('');
    return '<svg class="grafik" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Histogram distribusi nilai">' + grid + '<line x1="' + kiri + '" x2="' + W + '" y1="' + (H - bawah) + '" y2="' + (H - bawah) + '" stroke="#CBD5E1"/>' + batang + '</svg>';
  }

  function svgRombel(data) {
    // dua ukuran pada skala yang sama (0–100): rata-rata nilai dan % tuntas, batang berdampingan
    var W = 540, H = 240, kiri = 34, bawah = 34, atas = 18, n = Math.max(1, data.length), slot = (W - kiri - 10) / n, bw = Math.min(24, (slot - 18) / 2);
    var y = function (v) { return atas + (H - atas - bawah) * (1 - v / 100); };
    var grid = [0, 50, 100].map(function (v) { return '<line x1="' + kiri + '" x2="' + W + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E2E8F0"/><text x="' + (kiri - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>'; }).join('');
    var bar = function (x, v, w) { return v > 0 ? '<path d="M' + x + ',' + (H - bawah) + 'V' + (y(v) + 4) + 'q0,-4 4,-4h' + (bw - 8) + 'q4,0 4,4V' + (H - bawah) + 'z" fill="' + w + '"/>' : ''; };
    var isi = data.map(function (d, i) {
      var x0 = kiri + i * slot + (slot - 2 * bw - 2) / 2;
      return '<g><title>' + esc(d.rombel) + ': rata-rata ' + f1(d.rata) + ', tuntas ' + d.pct + '%</title>' + bar(x0, d.rata, WARNA[0]) + bar(x0 + bw + 2, d.pct, WARNA[1]) +
        '<text class="label-nilai" x="' + (x0 + bw / 2) + '" y="' + (y(d.rata) - 5) + '" text-anchor="middle">' + Math.round(d.rata) + '</text>' +
        '<text class="label-nilai" x="' + (x0 + bw * 1.5 + 2) + '" y="' + (y(d.pct) - 5) + '" text-anchor="middle">' + d.pct + '%</text>' +
        '<text x="' + (x0 + bw + 1) + '" y="' + (H - bawah + 18) + '" text-anchor="middle">' + esc(d.rombel) + '</text></g>';
    }).join('');
    return '<svg class="grafik" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Rata-rata dan ketuntasan per rombel">' + grid + '<line x1="' + kiri + '" x2="' + W + '" y1="' + (H - bawah) + '" y2="' + (H - bawah) + '" stroke="#CBD5E1"/>' + isi + '</svg>';
  }

  function laporanUjian(id) {
    PN.judul('Laporan Ujian', 'Laporan');
    PN.konten().innerHTML = '<p><a class="btn btn-ghost btn-sm" href="#/laporan">' + ikon('arrow-l', 'ic-sm') + 'Kembali</a></p><div id="lu-isi"><div class="kartu-blok" style="padding:20px"><div class="kerangka-muat"></div></div></div>';
    muatRekap(id, true).then(function (R) {
      var U = R.ujian, rows = R.peserta.filter(function (p) { return p.nilai !== null; });
      var nilai = rows.map(function (p) { return nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas); });
      var rombel = rows.map(function (p) { return p.rombel; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).sort();
      var perRombel = rombel.map(function (rb) { var s = statistik(rows.filter(function (p) { return p.rombel === rb; }), U.batas_tuntas, R.aturan_remedial); return { rombel: rb, n: s.n, rata: s.rata, min: s.min, maks: s.maks, tuntas: s.tuntas, pct: Math.round(s.tuntas / s.n * 100) }; });
      var st = statistik(rows, U.batas_tuntas, R.aturan_remedial);
      var tinjau = R.soal.filter(function (q) { var a = R.analisis[q.id]; return a && (a.d < 0.2 || a.p < 0.2 || a.p > 0.9); });
      $('lu-isi').innerHTML = '<div class="kepala-bagian"><div><h2>' + esc(U.nama) + '</h2><p>' + esc(U.mapel) + ' · ' + esc(U.jenis) + ' · ' + PN.tanggal(U.tanggal) + ' · batas tuntas ' + U.batas_tuntas + '</p></div>' +
        '<div class="baris-aksi"><button class="btn btn-secondary" id="lu-lembar">' + ikon('printer', 'ic-sm') + 'Lembar hasil per siswa</button><button class="btn btn-secondary" id="lu-cetak">' + ikon('printer', 'ic-sm') + 'Cetak laporan</button>' +
        '<button class="btn btn-primary" id="lu-excel">' + ikon('download', 'ic-sm') + 'Unduh Excel</button></div></div>' +
        '<div class="kartu-angka"><div class="angka"><div class="angka-kepala">Dinilai' + ikon('users') + '</div><b>' + (st.n || 0) + '</b><small>' + R.peserta.length + ' terjadwal</small></div>' +
        '<div class="angka"><div class="angka-kepala">Rata-rata' + ikon('chart') + '</div><b>' + f1(st.rata) + '</b><small>' + f1(st.min) + ' – ' + f1(st.maks) + '</small></div>' +
        '<div class="angka ok"><div class="angka-kepala">Tuntas' + ikon('check-c') + '</div><b>' + (st.n ? Math.round(st.tuntas / st.n * 100) + '%' : '-') + '</b><small>' + (st.tuntas || 0) + ' siswa</small></div>' +
        '<div class="angka warn"><div class="angka-kepala">Butir perlu ditinjau' + ikon('alert') + '</div><b>' + tinjau.length + '</b><small>dari ' + R.soal.length + ' soal</small></div></div>' +
        (st.n ? '<div class="kolom-dua"><section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Distribusi nilai</h2><p>Jumlah siswa per rentang nilai</p></div></div><div style="padding:12px 16px">' + svgHistogram(nilai) + '</div></section>' +
          '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Rata-rata &amp; ketuntasan per rombel</h2><p>Skala 0–100</p></div></div><div style="padding:12px 16px 4px">' + svgRombel(perRombel) + '</div>' +
          '<div class="legenda"><span><i style="background:' + WARNA[0] + '"></i>Rata-rata nilai</span><span><i style="background:' + WARNA[1] + '"></i>% siswa tuntas</span></div></section></div>' : '') +
        '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Per rombel</h2></div></div><table class="tabel tabel-ringkas"><thead><tr><th>Rombel</th><th class="kanan">Dinilai</th><th class="kanan">Rata-rata</th><th class="kanan">Terendah</th><th class="kanan">Tertinggi</th><th class="kanan">Tuntas</th></tr></thead><tbody>' +
        perRombel.map(function (d) { return '<tr><td><b>' + esc(d.rombel) + '</b></td><td class="kanan tnum">' + d.n + '</td><td class="kanan tnum">' + f1(d.rata) + '</td><td class="kanan tnum">' + f1(d.min) + '</td><td class="kanan tnum">' + f1(d.maks) + '</td><td class="kanan tnum">' + d.tuntas + ' (' + d.pct + '%)</td></tr>'; }).join('') + '</tbody></table></section>' +
        '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Analisis butir</h2><p>Tingkat kesukaran p (0 = sukar, 1 = mudah) dan daya pembeda D (27% atas − 27% bawah). ' + (R.analisis_tersimpan ? 'Tersimpan permanen saat verifikasi.' : 'Dihitung sementara dari Rekaman Jawaban.') + '</p></div></div>' +
        (Object.keys(R.analisis).length ? '<table class="tabel tabel-ringkas"><thead><tr><th>Soal</th><th>Jenis</th><th class="kanan">p</th><th class="kanan">D</th><th>Kategori</th></tr></thead><tbody>' +
          R.soal.map(function (q) { var a = R.analisis[q.id]; if (!a) return ''; var perlu = a.d < 0.2 || a.p < 0.2 || a.p > 0.9; return '<tr><td>' + q.no + '</td><td><span class="label-jenis">' + q.jenis + '</span></td><td class="kanan tnum">' + f1(a.p) + '</td><td class="kanan tnum">' + f1(a.d) + '</td><td>' + esc(a.kategori) + (perlu ? ' <span class="pill pill-warn">' + ikon('alert') + 'tinjau</span>' : '') + '</td></tr>'; }).join('') + '</tbody></table>' :
          '<div class="kosong-isi"><p>Analisis butir belum tersedia (sakelar dimatikan atau belum ada nilai).</p></div>') + '</section>' +
        '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Hasil per siswa</h2><p>Urut nilai tertinggi</p></div></div><div class="tabel-gulir"><table class="tabel tabel-ringkas"><thead><tr><th>No</th><th>Nama</th><th>Rombel</th><th class="kanan">Nilai</th><th class="kanan">Remedial</th><th>Keterangan</th></tr></thead><tbody>' +
        rows.slice().sort(function (a, b) { return nilaiAkhir(b, R.aturan_remedial, U.batas_tuntas) - nilaiAkhir(a, R.aturan_remedial, U.batas_tuntas); }).map(function (p, i) {
          var a = nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas);
          return '<tr><td>' + (i + 1) + '</td><td>' + esc(p.nama) + '</td><td>' + esc(p.rombel) + '</td><td class="kanan tnum"><b>' + f1(p.nilai) + '</b></td><td class="kanan tnum">' + f1(p.remedial) + '</td><td>' + (a >= U.batas_tuntas ? '<span class="pill pill-ok">Tuntas</span>' : '<span class="pill pill-danger">Belum tuntas</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div></section>';
      $('lu-excel').onclick = function () { unduhRekap(R, R.peserta); };
      $('lu-cetak').onclick = function () { cetakLaporan(R, perRombel, st, nilai); };
      $('lu-lembar').onclick = function () { cetakLembar(R, rows); };
    }, function (e) { $('lu-isi').innerHTML = '<div class="alert alert-danger">' + ikon('alert') + '<span>' + esc(e.message) + '</span></div>'; });
  }

  function sekolahCetak() {
    var b = (PN.P.boot && PN.P.boot.sekolah) || {};
    return Promise.resolve({ nama: b.nama_sekolah, npsn: b.npsn, alamat: b.alamat, kabupaten: b.kabupaten, provinsi: b.provinsi, logo: b.logo, tahun: b.tahun_pelajaran, semester: b.semester });
  }

  function cetakLaporan(R, perRombel, st, nilai) {
    var U = R.ujian, kop = window.MADMIN ? window.MADMIN.kopSekolah : function () { return ''; };
    sekolahCetak().then(function (s) {
      PN.cetak('<div class="halaman">' + kop(s) + '<h2>Laporan Hasil ' + esc(U.nama) + '</h2><p>Mapel ' + esc(U.mapel) + ' · ' + PN.tanggal(U.tanggal) + ' · batas tuntas ' + U.batas_tuntas + ' · rata-rata ' + f1(st.rata) + ' · tuntas ' + (st.n ? Math.round(st.tuntas / st.n * 100) : 0) + '%</p>' +
        '<table><thead><tr><th>Rombel</th><th>Dinilai</th><th>Rata-rata</th><th>Terendah</th><th>Tertinggi</th><th>Tuntas</th></tr></thead><tbody>' + perRombel.map(function (d) { return '<tr><td>' + esc(d.rombel) + '</td><td class="tengah">' + d.n + '</td><td class="tengah">' + f1(d.rata) + '</td><td class="tengah">' + f1(d.min) + '</td><td class="tengah">' + f1(d.maks) + '</td><td class="tengah">' + d.tuntas + ' (' + d.pct + '%)</td></tr>'; }).join('') + '</tbody></table>' +
        '<div style="margin:6mm 0">' + svgHistogram(nilai) + '</div>' +
        (Object.keys(R.analisis).length ? '<h2 style="font-size:11pt">Analisis butir</h2><table><thead><tr><th>Soal</th><th>Jenis</th><th>p</th><th>D</th><th>Kategori</th></tr></thead><tbody>' + R.soal.map(function (q) { var a = R.analisis[q.id]; return a ? '<tr><td class="tengah">' + q.no + '</td><td>' + q.jenis + '</td><td class="tengah">' + f1(a.p) + '</td><td class="tengah">' + f1(a.d) + '</td><td>' + esc(a.kategori) + '</td></tr>' : ''; }).join('') + '</tbody></table>' : '') + '</div>', 'Laporan ' + U.nama);
    });
  }

  function cetakLembar(R, rows) {
    var U = R.ujian;
    sekolahCetak().then(function (s) {
      var blok = rows.slice().sort(function (a, b) { return a.rombel.localeCompare(b.rombel) || a.nama.localeCompare(b.nama); }).map(function (p) {
        var a = nilaiAkhir(p, R.aturan_remedial, U.batas_tuntas);
        return '<div style="border:1px solid #000;padding:4mm;margin-bottom:4mm;break-inside:avoid"><b>' + esc(s.nama || '') + ' · Lembar Hasil Ujian</b><table class="tanpa-garis" style="margin-top:2mm">' +
          '<tr><td style="width:40mm">Nama</td><td>: <b>' + esc(p.nama) + '</b> (' + esc(p.rombel) + ')</td></tr><tr><td>Ujian / mapel</td><td>: ' + esc(U.nama) + ' / ' + esc(U.mapel) + '</td></tr>' +
          '<tr><td>Nilai</td><td>: <b>' + f1(p.nilai) + '</b>' + (p.remedial !== null ? ' · remedial ' + f1(p.remedial) : '') + ' · ' + (a >= U.batas_tuntas ? 'Tuntas' : 'Belum tuntas') + ' (batas ' + U.batas_tuntas + ')</td></tr>' +
          '<tr><td>Kode bukti</td><td>: ' + esc(p.kode || '-') + '</td></tr><tr><td>Batas sanggah</td><td>: ' + (U.sanggah_sampai ? PN.tanggalJam(U.sanggah_sampai) : 'sesuai pengumuman sekolah') + '</td></tr></table></div>';
      });
      PN.cetak('<div class="halaman">' + blok.join('') + '</div>', 'Lembar hasil ' + U.nama);
    });
  }

  // =========================================================================
  // W-31 Beranda kepala sekolah: rekap nilai di bawah ringkasan pelaksanaan
  // =========================================================================
  PN.BERANDA.kepsek = function () {
    return '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Rekap nilai &amp; ketuntasan</h2><p>Per mapel dan rombel</p></div><a class="btn btn-secondary btn-sm" href="#/laporan">Semua laporan</a></div><div id="kp-rekap"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
  };
  PN.BERANDA.kepsek_pasang = function () {
    if (PN.P.boot && PN.P.boot.mode_ujian) { $('kp-rekap').innerHTML = '<div class="kosong-isi"><p>Rekap nilai ditampilkan setelah semua sesi ujian selesai.</p></div>'; return; }
    PN.panggil('rekapSekolah', {}, { timeout: 120000 }).then(function (r) { var el = $('kp-rekap'); if (el) el.innerHTML = r.ok ? tabelRekapSekolah(r.data.ujian.slice(0, 8)) : '<div class="kosong-isi"><p>' + esc(r.pesan) + '</p></div>'; });
  };

  PN.daftar('nilai', halamanNilai);
  PN.daftar('laporan', halamanLaporan);
})();
