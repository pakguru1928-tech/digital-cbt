/* impor.js — Mesin baca soal Format Impor v1 (PRD F-13, F-14, Lampiran A).
 *
 * Dipakai alat verifikasi Tahap 1 dan nanti oleh layar Unggah Soal (Tahap 3).
 * Semua file diproses di browser: tidak ada isi soal yang dikirim ke server atau pihak lain.
 *
 *   CBTImpor.baca(file, { onProgres }) → Promise<Hasil>
 *   Hasil = { nama, jenisFile, soal[], stimulus{}, statistik{}, peringatan[], waktuMs }
 *   soal  = { no, jenis, isi (HTML tampil), isiSumber (rumus sebagai $..$), opsi[{huruf,html}],
 *             item[{no,html}], kunci (mentah), kunciData, bobot, skor_maks, rubrik[], stimulus, masalah[], info[] }
 *
 * Pustaka (disimpan di folder vendor/): mammoth 1.13.0, JSZip 3.10.2, pdf.js 6.5.438, KaTeX 0.19.1.
 * Konverter rumus Equation Editor (OMML → LaTeX) ditulis sendiri di file ini.
 */
(function (global) {
  'use strict';

  var VENDOR = (function () {
    var s = document.currentScript && document.currentScript.src;
    return s ? new URL('../vendor/', s).href : './vendor/';
  })();
  var NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
  var LEBAR_GAMBAR_MAKS = 1000; // F-13

  // =========================================================================
  // Pemuat pustaka (sekali per halaman)
  // =========================================================================
  var _skrip = {};
  function muatSkrip(nama) {
    if (_skrip[nama]) return _skrip[nama];
    _skrip[nama] = new Promise(function (ok, gagal) {
      var el = document.createElement('script');
      el.src = VENDOR + nama;
      el.onload = ok;
      el.onerror = function () { gagal(new Error('Pustaka ' + nama + ' gagal dimuat.')); };
      document.head.appendChild(el);
    });
    return _skrip[nama];
  }
  function muatKatex() {
    if (!document.getElementById('css-katex-impor')) {
      var l = document.createElement('link');
      l.id = 'css-katex-impor'; l.rel = 'stylesheet'; l.href = VENDOR + 'katex/katex.min.css';
      document.head.appendChild(l);
    }
    return muatSkrip('katex/katex.min.js');
  }
  var _pdfjs = null;
  function muatPdfjs() {
    if (!_pdfjs) {
      _pdfjs = import(VENDOR + 'pdfjs/pdf.min.mjs').then(function (m) {
        m.GlobalWorkerOptions.workerSrc = VENDOR + 'pdfjs/pdf.worker.min.mjs';
        return m;
      });
    }
    return _pdfjs;
  }

  // =========================================================================
  // KONVERTER OMML (Equation Editor Word) → LaTeX
  // =========================================================================
  var SIMBOL = {
    'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'ε': '\\varepsilon ', 'ϵ': '\\epsilon ', 'ζ': '\\zeta ',
    'η': '\\eta ', 'θ': '\\theta ', 'ϑ': '\\vartheta ', 'ι': '\\iota ', 'κ': '\\kappa ', 'λ': '\\lambda ', 'μ': '\\mu ', 'ν': '\\nu ',
    'ξ': '\\xi ', 'π': '\\pi ', 'ρ': '\\rho ', 'σ': '\\sigma ', 'ς': '\\varsigma ', 'τ': '\\tau ', 'υ': '\\upsilon ', 'φ': '\\varphi ',
    'ϕ': '\\phi ', 'χ': '\\chi ', 'ψ': '\\psi ', 'ω': '\\omega ', 'Γ': '\\Gamma ', 'Δ': '\\Delta ', '∆': '\\Delta ', 'Θ': '\\Theta ',
    'Λ': '\\Lambda ', 'Ξ': '\\Xi ', 'Π': '\\Pi ', 'Σ': '\\Sigma ', 'Υ': '\\Upsilon ', 'Φ': '\\Phi ', 'Ψ': '\\Psi ', 'Ω': '\\Omega ',
    '×': '\\times ', '÷': '\\div ', '±': '\\pm ', '∓': '\\mp ', '·': '\\cdot ', '⋅': '\\cdot ', '∙': '\\cdot ', '−': '-', '–': '-',
    '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '≡': '\\equiv ', '∼': '\\sim ', '≅': '\\cong ', '∝': '\\propto ',
    '∞': '\\infty ', '→': '\\to ', '←': '\\leftarrow ', '↔': '\\leftrightarrow ', '⇒': '\\Rightarrow ', '⇐': '\\Leftarrow ',
    '⇔': '\\Leftrightarrow ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ', '⊃': '\\supset ', '⊇': '\\supseteq ',
    '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ', '∀': '\\forall ', '∃': '\\exists ', '∂': '\\partial ', '∇': '\\nabla ',
    '∠': '\\angle ', '°': '^{\\circ}', '′': "'", '″': "''", '…': '\\ldots ', '⋯': '\\cdots ', '∴': '\\therefore ', '∵': '\\because ',
    '⊥': '\\perp ', '∥': '\\parallel ', '√': '\\surd ', 'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}',
    '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$', '_': '\\_', '{': '\\{', '}': '\\}', '~': '\\sim ', '\\': '\\backslash ',
    '²': '^{2}', '³': '^{3}', '¹': '^{1}', ' ': ' ', ' ': '\\, ', '​': ''
  };
  var NARY = { '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint', '⋃': '\\bigcup', '⋂': '\\bigcap', '⋁': '\\bigvee', '⋀': '\\bigwedge' };
  var FUNGSI = ['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'log', 'ln', 'lg', 'exp', 'lim', 'max', 'min', 'sup', 'inf', 'det', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'gcd', 'deg', 'dim'];
  var AKSEN = { '̂': '\\hat', '^': '\\hat', '̃': '\\tilde', '~': '\\tilde', '̄': '\\bar', '¯': '\\bar', '̅': '\\overline',
    '⃗': '\\vec', '→': '\\vec', '̇': '\\dot', '̈': '\\ddot', '̆': '\\breve', '̌': '\\check', '́': '\\acute', '̀': '\\grave',
    '⃖': '\\overleftarrow', '⃡': '\\overleftrightarrow' };
  var DELIM = { '(': '(', ')': ')', '[': '[', ']': ']', '{': '\\{', '}': '\\}', '|': '|', '‖': '\\|', '⟨': '\\langle ', '⟩': '\\rangle ',
    '〈': '\\langle ', '〉': '\\rangle ', '⌊': '\\lfloor ', '⌋': '\\rfloor ', '⌈': '\\lceil ', '⌉': '\\rceil ', '': '.' };

  function anakM(el, nama) {
    var out = [];
    for (var k = el ? el.firstElementChild : null; k; k = k.nextElementSibling) if (k.localName === nama) out.push(k);
    return out;
  }
  function satuM(el, nama) { return anakM(el, nama)[0] || null; }
  function nilai(el, nama, bawaan) {
    var e = satuM(el, nama);
    if (!e) return bawaan;
    var v = e.getAttributeNS(NS_M, 'val');
    if (v === null || v === undefined) v = e.getAttribute('m:val');
    return v === null || v === undefined ? (bawaan === undefined ? 'on' : '') : v;
  }
  function aktif(v) { return v === '1' || v === 'on' || v === 'true'; }

  function teksMath(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      var cp = s.codePointAt(i);
      if (cp > 0xffff) { ch = String.fromCodePoint(cp); i++; }
      out += Object.prototype.hasOwnProperty.call(SIMBOL, ch) ? SIMBOL[ch] : ch;
    }
    return out.replace(/(\d),(\d)/g, '$1{,}$2'); // desimal Indonesia tanpa spasi ekstra
  }
  function teksBiasa(s) { return s.replace(/[\\#$%&_{}~^]/g, function (c) { return c === '\\' ? '\\textbackslash{}' : c === '~' ? '\\textasciitilde{}' : c === '^' ? '\\textasciicircum{}' : '\\' + c; }); }

  function runMath(el) {
    var t = '';
    for (var k = el.firstElementChild; k; k = k.nextElementSibling) {
      if (k.localName === 't') t += k.textContent;
      else if (k.localName === 'tab') t += ' ';
      else if (k.localName === 'br') t += ' ';
    }
    if (!t) return '';
    var rPr = satuM(el, 'rPr');
    var biasa = el.namespaceURI === NS_W || (rPr && satuM(rPr, 'nor') && aktif(nilai(rPr, 'nor')));
    if (biasa) return '\\text{' + teksBiasa(t) + '}';
    var sty = rPr ? nilai(rPr, 'sty', '') : '';
    var lat = teksMath(t);
    if (sty === 'p' && /[A-Za-z]/.test(t)) {
      var kata = t.trim();
      if (FUNGSI.indexOf(kata) > -1) return '\\' + kata + ' ';
      return '\\mathrm{' + lat + '}';
    }
    return lat;
  }

  function urut(el) {
    var s = '';
    for (var k = el ? el.firstElementChild : null; k; k = k.nextElementSibling) {
      if (/Pr$/.test(k.localName)) continue;
      s += L(k);
    }
    return s;
  }
  function g(s) { return '{' + s + '}'; }

  function L(el) {
    if (!el) return '';
    switch (el.localName) {
      case 'oMathPara': return anakM(el, 'oMath').map(L).join(' \\\\ ');
      case 'r': return runMath(el);
      case 't': return teksMath(el.textContent);
      case 'f': {
        var tipe = nilai(satuM(el, 'fPr'), 'type', 'bar');
        var a = urut(satuM(el, 'num')), b = urut(satuM(el, 'den'));
        if (tipe === 'lin' || tipe === 'skw') return a + '/' + b;
        if (tipe === 'noBar') return '\\genfrac{}{}{0pt}{}' + g(a) + g(b);
        return '\\frac' + g(a) + g(b);
      }
      case 'sSup': return g(urut(satuM(el, 'e'))) + '^' + g(urut(satuM(el, 'sup')));
      case 'sSub': return g(urut(satuM(el, 'e'))) + '_' + g(urut(satuM(el, 'sub')));
      case 'sSubSup': return g(urut(satuM(el, 'e'))) + '_' + g(urut(satuM(el, 'sub'))) + '^' + g(urut(satuM(el, 'sup')));
      case 'sPre': return '{}_' + g(urut(satuM(el, 'sub'))) + '^' + g(urut(satuM(el, 'sup'))) + g(urut(satuM(el, 'e')));
      case 'rad': {
        var deg = urut(satuM(el, 'deg')).trim();
        var hide = aktif(nilai(satuM(el, 'radPr'), 'degHide', '0'));
        return '\\sqrt' + (deg && !hide ? '[' + deg + ']' : '') + g(urut(satuM(el, 'e')));
      }
      case 'd': {
        var pr = satuM(el, 'dPr');
        var beg = nilai(pr, 'begChr', '('), end = nilai(pr, 'endChr', ')'), sep = nilai(pr, 'sepChr', '|');
        var isi = anakM(el, 'e').map(urut).join(sep === '|' ? ' \\mid ' : teksMath(sep) + ' ');
        return '\\left' + (DELIM[beg] !== undefined ? DELIM[beg] : '.') + isi + '\\right' + (DELIM[end] !== undefined ? DELIM[end] : '.');
      }
      case 'nary': {
        var np = satuM(el, 'naryPr');
        var chr = nilai(np, 'chr', '∫');
        var op = NARY[chr] || '\\int';
        var integral = /int$/.test(op);
        var loc = nilai(np, 'limLoc', integral ? 'subSup' : 'undOvr');
        var s = op + (loc === 'undOvr' ? '\\limits' : '');
        var sub = urut(satuM(el, 'sub')).trim(), sup = urut(satuM(el, 'sup')).trim();
        if (sub && !aktif(nilai(np, 'subHide', '0'))) s += '_' + g(sub);
        if (sup && !aktif(nilai(np, 'supHide', '0'))) s += '^' + g(sup);
        return s + ' ' + g(urut(satuM(el, 'e')));
      }
      case 'func': {
        var fn = satuM(el, 'fName');
        var nama;
        if (satuM(fn, 'limLow') || satuM(fn, 'limUpp')) nama = urut(fn);
        else {
          var t = (fn ? fn.textContent : '').trim();
          nama = FUNGSI.indexOf(t) > -1 ? '\\' + t + ' ' : '\\operatorname{' + teksBiasa(t) + '}';
        }
        return nama + g(urut(satuM(el, 'e')));
      }
      case 'limLow': {
        var basis = satuM(el, 'e'), bt = basis ? basis.textContent.trim() : '';
        var lim = urut(satuM(el, 'lim'));
        if (FUNGSI.indexOf(bt) > -1) return '\\' + bt + '\\limits_' + g(lim);
        return '\\underset' + g(lim) + g(urut(basis));
      }
      case 'limUpp': return '\\overset' + g(urut(satuM(el, 'lim'))) + g(urut(satuM(el, 'e')));
      case 'acc': {
        var c = nilai(satuM(el, 'accPr'), 'chr', '̂');
        var cmd = AKSEN[c] || '\\hat';
        var e = urut(satuM(el, 'e'));
        if (cmd === '\\vec' && e.replace(/\\[a-z]+|\s|[{}]/gi, '').length > 1) cmd = '\\overrightarrow';
        if (cmd === '\\hat' && e.length > 2) cmd = '\\widehat';
        if (cmd === '\\tilde' && e.length > 2) cmd = '\\widetilde';
        return cmd + g(e);
      }
      case 'bar': return (nilai(satuM(el, 'barPr'), 'pos', 'bot') === 'top' ? '\\overline' : '\\underline') + g(urut(satuM(el, 'e')));
      case 'groupChr': {
        var gp = satuM(el, 'groupChrPr');
        var gc = nilai(gp, 'chr', '⏟'), pos = nilai(gp, 'pos', 'bot');
        var ge = urut(satuM(el, 'e'));
        if (gc === '⏟') return '\\underbrace' + g(ge);
        if (gc === '⏞') return '\\overbrace' + g(ge);
        return (pos === 'top' ? '\\overset' : '\\underset') + g(teksMath(gc)) + g(ge);
      }
      case 'borderBox': return '\\boxed' + g(urut(satuM(el, 'e')));
      case 'm': {
        var baris = anakM(el, 'mr').map(function (mr) { return anakM(mr, 'e').map(urut).join(' & '); });
        return '\\begin{matrix}' + baris.join(' \\\\ ') + '\\end{matrix}';
      }
      case 'eqArr': {
        var rows = anakM(el, 'e').map(function (x) { return urut(x).replace(/\\&/g, '&'); });
        var adaAlign = rows.some(function (r) { return r.indexOf('&') > -1; });
        return '\\begin{' + (adaAlign ? 'aligned' : 'gathered') + '}' + rows.join(' \\\\ ') + '\\end{' + (adaAlign ? 'aligned' : 'gathered') + '}';
      }
      case 'phant': return aktif(nilai(satuM(el, 'phantPr'), 'show', '1')) ? urut(satuM(el, 'e')) : '';
      default: return urut(el);
    }
  }

  /** OMML (m:oMath atau m:oMathPara) → LaTeX. */
  function ommlKeLatex(el) {
    return L(el).replace(/\s+/g, ' ').replace(/\s+([}^_])/g, '$1').trim();
  }

  function renderRumus(latex, tampilan) {
    try {
      return { ok: true, html: global.katex.renderToString(latex, { displayMode: !!tampilan, throwOnError: true, output: 'html', strict: 'ignore' }) };
    } catch (e) {
      return { ok: false, galat: String(e.message || e).replace(/^KaTeX parse error: /, '') };
    }
  }

  // =========================================================================
  // DOCX: pra-proses XML (rumus, penomoran otomatis, objek lama) lalu mammoth
  // =========================================================================
  function attrW(el, nama) { return el ? (el.getAttributeNS(NS_W, nama) || el.getAttribute('w:' + nama)) : null; }
  function anakW(el, nama) {
    for (var k = el ? el.firstElementChild : null; k; k = k.nextElementSibling) if (k.localName === nama && k.namespaceURI === NS_W) return k;
    return null;
  }

  function hurufUrut(n, kecil) {
    var s = '';
    while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
    return kecil ? s.toLowerCase() : s;
  }
  function romawi(n) {
    var r = '', t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    t.forEach(function (p) { while (n >= p[0]) { r += p[1]; n -= p[0]; } });
    return r;
  }
  function formatAngka(n, fmt) {
    switch (fmt) {
      case 'upperLetter': return hurufUrut(n);
      case 'lowerLetter': return hurufUrut(n, true);
      case 'upperRoman': return romawi(n);
      case 'lowerRoman': return romawi(n).toLowerCase();
      default: return String(n);
    }
  }

  function bacaPenomoran(xmlNum) {
    var peta = { num: {}, abs: {} };
    if (!xmlNum) return peta;
    var d = new DOMParser().parseFromString(xmlNum, 'application/xml');
    Array.prototype.forEach.call(d.getElementsByTagNameNS(NS_W, 'abstractNum'), function (a) {
      var lv = {};
      Array.prototype.forEach.call(a.getElementsByTagNameNS(NS_W, 'lvl'), function (l) {
        lv[attrW(l, 'ilvl')] = {
          start: Number(attrW(anakW(l, 'start'), 'val') || 1),
          fmt: attrW(anakW(l, 'numFmt'), 'val') || 'decimal',
          teks: attrW(anakW(l, 'lvlText'), 'val') || '%1.'
        };
      });
      peta.abs[attrW(a, 'abstractNumId')] = lv;
    });
    Array.prototype.forEach.call(d.getElementsByTagNameNS(NS_W, 'num'), function (n) {
      var o = { abs: attrW(anakW(n, 'abstractNumId'), 'val'), mulai: {} };
      Array.prototype.forEach.call(n.getElementsByTagNameNS(NS_W, 'lvlOverride'), function (lo) {
        var so = anakW(lo, 'startOverride');
        if (so) o.mulai[attrW(lo, 'ilvl')] = Number(attrW(so, 'val'));
      });
      peta.num[attrW(n, 'numId')] = o;
    });
    return peta;
  }

  function bacaGayaPenomoran(xmlGaya) {
    var gaya = {};
    if (!xmlGaya) return gaya;
    var d = new DOMParser().parseFromString(xmlGaya, 'application/xml');
    var basis = {};
    Array.prototype.forEach.call(d.getElementsByTagNameNS(NS_W, 'style'), function (s) {
      var id = attrW(s, 'styleId');
      var np = anakW(anakW(s, 'pPr'), 'numPr');
      if (np) gaya[id] = { numId: attrW(anakW(np, 'numId'), 'val'), ilvl: attrW(anakW(np, 'ilvl'), 'val') || '0' };
      var b = anakW(s, 'basedOn');
      if (b) basis[id] = attrW(b, 'val');
    });
    Object.keys(basis).forEach(function (id) { if (!gaya[id] && gaya[basis[id]]) gaya[id] = gaya[basis[id]]; });
    return gaya;
  }

  function buatRun(doc, teks) {
    var r = doc.createElementNS(NS_W, 'w:r');
    var t = doc.createElementNS(NS_W, 'w:t');
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve');
    t.textContent = teks;
    r.appendChild(t);
    return r;
  }

  /**
   * Pra-proses document.xml:
   *  - setiap rumus Equation Editor diganti penanda ⟦Rn⟧ dan dikonversi ke LaTeX;
   *  - penomoran otomatis Word ditulis menjadi teks biasa ("1.", "A.", "(1)") agar bisa dikenali;
   *  - objek lama (Equation 3.0, MathType, OLE lain) diganti penanda ⟦On⟧ agar posisinya terlihat.
   */
  function praProsesDocx(xml, xmlNum, xmlGaya, stat) {
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Isi file Word tidak bisa dibaca (XML rusak).');
    var rumus = [], objek = [];

    // 1. Rumus (oMathPara dulu, lalu oMath yang berdiri sendiri)
    Array.prototype.slice.call(doc.getElementsByTagNameNS(NS_M, 'oMathPara')).forEach(function (para) {
      var latex = ommlKeLatex(para);
      rumus.push({ latex: latex, tampilan: true });
      para.parentNode.replaceChild(buatRun(doc, '⟦R' + (rumus.length - 1) + '⟧'), para);
    });
    Array.prototype.slice.call(doc.getElementsByTagNameNS(NS_M, 'oMath')).forEach(function (om) {
      if (!om.parentNode) return;
      var latex = ommlKeLatex(om);
      rumus.push({ latex: latex, tampilan: false });
      var run = buatRun(doc, '⟦R' + (rumus.length - 1) + '⟧');
      // oMath bisa berada di dalam w:r (jarang) atau langsung di w:p
      if (om.parentNode.localName === 'r') om.parentNode.parentNode.replaceChild(run, om.parentNode);
      else om.parentNode.replaceChild(run, om);
    });
    stat.rumusWord = rumus.length;

    // 2. Objek OLE lama (Equation 3.0, MathType, dll.)
    Array.prototype.slice.call(doc.getElementsByTagNameNS(NS_W, 'object')).forEach(function (ob) {
      var ole = ob.getElementsByTagName('o:OLEObject')[0] || ob.getElementsByTagNameNS('urn:schemas-microsoft-com:office:office', 'OLEObject')[0];
      var progId = ole ? (ole.getAttribute('ProgID') || '') : '';
      var jenis = /^Equation\.3/i.test(progId) ? 'Equation Editor 3.0' : /DSMT|MathType/i.test(progId) ? 'MathType' : (progId || 'objek tersemat');
      objek.push({ jenis: jenis, rumus: /Equation|DSMT|MathType/i.test(progId) });
      var t = doc.createElementNS(NS_W, 'w:t');
      t.textContent = '⟦O' + (objek.length - 1) + '⟧';
      ob.parentNode.replaceChild(t, ob);
    });
    stat.objekLama = objek.length;
    stat.rumusLama = objek.filter(function (o) { return o.rumus; }).length;

    // 3. Penomoran otomatis → teks
    var peta = bacaPenomoran(xmlNum), gaya = bacaGayaPenomoran(xmlGaya), hitung = {};
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS_W, 'p'), function (p) {
      var pPr = anakW(p, 'pPr');
      var np = anakW(pPr, 'numPr');
      var numId, ilvl;
      if (np) { numId = attrW(anakW(np, 'numId'), 'val'); ilvl = attrW(anakW(np, 'ilvl'), 'val') || '0'; }
      else {
        var ps = attrW(anakW(pPr, 'pStyle'), 'val');
        if (ps && gaya[ps]) { numId = gaya[ps].numId; ilvl = gaya[ps].ilvl; }
      }
      if (!numId || numId === '0' || !peta.num[numId]) return;
      var inst = peta.num[numId], lv = (peta.abs[inst.abs] || {})[ilvl];
      if (!lv) return;
      var c = hitung[numId] = hitung[numId] || {};
      var L0 = Number(ilvl);
      c[L0] = c[L0] === undefined ? (inst.mulai[ilvl] !== undefined ? inst.mulai[ilvl] : lv.start) : c[L0] + 1;
      Object.keys(c).forEach(function (k) { if (Number(k) > L0) delete c[k]; });
      var label;
      if (lv.fmt === 'bullet' || lv.fmt === 'none') label = lv.fmt === 'bullet' ? '•' : '';
      else if (L0 >= 1 && lv.fmt === 'decimal') label = '(' + c[L0] + ')'; // tingkat kedua: pernyataan BS / lajur kiri JODOH
      else {
        label = lv.teks.replace(/%(\d)/g, function (_, k) {
          var lvk = (peta.abs[inst.abs] || {})[String(Number(k) - 1)] || lv;
          return formatAngka(c[Number(k) - 1] || lvk.start, lvk.fmt);
        });
      }
      if (label) p.insertBefore(buatRun(doc, label + ' '), pPr ? pPr.nextSibling : p.firstChild);
      // Matikan penomoran agar mammoth tidak membuat daftar <ol>
      if (!pPr) { pPr = doc.createElementNS(NS_W, 'w:pPr'); p.insertBefore(pPr, p.firstChild); }
      if (np) pPr.removeChild(np);
      var mati = doc.createElementNS(NS_W, 'w:numPr');
      var ni = doc.createElementNS(NS_W, 'w:numId'); ni.setAttributeNS(NS_W, 'w:val', '0');
      mati.appendChild(ni); pPr.appendChild(mati);
      stat.penomoranOtomatis++;
    });

    // Lebar tampil gambar di Word (EMU → px 96 dpi) dititipkan di teks alternatif agar terbaca saat mammoth mengonversi gambar
    var NS_WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    ['inline', 'anchor'].forEach(function (jenis) {
      Array.prototype.forEach.call(doc.getElementsByTagNameNS(NS_WP, jenis), function (d) {
        var ext = d.getElementsByTagNameNS(NS_WP, 'extent')[0], pr = d.getElementsByTagNameNS(NS_WP, 'docPr')[0];
        var cx = ext ? Number(ext.getAttribute('cx')) : 0;
        if (pr && cx > 0) pr.setAttribute('descr', '⟦W' + Math.round(cx / 9525) + '⟧' + (pr.getAttribute('descr') || ''));
      });
    });
    stat.gambarMengambang = doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing', 'anchor').length;
    stat.gambarVml = doc.getElementsByTagNameNS('urn:schemas-microsoft-com:vml', 'imagedata').length;
    return { xml: new XMLSerializer().serializeToString(doc), rumus: rumus, objek: objek };
  }

  /**
   * Kompres gambar (F-13): lebar piksel maksimal 1000, dan cukup 2× lebar tampilnya di Word agar tetap tajam di HP
   * tanpa memperbesar paket. Ukuran tampil di Word dipertahankan lewat atribut width/height.
   * Format yang tidak bisa ditampilkan browser (EMF/WMF/TIFF) ditandai.
   */
  function kompresGambar(tipe, b64, stat, lebarTampil) {
    var asli = Math.round(b64.length * 0.75);
    stat.gambar++;
    stat.ukuranGambarAsli += asli;
    if (/x-emf|x-wmf|emf|wmf|tiff/i.test(tipe)) {
      stat.gambarTakTampil++;
      return Promise.resolve({ src: '', 'data-tak': tipe });
    }
    var uri = 'data:' + tipe + ';base64,' + b64;
    if (/svg/i.test(tipe)) { stat.ukuranGambar += asli; return Promise.resolve(lebarTampil ? { src: uri, width: String(lebarTampil) } : { src: uri }); }
    var target = lebarTampil ? Math.min(LEBAR_GAMBAR_MAKS, Math.max(480, lebarTampil * 2)) : LEBAR_GAMBAR_MAKS;
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight;
        var tampilW = Math.round(lebarTampil ? Math.min(lebarTampil, 1000) : Math.min(w, target));
        var atribut = function (src) { return { src: src, width: String(tampilW), height: String(Math.round(tampilW * h / w)) }; };
        if (w <= target && asli < 150000) { stat.ukuranGambar += asli; ok(atribut(uri)); return; }
        var sk = Math.min(1, target / w);
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * sk)); cv.height = Math.max(1, Math.round(h * sk));
        var ctx = cv.getContext('2d');
        var gambarUlang = function (latarPutih) {
          ctx.clearRect(0, 0, cv.width, cv.height);
          if (latarPutih) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); }
          ctx.drawImage(img, 0, 0, cv.width, cv.height);
        };
        var png = /png|gif/i.test(tipe), hasil;
        if (png) {
          gambarUlang(false);
          hasil = cv.toDataURL('image/png');
          // PNG foto bisa sangat besar: pakai JPEG berlatar putih bila jauh lebih kecil (latar transparen tidak menjadi hitam)
          var jpg = (gambarUlang(true), cv.toDataURL('image/jpeg', 0.85));
          if (jpg.length < hasil.length * 0.6) hasil = jpg;
        } else {
          gambarUlang(true);
          hasil = cv.toDataURL('image/jpeg', 0.82);
        }
        if (hasil.length > uri.length) hasil = uri; // jangan pernah lebih besar dari aslinya
        stat.ukuranGambar += Math.round((hasil.length - hasil.indexOf(',') - 1) * 0.75);
        ok(atribut(hasil));
      };
      img.onerror = function () { stat.gambarTakTampil++; ok({ src: '', 'data-tak': tipe }); };
      img.src = uri;
    });
  }

  function statBaru() {
    return { blok: 0, soal: 0, gambar: 0, gambarMengambang: 0, gambarVml: 0, gambarTakTampil: 0, ukuranGambarAsli: 0, ukuranGambar: 0,
      pangkat: 0, indeks: 0, tabel: 0, rumusWord: 0, rumusLatex: 0, rumusGagal: 0, rumusLama: 0, objekLama: 0,
      penomoranOtomatis: 0, rumusPdf: 0, halaman: 0, halamanScan: 0, kemungkinanTabel: 0, barisTepiDibuang: 0 };
  }

  function bacaDocx(file, opsi) {
    var stat = statBaru(), peringatan = [];
    return Promise.all([muatSkrip('jszip.min.js'), muatSkrip('mammoth.browser.min.js'), muatKatex()])
      .then(function () { return file.arrayBuffer(); })
      .then(function (buf) { return global.JSZip.loadAsync(buf); })
      .then(function (zip) {
        var f = zip.file('word/document.xml');
        if (!f) throw new Error('Bukan file Word (.docx) yang sah.');
        var baca = function (n) { var x = zip.file(n); return x ? x.async('string') : Promise.resolve(''); };
        return Promise.all([f.async('string'), baca('word/numbering.xml'), baca('word/styles.xml')]).then(function (r) {
          var pra = praProsesDocx(r[0], r[1], r[2], stat);
          zip.file('word/document.xml', pra.xml);
          return zip.generateAsync({ type: 'arraybuffer' }).then(function (ab) { return { ab: ab, pra: pra }; });
        });
      })
      .then(function (x) {
        return global.mammoth.convertToHtml({ arrayBuffer: x.ab }, {
          convertImage: global.mammoth.images.imgElement(function (image) {
            var alt = image.altText || '', mw = alt.match(/⟦W(\d+)⟧/);
            return image.read('base64').then(function (b64) {
              return kompresGambar(image.contentType || '', b64, stat, mw ? Number(mw[1]) : 0).then(function (at) {
                var sisa = alt.replace(/⟦W\d+⟧/, '').trim();
                at.alt = sisa || 'Gambar soal';
                return at;
              });
            });
          })
        }).then(function (res) {
          res.messages.forEach(function (m) {
            if (m.type === 'warning' && !/unrecognised|Image of type/i.test(m.message)) peringatan.push('Word: ' + m.message);
          });
          return { html: res.value, pra: x.pra };
        });
      })
      .then(function (x) {
        var wadah = document.createElement('div');
        wadah.innerHTML = x.html;
        var blok = [];
        var tambah = function (el) {
          if (el.tagName === 'UL' || el.tagName === 'OL') { Array.prototype.forEach.call(el.children, tambah); return; }
          var tag = el.tagName === 'LI' ? 'p' : el.tagName.toLowerCase();
          blok.push({ html: tag === 'table' ? el.outerHTML : el.innerHTML, tabel: tag === 'table' });
        };
        Array.prototype.forEach.call(wadah.children, tambah);
        return susunHasil(file, 'docx', blok, x.pra.rumus, x.pra.objek, stat, peringatan);
      });
  }

  // =========================================================================
  // PDF: teks dengan posisi → baris → paragraf; gambar dipotong dari halaman; deteksi scan & rumus
  // =========================================================================
  // Huruf matematika (Cambria Math dari Equation Editor) atau lambang akar/integral/sigma: tanda rumus yang tata letaknya bisa pecah
  var POLA_RUMUS_PDF = /[\u221a\u221b\u222b-\u222e\u2211\u220f]|\ud835[\udc00-\udfff]/;

  function bacaPdf(file, opsi) {
    var stat = statBaru(), peringatan = [];
    var onProgres = (opsi && opsi.onProgres) || function () {};
    return Promise.all([muatPdfjs(), muatKatex()]).then(function (r) {
      var pdfjs = r[0];
      return file.arrayBuffer().then(function (buf) { return pdfjs.getDocument({ data: new Uint8Array(buf), wasmUrl: VENDOR + 'pdfjs/wasm/', isEvalSupported: false, enableXfa: false }).promise; }).then(function (doc) {
        stat.halaman = doc.numPages;
        var blok = [], berulang = {};
        var p = petaTepiBerulang(doc).then(function (b) { berulang = b; });
        for (var i = 1; i <= doc.numPages; i++) {
          (function (n) {
            p = p.then(function () {
              onProgres('Membaca halaman ' + n + ' dari ' + doc.numPages);
              return bacaHalamanPdf(pdfjs, doc, n, stat, berulang).then(function (b) { blok = blok.concat(b); });
            });
          })(i);
        }
        return p.then(function () {
          if (stat.halamanScan === stat.halaman) peringatan.push('Seluruh PDF adalah hasil scan (tanpa teks). Gunakan Potong soal untuk semua halaman.');
          else if (stat.halamanScan) peringatan.push(stat.halamanScan + ' halaman tampak hasil scan. Soal di halaman itu perlu Potong soal.');
          return susunHasil(file, 'pdf', blok, [], [], stat, peringatan);
        });
      });
    });
  }

  var POLA_NOMOR_HALAMAN = /^(?:-\s*)?(?:(?:halaman|hal\.?|page)\s*)?\d{1,3}(?:\s*(?:dari|of|\/)\s*\d{1,3})?(?:\s*-)?$/i;
  function diTepi(y, tinggi) { return y < tinggi * 0.12 || y > tinggi * 0.9; }
  function kunciTepi(s) { return s.trim().replace(/\d+/g, '#').replace(/\s+/g, ' ').toLowerCase(); }
  /** Teks di tepi atas/bawah yang muncul di ≥ 2 halaman (dan ≥ 40% halaman) = kepala/kaki halaman. */
  function petaTepiBerulang(doc) {
    var hitung = {}, n = doc.numPages, p = Promise.resolve();
    if (n < 2) return p.then(function () { return {}; });
    for (var i = 1; i <= n; i++) {
      (function (k) {
        p = p.then(function () { return doc.getPage(k); }).then(function (page) {
          var vp = page.getViewport({ scale: 1 });
          return page.getTextContent().then(function (tc) {
            var ada = {};
            tc.items.forEach(function (it) {
              if (!it.str || !it.str.trim()) return;
              var y = vp.convertToViewportPoint(it.transform[4], it.transform[5])[1];
              if (diTepi(y, vp.height)) ada[kunciTepi(it.str)] = 1;
            });
            Object.keys(ada).forEach(function (x) { hitung[x] = (hitung[x] || 0) + 1; });
          });
        });
      })(i);
    }
    return p.then(function () {
      var out = {};
      Object.keys(hitung).forEach(function (x) {
        // angka saja (nomor halaman, pangkat) dan penanda soal/opsi/kunci tidak pernah dianggap kepala halaman
        if (/^[#\s\-\/.,()]*$/.test(x) || POLA_PENANDA.test(x)) return;
        if (hitung[x] >= 2 && hitung[x] >= n * 0.4) out[x] = true;
      });
      return out;
    });
  }
  function bacaHalamanPdf(pdfjs, doc, n, stat, berulang) {
    return doc.getPage(n).then(function (page) {
      var vp = page.getViewport({ scale: 1 });
      return Promise.all([page.getTextContent(), page.getOperatorList()]).then(function (r) {
        var tc = r[0], ops = r[1];
        // --- kotak gambar dari daftar operasi (lacak matriks transformasi) ---
        var OPS = pdfjs.OPS, ctm = [1, 0, 0, 1, 0, 0], tumpuk = [], kotak = [];
        for (var i = 0; i < ops.fnArray.length; i++) {
          var fn = ops.fnArray[i], arg = ops.argsArray[i];
          if (fn === OPS.save) tumpuk.push(ctm.slice());
          else if (fn === OPS.restore) ctm = tumpuk.pop() || [1, 0, 0, 1, 0, 0];
          else if (fn === OPS.transform) ctm = pdfjs.Util.transform(ctm, arg);
          else if (fn === OPS.paintFormXObjectBegin) { tumpuk.push(ctm.slice()); if (arg && arg[0]) ctm = pdfjs.Util.transform(ctm, arg[0]); }
          else if (fn === OPS.paintFormXObjectEnd) ctm = tumpuk.pop() || [1, 0, 0, 1, 0, 0];
          else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
            var titik = [[0, 0], [1, 0], [0, 1], [1, 1]].map(function (q) {
              var x = ctm[0] * q[0] + ctm[2] * q[1] + ctm[4], y = ctm[1] * q[0] + ctm[3] * q[1] + ctm[5];
              return vp.convertToViewportPoint(x, y);
            });
            var xs = titik.map(function (t) { return t[0]; }), ys = titik.map(function (t) { return t[1]; });
            var k = { x: Math.max(0, Math.min.apply(null, xs)), y: Math.max(0, Math.min.apply(null, ys)), x2: Math.min(vp.width, Math.max.apply(null, xs)), y2: Math.min(vp.height, Math.max.apply(null, ys)) };
            if (k.x2 - k.x > 12 && k.y2 - k.y > 12) kotak.push(k);
          }
        }
        // --- baris teks ---
        // Butir yang hanya berisi spasi dibuang: jarak antarkata dihitung dari posisi, sehingga celah lebar (tab, kolom tabel) terdeteksi.
        // Kepala/kaki halaman (teks berulang di tepi atas/bawah, nomor halaman) juga dibuang.
        var item = tc.items.filter(function (it) { return it.str && it.str.trim() !== ''; }).map(function (it) {
          var t = it.transform, fs = Math.hypot(t[2], t[3]) || it.height || 10;
          var p = vp.convertToViewportPoint(t[4], t[5]);
          return { s: it.str, x: p[0], y: p[1], w: it.width, fs: fs };
        }).filter(function (it) {
          if (!diTepi(it.y, vp.height)) return true;
          if (berulang[kunciTepi(it.s)]) { stat.barisTepiDibuang++; return false; }
          return true;
        });
        var jumlahHuruf = item.reduce(function (a, it) { return a + it.s.trim().length; }, 0);
        var luasGambar = kotak.reduce(function (a, k) { return a + (k.x2 - k.x) * (k.y2 - k.y); }, 0);
        var scan = jumlahHuruf < 30 && luasGambar > vp.width * vp.height * 0.4;
        if (scan) stat.halamanScan++;
        item.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
        var baris = [];
        item.forEach(function (it) {
          var cocok = null;
          for (var j = baris.length - 1; j >= 0 && j >= baris.length - 3; j--) {
            var b = baris[j];
            var atas = Math.max(b.atas, it.y - it.fs * 0.8), bawah = Math.min(b.bawah, it.y + it.fs * 0.2);
            if (bawah - atas > Math.min(b.bawah - b.atas, it.fs) * 0.35) { cocok = b; break; }
          }
          if (!cocok) { cocok = { it: [], atas: it.y - it.fs * 0.8, bawah: it.y + it.fs * 0.2 }; baris.push(cocok); }
          cocok.it.push(it);
          cocok.atas = Math.min(cocok.atas, it.y - it.fs * 0.8);
          cocok.bawah = Math.max(cocok.bawah, it.y + it.fs * 0.2);
        });
        // Baris nomor halaman di tepi ("3", "- 3 -", "Halaman 3 dari 5") dibuang
        baris = baris.filter(function (b) {
          if (!diTepi(b.it[0].y, vp.height)) return true;
          var t = b.it.map(function (x) { return x.s; }).join(' ').trim();
          if (POLA_NOMOR_HALAMAN.test(t)) { stat.barisTepiDibuang++; return false; }
          return true;
        });
        var garis = baris.map(function (b) {
          b.it.sort(function (a, c) { return a.x - c.x; });
          var fsMaks = Math.max.apply(null, b.it.map(function (x) { return x.fs; }));
          var dasar = b.it.filter(function (x) { return x.fs >= fsMaks * 0.85; });
          var yDasar = dasar.length ? dasar.reduce(function (a, x) { return a + x.y; }, 0) / dasar.length : b.it[0].y;
          var html = '', teks = '', akhir = null, rumus = false;
          // Opsi sebaris ("A. 1 mm  B. 1 cm  C. …"): huruf berikutnya yang berurutan selalu dipisah tab, walau celahnya sempit
          var m0 = b.it[0].s.match(/^\s*\(?([Aa])[.)]\s/), harap = m0 ? (m0[1] === 'a' ? 'b' : 'B') : null;
          b.it.forEach(function (x) {
            if (akhir !== null) {
              var celah = x.x - akhir, mx = harap && x.s.match(/^\s*\(?([A-Ea-e])[.)]\s/);
              if (mx && mx[1] === harap) { harap = String.fromCharCode(harap.charCodeAt(0) + 1); html += '\t'; teks += '\t'; }
              else if (celah > fsMaks * 1.6) { html += '\t'; teks += '\t'; }
              else if (celah > fsMaks * 0.2 && !/\s$/.test(teks) && !/^\s/.test(x.s)) { html += ' '; teks += ' '; }
            }
            var s = escapeHtml(x.s);
            if (x.fs < fsMaks * 0.85 && x.y < yDasar - fsMaks * 0.15) { s = '<sup>' + s + '</sup>'; stat.pangkat++; }
            else if (x.fs < fsMaks * 0.85 && x.y > yDasar + fsMaks * 0.08) { s = '<sub>' + s + '</sub>'; stat.indeks++; }
            if (POLA_RUMUS_PDF.test(x.s)) rumus = true;
            html += s; teks += x.s;
            akhir = x.x + x.w;
          });
          if (rumus) stat.rumusPdf++;
          return { html: html, teks: teks, atas: b.atas, bawah: b.bawah, fs: fsMaks, rumus: rumus };
        });
        // --- gambar dipotong dari halaman yang dirender (2x) ---
        var siapGambar = !kotak.length || scan ? Promise.resolve([]) : renderPotongan(page, kotak);
        return siapGambar.then(function (gambar) {
          stat.gambar += gambar.length;
          gambar.forEach(function (gb) { stat.ukuranGambar += Math.round(gb.src.length * 0.75); });
          var semua = garis.map(function (gr) { return { tipe: 'baris', y: gr.atas, g: gr }; })
            .concat(gambar.map(function (gb) { return { tipe: 'gambar', y: gb.y + Math.min(12, gb.h / 4), gb: gb }; }))
            .sort(function (a, b) { return a.y - b.y; });
          var blok = [], sebelum = null;
          semua.forEach(function (s) {
            if (s.tipe === 'gambar') {
              blok.push({ html: '<img src="' + s.gb.src + '" width="' + s.gb.w + '" height="' + s.gb.h + '" alt="Gambar soal">', halaman: n });
              sebelum = null; return;
            }
            var gr = s.g, t = gr.teks.trim();
            var penanda = POLA_PENANDA.test(t);
            // Baris dengan celah kolom lebar → baris tabel; baris berurutan dengan jumlah kolom sama digabung menjadi <table>
            var sel = gr.html.split('\t');
            if (sel.length >= 2 && !RX.opsi.test(t) && !RX.soal.test(t)) {
              var bt = blok[blok.length - 1];
              if (bt && bt.barisTabel && bt.kolom === sel.length) bt.baris.push(sel);
              else blok.push({ barisTabel: true, kolom: sel.length, baris: [sel], halaman: n });
              sebelum = gr; return;
            }
            if (sebelum && !penanda && gr.atas - sebelum.bawah < sebelum.fs * 0.45 && blok.length) {
              var b = blok[blok.length - 1];
              b.html += ' ' + gr.html; b.rumus = b.rumus || gr.rumus;
            } else {
              blok.push({ html: gr.html, halaman: n, rumus: gr.rumus, scan: scan });
            }
            sebelum = gr;
          });
          if (scan) blok.push({ html: '', halaman: n, scan: true });
          blok.forEach(function (b) {
            if (!b.barisTabel) return;
            if (b.baris.length === 1 && b.kolom === 2) { b.html = b.baris[0].join(' '); return; } // bukan tabel, hanya celah lebar
            b.tabel = true;
            stat.kemungkinanTabel++;
            b.html = '<table><tbody>' + b.baris.map(function (r) { return '<tr>' + r.map(function (c) { return '<td>' + c.trim() + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table>';
          });
          return blok;
        });
      });
    });
  }

  function renderPotongan(page, kotak) {
    var skala = 2;
    var vp = page.getViewport({ scale: skala });
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
    var ctx = cv.getContext('2d');
    return page.render({ canvasContext: ctx, viewport: vp, canvas: cv }).promise.then(function () {
      return kotak.map(function (k) {
        var w = Math.round((k.x2 - k.x) * skala), h = Math.round((k.y2 - k.y) * skala);
        var s = Math.min(1, LEBAR_GAMBAR_MAKS / w);
        var c2 = document.createElement('canvas');
        c2.width = Math.max(1, Math.round(w * s)); c2.height = Math.max(1, Math.round(h * s));
        var x2 = c2.getContext('2d');
        x2.fillStyle = '#fff'; x2.fillRect(0, 0, c2.width, c2.height);
        x2.drawImage(cv, Math.round(k.x * skala), Math.round(k.y * skala), w, h, 0, 0, c2.width, c2.height);
        // ukuran tampil = ukuran di halaman PDF (pt → px CSS), piksel gambar 2× agar tajam
        return { src: c2.toDataURL('image/jpeg', 0.85), w: Math.round((k.x2 - k.x) * 4 / 3), h: Math.round((k.y2 - k.y) * 4 / 3), y: k.y };
      });
    });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // =========================================================================
  // Pengurai Format Impor v1 (Lampiran A) — sama untuk Word dan PDF
  // =========================================================================
  var RX = {
    stimulus: /^Stimulus\s+untuk\s+soal\s+(?:nomor\s+)?(\d+)\s*(?:[–\-—]|s\.?\s?d\.?|sampai)\s*(\d+)\s*:?\s*/i,
    soal: /^(\d{1,3})\s*[.)](?:\s+|$)/,
    jenis: /^Jenis\s*(?:soal)?\s*:\s*(PGK|PG|BS|JODOH|ISIAN|ESAI|URAIAN)\b\s*/i,
    bobot: /^Bobot\s*:\s*(\d+(?:[.,]\d+)?)\s*/i,
    skor: /^Skor\s*maks(?:imal|imum)?\s*:\s*(\d+)\s*/i,
    kunci: /^Kunci(?:\s*jawaban)?\s*:\s*/i,
    rubrik: /^Rubrik\s*:\s*/i,
    opsi: /^(?:\(([A-Ea-e])\)|([A-Ea-e])\s*[.)])(?:\s+|$)/,
    item: /^\((\d{1,2})\)(?:\s*|$)/
  };
  var POLA_PENANDA = /^(?:\d{1,3}\s*[.)](?:\s|$)|\(?[A-Ea-e][.)]\s|\([A-Ea-e]\)\s|\(\d{1,2}\)|Kunci\b|Jenis\s*:|Bobot\s*:|Skor\s*maks|Rubrik\s*:|Stimulus\s+untuk)/i;

  function teksDari(html) {
    var d = document.createElement('div');
    d.innerHTML = html;
    return (d.textContent || '').replace(/ /g, ' ');
  }

  /** Buang n karakter teks pertama dari HTML tanpa merusak tag (untuk memotong "1.", "A.", "Kunci:"). */
  function potongAwal(html, n) {
    var d = document.createElement('div');
    d.innerHTML = html;
    var w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT), node;
    while (n > 0 && (node = w.nextNode())) {
      var t = node.nodeValue;
      if (t.length <= n) { n -= t.length; node.nodeValue = ''; }
      else { node.nodeValue = t.slice(n); n = 0; }
    }
    // rapikan spasi di awal
    w = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
    while ((node = w.nextNode())) {
      if (!node.nodeValue) continue;
      node.nodeValue = node.nodeValue.replace(/^[\s ]+/, '');
      if (node.nodeValue) break;
    }
    return d.innerHTML.replace(/^(\s|<(strong|em|b|i|span)>\s*<\/\2>)+/, '');
  }

  function kosongHtml(html) { return !teksDari(html).trim() && !/<(img|table)/i.test(html); }

  /** Satu baris berisi beberapa opsi, mis. "A. 12 [tab] B. 15 [tab] C. 17". */
  function pecahOpsiSebaris(b) {
    var t = b.teks;
    var bagianT = t.split(/\t+|\s{2,}/).map(function (x) { return x.trim(); }).filter(String);
    if (bagianT.length < 2 || !bagianT.every(function (x) { return RX.opsi.test(x); })) {
      // Cadangan: "A. 10 B. 20 C. 30" dipisah spasi biasa; huruf harus berurutan agar teks biasa tidak terpecah
      var m0 = t.match(/^\(?([Aa])[.)]\s/);
      if (!m0) return null;
      var kecil = m0[1] === 'a', urut = kecil ? 'bcde' : 'BCDE', pos = [0], dari = 2;
      for (var u = 0; u < urut.length; u++) {
        var re = new RegExp('\\s\\(?' + urut[u] + '[.)]\\s'), mm = re.exec(t.slice(dari));
        if (!mm) break;
        pos.push(dari + mm.index + 1); dari = dari + mm.index + 3;
      }
      if (pos.length < 3) return null;
      bagianT = pos.map(function (p0, i) { return t.slice(p0, pos[i + 1]).trim(); });
      return bagianT.map(function (x) { return { html: escapeHtml(x), teks: x }; });
    }
    var bagianH = b.html.split(/\t+/);
    if (bagianH.length !== bagianT.length) bagianH = bagianT.map(escapeHtml);
    return bagianH.map(function (h, i) { return { html: h, teks: bagianT[i] }; });
  }

  function susunHasil(file, jenisFile, blokMentah, rumus, objek, stat, peringatan) {
    // Ganti penanda rumus & objek, kenali LaTeX $...$, hitung statistik
    var gagalRumus = [];
    var blok = blokMentah.map(function (b) {
      var tampil = b.html, sumber = b.html;
      tampil = tampil.replace(/⟦R(\d+)⟧/g, function (_, i) {
        var r = rumus[Number(i)], h = renderRumus(r.latex, r.tampilan);
        r.ok = h.ok;
        if (!h.ok) { gagalRumus.push(r.latex); return '<span class="rumus-gagal" title="' + escapeHtml(h.galat) + '">[rumus gagal: ' + escapeHtml(r.latex) + ']</span>'; }
        return h.html;
      });
      sumber = sumber.replace(/⟦R(\d+)⟧/g, function (_, i) { var r = rumus[Number(i)]; return r.tampilan ? '$$' + r.latex + '$$' : '$' + r.latex + '$'; });
      var objekDiSini = [];
      tampil = tampil.replace(/⟦O(\d+)⟧/g, function (_, i) {
        var o = objek[Number(i)]; objekDiSini.push(o);
        return '<span class="objek-lama">[' + escapeHtml(o.rumus ? 'rumus ' + o.jenis : o.jenis) + ' tidak bisa dibaca]</span>';
      });
      sumber = sumber.replace(/⟦O(\d+)⟧/g, '');
      // LaTeX yang diketik guru: $...$ atau $$...$$
      var latexGagal = 0;
      tampil = tampil.replace(/\$\$([^$]+?)\$\$|\$([^$\n<>]+?)\$/g, function (m, a, c) {
        var tex = (a || c).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        var h = renderRumus(tex, !!a);
        stat.rumusLatex++;
        if (!h.ok) { latexGagal++; gagalRumus.push(tex); return m; }
        return h.html;
      });
      var gambarRusak = (tampil.match(/data-tak="/g) || []).length;
      tampil = tampil.replace(/<img[^>]*data-tak="([^"]*)"[^>]*>/g, '<span class="objek-lama">[gambar format $1 tidak bisa ditampilkan browser]</span>');
      stat.pangkat += jenisFile === 'docx' ? (tampil.match(/<sup>/g) || []).length : 0;
      stat.indeks += jenisFile === 'docx' ? (tampil.match(/<sub>/g) || []).length : 0;
      if (b.tabel) stat.tabel++;
      return {
        html: tampil, sumber: sumber, teks: teksDari(tampil).replace(/\s+$/, ''), teksMentah: teksDari(b.html).trim(),
        tabel: !!b.tabel, gambar: /<img/i.test(tampil), objek: objekDiSini, rumusPdf: !!b.rumus, scan: !!b.scan,
        gambarRusak: gambarRusak, halaman: b.halaman
      };
    });
    stat.rumusGagal = gagalRumus.length;
    stat.blok = blok.length;

    // --- Mesin keadaan Format Impor v1 ---
    var soal = [], stimulus = {}, cur = null, stimAktif = null, terakhir = null, abaikan = 0;
    function baru(no) {
      cur = { no: no, jenis: null, isi: [], isiSumber: [], opsi: [], item: [], kunci: '', rubrikTeks: '', bobot: 1, skor_maks: null,
        stimulus: null, masalah: [], info: [], rumusPdf: false, scan: false, objek: [] };
      soal.push(cur); terakhir = 'isi'; stimAktif = null;
    }
    function tambahIsi(b, html, sumber) {
      cur.isi.push(html); cur.isiSumber.push(sumber);
    }
    function proses(b, html, sumber, teks) {
      var m;
      if ((m = teks.match(RX.jenis))) {
        cur.jenis = m[1].toUpperCase() === 'URAIAN' ? 'ESAI' : m[1].toUpperCase();
        var sisa = teks.slice(m[0].length);
        if (sisa.trim()) proses(b, potongAwal(html, m[0].length), potongAwal(sumber, m[0].length), sisa);
        return;
      }
      if ((m = teks.match(RX.bobot))) { cur.bobot = Number(m[1].replace(',', '.')); return; }
      if ((m = teks.match(RX.skor))) { cur.skor_maks = Number(m[1]); return; }
      if ((m = teks.match(RX.kunci))) { cur.kunci = teks.slice(m[0].length).trim(); terakhir = 'kunci'; return; }
      if ((m = teks.match(RX.rubrik))) { cur.rubrikTeks = teks.slice(m[0].length).trim(); terakhir = 'rubrik'; return; }
      var sebaris = pecahOpsiSebaris({ teks: teks, html: html });
      if (sebaris) {
        sebaris.forEach(function (o) {
          var mm = o.teks.match(RX.opsi);
          cur.opsi.push({ huruf: (mm[1] || mm[2]).toUpperCase(), html: potongAwal(o.html, mm[0].length) });
        });
        terakhir = 'opsi'; return;
      }
      if ((m = teks.match(RX.opsi))) {
        cur.opsi.push({ huruf: (m[1] || m[2]).toUpperCase(), html: potongAwal(html, m[0].length), sumber: potongAwal(sumber, m[0].length) });
        terakhir = 'opsi'; return;
      }
      if ((m = teks.match(RX.item))) {
        cur.item.push({ no: Number(m[1]), html: potongAwal(html, m[0].length), sumber: potongAwal(sumber, m[0].length) });
        terakhir = 'item'; return;
      }
      // Lanjutan baris sebelumnya
      if (terakhir === 'kunci') { cur.kunci += '\n' + teks.trim(); return; }
      if (terakhir === 'rubrik') { cur.rubrikTeks += '; ' + teks.trim(); return; }
      if (terakhir === 'opsi' && cur.opsi.length) { var o = cur.opsi[cur.opsi.length - 1]; o.html += '<br>' + html; return; }
      if (terakhir === 'item' && cur.item.length) { var it = cur.item[cur.item.length - 1]; it.html += '<br>' + html; return; }
      tambahIsi(b, b.tabel ? html : '<p>' + html + '</p>', b.tabel ? sumber : '<p>' + sumber + '</p>');
    }

    blok.forEach(function (b) {
      var teks = b.teks.trim(), m;
      if (b.scan && !teks) { if (cur) cur.scan = true; return; }
      if (kosongHtml(b.html)) return;
      if ((m = teks.match(RX.stimulus)) && !b.tabel) {
        var id = 'S' + (Object.keys(stimulus).length + 1);
        stimAktif = stimulus[id] = { id: id, dari: Number(m[1]), sampai: Number(m[2]), html: [], sumber: [] };
        var sisa = potongAwal(b.html, m[0].length);
        if (!kosongHtml(sisa)) { stimAktif.html.push('<p>' + sisa + '</p>'); stimAktif.sumber.push('<p>' + potongAwal(b.sumber, m[0].length) + '</p>'); }
        cur = null; return;
      }
      if (!b.tabel && (m = teks.match(RX.soal))) {
        baru(Number(m[1]));
        if (b.rumusPdf) cur.rumusPdf = true;
        if (b.objek.length) cur.objek = cur.objek.concat(b.objek);
        var rest = teks.slice(m[0].length);
        if (rest.trim()) proses(b, potongAwal(b.html, m[0].length), potongAwal(b.sumber, m[0].length), rest.trim());
        return;
      }
      if (stimAktif && !cur) {
        stimAktif.html.push(b.tabel ? b.html : '<p>' + b.html + '</p>');
        stimAktif.sumber.push(b.tabel ? b.sumber : '<p>' + b.sumber + '</p>');
        return;
      }
      if (!cur) { abaikan++; return; }
      if (b.rumusPdf) cur.rumusPdf = true;
      if (b.scan) cur.scan = true;
      if (b.objek.length) cur.objek = cur.objek.concat(b.objek);
      proses(b, b.html, b.sumber, b.tabel ? '' : teks);
    });

    // --- Finalisasi & pemeriksaan per soal ---
    var noSebelum = 0;
    soal.forEach(function (s) {
      if (noSebelum && s.no !== noSebelum + 1) s.masalah.push('Nomor soal loncat dari ' + noSebelum + ' ke ' + s.no + '. Periksa soal yang hilang atau nomor ganda.');
      noSebelum = s.no;
      var ditebak = false;
      if (!s.jenis) {
        ditebak = true;
        if (s.item.length && s.opsi.length) s.jenis = 'JODOH';
        else if (s.item.length) s.jenis = 'BS';
        else if (s.opsi.length) s.jenis = /[A-E]\s*[,;]\s*[A-E]/i.test(s.kunci) ? 'PGK' : 'PG';
        else s.jenis = s.kunci && (s.kunci.indexOf('|') > -1 || s.kunci.length <= 40) ? 'ISIAN' : 'ESAI';
        if (!s.opsi.length && !s.item.length) s.info.push('Jenis tidak ditulis dan soal tidak punya opsi. Ditebak ' + s.jenis + '. Tulis "Jenis: ' + s.jenis + '" agar pasti.');
        else if (s.jenis !== 'PG') s.info.push('Jenis ditebak ' + s.jenis + ' dari bentuk soalnya.');
      }
      s.jenisDitebak = ditebak;
      s.kunciData = urai_kunci(s);
      // stimulus
      Object.keys(stimulus).forEach(function (k) { var st = stimulus[k]; if (s.no >= st.dari && s.no <= st.sampai) s.stimulus = k; });
      s.isi = s.isi.join('');
      s.isiSumber = s.isiSumber.join('');
      if (!teksDari(s.isi).trim() && !/<img/i.test(s.isi) && !(s.jenis === 'BS' || s.jenis === 'JODOH')) s.masalah.push('Teks soal kosong.');
      if (s.objek.length) s.masalah.push('Ada ' + s.objek.length + ' objek lama (' + s.objek.map(function (o) { return o.jenis; }).join(', ') + ') yang tidak bisa dibaca. Ketik ulang rumusnya dengan Insert → Equation, atau gunakan Potong soal.');
      if (/rumus-gagal/.test(s.isi + JSON.stringify(s.opsi))) s.masalah.push('Ada rumus yang gagal ditampilkan.');
      if (/gambar format/.test(s.isi + JSON.stringify(s.opsi))) s.masalah.push('Ada gambar berformat EMF/WMF yang tidak bisa ditampilkan. Simpan ulang gambar itu sebagai PNG atau JPG.');
      if (s.rumusPdf) s.masalah.push('Soal ini berisi rumus dari PDF. Periksa tampilannya; bila pecah, gunakan Potong soal atau simpan PDF sebagai .docx.');
      if (s.scan) s.masalah.push('Soal berada di halaman hasil scan. Gunakan Potong soal.');
    });
    stat.soal = soal.length;
    Object.keys(stimulus).forEach(function (k) {
      var st = stimulus[k];
      st.html = st.html.join(''); st.sumber = st.sumber.join('');
      var anggota = soal.filter(function (s) { return s.stimulus === k; }).length;
      if (!anggota) peringatan.push('Stimulus untuk soal ' + st.dari + '–' + st.sampai + ' tidak menemukan soalnya.');
    });
    var catatan = [];
    if (abaikan) catatan.push(abaikan + ' paragraf sebelum soal nomor 1 diabaikan (judul, identitas, petunjuk).');
    if (stat.penomoranOtomatis) catatan.push('Penomoran otomatis Word dibaca pada ' + stat.penomoranOtomatis + ' paragraf.');
    if (stat.barisTepiDibuang) catatan.push(stat.barisTepiDibuang + ' potong teks kepala/kaki halaman (nomor halaman, judul berulang) dibuang.');
    if (!soal.length) peringatan.push('Tidak ada soal yang dikenali. Pastikan setiap soal diawali nomor seperti "1." (Lampiran A.1).');
    if (stat.rumusLama) peringatan.push(stat.rumusLama + ' rumus memakai Equation Editor 3.0 atau MathType (objek lama) yang tidak bisa dibaca otomatis.');
    if (stat.gambarTakTampil) peringatan.push(stat.gambarTakTampil + ' gambar berformat EMF/WMF/TIFF tidak bisa ditampilkan di browser.');
    if (stat.kemungkinanTabel && jenisFile === 'pdf') peringatan.push(stat.kemungkinanTabel + ' tabel disusun ulang dari PDF berdasarkan jarak kolom. Periksa sel yang menyatu atau terpecah; bila kacau, gunakan Potong soal.');
    return { nama: file.name, jenisFile: jenisFile, soal: soal, stimulus: stimulus, statistik: stat, peringatan: peringatan, catatan: catatan, gagalRumus: gagalRumus };
  }

  function urai_kunci(s) {
    var k = (s.kunci || '').trim();
    var huruf = s.opsi.map(function (o) { return o.huruf; });
    if (s.opsi.length && (s.jenis === 'PG' || s.jenis === 'PGK')) {
      if (s.opsi.length < 2) s.masalah.push('Opsi kurang dari 2.');
      if (s.opsi.length > 5) s.masalah.push('Opsi lebih dari 5 (A–E).');
      var kosong = s.opsi.filter(function (o) { return kosongHtml(o.html); }).map(function (o) { return o.huruf; });
      if (kosong.length) s.masalah.push('Opsi ' + kosong.join(', ') + ' kosong. Isinya mungkin rumus atau gambar yang tidak terbaca; periksa atau gunakan Potong soal.');
      var ganda = huruf.filter(function (h, i) { return huruf.indexOf(h) !== i; });
      if (ganda.length) s.masalah.push('Huruf opsi ganda: ' + ganda.join(', ') + '.');
    }
    if (!k) { s.info.push('Kunci belum ditulis. Bisa diisi di layar pratinjau.'); return null; }
    if (s.jenis !== 'ESAI' && k.indexOf('\n') > -1) {
      s.info.push('Teks setelah baris Kunci diabaikan: "' + k.slice(k.indexOf('\n') + 1).replace(/\n/g, ' / ').slice(0, 80) + '"');
      k = k.slice(0, k.indexOf('\n')).trim();
    }
    switch (s.jenis) {
      case 'PG': {
        var m = k.match(/^\(?([A-Ea-e])\)?\.?$/);
        if (!m) { s.masalah.push('Kunci "' + k + '" tidak dikenali. Contoh: Kunci: C'); return null; }
        var h = m[1].toUpperCase();
        if (huruf.indexOf(h) < 0) s.masalah.push('Kunci ' + h + ' merujuk opsi yang tidak ada.');
        return h;
      }
      case 'PGK': {
        var daftar = (k.match(/[A-Ea-e]/g) || []).map(function (x) { return x.toUpperCase(); });
        if (!daftar.length || /[^A-Ea-e,;\s&dan]/.test(k)) s.masalah.push('Kunci PGK "' + k + '" tidak dikenali. Contoh: Kunci: A, C, D');
        daftar.forEach(function (x) { if (huruf.indexOf(x) < 0) s.masalah.push('Kunci ' + x + ' merujuk opsi yang tidak ada.'); });
        return daftar;
      }
      case 'BS': {
        var bs = k.split(/[,;\s]+/).filter(String).map(function (x) { x = x.toUpperCase(); return x[0] === 'B' ? 'B' : x[0] === 'S' ? 'S' : '?'; });
        if (bs.indexOf('?') > -1) s.masalah.push('Kunci BS hanya boleh B atau S. Contoh: Kunci: B, S, B');
        if (bs.length !== s.item.length) s.masalah.push('Jumlah kunci BS (' + bs.length + ') tidak sama dengan jumlah pernyataan (' + s.item.length + ').');
        return bs;
      }
      case 'JODOH': {
        var pasang = {}, mm, re = /(\d+)\s*[-–=:]\s*([A-Ea-e])/g;
        while ((mm = re.exec(k))) pasang[mm[1]] = mm[2].toUpperCase();
        if (!Object.keys(pasang).length) s.masalah.push('Kunci menjodohkan tidak dikenali. Contoh: Kunci: 1-B, 2-A, 3-C');
        s.item.forEach(function (it) { if (!pasang[it.no]) s.masalah.push('Pernyataan (' + it.no + ') belum punya pasangan di kunci.'); });
        Object.keys(pasang).forEach(function (n) { if (huruf.indexOf(pasang[n]) < 0) s.masalah.push('Kunci ' + n + '-' + pasang[n] + ' merujuk lajur kanan yang tidak ada.'); });
        return pasang;
      }
      case 'ISIAN': return k.split('|').map(function (x) { return x.trim(); }).filter(String);
      case 'ESAI': {
        var rub = (s.rubrikTeks || '').split(';').map(function (x) { return x.trim(); }).filter(String).map(function (x) {
          var r = x.match(/^(.*?)\s*\((\d+(?:[.,]\d+)?)\)\s*$/);
          return r ? { kriteria: r[1], skor: Number(r[2].replace(',', '.')) } : { kriteria: x, skor: null };
        });
        s.rubrik = rub;
        if (!rub.length) s.info.push('Rubrik belum ditulis.');
        if (rub.some(function (r) { return r.skor === null; })) s.masalah.push('Ada kriteria rubrik tanpa skor. Contoh: Bahasa runtut (2)');
        var total = rub.reduce(function (a, r) { return a + (r.skor || 0); }, 0);
        if (s.skor_maks && total && total !== s.skor_maks) s.masalah.push('Jumlah skor rubrik (' + total + ') tidak sama dengan Skor maks (' + s.skor_maks + ').');
        if (!s.skor_maks) s.info.push('Skor maks belum ditulis.');
        return { acuan: k };
      }
    }
    return null;
  }

  function baca(file, opsi) {
    var t0 = performance.now();
    var nama = (file && file.name || '').toLowerCase();
    var p = /\.docx$/.test(nama) ? bacaDocx(file, opsi) : /\.pdf$/.test(nama) ? bacaPdf(file, opsi) :
      Promise.reject(new Error(/\.doc$/.test(nama) ? 'File .doc (Word lama) belum didukung. Buka di Word lalu Simpan Sebagai .docx.' : 'Format file tidak didukung. Gunakan .docx atau .pdf.'));
    return p.then(function (h) { h.waktuMs = Math.round(performance.now() - t0); return h; });
  }

  /** Render satu halaman PDF ke kanvas (dipakai Potong soal). lebarPx = lebar hasil dalam piksel. */
  function renderHalamanPdf(file, n, lebarPx) {
    var t0 = performance.now();
    return muatPdfjs().then(function (pdfjs) {
      return file.arrayBuffer().then(function (buf) {
        return pdfjs.getDocument({ data: new Uint8Array(buf), wasmUrl: VENDOR + 'pdfjs/wasm/', isEvalSupported: false, enableXfa: false }).promise;
      }).then(function (doc) { return doc.getPage(n); }).then(function (page) {
        var vp0 = page.getViewport({ scale: 1 });
        var vp = page.getViewport({ scale: Math.max(0.5, (lebarPx || 1000) / vp0.width) });
        var cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        return page.render({ canvasContext: cv.getContext('2d'), viewport: vp, canvas: cv }).promise.then(function () {
          return { canvas: cv, ms: Math.round(performance.now() - t0) };
        });
      });
    });
  }

  global.CBTImpor = { baca: baca, ommlKeLatex: ommlKeLatex, renderRumus: renderRumus, muatKatex: muatKatex, renderHalamanPdf: renderHalamanPdf, _RX: RX };
})(window);
