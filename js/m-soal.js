/* m-soal.js — Modul guru: Bank Soal (W-11), Unggah & Periksa (W-12, W-13), Potong soal (W-14),
 * Tulis/Ubah soal (W-15), Paket ujian (W-16), dan tambahan Beranda guru (W-10).
 * Semua file diproses di browser guru; server hanya menerima hasil akhirnya (PRD 7.4).
 */
(function () {
  'use strict';
  var PN = window.PANEL, $ = PN.$, esc = PN.esc, ikon = PN.ikon;
  var JENIS = { PG: 'Pilihan ganda', PGK: 'PG kompleks', BS: 'Benar–salah', JODOH: 'Menjodohkan', ISIAN: 'Isian singkat', ESAI: 'Uraian' };
  var HURUF = 'ABCDEFGHIJ';
  var S = { bank: null, full: {}, stim: {}, saring: { mapel: '', tingkat: '', jenis: '', pembuat: '', status: 'aktif', cari: '' }, hal: 0, pilih: {}, impor: null, paket: null };

  // =========================================================================
  // Pembantu umum
  // =========================================================================
  function mapelSaya() { return (PN.P.boot && PN.P.boot.cakupan && PN.P.boot.cakupan.mapel) || []; }
  function namaMapel(id) { var m = mapelSaya().filter(function (x) { return x.id === id; })[0]; return m ? m.nama : id; }
  function bersih(h) { return API.bersihHtml(h); }
  function teksPolos(h) { var d = document.createElement('div'); d.innerHTML = h || ''; d.querySelectorAll('.katex-mathml,annotation').forEach(function (x) { x.remove(); }); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
  function idSem() { return 'tmp-' + Math.random().toString(36).slice(2, 9); }
  function tampilKatex() { return API.katex(); }
  function opsiDaftar(q) { var o = q.opsi || {}; return q.jenis === 'BS' ? (o.pernyataan || []) : q.jenis === 'JODOH' ? (o.kiri || []) : (o.opsi || []); }

  /** Render soal seperti di layar siswa. opsi: { stimulus, kunci (tampilkan kunci), klik (opsi bisa diklik untuk memilih kunci) } */
  function htmlSoal(q, opsi) {
    opsi = opsi || {};
    var h = '', k = q.kunci;
    if (opsi.stimulus) h += '<div class="stimulus-blok"><small>' + esc(opsi.stimulus.judul || 'Stimulus') + '</small><div class="isi-soal">' + bersih(opsi.stimulus.html) + '</div></div>';
    h += '<div class="isi-soal">' + bersih(q.html || q.konten_tampil || '') + '</div>';
    var o = q.opsi || {};
    if (q.jenis === 'PG' || q.jenis === 'PGK') {
      h += '<ul class="opsi-tampil">' + (o.opsi || []).map(function (x, i) {
        var benar = opsi.kunci && (q.jenis === 'PG' ? k === x.id : Array.isArray(k) && k.indexOf(x.id) > -1);
        return '<li class="' + (benar ? 'kunci ' : '') + (opsi.klik ? 'bisa-klik' : '') + '" data-opsi="' + esc(x.id) + '"><b>' + HURUF[i] + '</b><div class="isi-soal">' + bersih(x.html) + '</div></li>';
      }).join('') + '</ul>';
    } else if (q.jenis === 'BS') {
      h += '<table class="tabel-item">' + (o.pernyataan || []).map(function (x, i) {
        var v = opsi.kunci && k ? k[x.id] : '';
        return '<tr><td>(' + (i + 1) + ')</td><td class="isi-soal">' + bersih(x.html) + '</td><td class="k">' + (v === 'B' ? '<span class="pill pill-ok">Benar</span>' : v === 'S' ? '<span class="pill pill-danger">Salah</span>' : opsi.kunci ? '<span class="pill pill-idle">?</span>' : '') + '</td></tr>';
      }).join('') + '</table>';
    } else if (q.jenis === 'JODOH') {
      var kanan = o.kanan || [];
      h += '<table class="tabel-item">' + (o.kiri || []).map(function (x, i) {
        var r = opsi.kunci && k ? k[x.id] : '', ri = kanan.map(function (y) { return y.id; }).indexOf(r);
        return '<tr><td>(' + (i + 1) + ')</td><td class="isi-soal">' + bersih(x.html) + '</td><td class="k">' + (opsi.kunci ? (ri > -1 ? '<span class="pill pill-ok">→ ' + HURUF[ri] + '</span>' : '<span class="pill pill-idle">?</span>') : '') + '</td></tr>';
      }).join('') + '</table><ul class="opsi-tampil">' + kanan.map(function (x, i) { return '<li><b>' + HURUF[i] + '</b><div class="isi-soal">' + bersih(x.html) + '</div></li>'; }).join('') + '</ul>';
    } else if (q.jenis === 'ISIAN' && opsi.kunci) {
      h += '<p class="kecil" style="margin-top:10px">Jawaban diterima: ' + (Array.isArray(k) && k.length ? k.map(function (x) { return '<code>' + esc(x) + '</code>'; }).join(' · ') : '<i>belum ada</i>') + '</p>';
    } else if (q.jenis === 'ESAI' && opsi.kunci) {
      h += '<div class="kecil" style="margin-top:10px">' + (k && k.acuan ? '<p><b>Jawaban acuan:</b> ' + esc(k.acuan) + '</p>' : '') +
        '<p><b>Rubrik</b> (skor maks ' + (q.skor_maks || '-') + '): ' + ((q.rubrik || []).length ? q.rubrik.map(function (r) { return esc(r.kriteria) + ' <code>' + r.skor + '</code>'; }).join(' · ') : '<i>belum ada</i>') + '</p></div>';
    }
    return h;
  }

  /** Periksa satu soal: tanda merah memblokir penyimpanan, kuning hanya peringatan (F-17). */
  function periksa(q, bank) {
    var merah = [], kuning = [], o = q.opsi || {}, k = q.kunci;
    var ids = function (a) { return (a || []).map(function (x) { return x.id; }); };
    if (!teksPolos(q.html) && !/<img/i.test(q.html || '') && q.jenis !== 'BS' && q.jenis !== 'JODOH') merah.push('Teks soal kosong.');
    if (q.jenis === 'PG' || q.jenis === 'PGK') {
      if ((o.opsi || []).length < 2) merah.push('Opsi kurang dari dua.');
      if (q.jenis === 'PG' && ids(o.opsi).indexOf(k) < 0) merah.push('Kunci belum dipilih.');
      if (q.jenis === 'PGK' && (!Array.isArray(k) || !k.length || k.some(function (x) { return ids(o.opsi).indexOf(x) < 0; }))) merah.push('Kunci belum lengkap.');
      if ((o.opsi || []).some(function (x) { return !teksPolos(x.html) && !/<img/i.test(x.html); })) merah.push('Ada opsi yang kosong.');
    } else if (q.jenis === 'BS') {
      if (!(o.pernyataan || []).length) merah.push('Pernyataan belum ada.');
      else if (!k || ids(o.pernyataan).some(function (p) { return ['B', 'S'].indexOf(k[p]) < 0; })) merah.push('Kunci benar/salah belum lengkap.');
    } else if (q.jenis === 'JODOH') {
      if (!(o.kiri || []).length || (o.kanan || []).length < 2) merah.push('Pasangan kurang.');
      else if (!k || ids(o.kiri).some(function (x) { return ids(o.kanan).indexOf(k[x]) < 0; })) merah.push('Kunci pasangan belum lengkap.');
    } else if (q.jenis === 'ISIAN') {
      if (!Array.isArray(k) || !k.filter(String).length) merah.push('Jawaban benar belum diisi.');
    } else if (q.jenis === 'ESAI') {
      if (!(Number(q.skor_maks) > 0)) merah.push('Skor maksimal belum diisi.');
      if (!(q.rubrik || []).length) merah.push('Rubrik belum diisi.');
      else if ((q.rubrik || []).reduce(function (a, r) { return a + (Number(r.skor) || 0); }, 0) !== Number(q.skor_maks)) kuning.push('Jumlah skor rubrik tidak sama dengan skor maksimal.');
    }
    var semua = (q.html || '') + JSON.stringify(o);
    if (/data-tak=|gambar format/.test(semua)) merah.push('Ada gambar EMF/WMF yang gagal dimuat. Ganti gambarnya dengan PNG/JPG.');
    if (/objek-lama/.test(semua)) kuning.push('Ada rumus lama (Equation 3.0/MathType) yang tidak terbaca. Ketik ulang rumusnya atau gunakan Potong soal.');
    if (/rumus-gagal/.test(semua)) kuning.push('Ada rumus yang gagal ditampilkan.');
    if (q.rumusPdf) kuning.push('Rumus dari PDF mungkin tidak terbaca sempurna.');
    if (q.sumber === 'potong_pdf') kuning.push('Soal hasil potong PDF: tampil sebagai gambar, opsinya tidak diacak.');
    if (bank && teksPolos(q.html).length > 20) {
      var t = teksPolos(q.html).toLowerCase().slice(0, 160);
      if (bank.soal.some(function (b) { return b.id !== q.id && b.id_mapel === q.id_mapel && b.teks.toLowerCase().slice(0, 120) === t.slice(0, 120); })) kuning.push('Mirip dengan soal lain di bank soal.');
    }
    (q.masalah || []).forEach(function (m) { if (merah.indexOf(m) < 0 && kuning.indexOf(m) < 0 && !/kunci|opsi|Teks soal kosong|rumus|Potong soal|EMF/i.test(m)) kuning.push(m); });
    return { merah: merah, kuning: kuning };
  }

  // =========================================================================
  // Gambar: kompres di browser, unggah sebelum menyimpan soal
  // =========================================================================
  function kompresDataUrl(src, lebarTampil) {
    return new Promise(function (ok, gagal) {
      var img = new Image();
      img.onload = function () {
        var target = Math.min(1000, Math.max(480, (lebarTampil || 500) * 2));
        var s = Math.min(1, target / img.naturalWidth);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
        var c = cv.getContext('2d');
        c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height); c.drawImage(img, 0, 0, cv.width, cv.height);
        var png = cv.toDataURL('image/png'), q = 0.82, jpg = cv.toDataURL('image/jpeg', q);
        while (jpg.length > 120000 && q > 0.5) { q -= 0.1; jpg = cv.toDataURL('image/jpeg', q); } // ±80 KB (PRD 6.1)
        ok({ src: png.length < jpg.length * 0.8 ? png : jpg, w: cv.width, h: cv.height });
      };
      img.onerror = function () { gagal(new Error('Gambar tidak bisa dibaca.')); };
      img.src = src;
    });
  }
  function bacaFileGambar(file) {
    return new Promise(function (ok, gagal) {
      if (!/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type)) { gagal(new Error('Pilih gambar PNG atau JPG.')); return; }
      var r = new FileReader();
      r.onload = function () { kompresDataUrl(r.result).then(ok, gagal); };
      r.onerror = function () { gagal(new Error('Gambar tidak bisa dibaca.')); };
      r.readAsDataURL(file);
    });
  }

  /** Ganti semua <img src="data:…"> di daftar soal & stimulus dengan <img data-gid> setelah diunggah (paling banyak ±1,8 MB per panggilan). */
  function unggahSemuaGambar(soal, stimulus, onProgres) {
    var semua = {}, pola = /<img\b[^>]*\bsrc="(data:image\/(?:png|jpeg|gif|webp);base64,[^"]+)"[^>]*>/g;
    var kumpul = function (h) { var m; pola.lastIndex = 0; while ((m = pola.exec(String(h || '')))) semua[m[1]] = ''; };
    var tiap = function (fn) {
      soal.forEach(function (q) {
        q.html = fn(q.html); q.src = fn(q.src);
        opsiSemua(q).forEach(function (x) { x.html = fn(x.html); if (x.src !== undefined) x.src = fn(x.src); });
      });
      stimulus.forEach(function (s) { s.html = fn(s.html); s.src = fn(s.src); });
    };
    tiap(function (h) { kumpul(h); return h; });
    var daftar = Object.keys(semua);
    if (!daftar.length) return Promise.resolve(0);
    var batch = [], kini = [], ukuran = 0;
    daftar.forEach(function (d) {
      if (kini.length && (ukuran + d.length > 1800000 || kini.length >= 15)) { batch.push(kini); kini = []; ukuran = 0; }
      kini.push(d); ukuran += d.length;
    });
    if (kini.length) batch.push(kini);
    var p = Promise.resolve(), selesai = 0;
    batch.forEach(function (b) {
      p = p.then(function () {
        return PN.panggil('unggahGambar', { gambar: b.map(function (d, i) { return { data: d, nama: 'soal-' + (selesai + i + 1) }; }) }, { timeout: 120000 }).then(function (r) {
          if (!r.ok) throw new Error(r.pesan || 'Gambar gagal diunggah.');
          r.data.ids.forEach(function (id, i) { semua[b[i]] = id; });
          selesai += b.length;
          if (onProgres) onProgres('Mengunggah gambar ' + selesai + ' dari ' + daftar.length + '…');
        });
      });
    });
    return p.then(function () {
      tiap(function (h) {
        return String(h || '').replace(pola, function (tag, src) {
          return semua[src] ? tag.replace(' src="' + src + '"', ' data-gid="' + semua[src] + '"').replace('src="' + src + '"', 'data-gid="' + semua[src] + '"') : tag;
        });
      });
      return daftar.length;
    });
  }
  function opsiSemua(q) { var o = q.opsi || {}; return [].concat(o.opsi || [], o.pernyataan || [], o.kiri || [], o.kanan || []); }

  /** Kirim soal ke server dalam beberapa batch (stimulus ikut batch pertama). */
  function kirimSoal(soal, stimulus, onProgres) {
    var peta = {}, hasil = { baru: 0, diubah: 0 };
    var keServer = function (q) {
      var o = JSON.parse(JSON.stringify(q.opsi || {}));
      return { id: q.id, no: q.no, id_mapel: q.id_mapel, tingkat: q.tingkat, jenis: q.jenis, id_stimulus: peta[q.id_stimulus] || q.id_stimulus || '',
        konten_html: q.src || q.html, konten_tampil: q.html, opsi: o, kunci: q.kunci, rubrik: q.rubrik || null, skor_maks: q.skor_maks, bobot: q.bobot || 1,
        sumber: q.sumber || 'editor', status: q.status };
    };
    var batch = [], kini = [], uk = 0;
    soal.forEach(function (q) {
      var s = JSON.stringify(keServer(q)).length;
      if (kini.length && (uk + s > 1500000 || kini.length >= 60)) { batch.push(kini); kini = []; uk = 0; }
      kini.push(q); uk += s;
    });
    if (kini.length || stimulus.length) batch.push(kini);
    var p = Promise.resolve();
    batch.forEach(function (b, bi) {
      p = p.then(function () {
        if (onProgres) onProgres('Menyimpan soal ' + (bi + 1) + '/' + batch.length + '…');
        var d = { soal: b.map(keServer) };
        if (bi === 0) d.stimulus = stimulus.map(function (s) { return { id: s.id, id_mapel: s.id_mapel, tingkat: s.tingkat, judul: s.judul, konten_html: s.src || s.html, konten_tampil: s.html }; });
        return PN.panggil('simpanSoal', d, { timeout: 120000 }).then(function (r) {
          if (!r.ok) throw new Error(r.pesan || 'Soal gagal disimpan.');
          Object.keys(r.data.peta).forEach(function (k) { peta[k] = r.data.peta[k]; });
          hasil.baru += r.data.baru; hasil.diubah += r.data.diubah;
        });
      });
    });
    return p.then(function () { PN.lupakan('bank'); hasil.peta = peta; return hasil; });
  }

  // =========================================================================
  // W-11 Bank soal
  // =========================================================================
  function halamanBank(bagian) {
    if (bagian[0] === 'unggah') return halamanUnggah();
    if (bagian[0] === 'tulis') return halamanEditor(null);
    if (bagian[0] === 'ubah' && bagian[1]) return halamanEditor(bagian[1]);
    PN.judul('Bank Soal');
    var mp = mapelSaya();
    if (!S.saring.mapel && mp.length === 1) S.saring.mapel = mp[0].id;
    PN.konten().innerHTML = PN.bannerMode() +
      '<div class="kepala-bagian"><div><h2>Soal di mapel yang Anda ampu</h2><p>Dipakai bersama semua guru pengampu mapel yang sama.</p></div>' +
      '<div class="baris-aksi"><button class="btn btn-secondary" id="b-template">' + ikon('download', 'ic-sm') + 'Template Excel</button>' +
      '<a class="btn btn-secondary" href="#/bank/tulis">' + ikon('edit', 'ic-sm') + 'Tulis Soal</a>' +
      '<a class="btn btn-primary" href="#/bank/unggah">' + ikon('upload', 'ic-sm') + 'Unggah Soal</a></div></div>' +
      '<section class="kartu-blok"><div class="bilah-saring">' +
      '<label class="cari">' + ikon('search', 'ic-sm') + '<input class="input" id="b-cari" placeholder="Cari teks soal…" value="' + esc(S.saring.cari) + '"></label>' +
      '<select class="input" id="b-mapel"><option value="">Semua mapel</option>' + mp.map(function (m) { return '<option value="' + esc(m.id) + '"' + (S.saring.mapel === m.id ? ' selected' : '') + '>' + esc(m.nama) + '</option>'; }).join('') + '</select>' +
      '<select class="input" id="b-tingkat"><option value="">Semua tingkat</option>' + [7, 8, 9].map(function (t) { return '<option' + (String(S.saring.tingkat) === String(t) ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<select class="input" id="b-jenis"><option value="">Semua jenis</option>' + Object.keys(JENIS).map(function (j) { return '<option value="' + j + '"' + (S.saring.jenis === j ? ' selected' : '') + '>' + JENIS[j] + '</option>'; }).join('') + '</select>' +
      '<select class="input" id="b-pembuat"><option value="">Semua pembuat</option><option value="saya"' + (S.saring.pembuat === 'saya' ? ' selected' : '') + '>Buatan saya</option></select>' +
      '<select class="input" id="b-status"><option value="aktif"' + (S.saring.status === 'aktif' ? ' selected' : '') + '>Aktif</option><option value="nonaktif"' + (S.saring.status === 'nonaktif' ? ' selected' : '') + '>Nonaktif</option><option value=""' + (!S.saring.status ? ' selected' : '') + '>Semua status</option></select>' +
      '</div><div id="b-massal" class="bilah-saring" hidden></div><div id="b-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    var t = null;
    $('b-cari').addEventListener('input', function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { S.saring.cari = v.trim().toLowerCase(); S.hal = 0; renderBank(); }, 300); });
    ['mapel', 'tingkat', 'jenis', 'pembuat', 'status'].forEach(function (k) { $('b-' + k).addEventListener('change', function () { S.saring[k] = this.value; S.hal = 0; renderBank(); }); });
    $('b-template').onclick = unduhTemplateSoal;
    $('b-daftar').addEventListener('click', klikDaftarBank);
    $('b-daftar').addEventListener('change', function (e) {
      var c = e.target.closest('[data-cek]'); if (!c) return;
      if (c.checked) S.pilih[c.getAttribute('data-cek')] = 1; else delete S.pilih[c.getAttribute('data-cek')];
      renderMassal();
    });
    PN.muat('bank', 'bankSoal', {}, function (d, dariCache, galat) {
      if (!d) { $('b-daftar').innerHTML = '<div class="kosong-isi">' + ikon('alert') + '<p><b>' + esc(galat ? galat.pesan : 'Gagal memuat bank soal.') + '</b></p></div>'; return; }
      S.bank = d; renderBank();
    });
  }

  function saringBank() {
    var f = S.saring, saya = PN.P.pengguna.id;
    return (S.bank ? S.bank.soal : []).filter(function (q) {
      return (!f.mapel || q.id_mapel === f.mapel) && (!f.tingkat || String(q.tingkat) === String(f.tingkat)) && (!f.jenis || q.jenis === f.jenis) &&
        (!f.pembuat || q.pembuat === saya) && (!f.status || q.status === f.status) && (!f.cari || q.teks.toLowerCase().indexOf(f.cari) > -1);
    }).sort(function (a, b) { return b.diubah - a.diubah; });
  }

  function renderBank() {
    var el = $('b-daftar'); if (!el) return;
    var daftar = saringBank(), per = 50, hal = Math.min(S.hal, Math.max(0, Math.ceil(daftar.length / per) - 1));
    var stim = {};
    (S.bank.stimulus || []).forEach(function (s) { stim[s.id] = s; });
    if (!daftar.length) {
      el.innerHTML = '<div class="kosong-isi">' + ikon('book') + '<p><b>' + (S.bank.soal.length ? 'Tidak ada soal yang cocok dengan saringan.' : 'Bank soal masih kosong.') + '</b></p>' +
        '<p>Unggah file Word, PDF, atau Excel sesuai Format Impor v1, atau tulis soal langsung.</p></div>';
      renderMassal(); return;
    }
    el.innerHTML = '<div class="daftar-soal">' + daftar.slice(hal * per, hal * per + per).map(function (q) {
      return '<div class="baris-soal' + (q.status === 'nonaktif' ? ' nonaktif' : '') + '"><input type="checkbox" class="kotak-cek" data-cek="' + esc(q.id) + '"' + (S.pilih[q.id] ? ' checked' : '') + ' aria-label="Pilih soal">' +
        '<div><div class="teks">' + esc(q.teks || '(soal bergambar)') + '</div><div class="meta"><span class="label-jenis">' + q.jenis + '</span>' +
        '<span>' + esc(namaMapel(q.id_mapel)) + (q.tingkat ? ' · ' + q.tingkat : '') + '</span>' +
        (q.st ? '<span class="chip">' + ikon('file', 'ic-sm') + esc((stim[q.st] || {}).judul || 'Stimulus') + '</span>' : '') +
        (q.gambar ? '<span title="Bergambar">' + ikon('image', 'ic-sm') + '</span>' : '') + (q.rumus ? '<span title="Berisi rumus">' + ikon('sigma', 'ic-sm') + '</span>' : '') +
        (q.sumber === 'potong_pdf' ? '<span class="chip">Potong PDF</span>' : '') +
        '<span>· ' + esc(q.nama_pembuat || '-') + ' · ' + PN.tanggal(q.diubah) + '</span></div></div>' +
        '<div class="baris-aksi"><button class="tombol-ikon" data-lihat="' + esc(q.id) + '" title="Lihat sebagai siswa" aria-label="Lihat sebagai siswa">' + ikon('eye', 'ic-sm') + '</button>' +
        '<a class="tombol-ikon" href="#/bank/ubah/' + encodeURIComponent(q.id) + '" title="Ubah" aria-label="Ubah">' + ikon('edit', 'ic-sm') + '</a></div></div>';
    }).join('') + '</div>' +
      '<div class="halaman-nav"><span>' + daftar.length + ' soal · halaman ' + (hal + 1) + ' dari ' + Math.ceil(daftar.length / per) + '</span><span class="baris-aksi">' +
      '<button class="btn btn-secondary btn-sm" data-hal="' + (hal - 1) + '"' + (hal ? '' : ' disabled') + '>Sebelumnya</button>' +
      '<button class="btn btn-secondary btn-sm" data-hal="' + (hal + 1) + '"' + ((hal + 1) * per < daftar.length ? '' : ' disabled') + '>Berikutnya</button></span></div>';
    renderMassal();
  }

  function renderMassal() {
    var el = $('b-massal'); if (!el) return;
    var n = Object.keys(S.pilih).length;
    el.hidden = !n;
    el.innerHTML = '<b>' + n + ' soal dipilih</b><span class="spasi"></span>' +
      '<button class="btn btn-secondary btn-sm" data-massal="paket">' + ikon('layers', 'ic-sm') + 'Buat paket</button>' +
      '<button class="btn btn-secondary btn-sm" data-massal="duplikat">' + ikon('dup', 'ic-sm') + 'Duplikat</button>' +
      '<button class="btn btn-secondary btn-sm" data-massal="' + (S.saring.status === 'nonaktif' ? 'aktif' : 'nonaktif') + '">' + (S.saring.status === 'nonaktif' ? 'Aktifkan' : 'Nonaktifkan') + '</button>' +
      '<button class="btn btn-ghost btn-sm" data-massal="batal">Batal pilih</button>';
    el.onclick = function (e) {
      var b = e.target.closest('[data-massal]'); if (!b) return;
      var ids = Object.keys(S.pilih), a = b.getAttribute('data-massal');
      if (a === 'batal') { S.pilih = {}; renderBank(); return; }
      if (a === 'paket') { try { sessionStorage.setItem('cbt_paket_awal', JSON.stringify(ids)); } catch (er) { /* abaikan */ } location.hash = '#/paket/baru'; return; }
      b.disabled = true;
      var aksi = a === 'duplikat' ? PN.panggil('duplikatSoal', { ids: ids }) : PN.panggil('statusSoal', { ids: ids, status: a });
      aksi.then(function (r) {
        b.disabled = false;
        if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
        PN.toast(a === 'duplikat' ? ids.length + ' soal diduplikat.' : ids.length + ' soal di' + (a === 'aktif' ? 'aktifkan.' : 'nonaktifkan.'), 'ok');
        S.pilih = {}; PN.lupakan('bank'); halamanBank([]);
      });
    };
  }

  function klikDaftarBank(e) {
    var h = e.target.closest('[data-hal]');
    if (h) { S.hal = Number(h.getAttribute('data-hal')); renderBank(); $('b-daftar').scrollIntoView({ block: 'start' }); return; }
    var l = e.target.closest('[data-lihat]');
    if (l) lihatSebagaiSiswa([l.getAttribute('data-lihat')]);
  }

  /** Ambil isi lengkap soal (dengan cache memori). */
  function ambilSoal(ids) {
    var kurang = ids.filter(function (id) { return !S.full[id]; });
    var p = Promise.resolve();
    for (var i = 0; i < kurang.length; i += 100) {
      (function (b) {
        p = p.then(function () {
          return PN.panggil('ambilSoal', { ids: b }).then(function (r) {
            if (!r.ok) throw new Error(r.pesan);
            r.data.soal.forEach(function (q) { q.html = q.konten_tampil; q.src = q.konten_html; S.full[q.id] = q; });
            Object.keys(r.data.stimulus).forEach(function (k) { var s = r.data.stimulus[k]; s.html = s.konten_tampil; s.src = s.konten_html; S.stim[k] = s; });
          });
        });
      })(kurang.slice(i, i + 100));
    }
    return p.then(function () { return ids.map(function (id) { return S.full[id]; }).filter(Boolean); });
  }

  /** "Lihat sebagai siswa" (F-18) dan pratinjau paket: soal ditampilkan berurutan seperti di ruang ujian. */
  function lihatSebagaiSiswa(ids, judulModal) {
    PN.modal('<div class="modal-kepala"><h2>' + esc(judulModal || 'Lihat sebagai siswa') + '</h2><p>Kunci jawaban ditandai hijau (tidak terlihat oleh siswa).</p></div><div class="modal-isi" id="lihat-isi"><div class="kerangka-muat"></div></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-tutup>Tutup</button></div>', 'penuh');
    $('modal-isi').onclick = function (e) { if (e.target.closest('[data-tutup]')) PN.tutupModal(); };
    Promise.all([ambilSoal(ids), tampilKatex()]).then(function (r) {
      var sudah = {};
      $('lihat-isi').innerHTML = r[0].map(function (q, i) {
        var st = q.id_stimulus && !sudah[q.id_stimulus] && S.stim[q.id_stimulus] ? S.stim[q.id_stimulus] : null;
        if (st) sudah[q.id_stimulus] = 1;
        return '<article class="kartu-soal"><div class="kartu-soal-kepala"><b>Soal ' + (i + 1) + '</b><span class="label-jenis">' + JENIS[q.jenis] + '</span>' + (q.bobot !== 1 ? '<span class="muted kecil">bobot ' + q.bobot + '</span>' : '') + '</div>' +
          htmlSoal(q, { stimulus: st, kunci: true }) + '</article>';
      }).join('') || '<p class="muted">Tidak ada soal.</p>';
      PN.muatGambar($('lihat-isi'));
    }, function (e) { $('lihat-isi').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
  }

  // =========================================================================
  // W-15 Editor soal (tulis / ubah) — juga dipakai untuk memperbaiki hasil impor
  // =========================================================================
  var PALET = [['\\frac{a}{b}', 'a/b'], ['x^{2}', 'x²'], ['x_{1}', 'x₁'], ['\\sqrt{x}', '√'], ['\\sqrt[3]{x}', '∛'], ['\\times', '×'], ['\\div', '÷'], ['\\pm', '±'],
    ['\\le', '≤'], ['\\ge', '≥'], ['\\ne', '≠'], ['\\approx', '≈'], ['\\pi', 'π'], ['\\alpha', 'α'], ['\\beta', 'β'], ['\\theta', 'θ'], ['\\Delta', 'Δ'],
    ['^{\\circ}', '°'], ['\\sum_{i=1}^{n}', 'Σ'], ['\\int_{a}^{b}', '∫'], ['\\infty', '∞'], ['\\rightarrow', '→'], ['\\overline{x}', 'x̄'], ['\\vec{v}', 'v⃗'],
    ['\\text{H}_2\\text{O}', 'H₂O'], ['\\begin{matrix}a & b \\\\ c & d\\end{matrix}', '▦']];

  function renderTex(tex, tampilan) {
    try { return window.katex.renderToString(tex, { displayMode: !!tampilan, throwOnError: true, strict: 'ignore' }); }
    catch (e) { return null; }
  }
  /** Sumber ($…$) → isi editor (rumus sebagai span yang bisa diklik). */
  function keEditor(src) {
    return bersih(String(src || '')).replace(/\$\$([^$]+?)\$\$|\$([^$<>\n]+?)\$/g, function (m, a, b) {
      var tex = (a || b).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
      var h = renderTex(tex, !!a);
      return h ? '<span class="rumus" contenteditable="false" data-tex="' + esc(tex) + '"' + (a ? ' data-tampil="1"' : '') + '>' + h + '</span>' : m;
    });
  }
  /** Isi editor → { src (rumus sebagai $…$), html (rumus sudah dirender) } */
  function dariEditor(el) {
    var a = el.cloneNode(true), b = el.cloneNode(true);
    [a, b].forEach(function (x) {
      x.querySelectorAll('img').forEach(function (im) { im.classList.remove('dipilih', 'memuat'); if (!im.className) im.removeAttribute('class'); if (im.getAttribute('data-gid')) im.removeAttribute('src'); });
      x.querySelectorAll('[contenteditable]').forEach(function (n) { n.removeAttribute('contenteditable'); });
    });
    a.querySelectorAll('.rumus').forEach(function (r) { var t = r.getAttribute('data-tex'), d = r.getAttribute('data-tampil'); r.replaceWith(document.createTextNode(d ? '$$' + t + '$$' : '$' + t + '$')); });
    b.querySelectorAll('.rumus').forEach(function (r) { var s = document.createElement('span'); s.innerHTML = renderTex(r.getAttribute('data-tex'), !!r.getAttribute('data-tampil')) || esc(r.getAttribute('data-tex')); r.replaceWith(s.firstChild || s); });
    var rapih = function (h) { return h.replace(/^(<br\s*\/?>|\s)+|(<br\s*\/?>|\s)+$/g, ''); };
    return { src: rapih(a.innerHTML), html: rapih(b.innerHTML) };
  }

  /**
   * Bangun editor di dalam wadah. model: objek soal (dapat diubah). Mengembalikan { ambil() → model baru }.
   * opsi: { mapelTetap, stimulus: [{id, judul}], onUbah }
   */
  function editorSoal(wadah, model, opsi) {
    opsi = opsi || {};
    var q = JSON.parse(JSON.stringify(model));
    q.opsi = q.opsi || {}; q.bobot = q.bobot || 1;
    var mp = mapelSaya();
    var fokus = null, rentang = null, gambarPilih = null, rumusEdit = null;
    var stim = opsi.stimulus || [];
    wadah.innerHTML =
      '<div class="grid-form">' +
      '<label class="field"><span class="label">Mapel</span><select class="input" data-f="id_mapel"' + (opsi.mapelTetap ? ' disabled' : '') + '>' + mp.map(function (m) { return '<option value="' + esc(m.id) + '"' + (q.id_mapel === m.id ? ' selected' : '') + '>' + esc(m.nama) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="label">Tingkat</span><select class="input" data-f="tingkat">' + ['', 7, 8, 9].map(function (t) { return '<option value="' + t + '"' + (String(q.tingkat) === String(t) ? ' selected' : '') + '>' + (t || '-') + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="label">Jenis soal</span><select class="input" data-f="jenis"' + (q.sumber === 'potong_pdf' ? ' disabled' : '') + '>' + Object.keys(JENIS).map(function (j) { return '<option value="' + j + '"' + (q.jenis === j ? ' selected' : '') + '>' + JENIS[j] + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="label">Bobot</span><input class="input" type="number" min="0.5" max="10" step="0.5" data-f="bobot" value="' + esc(q.bobot) + '"></label>' +
      (stim.length ? '<label class="field lebar-penuh"><span class="label">Stimulus bersama</span><select class="input" data-f="id_stimulus"><option value="">Tanpa stimulus</option>' + stim.map(function (s) { return '<option value="' + esc(s.id) + '"' + (q.id_stimulus === s.id ? ' selected' : '') + '>' + esc(s.judul) + '</option>'; }).join('') + '</select></label>' : '') +
      '</div>' +
      '<div class="alat" data-alat>' +
      '<button type="button" data-cmd="bold" title="Tebal"><b>B</b></button><button type="button" data-cmd="italic" title="Miring"><i>I</i></button><button type="button" data-cmd="underline" title="Garis bawah"><u>U</u></button>' +
      '<span class="pisah"></span><button type="button" data-cmd="superscript" title="Pangkat">x²</button><button type="button" data-cmd="subscript" title="Indeks">x₂</button>' +
      '<span class="pisah"></span><button type="button" data-aksi="rumus" title="Sisip rumus">' + ikon('sigma', 'ic-sm') + 'Rumus</button>' +
      '<button type="button" data-aksi="tabel" title="Sisip tabel">' + ikon('table', 'ic-sm') + 'Tabel</button>' +
      '<button type="button" data-aksi="gambar" title="Sisip gambar">' + ikon('image', 'ic-sm') + 'Gambar</button>' +
      '<span class="pisah"></span><button type="button" data-cmd="removeFormat" title="Hapus format">Tx</button></div>' +
      '<div data-panel-rumus hidden class="kartu-blok" style="padding:14px;margin:0;border-radius:0">' +
      '<div class="palet">' + PALET.map(function (p) { return '<button type="button" data-tex="' + esc(p[0]) + '" title="' + esc(p[0]) + '">' + esc(p[1]) + '</button>'; }).join('') + '</div>' +
      '<div class="kolom-dua"><label class="field" style="margin:0"><span class="label">Rumus (LaTeX)</span><textarea class="input mono" data-tex-input rows="2" placeholder="\\frac{1}{2}mv^2"></textarea></label>' +
      '<div><span class="label kecil">Pratinjau</span><div class="pratinjau-rumus" data-pratinjau-rumus></div></div></div>' +
      '<div class="baris-aksi" style="margin-top:10px"><label class="sakelar"><input type="checkbox" data-tampil-rumus><i></i><span class="kecil">Baris sendiri</span></label><span class="spasi"></span>' +
      '<button type="button" class="btn btn-secondary btn-sm" data-rumus-batal>Batal</button><button type="button" class="btn btn-primary btn-sm" data-rumus-ok>Sisipkan</button></div></div>' +
      '<div data-panel-tabel hidden class="kartu-blok" style="padding:14px;margin:0;border-radius:0"><div class="baris-aksi"><label>Baris <input class="input input-bobot" type="number" min="1" max="20" value="3" data-tb-baris></label>' +
      '<label>Kolom <input class="input input-bobot" type="number" min="1" max="8" value="3" data-tb-kolom></label><span class="spasi"></span><button type="button" class="btn btn-primary btn-sm" data-tabel-ok>Sisipkan tabel</button></div></div>' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-file-gambar hidden>' +
      '<div class="editor" contenteditable="true" data-isi data-kosong="Tulis teks soal di sini. Tempel atau seret gambar langsung ke sini.">' + keEditor(q.src || q.html) + '</div>' +
      '<div class="ukuran-gambar" data-ukuran><span>Ukuran gambar:</span><button type="button" class="btn btn-secondary btn-sm" data-ukur="0.3">Kecil</button><button type="button" class="btn btn-secondary btn-sm" data-ukur="0.6">Sedang</button><button type="button" class="btn btn-secondary btn-sm" data-ukur="1">Penuh</button><button type="button" class="btn btn-ghost btn-sm" data-ukur="hapus">' + ikon('trash', 'ic-sm') + 'Hapus</button></div>' +
      '<div data-jawaban style="margin-top:18px"></div>';
    var isi = wadah.querySelector('[data-isi]');
    PN.muatGambar(isi);

    function editorKecil(x, attr, kosong) { return '<div class="editor kecil" contenteditable="true" ' + attr + ' data-kosong="' + esc(kosong) + '">' + keEditor(x ? (x.src !== undefined ? x.src : x.html) : '') + '</div>'; }

    function renderJawaban() {
      var el = wadah.querySelector('[data-jawaban]'), o = q.opsi, j = q.jenis, h = '';
      if (j === 'PG' || j === 'PGK') {
        o.opsi = o.opsi && o.opsi.length ? o.opsi : [0, 1, 2, 3].map(function (i) { return { id: 'o' + (i + 1), html: '' }; });
        h = '<p class="label">Opsi jawaban <span class="muted kecil">— klik huruf untuk menandai kunci' + (j === 'PGK' ? ' (boleh lebih dari satu)' : '') + '</span></p>' +
          o.opsi.map(function (x, i) {
            var kunci = j === 'PG' ? q.kunci === x.id : Array.isArray(q.kunci) && q.kunci.indexOf(x.id) > -1;
            return '<div class="baris-opsi"><button type="button" class="huruf' + (kunci ? ' kunci' : '') + '" data-kunci="' + esc(x.id) + '" aria-pressed="' + kunci + '">' + HURUF[i] + '</button>' +
              editorKecil(x, 'data-opsi="' + esc(x.id) + '"', 'Opsi ' + HURUF[i]) + '<button type="button" class="tombol-ikon bahaya" data-hapus-opsi="' + esc(x.id) + '" aria-label="Hapus opsi"' + (o.opsi.length <= 2 ? ' disabled' : '') + '>' + ikon('trash', 'ic-sm') + '</button></div>';
          }).join('') + (o.opsi.length < 5 ? '<button type="button" class="btn btn-ghost btn-sm" data-tambah="opsi">' + ikon('plus', 'ic-sm') + 'Tambah opsi</button>' : '');
      } else if (j === 'BS') {
        o.pernyataan = o.pernyataan && o.pernyataan.length ? o.pernyataan : [{ id: 'p1', html: '' }, { id: 'p2', html: '' }];
        q.kunci = q.kunci && typeof q.kunci === 'object' && !Array.isArray(q.kunci) ? q.kunci : {};
        h = '<p class="label">Pernyataan <span class="muted kecil">— pilih Benar atau Salah untuk setiap pernyataan</span></p>' + o.pernyataan.map(function (x, i) {
          return '<div class="baris-opsi"><span class="huruf" style="cursor:default">' + (i + 1) + '</span>' + editorKecil(x, 'data-opsi="' + esc(x.id) + '"', 'Pernyataan ' + (i + 1)) +
            '<span class="baris-aksi"><button type="button" class="btn btn-sm ' + (q.kunci[x.id] === 'B' ? 'btn-primary' : 'btn-secondary') + '" data-bs="' + esc(x.id) + '" data-v="B">Benar</button>' +
            '<button type="button" class="btn btn-sm ' + (q.kunci[x.id] === 'S' ? 'btn-primary' : 'btn-secondary') + '" data-bs="' + esc(x.id) + '" data-v="S">Salah</button>' +
            '<button type="button" class="tombol-ikon bahaya" data-hapus-opsi="' + esc(x.id) + '" aria-label="Hapus"' + (o.pernyataan.length <= 1 ? ' disabled' : '') + '>' + ikon('trash', 'ic-sm') + '</button></span></div>';
        }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-tambah="pernyataan">' + ikon('plus', 'ic-sm') + 'Tambah pernyataan</button>';
      } else if (j === 'JODOH') {
        o.kiri = o.kiri && o.kiri.length ? o.kiri : [{ id: 'k1', html: '' }, { id: 'k2', html: '' }];
        o.kanan = o.kanan && o.kanan.length ? o.kanan : [{ id: 'r1', html: '' }, { id: 'r2', html: '' }, { id: 'r3', html: '' }];
        q.kunci = q.kunci && typeof q.kunci === 'object' && !Array.isArray(q.kunci) ? q.kunci : {};
        h = '<div class="kolom-dua"><div><p class="label">Lajur kiri (pernyataan) &amp; pasangannya</p>' + o.kiri.map(function (x, i) {
          return '<div class="baris-opsi jodoh"><span class="huruf" style="cursor:default">' + (i + 1) + '</span>' + editorKecil(x, 'data-opsi="' + esc(x.id) + '"', 'Pernyataan ' + (i + 1)) +
            '<select class="input" data-pasang="' + esc(x.id) + '"><option value="">Pasangan…</option>' + o.kanan.map(function (y, k) { return '<option value="' + esc(y.id) + '"' + (q.kunci[x.id] === y.id ? ' selected' : '') + '>' + HURUF[k] + '</option>'; }).join('') + '</select>' +
            '<button type="button" class="tombol-ikon bahaya" data-hapus-opsi="' + esc(x.id) + '" aria-label="Hapus"' + (o.kiri.length <= 1 ? ' disabled' : '') + '>' + ikon('trash', 'ic-sm') + '</button></div>';
        }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-tambah="kiri">' + ikon('plus', 'ic-sm') + 'Tambah pernyataan</button></div>' +
          '<div><p class="label">Lajur kanan (pilihan)</p>' + o.kanan.map(function (x, i) {
            return '<div class="baris-opsi"><span class="huruf" style="cursor:default">' + HURUF[i] + '</span>' + editorKecil(x, 'data-opsi="' + esc(x.id) + '"', 'Pilihan ' + HURUF[i]) +
              '<button type="button" class="tombol-ikon bahaya" data-hapus-opsi="' + esc(x.id) + '" aria-label="Hapus"' + (o.kanan.length <= 2 ? ' disabled' : '') + '>' + ikon('trash', 'ic-sm') + '</button></div>';
          }).join('') + (o.kanan.length < 10 ? '<button type="button" class="btn btn-ghost btn-sm" data-tambah="kanan">' + ikon('plus', 'ic-sm') + 'Tambah pilihan</button>' : '') + '</div></div>';
      } else if (j === 'ISIAN') {
        h = '<label class="field"><span class="label">Jawaban benar</span><input class="input" data-isian value="' + esc(Array.isArray(q.kunci) ? q.kunci.join(' | ') : '') + '" placeholder="Proklamasi | proklamasi kemerdekaan">' +
          '<span class="hint">' + ikon('info', 'ic-sm') + 'Pisahkan jawaban alternatif dengan tanda |. Huruf besar-kecil dan spasi berlebih diabaikan saat koreksi.</span></label>';
      } else if (j === 'ESAI') {
        q.rubrik = q.rubrik && q.rubrik.length ? q.rubrik : [{ kriteria: '', skor: '' }];
        h = '<div class="grid-form"><label class="field"><span class="label">Skor maksimal</span><input class="input" type="number" min="1" max="100" data-skor-maks value="' + esc(q.skor_maks || '') + '"></label></div>' +
          '<label class="field"><span class="label">Jawaban acuan</span><textarea class="input" data-acuan rows="3">' + esc(q.kunci && q.kunci.acuan || '') + '</textarea></label>' +
          '<p class="label">Rubrik penilaian</p>' + q.rubrik.map(function (r, i) {
            return '<div class="baris-opsi" style="grid-template-columns:minmax(0,1fr) 90px auto"><input class="input" data-rub-k="' + i + '" value="' + esc(r.kriteria) + '" placeholder="Kriteria, mis. Menyebut tiga dampak">' +
              '<input class="input" type="number" min="0" max="100" data-rub-s="' + i + '" value="' + esc(r.skor) + '" placeholder="Skor"><button type="button" class="tombol-ikon bahaya" data-hapus-rub="' + i + '"' + (q.rubrik.length <= 1 ? ' disabled' : '') + '>' + ikon('trash', 'ic-sm') + '</button></div>';
          }).join('') + '<button type="button" class="btn btn-ghost btn-sm" data-tambah="rubrik">' + ikon('plus', 'ic-sm') + 'Tambah kriteria</button>';
      }
      el.innerHTML = h;
      PN.muatGambar(el);
    }

    /** Simpan isi editor kecil & isian ke model sebelum render ulang. */
    function serapJawaban() {
      wadah.querySelectorAll('[data-opsi]').forEach(function (ed) {
        var id = ed.getAttribute('data-opsi'), x = opsiSemua(q).filter(function (y) { return y.id === id; })[0];
        if (x) { var r = dariEditor(ed); x.html = r.html; x.src = r.src; }
      });
      var isian = wadah.querySelector('[data-isian]');
      if (isian) q.kunci = isian.value.split('|').map(function (s) { return s.trim(); }).filter(String);
      var sm = wadah.querySelector('[data-skor-maks]');
      if (sm) {
        q.skor_maks = Number(sm.value) || '';
        q.kunci = { acuan: wadah.querySelector('[data-acuan]').value.trim() };
        q.rubrik = Array.prototype.map.call(wadah.querySelectorAll('[data-rub-k]'), function (k, i) { return { kriteria: k.value.trim(), skor: Number(wadah.querySelector('[data-rub-s="' + i + '"]').value) || 0 }; });
      }
    }

    function idBaruOpsi(awal, daftar) { var n = 1; while (daftar.some(function (x) { return x.id === awal + n; })) n++; return awal + n; }

    wadah.addEventListener('focusin', function (e) { var ed = e.target.closest('.editor'); if (ed) fokus = ed; });
    document.addEventListener('selectionchange', simpanRentang);
    function simpanRentang() {
      var s = window.getSelection();
      if (s.rangeCount && wadah.contains(s.anchorNode) && s.anchorNode && (s.anchorNode.closest ? s.anchorNode : s.anchorNode.parentElement).closest('.editor')) rentang = s.getRangeAt(0).cloneRange();
    }
    function pulihkan() {
      if (!fokus) fokus = isi;
      fokus.focus();
      if (rentang && fokus.contains(rentang.startContainer)) { var s = window.getSelection(); s.removeAllRanges(); s.addRange(rentang); }
      else { var r = document.createRange(); r.selectNodeContents(fokus); r.collapse(false); var s2 = window.getSelection(); s2.removeAllRanges(); s2.addRange(r); }
    }
    function sisip(html) { pulihkan(); document.execCommand('insertHTML', false, html); }

    var alat = wadah.querySelector('[data-alat]');
    alat.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
    alat.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.getAttribute('data-cmd')) { pulihkan(); document.execCommand(b.getAttribute('data-cmd'), false, null); return; }
      var a = b.getAttribute('data-aksi');
      if (a === 'rumus') bukaRumus(null);
      if (a === 'tabel') { var p = wadah.querySelector('[data-panel-tabel]'); p.hidden = !p.hidden; wadah.querySelector('[data-panel-rumus]').hidden = true; }
      if (a === 'gambar') wadah.querySelector('[data-file-gambar]').click();
    });
    function bukaRumus(span) {
      rumusEdit = span;
      var p = wadah.querySelector('[data-panel-rumus]');
      p.hidden = false; wadah.querySelector('[data-panel-tabel]').hidden = true;
      tampilKatex().then(function () {
        var inp = p.querySelector('[data-tex-input]');
        inp.value = span ? span.getAttribute('data-tex') : '';
        p.querySelector('[data-tampil-rumus]').checked = !!(span && span.getAttribute('data-tampil'));
        pratinjauRumus(); inp.focus();
      });
    }
    function pratinjauRumus() {
      var p = wadah.querySelector('[data-panel-rumus]'), tex = p.querySelector('[data-tex-input]').value.trim();
      var h = tex ? renderTex(tex, p.querySelector('[data-tampil-rumus]').checked) : '';
      p.querySelector('[data-pratinjau-rumus]').innerHTML = !tex ? '<span class="muted kecil">Ketik rumus atau klik palet</span>' : h || '<span class="pill pill-danger">Rumus belum benar</span>';
    }
    var panelR = wadah.querySelector('[data-panel-rumus]');
    panelR.addEventListener('input', pratinjauRumus);
    panelR.addEventListener('change', pratinjauRumus);
    panelR.addEventListener('click', function (e) {
      var t = e.target.closest('[data-tex]');
      if (t) {
        var inp = panelR.querySelector('[data-tex-input]'), s = inp.selectionStart || inp.value.length;
        inp.value = inp.value.slice(0, s) + t.getAttribute('data-tex') + inp.value.slice(inp.selectionEnd || s);
        inp.focus(); pratinjauRumus(); return;
      }
      if (e.target.closest('[data-rumus-batal]')) { panelR.hidden = true; rumusEdit = null; return; }
      if (e.target.closest('[data-rumus-ok]')) {
        var tex = panelR.querySelector('[data-tex-input]').value.trim(), tampil = panelR.querySelector('[data-tampil-rumus]').checked;
        var h = renderTex(tex, tampil);
        if (!tex || !h) { PN.toast('Periksa kembali penulisan rumusnya.', 'warn'); return; }
        var span = '<span class="rumus" contenteditable="false" data-tex="' + esc(tex) + '"' + (tampil ? ' data-tampil="1"' : '') + '>' + h + '</span>';
        if (rumusEdit) { var d = document.createElement('span'); d.innerHTML = span; rumusEdit.replaceWith(d.firstChild); }
        else sisip(span + '&nbsp;');
        panelR.hidden = true; rumusEdit = null;
        if (opsi.onUbah) opsi.onUbah();
      }
    });
    wadah.querySelector('[data-tabel-ok]').onclick = function () {
      var r = Math.max(1, Math.min(20, Number(wadah.querySelector('[data-tb-baris]').value) || 3)), c = Math.max(1, Math.min(8, Number(wadah.querySelector('[data-tb-kolom]').value) || 3));
      var t = '<table><tbody>' + new Array(r + 1).join('<tr>' + new Array(c + 1).join('<td>&nbsp;</td>') + '</tr>') + '</tbody></table><p><br></p>';
      sisip(t); wadah.querySelector('[data-panel-tabel]').hidden = true;
    };
    function sisipGambar(file) {
      bacaFileGambar(file).then(function (g) {
        sisip('<img src="' + g.src + '" width="' + Math.min(g.w, 600) + '" alt="Gambar soal">');
        if (opsi.onUbah) opsi.onUbah();
      }, function (e) { PN.toast(e.message, 'warn'); });
    }
    wadah.querySelector('[data-file-gambar]').addEventListener('change', function () { if (this.files[0]) sisipGambar(this.files[0]); this.value = ''; });
    wadah.addEventListener('paste', function (e) {
      var ed = e.target.closest('.editor'); if (!ed) return;
      var it = Array.prototype.filter.call((e.clipboardData || {}).items || [], function (x) { return /^image\//.test(x.type); })[0];
      if (it) { e.preventDefault(); fokus = ed; simpanRentang(); sisipGambar(it.getAsFile()); return; }
      // tempel teks dari Word: pertahankan tebal/miring/pangkat/indeks saja
      var h = e.clipboardData && e.clipboardData.getData('text/html');
      if (h) {
        e.preventDefault();
        var d = document.createElement('div'); d.innerHTML = bersih(h);
        d.querySelectorAll('*').forEach(function (n) { Array.prototype.slice.call(n.attributes).forEach(function (a) { if (!/^(src|width|height|colspan|rowspan|alt)$/.test(a.name)) n.removeAttribute(a.name); }); });
        d.querySelectorAll('img[src^="file:"]').forEach(function (n) { n.remove(); });
        document.execCommand('insertHTML', false, d.innerHTML.replace(/<!--[\s\S]*?-->/g, ''));
      }
    });
    wadah.addEventListener('drop', function (e) {
      var ed = e.target.closest('.editor'); if (!ed || !e.dataTransfer || !e.dataTransfer.files.length) return;
      e.preventDefault(); fokus = ed; ed.focus(); sisipGambar(e.dataTransfer.files[0]);
    });
    wadah.addEventListener('click', function (e) {
      var r = e.target.closest('.rumus');
      if (r && wadah.contains(r)) { fokus = r.closest('.editor'); bukaRumus(r); return; }
      var img = e.target.closest('.editor img');
      wadah.querySelectorAll('.editor img.dipilih').forEach(function (x) { x.classList.remove('dipilih'); });
      gambarPilih = img || null;
      if (img) img.classList.add('dipilih');
      wadah.querySelector('[data-ukuran]').classList.toggle('tampil', !!img);
      var u = e.target.closest('[data-ukur]');
      if (u && gambarPilih) {
        var v = u.getAttribute('data-ukur');
        if (v === 'hapus') gambarPilih.remove();
        else { var lebar = Math.round((fokus || isi).clientWidth * Number(v)); gambarPilih.setAttribute('width', String(Math.max(40, lebar))); gambarPilih.removeAttribute('height'); }
        wadah.querySelector('[data-ukuran]').classList.remove('tampil'); gambarPilih = null;
        return;
      }
      var k = e.target.closest('[data-kunci]');
      if (k) {
        var id = k.getAttribute('data-kunci');
        if (q.jenis === 'PG') q.kunci = id;
        else { var a = Array.isArray(q.kunci) ? q.kunci.slice() : []; var i = a.indexOf(id); if (i > -1) a.splice(i, 1); else a.push(id); q.kunci = a; }
        serapJawaban(); renderJawaban(); return;
      }
      var bs = e.target.closest('[data-bs]');
      if (bs) { q.kunci[bs.getAttribute('data-bs')] = bs.getAttribute('data-v'); serapJawaban(); renderJawaban(); return; }
      var t = e.target.closest('[data-tambah]');
      if (t) {
        serapJawaban();
        var jenis = t.getAttribute('data-tambah'), o = q.opsi;
        if (jenis === 'opsi') o.opsi.push({ id: idBaruOpsi('o', o.opsi), html: '' });
        if (jenis === 'pernyataan') o.pernyataan.push({ id: idBaruOpsi('p', o.pernyataan), html: '' });
        if (jenis === 'kiri') o.kiri.push({ id: idBaruOpsi('k', o.kiri), html: '' });
        if (jenis === 'kanan') o.kanan.push({ id: idBaruOpsi('r', o.kanan), html: '' });
        if (jenis === 'rubrik') q.rubrik.push({ kriteria: '', skor: '' });
        renderJawaban(); return;
      }
      var h = e.target.closest('[data-hapus-opsi]');
      if (h) {
        serapJawaban();
        var hid = h.getAttribute('data-hapus-opsi');
        ['opsi', 'pernyataan', 'kiri', 'kanan'].forEach(function (k2) { if (q.opsi[k2]) q.opsi[k2] = q.opsi[k2].filter(function (x) { return x.id !== hid; }); });
        if (q.kunci === hid) q.kunci = '';
        if (Array.isArray(q.kunci)) q.kunci = q.kunci.filter(function (x) { return x !== hid; });
        else if (q.kunci && typeof q.kunci === 'object') { delete q.kunci[hid]; Object.keys(q.kunci).forEach(function (kk) { if (q.kunci[kk] === hid) delete q.kunci[kk]; }); }
        renderJawaban(); return;
      }
      var hr = e.target.closest('[data-hapus-rub]');
      if (hr) { serapJawaban(); q.rubrik.splice(Number(hr.getAttribute('data-hapus-rub')), 1); renderJawaban(); }
    });
    wadah.addEventListener('change', function (e) {
      var f = e.target.getAttribute('data-f');
      if (f === 'jenis') {
        serapJawaban();
        var lama = q.jenis; q.jenis = e.target.value;
        if ((lama === 'PG' || lama === 'PGK') && (q.jenis === 'PG' || q.jenis === 'PGK')) q.kunci = q.jenis === 'PG' ? (Array.isArray(q.kunci) ? q.kunci[0] || '' : q.kunci) : (q.kunci ? [].concat(q.kunci) : []);
        else { q.kunci = null; }
        renderJawaban();
      } else if (f) q[f] = f === 'bobot' ? Number(e.target.value) || 1 : e.target.value;
      var ps = e.target.getAttribute('data-pasang');
      if (ps) { if (e.target.value) q.kunci[ps] = e.target.value; else delete q.kunci[ps]; }
    });
    renderJawaban();
    return {
      ambil: function () {
        serapJawaban();
        var r = dariEditor(isi);
        q.html = r.html; q.src = r.src;
        wadah.querySelectorAll('[data-f]').forEach(function (x) { var f = x.getAttribute('data-f'); q[f] = f === 'bobot' ? Number(x.value) || 1 : x.value; });
        if (q.tingkat !== '') q.tingkat = Number(q.tingkat) || '';
        return JSON.parse(JSON.stringify(q));
      },
      lepas: function () { document.removeEventListener('selectionchange', simpanRentang); }
    };
  }

  function halamanEditor(id) {
    PN.judul(id ? 'Ubah Soal' : 'Tulis Soal', 'Bank Soal');
    PN.konten().innerHTML = PN.bannerMode() + '<p><a class="btn btn-ghost btn-sm" href="#/bank">' + ikon('arrow-l', 'ic-sm') + 'Kembali ke Bank Soal</a></p>' +
      '<section class="kartu-blok" style="padding:20px;overflow:visible"><div id="ed-wadah"><div class="kerangka-muat"></div></div></section>' +
      '<div class="bilah-simpan"><span class="teks" id="ed-status">Draf tersimpan otomatis di perangkat ini.</span>' +
      '<button class="btn btn-secondary" id="ed-lihat">' + ikon('eye', 'ic-sm') + 'Pratinjau</button><button class="btn btn-primary" id="ed-simpan">' + ikon('check', 'ic-sm') + 'Simpan soal</button></div>';
    var kunciDraf = 'cbt_draf_soal_' + PN.P.pengguna.id + '_' + (id || 'baru');
    var mp = mapelSaya();
    var siap = id ? Promise.all([ambilSoal([id]), tampilKatex()]).then(function (r) { return r[0][0]; }) : tampilKatex().then(function () { return null; });
    siap.then(function (q) {
      if (id && !q) throw new Error('Soal tidak ditemukan.');
      var draf = null;
      try { draf = JSON.parse(localStorage.getItem(kunciDraf) || 'null'); } catch (e) { draf = null; }
      var model = q || { id: '', jenis: 'PG', id_mapel: (mp[0] || {}).id || '', tingkat: '', bobot: 1, html: '', src: '', opsi: {}, kunci: '' };
      if (draf && (!q || draf.versi === q.versi)) { model = draf.model; $('ed-status').textContent = 'Melanjutkan draf yang belum disimpan.'; }
      var daftarStim = ((S.bank && S.bank.stimulus) || []).filter(function (s) { return s.id_mapel === model.id_mapel; });
      var ed = editorSoal($('ed-wadah'), model, { stimulus: daftarStim });
      var t = setInterval(function () {
        try { localStorage.setItem(kunciDraf, JSON.stringify({ versi: q ? q.versi : 0, model: ed.ambil(), t: Date.now() })); $('ed-status').textContent = 'Draf tersimpan di perangkat · ' + PN.jam(Date.now()); } catch (e) { /* abaikan */ }
      }, 8000);
      PN.tinggalkan = function () { clearInterval(t); ed.lepas(); };
      $('ed-lihat').onclick = function () {
        var m = ed.ambil();
        PN.modal('<div class="modal-kepala"><h2>Pratinjau</h2></div><div class="modal-isi">' + htmlSoal(m, { kunci: true, stimulus: m.id_stimulus ? S.stim[m.id_stimulus] : null }) + '</div><div class="modal-kaki"><button class="btn btn-secondary" data-tutup>Tutup</button></div>', 'lebar');
        $('modal-isi').onclick = function (e) { if (e.target.closest('[data-tutup]')) PN.tutupModal(); };
        PN.muatGambar($('modal-isi'));
      };
      $('ed-simpan').onclick = function () {
        var m = ed.ambil(), cek = periksa(m);
        if (cek.merah.length) { PN.toast(cek.merah[0], 'danger', 6000); return; }
        var b = $('ed-simpan');
        b.disabled = true; b.innerHTML = '<span class="putar"></span>Menyimpan…';
        unggahSemuaGambar([m], [], function (t2) { $('ed-status').textContent = t2; }).then(function () {
          return kirimSoal([m], []);
        }).then(function (r) {
          try { localStorage.removeItem(kunciDraf); } catch (e) { /* abaikan */ }
          delete S.full[m.id];
          PN.toast(id ? 'Soal diperbarui.' : 'Soal disimpan ke bank soal.', 'ok');
          clearInterval(t);
          location.hash = '#/bank';
        }).catch(function (e) {
          b.disabled = false; b.innerHTML = ikon('check', 'ic-sm') + 'Simpan soal';
          PN.toast(e.message, 'danger', 7000);
        });
      };
    }).catch(function (e) { $('ed-wadah').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
    if (!S.bank) PN.muat('bank', 'bankSoal', {}, function (d) { if (d) S.bank = d; });
  }

  // =========================================================================
  // W-12 Unggah soal & W-13 Periksa hasil impor
  // =========================================================================
  function halamanUnggah() {
    PN.judul('Unggah Soal', 'Bank Soal');
    if (S.impor && S.impor.soal) return renderPeriksa();
    var mp = mapelSaya();
    PN.konten().innerHTML = PN.bannerMode() + '<p><a class="btn btn-ghost btn-sm" href="#/bank">' + ikon('arrow-l', 'ic-sm') + 'Kembali ke Bank Soal</a></p>' +
      '<section class="kartu-blok" style="padding:20px"><div class="grid-form">' +
      '<label class="field"><span class="label">Mapel</span><select class="input" id="u-mapel">' + mp.map(function (m) { return '<option value="' + esc(m.id) + '">' + esc(m.nama) + '</option>'; }).join('') + '</select></label>' +
      '<label class="field"><span class="label">Tingkat</span><select class="input" id="u-tingkat"><option value="">-</option><option>7</option><option selected>8</option><option>9</option></select></label></div>' +
      (mp.length ? '' : '<div class="alert alert-warn">' + ikon('alert') + '<span>Anda belum terdaftar sebagai pengampu mapel. Minta admin mengisi tab Pengampu.</span></div>') +
      '<label class="zona-unggah" id="u-zona">' + ikon('upload') + '<b>Pilih atau seret file soal</b><span class="muted">Word (.docx), PDF, atau Excel (.xlsx) — aplikasi mengenali jenisnya sendiri</span>' +
      '<input type="file" id="u-file" hidden accept=".docx,.pdf,.xlsx,.csv,application/pdf"></label>' +
      '<div id="u-progres" style="margin-top:14px"></div>' +
      '<div class="alert alert-info" style="margin-top:16px">' + ikon('info') + '<span>Tulis soal sesuai <b>Format Impor v1</b>: nomor "1.", opsi "A.", baris <code>Kunci: C</code>, <code>Jenis: PGK</code> bila bukan PG. ' +
      'File diproses di perangkat ini; server hanya menerima hasil akhirnya. Untuk PDF yang banyak rumusnya, buka PDF di Word lalu simpan sebagai .docx agar hasilnya lebih rapi.</span></div></section>';
    var zona = $('u-zona'), inp = $('u-file');
    inp.addEventListener('change', function () { if (inp.files[0]) prosesFile(inp.files[0]); inp.value = ''; });
    ['dragenter', 'dragover'].forEach(function (n) { zona.addEventListener(n, function (e) { e.preventDefault(); zona.classList.add('seret'); }); });
    ['dragleave', 'drop'].forEach(function (n) { zona.addEventListener(n, function (e) { e.preventDefault(); zona.classList.remove('seret'); }); });
    zona.addEventListener('drop', function (e) { if (e.dataTransfer.files[0]) prosesFile(e.dataTransfer.files[0]); });
    if (!S.bank) PN.muat('bank', 'bankSoal', {}, function (d) { if (d) S.bank = d; });
  }

  function progres(t) { var el = $('u-progres'); if (el) el.innerHTML = t ? '<div class="alert alert-info"><span class="putar" style="border-color:var(--primary);border-right-color:transparent"></span><span>' + esc(t) + '</span></div>' : ''; }

  function prosesFile(file) {
    if (PN.P.boot && PN.P.boot.mode_ujian) { PN.toast('Impor soal dibuka kembali setelah semua sesi ujian selesai.', 'warn'); return; }
    var mapel = $('u-mapel').value, tingkat = Number($('u-tingkat').value) || '';
    if (!mapel) { PN.toast('Pilih mapel terlebih dahulu.', 'warn'); return; }
    var nama = file.name.toLowerCase(), sumber = /\.pdf$/.test(nama) ? 'pdf' : /\.(xlsx|csv)$/.test(nama) ? 'excel' : 'word';
    var bacaPdfOtomatis = !(PN.P.boot && PN.P.boot.sakelar && PN.P.boot.sakelar.baca_pdf_otomatis === false); // sakelar F-48
    progres('Membaca ' + file.name + '…');
    var proses;
    if (sumber === 'excel') proses = API.muatSkrip('./js/xlsx.js').then(function () { return XLSX.baca(file); }).then(bacaTemplateExcel);
    else proses = API.muatSkrip('./js/impor.js').then(function () { return CBTImpor.baca(file, { onProgres: progres }); });
    proses.then(function (h) {
      progres('');
      S.impor = dariImpor(h, mapel, tingkat, sumber, file);
      if (sumber === 'pdf' && (!S.impor.soal.length || !bacaPdfOtomatis || (h.statistik && h.statistik.halamanScan === h.statistik.halaman))) {
        S.impor.soal = [];
        renderPeriksa();
        bukaPotong(1, null);
        return;
      }
      if (!S.impor.soal.length) { progres(''); PN.toast('Tidak ada soal yang dikenali. Pastikan setiap soal diawali nomor seperti "1."', 'danger', 7000); S.impor = null; return; }
      renderPeriksa();
    }).catch(function (e) { progres(''); PN.toast(e.message || String(e), 'danger', 7000); });
  }

  /** Hasil CBTImpor/Excel → model soal yang sama dengan editor. */
  function dariImpor(h, mapel, tingkat, sumber, file) {
    var stimulus = Object.keys(h.stimulus || {}).map(function (k) {
      var st = h.stimulus[k];
      return { id: 'tmp-st-' + k, kode: k, id_mapel: mapel, tingkat: tingkat, judul: st.judul || ('Stimulus soal ' + st.dari + '–' + st.sampai), html: st.html, src: st.sumber || st.html };
    });
    var soal = (h.soal || []).map(function (s) {
      var q = { id: idSem(), no: s.no, jenis: s.jenis, id_mapel: mapel, tingkat: tingkat, bobot: s.bobot || 1, html: s.isi, src: s.isiSumber || s.isi,
        id_stimulus: s.stimulus ? 'tmp-st-' + s.stimulus : '', sumber: sumber, masalah: s.masalah || [], info: s.info || [], rumusPdf: !!s.rumusPdf, opsi: {}, kunci: null };
      var kd = s.kunciData;
      if (s.jenis === 'PG' || s.jenis === 'PGK') {
        q.opsi.opsi = s.opsi.map(function (o, i) { return { id: 'o' + (i + 1), huruf: o.huruf, html: o.html, src: o.sumber || o.html }; });
        var idDari = function (hf) { var o = q.opsi.opsi.filter(function (x) { return x.huruf === hf; })[0]; return o ? o.id : ''; };
        q.kunci = s.jenis === 'PG' ? (kd ? idDari(kd) : '') : (Array.isArray(kd) ? kd.map(idDari).filter(String) : []);
        q.opsi.opsi.forEach(function (o) { delete o.huruf; });
      } else if (s.jenis === 'BS') {
        q.opsi.pernyataan = s.item.map(function (it, i) { return { id: 'p' + (i + 1), html: it.html, src: it.sumber || it.html }; });
        q.kunci = {};
        if (Array.isArray(kd)) q.opsi.pernyataan.forEach(function (p, i) { if (kd[i] === 'B' || kd[i] === 'S') q.kunci[p.id] = kd[i]; });
      } else if (s.jenis === 'JODOH') {
        q.opsi.kiri = s.item.map(function (it) { return { id: 'k' + it.no, no: it.no, html: it.html, src: it.sumber || it.html }; });
        q.opsi.kanan = s.opsi.map(function (o, i) { return { id: 'r' + (i + 1), huruf: o.huruf, html: o.html, src: o.sumber || o.html }; });
        q.kunci = {};
        if (kd) q.opsi.kiri.forEach(function (k) { var hf = kd[k.no]; var r = q.opsi.kanan.filter(function (x) { return x.huruf === hf; })[0]; if (r) q.kunci[k.id] = r.id; });
        q.opsi.kiri.forEach(function (k) { delete k.no; }); q.opsi.kanan.forEach(function (r) { delete r.huruf; });
      } else if (s.jenis === 'ISIAN') {
        q.kunci = Array.isArray(kd) ? kd : [];
      } else if (s.jenis === 'ESAI') {
        q.kunci = { acuan: (kd && kd.acuan) || '' };
        q.rubrik = (s.rubrik || []).map(function (r) { return { kriteria: r.kriteria, skor: Number(r.skor) || 0 }; });
        q.skor_maks = s.skor_maks || q.rubrik.reduce(function (a, r) { return a + r.skor; }, 0) || '';
      }
      return q;
    });
    return { sumber: sumber, file: file, nama: file.name, mapel: mapel, tingkat: tingkat, stimulus: stimulus, soal: soal, peringatan: h.peringatan || [], statistik: h.statistik || {} };
  }

  function renderPeriksa() {
    var I = S.impor;
    PN.judul('Periksa Hasil Impor', 'Bank Soal · Unggah Soal');
    tampilKatex().then(function () {
      var hasil = I.soal.map(function (q) { return periksa(q, S.bank); });
      var merah = hasil.filter(function (x) { return x.merah.length; }).length, kuning = hasil.filter(function (x) { return !x.merah.length && x.kuning.length; }).length;
      var stim = {}; I.stimulus.forEach(function (s) { stim[s.id] = s; });
      var sudah = {};
      PN.konten().innerHTML = PN.bannerMode() +
        '<div class="kepala-bagian"><div><h2>' + esc(I.nama) + '</h2><p>' + esc(namaMapel(I.mapel)) + (I.tingkat ? ' · tingkat ' + I.tingkat : '') + ' · tanda merah wajib diperbaiki sebelum disimpan</p></div>' +
        '<div class="baris-aksi">' + (I.sumber === 'pdf' ? '<button class="btn btn-secondary" id="p-potong">' + ikon('scissors', 'ic-sm') + 'Potong soal dari PDF</button>' : '') +
        '<button class="btn btn-secondary" id="p-batal">Batalkan impor</button></div></div>' +
        '<div class="ringkas-impor"><div><b>' + I.soal.length + '</b><span>soal dikenali</span></div><div><b>' + I.stimulus.length + '</b><span>stimulus</span></div>' +
        '<div class="merah"><b>' + merah + '</b><span>tanda merah</span></div><div class="kuning"><b>' + kuning + '</b><span>tanda kuning</span></div>' +
        '<div><b>' + (I.statistik.gambar || 0) + '</b><span>gambar</span></div><div><b>' + ((I.statistik.rumusWord || 0) + (I.statistik.rumusLatex || 0)) + '</b><span>rumus</span></div></div>' +
        I.peringatan.map(function (p) { return '<div class="alert alert-warn" style="margin-bottom:10px">' + ikon('alert') + '<span>' + esc(p) + '</span></div>'; }).join('') +
        '<div id="p-daftar">' + I.soal.map(function (q, i) {
          var c = hasil[i], st = q.id_stimulus && !sudah[q.id_stimulus] ? stim[q.id_stimulus] : null;
          if (st) sudah[q.id_stimulus] = 1;
          return '<article class="kartu-soal ' + (c.merah.length ? 'merah' : c.kuning.length ? 'kuning' : '') + '" id="ks-' + q.id + '"><div class="kartu-soal-kepala"><b>Soal ' + (q.no || i + 1) + '</b><span class="label-jenis">' + JENIS[q.jenis] + '</span>' +
            (c.merah.length ? '<span class="pill pill-danger">' + c.merah.length + ' merah</span>' : '') + (c.kuning.length ? '<span class="pill pill-warn">' + c.kuning.length + ' kuning</span>' : '') +
            (!c.merah.length && !c.kuning.length ? '<span class="pill pill-ok">' + ikon('check') + 'Siap</span>' : '') +
            '<div class="baris-aksi"><button class="btn btn-secondary btn-sm" data-ubah="' + q.id + '">' + ikon('edit', 'ic-sm') + 'Ubah</button>' +
            (I.sumber === 'pdf' ? '<button class="btn btn-secondary btn-sm" data-potong="' + q.id + '">' + ikon('scissors', 'ic-sm') + 'Potong</button>' : '') +
            '<button class="tombol-ikon bahaya" data-buang="' + q.id + '" title="Buang dari impor" aria-label="Buang dari impor">' + ikon('trash', 'ic-sm') + '</button></div></div>' +
            htmlSoal(q, { stimulus: st, kunci: true, klik: q.jenis === 'PG' || q.jenis === 'PGK' }) +
            '<ul class="daftar-masalah">' + c.merah.map(function (m) { return '<li class="merah">' + esc(m) + '</li>'; }).join('') + c.kuning.map(function (m) { return '<li class="kuning">' + esc(m) + '</li>'; }).join('') +
            (q.info || []).map(function (m) { return '<li class="info">' + esc(m) + '</li>'; }).join('') + '</ul></article>';
        }).join('') + '</div>' +
        '<div class="bilah-simpan"><span class="teks"><b>' + I.soal.length + '</b> soal · ' + (merah ? '<b style="color:var(--danger)">' + merah + ' perlu diperbaiki</b>' : 'tidak ada tanda merah') + '</span>' +
        '<button class="btn btn-primary" id="p-simpan"' + (merah || !I.soal.length ? ' disabled' : '') + '>' + ikon('check', 'ic-sm') + 'Simpan ke Bank Soal</button></div>';
      PN.muatGambar($('p-daftar'));
      $('p-batal').onclick = function () {
        PN.konfirmasi('Batalkan impor?', '<p>Hasil baca dan perbaikan yang belum disimpan akan hilang.</p>', 'Batalkan', true).then(function (ya) { if (ya) { S.impor = null; location.hash = '#/bank'; } });
      };
      if ($('p-potong')) $('p-potong').onclick = function () { bukaPotong(1, null); };
      $('p-simpan').onclick = simpanImpor;
      $('p-daftar').onclick = function (e) {
        var b = e.target.closest('[data-ubah],[data-potong],[data-buang],[data-opsi]'); if (!b) return;
        var kartu = b.closest('.kartu-soal'), id = kartu.id.slice(3), q = I.soal.filter(function (x) { return x.id === id; })[0];
        if (b.hasAttribute('data-buang')) { I.soal = I.soal.filter(function (x) { return x.id !== id; }); renderPeriksa(); return; }
        if (b.hasAttribute('data-potong')) { bukaPotong(1, id); return; }
        if (b.hasAttribute('data-ubah')) { ubahDraf(q); return; }
        if (b.hasAttribute('data-opsi')) {
          var oid = b.getAttribute('data-opsi');
          if (q.jenis === 'PG') q.kunci = oid;
          else { var a = Array.isArray(q.kunci) ? q.kunci.slice() : []; var k = a.indexOf(oid); if (k > -1) a.splice(k, 1); else a.push(oid); q.kunci = a; }
          var y = window.scrollY; renderPeriksa(); setTimeout(function () { window.scrollTo(0, y); }, 0);
        }
      };
    });
  }

  function ubahDraf(q) {
    var I = S.impor;
    PN.modal('<div class="modal-kepala"><h2>Ubah soal ' + (q.no || '') + '</h2></div><div class="modal-isi" id="ud-wadah"></div>' +
      '<div class="modal-kaki"><button class="btn btn-secondary" data-batal>Batal</button><button class="btn btn-primary" data-ok>Terapkan</button></div>', 'penuh');
    var ed = editorSoal($('ud-wadah'), q, { mapelTetap: true, stimulus: I.stimulus.map(function (s) { return { id: s.id, judul: s.judul }; }) });
    PN.tutupModalHook = function () { ed.lepas(); };
    $('modal-isi').onclick = function (e) {
      if (e.target.closest('[data-batal]')) PN.tutupModal();
      if (e.target.closest('[data-ok]')) {
        var m = ed.ambil();
        m.masalah = (q.masalah || []).filter(function (x) { return !/kunci|opsi|Teks soal kosong|rumus|EMF/i.test(x); });
        m.rumusPdf = false;
        I.soal = I.soal.map(function (x) { return x.id === q.id ? m : x; });
        PN.tutupModal();
        renderPeriksa();
        setTimeout(function () { var el = $('ks-' + m.id); if (el) el.scrollIntoView({ block: 'center' }); }, 50);
      }
    };
  }

  function simpanImpor() {
    var I = S.impor, b = $('p-simpan');
    var merah = I.soal.filter(function (q) { return periksa(q).merah.length; });
    if (merah.length) { PN.toast('Masih ada ' + merah.length + ' soal bertanda merah.', 'danger'); return; }
    b.disabled = true; b.innerHTML = '<span class="putar"></span>Menyimpan…';
    var teks = document.querySelector('.bilah-simpan .teks');
    var pakaiStim = {};
    I.soal.forEach(function (q) { if (q.id_stimulus) pakaiStim[q.id_stimulus] = 1; });
    var stim = I.stimulus.filter(function (s) { return pakaiStim[s.id]; });
    var soal = I.soal.map(function (q) { var x = JSON.parse(JSON.stringify(q)); delete x.masalah; delete x.info; delete x.rumusPdf; return x; });
    unggahSemuaGambar(soal, stim, function (t) { teks.textContent = t; }).then(function () {
      return kirimSoal(soal, stim, function (t) { teks.textContent = t; });
    }).then(function (r) {
      S.impor = null;
      PN.toast(r.baru + ' soal tersimpan di bank soal.', 'ok', 6000);
      location.hash = '#/bank';
    }).catch(function (e) {
      b.disabled = false; b.innerHTML = ikon('check', 'ic-sm') + 'Simpan ke Bank Soal';
      teks.textContent = '';
      PN.toast(e.message, 'danger', 8000);
    });
  }

  // =========================================================================
  // W-14 Potong soal dari PDF
  // =========================================================================
  function bukaPotong(halaman, gantiId) {
    var I = S.impor;
    if (!I || !I.file) return;
    var st = { n: halaman || 1, total: (I.statistik && I.statistik.halaman) || 1, kotak: null, kunci: 'a', jumlah: 4, kanvas: null, ditambah: 0 };
    PN.modal('<div class="modal-kepala"><h2>Potong soal dari PDF</h2><p>Tarik kotak di sekitar satu soal (beserta opsinya), pilih kuncinya, lalu tambahkan. Ulangi untuk soal berikutnya.</p></div>' +
      '<div class="modal-isi"><div class="potong-nav"><button class="btn btn-secondary btn-sm" data-hal="-1">' + ikon('arrow-l', 'ic-sm') + 'Sebelumnya</button>' +
      '<b data-info-hal></b><button class="btn btn-secondary btn-sm" data-hal="1">Berikutnya</button><span class="spasi"></span>' +
      '<span class="kecil muted">Jumlah opsi</span><select class="input" data-jumlah style="width:auto;min-height:36px;height:36px"><option>3</option><option selected>4</option><option>5</option></select>' +
      '<span class="kecil muted">Kunci</span><span class="skor-pilih" data-kunci-potong></span></div>' +
      '<div data-wadah-kanvas><div class="kerangka-muat"></div></div></div>' +
      '<div class="modal-kaki"><span class="kecil muted" data-hasil style="margin-right:auto"></span><button class="btn btn-secondary" data-selesai>Selesai</button>' +
      '<button class="btn btn-primary" data-tambah disabled>' + ikon('plus', 'ic-sm') + (gantiId ? 'Ganti soal ini' : 'Tambahkan soal') + '</button></div>', 'penuh');
    var M = $('modal-isi');
    function renderKunci() {
      M.querySelector('[data-kunci-potong]').innerHTML = HURUF.slice(0, st.jumlah).split('').map(function (h) {
        return '<button type="button" class="' + (st.kunci === h.toLowerCase() ? 'aktif' : '') + '" data-k="' + h.toLowerCase() + '">' + h + '</button>';
      }).join('');
    }
    function muatHalaman() {
      M.querySelector('[data-info-hal]').textContent = 'Halaman ' + st.n + ' dari ' + st.total;
      var w = M.querySelector('[data-wadah-kanvas]');
      w.innerHTML = '<div class="kerangka-muat"></div>';
      var lebar = Math.min(1100, Math.max(600, w.clientWidth || 900));
      CBTImpor.renderHalamanPdf(I.file, st.n, lebar * Math.min(2, window.devicePixelRatio || 1)).then(function (r) {
        st.kanvas = r.canvas; st.kotak = null;
        w.innerHTML = '<div class="potong-wadah"></div>';
        var wadah = w.firstChild;
        r.canvas.style.width = lebar + 'px';
        wadah.appendChild(r.canvas);
        var kotak = document.createElement('div'); kotak.className = 'potong-kotak'; kotak.hidden = true; wadah.appendChild(kotak);
        var awal = null;
        var titik = function (e) { var b = r.canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(b.width, e.clientX - b.left)), y: Math.max(0, Math.min(b.height, e.clientY - b.top)), w: b.width, h: b.height }; };
        wadah.addEventListener('pointerdown', function (e) { awal = titik(e); wadah.setPointerCapture(e.pointerId); kotak.hidden = false; gambarKotak(awal, awal); });
        wadah.addEventListener('pointermove', function (e) { if (awal) gambarKotak(awal, titik(e)); });
        wadah.addEventListener('pointerup', function (e) {
          if (!awal) return;
          var akhir = titik(e);
          if (Math.abs(akhir.x - awal.x) > 20 && Math.abs(akhir.y - awal.y) > 20) st.kotak = { x: Math.min(awal.x, akhir.x) / akhir.w, y: Math.min(awal.y, akhir.y) / akhir.h, w: Math.abs(akhir.x - awal.x) / akhir.w, h: Math.abs(akhir.y - awal.y) / akhir.h };
          else { st.kotak = null; kotak.hidden = true; }
          awal = null;
          M.querySelector('[data-tambah]').disabled = !st.kotak;
        });
        function gambarKotak(a, b) { kotak.style.left = Math.min(a.x, b.x) + 'px'; kotak.style.top = Math.min(a.y, b.y) + 'px'; kotak.style.width = Math.abs(b.x - a.x) + 'px'; kotak.style.height = Math.abs(b.y - a.y) + 'px'; }
      }, function (e) { w.innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
    }
    M.onclick = function (e) {
      var h = e.target.closest('[data-hal]');
      if (h) { var n = st.n + Number(h.getAttribute('data-hal')); if (n >= 1 && n <= st.total) { st.n = n; muatHalaman(); M.querySelector('[data-tambah]').disabled = true; } return; }
      var k = e.target.closest('[data-k]');
      if (k) { st.kunci = k.getAttribute('data-k'); renderKunci(); return; }
      if (e.target.closest('[data-selesai]')) { PN.tutupModal(); renderPeriksa(); return; }
      if (e.target.closest('[data-tambah]') && st.kotak && st.kanvas) {
        var c = st.kanvas, b = st.kotak;
        var sx = Math.round(b.x * c.width), sy = Math.round(b.y * c.height), sw = Math.round(b.w * c.width), sh = Math.round(b.h * c.height);
        var skala = Math.min(1, 1000 / sw), out = document.createElement('canvas');
        out.width = Math.round(sw * skala); out.height = Math.round(sh * skala);
        var cx = out.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, out.width, out.height);
        cx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
        kompresDataUrl(out.toDataURL('image/png'), Math.min(720, out.width)).then(function (g) {
          var letters = HURUF.slice(0, st.jumlah).split('');
          var lama = gantiId ? I.soal.filter(function (x) { return x.id === gantiId; })[0] : null;
          var q = { id: gantiId || idSem(), no: lama ? lama.no : (I.soal.length ? Math.max.apply(null, I.soal.map(function (x) { return Number(x.no) || 0; })) + 1 : 1),
            jenis: 'PG', id_mapel: I.mapel, tingkat: I.tingkat, bobot: 1, sumber: 'potong_pdf',
            html: '<p><img src="' + g.src + '" width="' + Math.min(720, g.w) + '" alt="Soal hasil potong PDF"></p>', src: '',
            opsi: { opsi: letters.map(function (h) { return { id: h.toLowerCase(), html: h }; }) }, kunci: st.kunci, masalah: [], info: [] };
          q.src = q.html;
          if (lama) I.soal = I.soal.map(function (x) { return x.id === gantiId ? q : x; });
          else I.soal.push(q);
          st.ditambah++;
          M.querySelector('[data-hasil]').textContent = st.ditambah + ' soal ditambahkan dari potongan.';
          PN.toast('Soal ' + q.no + ' ditambahkan (kunci ' + st.kunci.toUpperCase() + ').', 'ok');
          if (gantiId) { PN.tutupModal(); renderPeriksa(); return; }
          st.kotak = null; M.querySelector('.potong-kotak').hidden = true; M.querySelector('[data-tambah]').disabled = true;
        });
      }
    };
    M.querySelector('[data-jumlah]').onchange = function () { st.jumlah = Number(this.value); if (HURUF.slice(0, st.jumlah).toLowerCase().indexOf(st.kunci) < 0) st.kunci = 'a'; renderKunci(); };
    renderKunci();
    API.muatSkrip('./js/impor.js').then(muatHalaman);
  }

  // =========================================================================
  // F-15 Impor Excel (template Lampiran A.4)
  // =========================================================================
  var KOLOM_TEMPLATE = ['No', 'Jenis', 'Stimulus', 'Soal', 'A', 'B', 'C', 'D', 'E', 'Pasangan', 'Kunci', 'Rubrik', 'Skor maks', 'Bobot'];

  function unduhTemplateSoal() {
    API.muatSkrip('./js/xlsx.js').then(function () {
      return XLSX.tulis([
        { nama: 'Soal', lebar: [5, 9, 10, 60, 18, 18, 18, 18, 18, 30, 16, 36, 10, 8], baris: [KOLOM_TEMPLATE,
          [1, 'PG', '', 'Organisasi pergerakan nasional yang berdiri pada 20 Mei 1908 adalah ....', 'Sarekat Islam', 'Indische Partij', 'Budi Utomo', 'Muhammadiyah', '', '', 'C', '', '', 1],
          [2, 'PGK', '', 'Pilih semua dampak pendudukan Jepang di bidang ekonomi!', 'Romusha', 'Politik etis', 'Wajib serah padi', 'Tanam paksa', '', '', 'A, C', '', '', 1],
          [3, 'BS', 'S1', 'Tentukan benar atau salah pernyataan berikut!', 'Perlawanan PETA terjadi di Blitar.', 'Jepang mendarat pertama di Jakarta.', '', '', '', '', 'B, S', '', '', 1],
          [4, 'JODOH', 'S1', 'Jodohkan tokoh dengan perannya!', 'Supriyadi', 'Soekarno', '', '', '', 'Proklamator | Pemimpin PETA Blitar | Wakil Presiden', '1-B, 2-A', '', '', 1],
          [5, 'ISIAN', '', 'Luas persegi bersisi $s$ adalah ....', '', '', '', '', '', '', 's^2 | s²', '', '', 1],
          [6, 'ESAI', '', 'Jelaskan tiga dampak sosial pendudukan Jepang!', '', '', '', '', '', '', 'romusha, kelaparan, pengerahan pemuda', 'Menyebut tiga dampak (6); Penjelasan runtut (4)', 10, 2]] },
        { nama: 'Stimulus', lebar: [8, 30, 80], baris: [['Kode', 'Judul', 'Isi'], ['S1', 'Perlawanan PETA', 'Pada 14 Februari 1945 terjadi perlawanan PETA di Blitar yang dipimpin Supriyadi.']] },
        { nama: 'Petunjuk', kepala: false, lebar: [110], baris: [['Satu baris untuk satu soal. Jenis: PG, PGK, BS, JODOH, ISIAN, ESAI (kosong = PG).'],
          ['BS: kolom A–E berisi pernyataan, kunci "B, S, B". JODOH: kolom A–E berisi lajur kiri, kolom Pasangan berisi lajur kanan dipisah |, kunci "1-B, 2-A".'],
          ['ISIAN: jawaban alternatif dipisah |. ESAI: Kunci berisi jawaban acuan, Rubrik "kriteria (skor); kriteria (skor)", isi Skor maks.'],
          ['Rumus ditulis $...$, misalnya $\\frac{1}{2}$. Gambar ditambahkan di layar pratinjau setelah impor.']] }
      ]);
    }).then(function (blob) { API.unduh(blob, 'Template_Soal_DigitalCBT.xlsx'); }, function (e) { PN.toast(e.message, 'danger'); });
  }

  function bacaTemplateExcel(sheets) {
    var lembar = sheets[0];
    if (!lembar || !lembar.baris.length) throw new Error('File Excel kosong.');
    var kepala = lembar.baris[0], c = {};
    KOLOM_TEMPLATE.forEach(function (k) { c[k] = XLSX.cariKolom(kepala, [k, k === 'Skor maks' ? 'Skor maksimal' : k]); });
    if (c.Soal < 0) throw new Error('Kolom "Soal" tidak ditemukan. Gunakan template Excel dari aplikasi.');
    var stimulus = {}, st = sheets.filter(function (s) { return /stimulus/i.test(s.nama); })[0];
    if (st && st.baris.length > 1) {
      var ck = XLSX.cariKolom(st.baris[0], ['Kode']), cj = XLSX.cariKolom(st.baris[0], ['Judul']), ci = XLSX.cariKolom(st.baris[0], ['Isi', 'Teks']);
      st.baris.slice(1).forEach(function (r) {
        var kode = String(r[ck] || '').trim(); if (!kode) return;
        var teks = htmlTeks(r[ci]);
        stimulus[kode] = { judul: String(r[cj] || 'Stimulus ' + kode), html: teks.html, sumber: teks.src, dari: '', sampai: '' };
      });
    }
    var soal = [];
    lembar.baris.slice(1).forEach(function (r, i) {
      var nilai = function (k) { return c[k] > -1 ? String(r[c[k]] === undefined ? '' : r[c[k]]).trim() : ''; };
      if (!nilai('Soal')) return;
      var jenis = (nilai('Jenis') || 'PG').toUpperCase().replace('URAIAN', 'ESAI');
      var isi = htmlTeks(nilai('Soal'));
      var huruf = ['A', 'B', 'C', 'D', 'E'].map(function (h) { return nilai(h); });
      var s = { no: Number(nilai('No')) || i + 1, jenis: jenis, isi: isi.html, isiSumber: isi.src, bobot: Number(nilai('Bobot')) || 1, stimulus: nilai('Stimulus'), masalah: [], info: [], opsi: [], item: [] };
      var kunci = nilai('Kunci');
      if (jenis === 'PG' || jenis === 'PGK') {
        s.opsi = huruf.map(function (t, k) { var x = htmlTeks(t); return t ? { huruf: 'ABCDE'[k], html: x.html, sumber: x.src } : null; }).filter(Boolean);
        s.kunciData = jenis === 'PG' ? (kunci.match(/[A-Ea-e]/) || [''])[0].toUpperCase() : (kunci.match(/[A-Ea-e]/g) || []).map(function (x) { return x.toUpperCase(); });
      } else if (jenis === 'BS' || jenis === 'JODOH') {
        s.item = huruf.map(function (t, k) { var x = htmlTeks(t); return t ? { no: k + 1, html: x.html, sumber: x.src } : null; }).filter(Boolean);
        if (jenis === 'BS') s.kunciData = kunci.split(/[,;\s]+/).filter(String).map(function (x) { return x[0].toUpperCase(); });
        else {
          s.opsi = nilai('Pasangan').split('|').map(function (t) { return t.trim(); }).filter(String).map(function (t, k) { var x = htmlTeks(t); return { huruf: 'ABCDEFGHIJ'[k], html: x.html, sumber: x.src }; });
          s.kunciData = {};
          kunci.replace(/(\d+)\s*[-–=:]\s*([A-Ja-j])/g, function (m, n, h) { s.kunciData[n] = h.toUpperCase(); return m; });
        }
      } else if (jenis === 'ISIAN') {
        s.kunciData = kunci.split('|').map(function (x) { return x.trim(); }).filter(String);
      } else if (jenis === 'ESAI') {
        s.kunciData = { acuan: kunci };
        s.rubrik = nilai('Rubrik').split(';').map(function (x) { return x.trim(); }).filter(String).map(function (x) {
          var m = x.match(/^(.*?)\s*\((\d+(?:[.,]\d+)?)\)\s*$/); return m ? { kriteria: m[1], skor: Number(m[2].replace(',', '.')) } : { kriteria: x, skor: 0 };
        });
        s.skor_maks = Number(nilai('Skor maks')) || 0;
      } else { s.jenis = 'PG'; s.masalah.push('Jenis "' + jenis + '" tidak dikenal; dianggap PG.'); }
      if (s.stimulus && !stimulus[s.stimulus]) s.masalah.push('Kode stimulus ' + s.stimulus + ' tidak ada di sheet Stimulus.');
      soal.push(s);
    });
    Object.keys(stimulus).forEach(function (k) {
      var anggota = soal.filter(function (s) { return s.stimulus === k; }).map(function (s) { return s.no; });
      stimulus[k].dari = Math.min.apply(null, anggota.concat([0])); stimulus[k].sampai = Math.max.apply(null, anggota.concat([0]));
    });
    soal.forEach(function (s) { if (s.stimulus && !stimulus[s.stimulus]) s.stimulus = ''; });
    return API.katex().then(function () { return { soal: soal, stimulus: stimulus, peringatan: [], statistik: { gambar: 0 } }; });
  }
  /** Teks sel Excel → HTML aman; $…$ dirender KaTeX untuk tampilan, sumber tetap $…$. */
  function htmlTeks(t) {
    var src = esc(String(t || '')).replace(/\n/g, '<br>');
    var html = src.replace(/\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g, function (m, a, b) {
      var tex = (a || b).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
      try { return window.katex.renderToString(tex, { displayMode: !!a, throwOnError: true, strict: 'ignore' }); } catch (e) { return '<span class="rumus-gagal">[rumus gagal: ' + esc(tex) + ']</span>'; }
    });
    return { html: html, src: src };
  }

  // =========================================================================
  // W-16 Paket ujian
  // =========================================================================
  function halamanPaket(bagian) {
    if (bagian[0]) return editorPaket(bagian[0] === 'baru' ? null : bagian[0]);
    PN.judul('Paket Ujian');
    PN.konten().innerHTML = PN.bannerMode() + '<div class="kepala-bagian"><div><h2>Paket ujian</h2><p>Susun soal dari bank, atur acak dan bobot, lalu kunci paket agar bisa dijadwalkan admin.</p></div>' +
      '<a class="btn btn-primary" href="#/paket/baru">' + ikon('plus', 'ic-sm') + 'Buat paket</a></div><section class="kartu-blok"><div id="pk-daftar"><div style="padding:20px"><div class="kerangka-muat"></div></div></div></section>';
    PN.muat('paket', 'daftarPaket', {}, function (d, c, g) {
      var el = $('pk-daftar'); if (!el) return;
      if (!d) { el.innerHTML = '<div class="kosong-isi"><p>' + esc(g ? g.pesan : 'Gagal memuat.') + '</p></div>'; return; }
      S.paket = d.paket;
      if (!d.paket.length) { el.innerHTML = '<div class="kosong-isi">' + ikon('layers') + '<p><b>Belum ada paket.</b></p><p>Buat paket dari soal di bank soal.</p></div>'; return; }
      el.innerHTML = '<div class="kartu-ujian-list">' + d.paket.slice().sort(function (a, b) { return (a.status === 'Dikunci') - (b.status === 'Dikunci') || b.dikunci_pada - a.dikunci_pada; }).map(function (p) {
        var kunci = p.status === 'Dikunci';
        return '<div class="kartu-ujian"><div><h3>' + esc(p.nama) + ' ' + (kunci ? '<span class="pill pill-ok">' + ikon('lock') + 'Dikunci</span>' : '<span class="pill pill-warn">Draf</span>') + '</h3>' +
          '<p>' + esc(namaMapel(p.id_mapel)) + (p.tingkat ? ' · tingkat ' + p.tingkat : '') + ' · ' + p.soal_ids.length + ' soal · ' + (p.acak_soal ? 'soal diacak' : 'urutan tetap') + ' · skor ' + p.aturan_skor +
          ' · ' + esc(p.nama_penyusun.join(', ')) + (kunci ? ' · dikunci ' + PN.tanggal(p.dikunci_pada) : '') + (p.dipakai.length ? ' · dipakai: ' + esc(p.dipakai.join(', ')) : '') + '</p></div>' +
          '<div class="baris-aksi"><a class="btn btn-secondary btn-sm" href="#/paket/' + encodeURIComponent(p.id) + '">' + (kunci ? ikon('eye', 'ic-sm') + 'Lihat' : ikon('edit', 'ic-sm') + 'Ubah') + '</a>' +
          '<button class="tombol-ikon" data-dup="' + esc(p.id) + '" title="Duplikat" aria-label="Duplikat">' + ikon('dup', 'ic-sm') + '</button>' +
          (!kunci && !p.dipakai.length ? '<button class="tombol-ikon bahaya" data-hapus="' + esc(p.id) + '" title="Hapus" aria-label="Hapus">' + ikon('trash', 'ic-sm') + '</button>' : '') + '</div></div>';
      }).join('') + '</div>';
      el.onclick = function (e) {
        var b = e.target.closest('[data-dup],[data-hapus]'); if (!b) return;
        var dup = b.hasAttribute('data-dup'), id = b.getAttribute(dup ? 'data-dup' : 'data-hapus');
        (dup ? Promise.resolve(true) : PN.konfirmasi('Hapus paket draf?', '<p>Soal di bank soal tidak ikut terhapus.</p>', 'Hapus', true)).then(function (ya) {
          if (!ya) return;
          PN.panggil(dup ? 'duplikatPaket' : 'hapusPaket', { id: id }).then(function (r) {
            if (!r.ok) { PN.toast(r.pesan, 'danger'); return; }
            PN.toast(dup ? 'Paket diduplikat sebagai draf.' : 'Paket dihapus.', 'ok');
            PN.lupakan('paket');
            if (dup) location.hash = '#/paket/' + encodeURIComponent(r.data.id); else halamanPaket([]);
          });
        });
      };
    });
  }

  function editorPaket(id) {
    PN.judul(id ? 'Paket Ujian' : 'Paket Baru', 'Paket Ujian');
    PN.konten().innerHTML = '<p><a class="btn btn-ghost btn-sm" href="#/paket">' + ikon('arrow-l', 'ic-sm') + 'Kembali ke daftar paket</a></p><div id="pe-isi"><div class="kerangka-muat"></div></div>';
    Promise.all([
      S.paket ? Promise.resolve({ paket: S.paket }) : PN.panggil('daftarPaket', {}).then(function (r) { if (!r.ok) throw new Error(r.pesan); S.paket = r.data.paket; return r.data; }),
      S.bank ? Promise.resolve(S.bank) : PN.panggil('bankSoal', {}).then(function (r) { if (!r.ok) throw new Error(r.pesan); S.bank = r.data; return r.data; })
    ]).then(function () {
      var mp = mapelSaya();
      var awal = null;
      try { awal = JSON.parse(sessionStorage.getItem('cbt_paket_awal') || 'null'); sessionStorage.removeItem('cbt_paket_awal'); } catch (e) { awal = null; }
      var pk = id ? S.paket.filter(function (p) { return p.id === id; })[0] : null;
      if (id && !pk) throw new Error('Paket tidak ditemukan.');
      var bankPeta = {}; S.bank.soal.forEach(function (q) { bankPeta[q.id] = q; });
      var M = pk ? JSON.parse(JSON.stringify(pk)) : { id: '', nama: '', id_mapel: (awal && bankPeta[awal[0]] ? bankPeta[awal[0]].id_mapel : (mp[0] || {}).id) || '', tingkat: (awal && bankPeta[awal[0]] ? bankPeta[awal[0]].tingkat : 8), soal_ids: awal || [], acak_soal: true, acak_opsi: true, aturan_skor: 'parsial', bobot: {}, status: 'Draf' };
      var kunci = M.status === 'Dikunci';
      var cari = '', jenisF = '';
      var el = $('pe-isi');
      el.innerHTML = (kunci ? '<div class="alert alert-ok" style="margin-bottom:16px">' + ikon('lock') + '<span>Paket ini sudah dikunci ' + PN.tanggal(M.dikunci_pada) + ' (snapshot dibuat). Isinya tidak bisa diubah; duplikat paket untuk membuat versi baru.</span></div>' : '') +
        '<section class="kartu-blok" style="padding:20px"><div class="grid-form">' +
        '<label class="field lebar-penuh"><span class="label">Nama paket</span><input class="input" id="pe-nama" value="' + esc(M.nama) + '" placeholder="PAS Ganjil IPS VIII — Paket A"' + (kunci ? ' disabled' : '') + '></label>' +
        '<label class="field"><span class="label">Mapel</span><select class="input" id="pe-mapel"' + (kunci || M.soal_ids.length ? ' disabled' : '') + '>' + mp.map(function (m) { return '<option value="' + esc(m.id) + '"' + (M.id_mapel === m.id ? ' selected' : '') + '>' + esc(m.nama) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="label">Tingkat</span><select class="input" id="pe-tingkat"' + (kunci ? ' disabled' : '') + '>' + ['', 7, 8, 9].map(function (t) { return '<option value="' + t + '"' + (String(M.tingkat) === String(t) ? ' selected' : '') + '>' + (t || '-') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span class="label">Skor PG kompleks, B-S &amp; menjodohkan</span><select class="input" id="pe-aturan"' + (kunci ? ' disabled' : '') + '><option value="parsial"' + (M.aturan_skor === 'parsial' ? ' selected' : '') + '>Parsial (sebagian benar dapat sebagian)</option><option value="mutlak"' + (M.aturan_skor === 'mutlak' ? ' selected' : '') + '>Mutlak (harus benar semua)</option></select></label>' +
        '<div class="field"><span class="label">Pengacakan</span><div class="baris-aksi" style="min-height:44px"><label class="sakelar"><input type="checkbox" id="pe-acak-soal"' + (M.acak_soal ? ' checked' : '') + (kunci ? ' disabled' : '') + '><i></i>Acak soal</label>' +
        '<label class="sakelar"><input type="checkbox" id="pe-acak-opsi"' + (M.acak_opsi ? ' checked' : '') + (kunci ? ' disabled' : '') + '><i></i>Acak opsi</label></div></div></div></section>' +
        '<div class="paket-badan">' +
        (kunci ? '' : '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Bank soal</h2><p>Klik + untuk menambahkan ke paket</p></div></div><div class="bilah-saring"><label class="cari">' + ikon('search', 'ic-sm') + '<input class="input" id="pe-cari" placeholder="Cari soal…"></label>' +
          '<select class="input" id="pe-jenis"><option value="">Semua jenis</option>' + Object.keys(JENIS).map(function (j) { return '<option value="' + j + '">' + JENIS[j] + '</option>'; }).join('') + '</select></div><div class="daftar-pilih" id="pe-bank"></div></section>') +
        '<section class="kartu-blok terpilih"><div class="kartu-blok-kepala"><div><h2>Isi paket</h2><p id="pe-ringkas"></p></div>' + (kunci ? '' : '<button class="btn btn-ghost btn-sm" id="pe-rapikan" title="Soal satu stimulus diletakkan berurutan">Rapikan stimulus</button>') + '</div><div class="daftar-pilih" id="pe-terpilih"></div></section></div>' +
        '<div id="pe-ukuran"></div>' +
        '<div class="bilah-simpan"><span class="teks" id="pe-status"></span>' +
        '<button class="btn btn-secondary" id="pe-lihat">' + ikon('eye', 'ic-sm') + 'Pratinjau sebagai siswa</button>' +
        (kunci ? '<button class="btn btn-primary" id="pe-dup">' + ikon('dup', 'ic-sm') + 'Duplikat untuk mengubah</button>' :
          '<button class="btn btn-secondary" id="pe-simpan">Simpan draf</button><button class="btn btn-primary" id="pe-kunci">' + ikon('lock', 'ic-sm') + 'Kunci paket</button>') + '</div>';

      function baca() {
        if (kunci) return;
        M.nama = $('pe-nama').value.trim(); M.id_mapel = $('pe-mapel').value; M.tingkat = Number($('pe-tingkat').value) || '';
        M.aturan_skor = $('pe-aturan').value; M.acak_soal = $('pe-acak-soal').checked; M.acak_opsi = $('pe-acak-opsi').checked;
      }
      function renderBankPaket() {
        if (kunci) return;
        var ada = {}; M.soal_ids.forEach(function (x) { ada[x] = 1; });
        var daftar = S.bank.soal.filter(function (q) {
          return q.status !== 'nonaktif' && q.id_mapel === M.id_mapel && !ada[q.id] && (!jenisF || q.jenis === jenisF) && (!cari || q.teks.toLowerCase().indexOf(cari) > -1) &&
            (!M.tingkat || !q.tingkat || String(q.tingkat) === String(M.tingkat));
        });
        $('pe-bank').innerHTML = daftar.length ? daftar.slice(0, 200).map(function (q) {
          return '<div class="baris-soal"><div><div class="teks">' + esc(q.teks || '(soal bergambar)') + '</div><div class="meta"><span class="label-jenis">' + q.jenis + '</span>' + (q.st ? '<span class="chip">Stimulus</span>' : '') + (q.kunci ? '' : '<span class="pill pill-danger">kunci kosong</span>') + '</div></div>' +
            '<div class="baris-aksi"><button class="tombol-ikon" data-lihat="' + esc(q.id) + '" aria-label="Lihat">' + ikon('eye', 'ic-sm') + '</button><button class="tombol-ikon" data-tambah="' + esc(q.id) + '" aria-label="Tambahkan">' + ikon('plus', 'ic-sm') + '</button></div></div>';
        }).join('') : '<div class="kosong-isi"><p>Tidak ada soal lain di mapel ini.</p></div>';
      }
      function renderTerpilih() {
        var tot = 0, per = {};
        $('pe-terpilih').innerHTML = M.soal_ids.length ? M.soal_ids.map(function (sid, i) {
          var q = bankPeta[sid] || { teks: '(soal tidak ditemukan)', jenis: '?' };
          var b = M.bobot[sid] || q.bobot || 1; tot += b; per[q.jenis] = (per[q.jenis] || 0) + 1;
          return '<div class="baris-soal"><span class="no">' + (i + 1) + '</span><div><div class="teks">' + esc(q.teks || '(soal bergambar)') + '</div><div class="meta"><span class="label-jenis">' + q.jenis + '</span>' + (q.st ? '<span class="chip">Stimulus</span>' : '') + '</div></div>' +
            '<div class="baris-aksi">' + (kunci ? '<span class="kecil muted">bobot ' + b + '</span>' : '<input class="input input-bobot" type="number" min="0.5" max="10" step="0.5" value="' + b + '" data-bobot="' + esc(sid) + '" title="Bobot" aria-label="Bobot soal ' + (i + 1) + '">' +
            '<button class="tombol-ikon" data-naik="' + i + '"' + (i ? '' : ' disabled') + ' aria-label="Naik">' + ikon('up', 'ic-sm') + '</button><button class="tombol-ikon" data-turun="' + i + '"' + (i < M.soal_ids.length - 1 ? '' : ' disabled') + ' aria-label="Turun">' + ikon('down', 'ic-sm') + '</button>' +
            '<button class="tombol-ikon bahaya" data-buang="' + i + '" aria-label="Keluarkan">' + ikon('x', 'ic-sm') + '</button>') + '</div></div>';
        }).join('') : '<div class="kosong-isi"><p>Belum ada soal. Tambahkan dari bank soal di sebelah kiri.</p></div>';
        $('pe-ringkas').textContent = M.soal_ids.length + ' soal · total bobot ' + tot + (Object.keys(per).length ? ' · ' + Object.keys(per).map(function (k) { return k + ' ' + per[k]; }).join(', ') : '');
        if (!kunci) $('pe-mapel').disabled = !!M.soal_ids.length;
      }
      renderBankPaket(); renderTerpilih();
      if (!kunci) {
        var t = null;
        $('pe-cari').oninput = function () { var v = this.value; clearTimeout(t); t = setTimeout(function () { cari = v.trim().toLowerCase(); renderBankPaket(); }, 300); };
        $('pe-jenis').onchange = function () { jenisF = this.value; renderBankPaket(); };
        $('pe-mapel').onchange = $('pe-tingkat').onchange = function () { baca(); renderBankPaket(); };
        $('pe-rapikan').onclick = function () {
          var urut = [], sudah = {};
          M.soal_ids.forEach(function (sid) {
            if (sudah[sid]) return;
            var st = (bankPeta[sid] || {}).st;
            if (!st) { urut.push(sid); sudah[sid] = 1; return; }
            M.soal_ids.forEach(function (x) { if (!sudah[x] && (bankPeta[x] || {}).st === st) { urut.push(x); sudah[x] = 1; } });
          });
          M.soal_ids = urut; renderTerpilih(); PN.toast('Soal satu stimulus kini berurutan.', 'ok');
        };
      }
      el.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tambah],[data-naik],[data-turun],[data-buang],[data-lihat]'); if (!b) return;
        if (b.hasAttribute('data-lihat')) { lihatSebagaiSiswa([b.getAttribute('data-lihat')]); return; }
        if (b.hasAttribute('data-tambah')) {
          var sid = b.getAttribute('data-tambah'), st = (bankPeta[sid] || {}).st;
          M.soal_ids.push(sid);
          if (st) S.bank.soal.forEach(function (q) { if (q.st === st && q.status !== 'nonaktif' && M.soal_ids.indexOf(q.id) < 0) M.soal_ids.push(q.id); }); // satu stimulus satu kelompok
        }
        var i = Number(b.getAttribute('data-naik') || b.getAttribute('data-turun') || b.getAttribute('data-buang'));
        if (b.hasAttribute('data-naik')) M.soal_ids.splice(i - 1, 0, M.soal_ids.splice(i, 1)[0]);
        if (b.hasAttribute('data-turun')) M.soal_ids.splice(i + 1, 0, M.soal_ids.splice(i, 1)[0]);
        if (b.hasAttribute('data-buang')) M.soal_ids.splice(i, 1);
        renderBankPaket(); renderTerpilih();
      });
      el.addEventListener('change', function (e) { var bb = e.target.closest('[data-bobot]'); if (bb) { M.bobot[bb.getAttribute('data-bobot')] = Math.max(0.5, Math.min(10, Number(bb.value) || 1)); renderTerpilih(); } });
      $('pe-lihat').onclick = function () { lihatSebagaiSiswa(M.soal_ids, 'Pratinjau paket: ' + (M.nama || 'tanpa nama')); };
      function simpan() {
        baca();
        if (!M.nama) { PN.toast('Isi nama paket.', 'warn'); $('pe-nama').focus(); return Promise.reject(new Error('')); }
        $('pe-status').textContent = 'Menyimpan…';
        return PN.panggil('simpanPaket', { id: M.id, nama: M.nama, id_mapel: M.id_mapel, tingkat: M.tingkat, soal_ids: M.soal_ids, acak_soal: M.acak_soal, acak_opsi: M.acak_opsi, aturan_skor: M.aturan_skor, bobot: M.bobot }).then(function (r) {
          if (!r.ok) { $('pe-status').textContent = ''; throw new Error(r.pesan); }
          M.id = r.data.id; PN.lupakan('paket'); S.paket = null;
          $('pe-status').textContent = 'Draf tersimpan ' + PN.jam(Date.now());
          if (!id) history.replaceState(null, '', '#/paket/' + encodeURIComponent(M.id));
          return M.id;
        });
      }
      if ($('pe-simpan')) $('pe-simpan').onclick = function () { simpan().then(function () { PN.toast('Draf paket disimpan.', 'ok'); }, function (e) { if (e.message) PN.toast(e.message, 'danger'); }); };
      if ($('pe-kunci')) $('pe-kunci').onclick = function () {
        if (!M.soal_ids.length) { PN.toast('Paket belum berisi soal.', 'warn'); return; }
        PN.konfirmasi('Kunci paket?', '<p>Isi soal, opsi, kunci, rubrik, dan bobot disalin menjadi <b>snapshot</b>. Setelah dikunci, paket tidak bisa diubah — hanya bisa diduplikat. Perubahan di bank soal sesudahnya tidak memengaruhi ujian dan nilainya.</p>', 'Kunci paket').then(function (ya) {
          if (!ya) return;
          var b = $('pe-kunci'); b.disabled = true; b.innerHTML = '<span class="putar"></span>Mengunci…';
          simpan().then(function (pid) { return PN.panggil('kunciPaket', { id: pid }, { timeout: 120000 }); }).then(function (r) {
            if (!r.ok) throw new Error(r.pesan);
            var u = r.data.ukuran, kb = function (n) { return Math.round(n / 1024) + ' KB'; };
            PN.lupakan('paket'); S.paket = null;
            PN.toast('Paket dikunci.', 'ok');
            PN.modal('<div class="modal-kepala"><h2>Paket dikunci</h2></div><div class="modal-isi"><div class="ukuran-paket"><div class="angka"><div class="angka-kepala">Teks</div><b style="font-size:22px">' + kb(u.teks) + '</b><small>batas 300 KB</small></div>' +
              '<div class="angka"><div class="angka-kepala">Gambar</div><b style="font-size:22px">' + kb(u.gambar) + '</b><small>' + u.jumlah_gambar + ' gambar</small></div><div class="angka"><div class="angka-kepala">Total</div><b style="font-size:22px">' + kb(u.total) + '</b><small>batas 2 MB</small></div></div>' +
              (u.lewat ? '<div class="alert alert-warn" style="margin-top:12px">' + ikon('alert') + '<span>Paket melebihi anggaran ukuran (PRD 6.1). Paket tetap bisa dipakai, tetapi unduhan di HP lebih lama. Kecilkan gambar terbesar.</span></div>' :
                '<div class="alert alert-ok" style="margin-top:12px">' + ikon('check-c') + '<span>Ukuran paket sesuai anggaran.</span></div>') + '</div>' +
              '<div class="modal-kaki"><button class="btn btn-primary" data-ok>Selesai</button></div>');
            $('modal-isi').onclick = function (e) { if (e.target.closest('[data-ok]')) { PN.tutupModal(); location.hash = '#/paket'; } };
          }).catch(function (e) { b.disabled = false; b.innerHTML = ikon('lock', 'ic-sm') + 'Kunci paket'; if (e.message) PN.toast(e.message, 'danger', 7000); });
        });
      };
      if ($('pe-dup')) $('pe-dup').onclick = function () {
        PN.panggil('duplikatPaket', { id: M.id }).then(function (r) { if (!r.ok) { PN.toast(r.pesan, 'danger'); return; } PN.lupakan('paket'); S.paket = null; location.hash = '#/paket/' + encodeURIComponent(r.data.id); });
      };
    }).catch(function (e) { $('pe-isi').innerHTML = '<div class="alert alert-danger">' + esc(e.message) + '</div>'; });
  }

  // =========================================================================
  // Beranda guru: tugas berikutnya (PRD 8.4)
  // =========================================================================
  PN.BERANDA.guru = function () {
    var b = PN.P.boot || {}, d = b.data || {}, c = b.cakupan || { mapel: [] };
    var h = '';
    if (!c.mapel.length) h += '<div class="alert alert-warn" style="margin-bottom:18px">' + ikon('alert') + '<span>Anda belum terdaftar sebagai pengampu mapel. Minta admin menambahkannya di menu Guru &amp; Data Sekolah → Pengampu.</span></div>';
    // Alur kerja guru dalam 4 langkah: langkah yang belum beres disorot, lengkap dengan tombol tujuannya
    var nilai = (d.ujian_nilai || []).length;
    var langkah = [
      { n: 1, j: 'Susun soal', k: d.soal ? d.soal + ' soal aktif di bank soal' : 'Belum ada soal. Unggah file Word/PDF/Excel atau tulis langsung.', ok: d.soal > 0, a: '#/bank', t: d.soal ? 'Buka bank soal' : 'Mulai susun soal' },
      { n: 2, j: 'Buat & kunci paket', k: (d.paket_kunci || 0) + ' paket terkunci' + (d.paket_draf ? ' · ' + d.paket_draf + ' masih draf' : ''), ok: d.paket_kunci > 0 && !d.paket_draf, a: d.paket_draf || d.paket_kunci ? '#/paket' : '#/paket/baru', t: d.paket_draf ? 'Lanjutkan paket' : d.paket_kunci ? 'Lihat paket' : 'Buat paket' },
      { n: 3, j: 'Ujian berlangsung', k: 'Admin menjadwalkan paket Anda. Bila ditugaskan mengawasi, tombol Panel Pengawas muncul di atas pada hari ujian.', ok: null },
      { n: 4, j: 'Nilai & publikasikan', k: nilai ? nilai + ' ujian menunggu koreksi esai, verifikasi, atau publikasi' : 'Tidak ada nilai yang menunggu.', ok: !nilai, a: '#/nilai', t: nilai ? 'Kerjakan sekarang' : 'Lihat nilai' }
    ];
    var kini = langkah.filter(function (x) { return x.ok === false; })[0];
    h += '<section class="kartu-blok"><div class="kartu-blok-kepala"><div><h2>Alur kerja Anda</h2><p>' + esc(c.mapel.map(function (m) { return m.nama; }).join(', ') || 'Belum ada mapel') +
      (c.rombel && c.rombel.length ? ' · ' + esc(c.rombel.join(', ')) : '') + '</p></div></div><ol class="alur-guru">' +
      langkah.map(function (x) {
        var kls = x === kini ? 'kini' : x.ok === true ? 'beres' : x.ok === null ? 'info' : '';
        return '<li class="' + kls + '"><span class="alur-no">' + (x.ok === true ? ikon('check', 'ic-sm') : x.n) + '</span><div class="alur-isi"><b>' + x.j + '</b><small>' + esc(x.k) + '</small></div>' +
          (x.a ? '<a class="btn ' + (x === kini ? 'btn-primary' : 'btn-secondary') + ' btn-sm" href="' + x.a + '">' + x.t + '</a>' : '') + '</li>';
      }).join('') + '</ol>' +
      (nilai ? '<div class="tugas">' + d.ujian_nilai.map(function (u) {
        return '<div class="tugas-item"><div><h3>' + esc(u.nama) + '</h3><p>' + PN.tanggal(u.t) + ' · ' + esc(u.st) + '</p></div><a class="btn btn-primary" href="#/nilai/' + encodeURIComponent(u.id) + '">Buka nilai</a></div>';
      }).join('') + '</div>' : '') + '</section>';
    return h;
  };

  PN.daftar('bank', halamanBank);
  PN.daftar('paket', halamanPaket);
  window.MSOAL = { htmlSoal: htmlSoal, ambilSoal: ambilSoal, JENIS: JENIS, HURUF: HURUF };
  window.addEventListener('beforeunload', function (e) { if (S.impor && S.impor.soal && S.impor.soal.length) { e.preventDefault(); e.returnValue = ''; } });
})();
