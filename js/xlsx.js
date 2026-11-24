/* xlsx.js — Baca & tulis Excel (.xlsx) dan CSV di browser, di atas JSZip (vendor/jszip.min.js).
 * Cukup untuk impor Dapodik, template guru/soal, ekspor e-Rapor, dan rekap nilai (PRD 4.4: dibuat di browser).
 * Tidak memakai SheetJS: lebih kecil dan tanpa celah keamanan versi npm lama.
 *   XLSX.baca(file) → Promise<[{ nama, baris: [[sel, …], …] }]>
 *   XLSX.tulis([{ nama, baris, lebar }]) → Promise<Blob>
 */
(function () {
  'use strict';
  var NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  function siapZip() { return window.JSZip ? Promise.resolve() : API.muatSkrip('./vendor/jszip.min.js'); }
  function xml(s) { return new DOMParser().parseFromString(s, 'application/xml'); }
  function kolomKeIndeks(ref) {
    var m = String(ref).match(/^([A-Z]+)/), n = 0;
    if (!m) return 0;
    for (var i = 0; i < m[1].length; i++) n = n * 26 + (m[1].charCodeAt(i) - 64);
    return n - 1;
  }
  function teksDari(el) {
    // gabungkan semua <t> (rich text) di dalam si/is
    var t = el.getElementsByTagNameNS(NS, 't'), s = '';
    for (var i = 0; i < t.length; i++) s += t[i].textContent;
    return s;
  }

  function bacaCsv(teks) {
    teks = teks.replace(/^﻿/, '');
    var pemisah = (teks.split('\n')[0].match(/;/g) || []).length > (teks.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    var baris = [], sel = '', row = [], kutip = false;
    for (var i = 0; i < teks.length; i++) {
      var c = teks[i];
      if (kutip) {
        if (c === '"' && teks[i + 1] === '"') { sel += '"'; i++; } else if (c === '"') kutip = false; else sel += c;
      } else if (c === '"') kutip = true;
      else if (c === pemisah) { row.push(sel); sel = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && teks[i + 1] === '\n') i++; row.push(sel); baris.push(row); row = []; sel = ''; }
      else sel += c;
    }
    if (sel !== '' || row.length) { row.push(sel); baris.push(row); }
    return [{ nama: 'CSV', baris: baris.filter(function (r) { return r.join('') !== ''; }) }];
  }

  function baca(file) {
    var nama = String(file.name || '').toLowerCase();
    if (/\.csv$/.test(nama)) return file.text().then(bacaCsv);
    if (/\.xls$/.test(nama)) return Promise.reject(new Error('File .xls (Excel lama) belum didukung. Buka di Excel lalu Simpan Sebagai .xlsx.'));
    return siapZip().then(function () { return file.arrayBuffer(); }).then(function (buf) { return JSZip.loadAsync(buf); }).then(function (zip) {
      var str = function (p) { var f = zip.file(p); return f ? f.async('string') : Promise.resolve(''); };
      return Promise.all([str('xl/workbook.xml'), str('xl/_rels/workbook.xml.rels'), str('xl/sharedStrings.xml')]).then(function (r) {
        if (!r[0]) throw new Error('Bukan file Excel (.xlsx) yang sah.');
        var wb = xml(r[0]), rels = xml(r[1] || '<x/>'), ss = r[2] ? xml(r[2]) : null;
        var target = {};
        Array.prototype.forEach.call(rels.getElementsByTagName('Relationship'), function (x) { target[x.getAttribute('Id')] = x.getAttribute('Target'); });
        var shared = [];
        if (ss) Array.prototype.forEach.call(ss.getElementsByTagNameNS(NS, 'si'), function (si) { shared.push(teksDari(si)); });
        var sheets = Array.prototype.map.call(wb.getElementsByTagNameNS(NS, 'sheet'), function (s) {
          var t = target[s.getAttributeNS(NS_R, 'id') || s.getAttribute('r:id')] || '';
          t = t.replace(/^\//, '').replace(/^xl\//, '');
          return { nama: s.getAttribute('name'), path: 'xl/' + t };
        });
        return Promise.all(sheets.map(function (s) {
          return str(s.path).then(function (isi) {
            var d = xml(isi || '<x/>'), out = [];
            Array.prototype.forEach.call(d.getElementsByTagNameNS(NS, 'row'), function (row) {
              var ri = Number(row.getAttribute('r')) - 1, arr = [];
              Array.prototype.forEach.call(row.getElementsByTagNameNS(NS, 'c'), function (c) {
                var tipe = c.getAttribute('t'), v = c.getElementsByTagNameNS(NS, 'v')[0], nilai = '';
                if (tipe === 's') nilai = shared[Number(v ? v.textContent : -1)] || '';
                else if (tipe === 'inlineStr') nilai = teksDari(c);
                else if (tipe === 'b') nilai = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
                else if (v) nilai = tipe === 'str' || tipe === 'e' ? v.textContent : (isNaN(Number(v.textContent)) ? v.textContent : Number(v.textContent));
                arr[kolomKeIndeks(c.getAttribute('r'))] = nilai;
              });
              for (var i = 0; i < arr.length; i++) if (arr[i] === undefined) arr[i] = '';
              out[ri >= 0 ? ri : out.length] = arr;
            });
            for (var j = 0; j < out.length; j++) if (!out[j]) out[j] = [];
            return { nama: s.nama, baris: out };
          });
        }));
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Penulis .xlsx minimal (string inline, angka, baris pertama tebal)
  // ---------------------------------------------------------------------------
  function escXml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ''); }
  function namaKolom(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function lembarXml(sh) {
    var lebar = sh.lebar || [];
    var cols = lebar.length ? '<cols>' + lebar.map(function (w, i) { return '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>'; }).join('') + '</cols>' : '';
    var rows = sh.baris.map(function (r, ri) {
      return '<row r="' + (ri + 1) + '">' + r.map(function (v, ci) {
        var ref = namaKolom(ci) + (ri + 1), gaya = ri === 0 && sh.kepala !== false ? ' s="1"' : '';
        if (v === null || v === undefined || v === '') return '';
        if (typeof v === 'number' && isFinite(v)) return '<c r="' + ref + '"' + gaya + '><v>' + v + '</v></c>';
        return '<c r="' + ref + '" t="inlineStr"' + gaya + '><is><t xml:space="preserve">' + escXml(v) + '</t></is></c>';
      }).join('') + '</row>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="' + NS + '"' +
      (sh.kepala !== false ? '><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '>') +
      cols + '<sheetData>' + rows + '</sheetData></worksheet>';
  }

  function tulis(sheets) {
    return siapZip().then(function () {
      var zip = new JSZip();
      var nama = sheets.map(function (s, i) { return String(s.nama || 'Sheet' + (i + 1)).replace(/[\\\/?*\[\]:]/g, ' ').slice(0, 31) || 'Sheet' + (i + 1); });
      zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets.map(function (s, i) { return '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'; }).join('') + '</Types>');
      zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
      zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><sheets>' +
        nama.map(function (n, i) { return '<sheet name="' + escXml(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>'; }).join('') + '</sheets></workbook>');
      zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map(function (s, i) { return '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>'; }).join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
      zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="' + NS + '">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEF2FF"/></patternFill></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>');
      sheets.forEach(function (s, i) { zip.file('xl/worksheets/sheet' + (i + 1) + '.xml', lembarXml(s)); });
      return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
    });
  }

  /** Cari indeks kolom dari baris judul berdasarkan daftar nama alternatif (tidak peka huruf besar/spasi). */
  function cariKolom(judul, alternatif) {
    var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var h = judul.map(norm);
    for (var i = 0; i < alternatif.length; i++) { var k = h.indexOf(norm(alternatif[i])); if (k > -1) return k; }
    return -1;
  }

  window.XLSX = { baca: baca, tulis: tulis, cariKolom: cariKolom, bacaCsv: bacaCsv };
})();
