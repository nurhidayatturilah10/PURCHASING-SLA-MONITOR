/* Hak cipta (c) 2026 NURHIDAYAT TURILAH - Branch Fixed Asset Administrator
   Purchasing SLA Monitor. HTML, CSS, dan JavaScript biasa, tanpa build. */
(function () {
  "use strict";
  var DATA_URL = "data/data.json";
  var X = window.SLA, nf = X.nf;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- penyimpanan kecil di browser ---------- */
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  async function simpanBerkas(nama, teks, tipe) {
    try {
      var d = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
      if (d) { await d.save({ filename: nama, data: teks }); return; }
    } catch (e) { if (e && e.code === "declined") return; }
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([teks], { type: tipe || "text/csv;charset=utf-8" }));
    a.download = nama; document.body.appendChild(a); a.click(); a.remove();
  }
  var csv = function (v) { v = String(v == null ? "" : v); return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var pct = function (v) { return v == null ? "-" : (v.toFixed(v >= 99.95 || v === 0 ? 0 : 1).replace(".", ",") + "%"); };
  var hr = function (v) { return v == null ? "-" : nf.format(Math.round(v)) + " hari"; };
  var warnaP = function (p, t) { return p == null ? "" : p >= t ? "good" : p >= t - 10 ? "warn" : "bad"; };

  /* ---------- keadaan ---------- */
  var SLA_EXTRA = { toko: 3, arsip: 60 };
  var slaBaru = function (o) { return Object.assign({}, X.SLA_AWAL, SLA_EXTRA, o || {}); };
  var FILTER0 = { from: "", to: "", jenis: "", src: "", sup: "", alok: "", q: "" };
  var S = {
    sla: Object.assign({}, X.SLA_AWAL, SLA_EXTRA, ls.get("psla-sla", {})), ref: ls.get("psla-ref", ""),
    f: Object.assign({}, FILTER0), hapusKonfirm: "", resetU: "", pesan: null, page: "menu", tab: "tindak", hal: 1, par: "", tabT: "belum", halT: 1, tabA: "lewat", halA: 1, bunyi: ls.get("psla-bunyi", false), notif: ls.get("psla-notif", false), trmMsg: "",
    urut: { sup: { k: "n", asc: false }, alok: { k: "open", asc: false } }
  };
  var D = null, C = {}; // D = data, C = hasil hitung
  var PER = 15;
  var TAB = [["tindak", "Perlu tindakan"], ["segera", "Jatuh tempo ≤ 7 hari"], ["po", "Menunggu PO"], ["buka", "Semua yang terbuka"]];

  var TR = function (id) { return Auth.terimaAll()[id] || {}; };
  var hariIni = function () { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); };
  function acuan() { return X.tgl(S.ref || D.meta.printed.slice(0, 10)); }
  function hitung() {
    var f = S.f, q = f.q.trim().toLowerCase(), ref = acuan();
    var rows = D.lines.filter(function (l) {
      return (!f.from || l.mon >= f.from) && (!f.to || l.mon <= f.to) && (!f.jenis || l.jenis === f.jenis) && (f.src === "" || l.src === +f.src) &&
        (!f.sup || l.sup === f.sup) && (!f.alok || l.alok === f.alok) &&
        (!q || (l.par + " " + l.po + " " + l.lpb + " " + l.nama + " " + l.kode).toLowerCase().indexOf(q) >= 0);
    });
    var ds = rows.map(function (l) { return X.derive(l, S.sla, ref); });
    var R = X.ringkas(rows, ds);
    C = { rows: rows, ds: ds, R: R, bln: X.perBulan(rows, ds), seb: X.sebaran(ds), sup: X.kelompok(rows, ds, "sup"), tok: X.kelompok(rows, ds, "alok"), ref: ref };
    C.alarm = hitungAlarm(rows, ds, ref);
    C.nSerah = rows.filter(function (l) { return TR(l.id).k; }).length;
    var ok = { tindak: function (d) { return d.st === "lewat" || d.st === "tunggu-telat"; }, segera: function (d) { return d.st === "segera"; }, po: function (d) { return !d.hasPo; }, buka: function (d) { return !d.done; } }[S.tab];
    var out = []; rows.forEach(function (l, i) { if (ok(ds[i])) out.push({ l: l, d: ds[i] }); });
    var skor = function (o) { var d = o.d; return d.st === "lewat" ? 1000 + d.over : d.st === "tunggu-telat" ? 500 + d.waitPo : d.st === "segera" ? 200 + d.over : d.st === "tunggu-po" ? 100 + d.waitPo : 50 + (d.over == null ? -999 : d.over) / 1000; };
    C.kerja = out.sort(function (a, b) { return skor(b) - skor(a); });
    C.jumlahTab = { tindak: R.lewat + R.tungguTelat, segera: R.segera, po: R.tungguPo + R.tungguTelat, buka: R.n - R.done };
  }

  /* ---------- grafik (SVG) ---------- */
  var TXT = 'fill="var(--mute)" font-size="11" font-family="IBM Plex Mono, monospace"';
  function lebar(el) { return Math.max(260, Math.floor(el.clientWidth || 600)); }
  function trenSvg(data, target, W) {
    var H = 250, L = 40, Rr = 40, T = 14, B = 30, iw = W - L - Rr, ih = H - T - B;
    var maxN = Math.max.apply(null, [1].concat(data.map(function (d) { return d.n; }))), nice = Math.ceil(maxN / 100) * 100 || 100;
    var band = iw / Math.max(1, data.length), bw = Math.max(4, Math.min(34, band * 0.62));
    var cx = function (i) { return L + band * i + band / 2; }, yN = function (v) { return T + ih - (v / nice) * ih; }, yP = function (v) { return T + ih - (v / 100) * ih; };
    var pts = []; data.forEach(function (d, i) { if (d.pDel != null && d.delN >= 10) pts.push([cx(i), yP(d.pDel), d.pDel]); });
    var path = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ");
    var every = Math.ceil(data.length / Math.max(2, Math.floor(iw / 46))), last = pts[pts.length - 1], s = "";
    [0, 25, 50, 75, 100].forEach(function (t) {
      s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + yP(t) + '" y2="' + yP(t) + '" stroke="var(--line)" stroke-width="1" opacity="' + (t === 0 ? 1 : 0.6) + '"/>' +
        '<text x="' + (W - Rr + 6) + '" y="' + (yP(t) + 4) + '" ' + TXT + '>' + t + '%</text>';
    });
    [0, nice / 2, nice].forEach(function (t) { s += '<text x="' + (L - 6) + '" y="' + (yN(t) + 4) + '" text-anchor="end" ' + TXT + '>' + nf.format(t) + '</text>'; });
    data.forEach(function (d, i) {
      s += '<rect x="' + (cx(i) - bw / 2) + '" y="' + yN(d.n) + '" width="' + bw + '" height="' + Math.max(0, T + ih - yN(d.n)) + '" rx="2" fill="var(--surface2)" stroke="var(--line)"><title>' + X.bulanLabel(d.k) + ": " + nf.format(d.n) + " item</title></rect>";
    });
    s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + yP(target) + '" y2="' + yP(target) + '" stroke="var(--mute)" stroke-dasharray="4 4"/>' +
      '<text x="' + (L + 4) + '" y="' + (yP(target) - 5) + '" ' + TXT + '>target ' + target + '%</text>' +
      '<path d="' + path + '" fill="none" stroke="var(--accent)" stroke-width="2"/>';
    pts.forEach(function (p) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="2.6" fill="var(--surface)" stroke="var(--accent)" stroke-width="1.6"><title>' + pct(p[2]) + "</title></circle>"; });
    if (last) s += '<circle cx="' + last[0] + '" cy="' + last[1] + '" r="5" fill="var(--accent)"/><text x="' + Math.min(last[0], W - Rr - 4) + '" y="' + Math.max(T + 10, last[1] - 10) + '" text-anchor="end" ' + TXT.replace('fill="var(--mute)"', 'fill="var(--ink)" font-weight="600"') + ">" + pct(last[2]) + "</text>";
    data.forEach(function (d, i) { if (i % every === 0) s += '<text x="' + cx(i) + '" y="' + (H - 10) + '" text-anchor="middle" ' + TXT + ">" + X.bulanLabel(d.k) + "</text>"; });
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Jumlah item pesanan dan persentase tepat waktu per bulan">' + s + "</svg>";
  }
  function sebSvg(data, W) {
    var H = 190, T = 22, B = 36, L = 8, Rr = 8, max = Math.max.apply(null, [1].concat(data.map(function (d) { return d.n; })));
    var band = (W - L - Rr) / data.length, bw = Math.min(54, band * 0.68), t = TXT.replace('font-size="11"', 'font-size="10.5"'), s = "";
    s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + (H - B) + '" y2="' + (H - B) + '" stroke="var(--line)"/>';
    data.forEach(function (d, i) {
      var h = (d.n / max) * (H - B - T), x = L + band * i + (band - bw) / 2, c = !d.telat ? "var(--good)" : i === 4 ? "var(--warn)" : "var(--bad)", p = d.label.split(" ");
      s += '<rect x="' + x + '" y="' + (H - B - h) + '" width="' + bw + '" height="' + h + '" rx="2" fill="' + c + '"/>' +
        '<text x="' + (x + bw / 2) + '" y="' + (H - B - h - 5) + '" text-anchor="middle" ' + t.replace('fill="var(--mute)"', 'fill="var(--ink)"') + ">" + nf.format(d.n) + "</text>" +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 18) + '" text-anchor="middle" ' + t + ">" + p[0] + "</text>" +
        '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" ' + t + ">" + p.slice(1).join(" ") + "</text>";
    });
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Sebaran selisih tanggal terima terhadap target kirim">' + s + "</svg>";
  }
  function spark(vals) {
    var w = 112, h = 30, pts = []; vals.forEach(function (v, i) { if (v != null) pts.push([i, v]); });
    if (pts.length < 2) return '<svg width="' + w + '" height="' + h + '" aria-hidden="true"></svg>';
    var n = vals.length - 1, x = function (i) { return 2 + (i / n) * (w - 4); }, y = function (v) { return h - 3 - (v / 100) * (h - 6); };
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + x(p[0]).toFixed(1) + "," + y(p[1]).toFixed(1); }).join(" "), last = pts[pts.length - 1];
    return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Tren kepatuhan per bulan">' +
      '<path d="' + d + " L" + x(last[0]).toFixed(1) + "," + (h - 3) + " L" + x(pts[0][0]).toFixed(1) + "," + (h - 3) + ' Z" fill="var(--accent)" opacity="0.14"/>' +
      '<path d="' + d + '" fill="none" stroke="var(--accent)" stroke-width="1.6"/><circle cx="' + x(last[0]) + '" cy="' + y(last[1]) + '" r="3" fill="var(--accent)"/></svg>';
  }

  /* ---------- bagian halaman ---------- */
  var chip = function (tone, t) { return '<span class="chip ' + tone + '">' + esc(t) + "</span>"; };
  var med = function (a) { return X.kuantil(a, 0.5); }, p90 = function (a) { return X.kuantil(a, 0.9); };

  function renderHeader() {
    $("#cabang").textContent = D.meta.branch;
    $("#periode").textContent = "Dari permintaan cabang (PAR) sampai barang diterima gudang · periode " + D.meta.periode;
    $("#infoLaporan").textContent = "Data laporan " + X.fmtTgl(X.tgl(D.meta.printed.slice(0, 10)));
    $("#infoAcuan").textContent = "Dihitung per " + X.fmtTgl(C.ref);
  }
  function renderKpi() {
    var R = C.R, s = S.sla, pDel = X.persen(R.delOk, R.delN), tind = R.lewat + R.tungguTelat;
    var k = function (l, v, sub, tone) { return '<div class="kpi"><div class="l">' + l + '</div><div class="v num ' + (tone || "") + '">' + v + '</div><div class="s">' + sub + "</div></div>"; };
    $("#kpi").innerHTML =
      k("Item pesanan", nf.format(R.n), nf.format(R.pars.size) + " PAR · " + nf.format(R.pos.size) + " PO") +
      k("Nilai pengadaan", X.rp(R.nominal), "termasuk PPN") +
      k("Sudah diterima", pct(X.persen(R.done, R.n)), nf.format(R.n - R.done) + " item belum datang") +
      k("Tepat waktu", pct(pDel), "target " + s.target + "% · " + nf.format(R.delN) + " item diterima", pDel == null ? "" : pDel >= s.target ? "good" : "bad") +
      k("Median PAR ke LPB", med(R.total) == null ? "-" : nf.format(Math.round(med(R.total))) + " hari", "90% selesai dalam " + (p90(R.total) == null ? "-" : Math.round(p90(R.total))) + " hari") +
      k("Perlu tindakan", nf.format(tind), nf.format(R.segera) + " jatuh tempo ≤ 7 hari", tind ? "bad" : "good");
  }
  function renderAlur() {
    var R = C.R, s = S.sla;
    var lev = [
      { t: "Permintaan cabang (PAR)", n: R.n }, { t: "Disetujui", n: R.n, d: med(R.app), sla: s.app },
      { t: "PO terbit", n: R.n - R.tungguPo - R.tungguTelat, d: med(R.po), sla: s.po },
      { t: "Diterima gudang (LPB)", n: R.done, d: med(R.kirim) }, { t: "Diterima user / toko", n: C.nSerah, manual: true }
    ];
    $("#alur").innerHTML = lev.map(function (v, i) {
      var w = R.n ? (v.n / R.n) * 100 : 0, ok = v.sla != null && v.d != null ? v.d <= v.sla : null;
      return '<li class="r"><div class="t"><b>' + v.t + '</b><span class="num xs mute">' + nf.format(v.n) + " · " + pct(w) + '</span></div>' +
        '<div class="bar"><i style="width:' + Math.max(w, v.n ? 1.5 : 0) + '%"></i></div><div class="m">' +
        (i > 0 && !v.manual ? "<span>median " + hr(v.d) + " dari tahap sebelumnya</span>" : "") +
        (ok != null ? chip(ok ? "good" : "bad", ok ? "Dalam SLA " + v.sla + " hari" : "Melewati SLA " + v.sla + " hari") : "") +
        (v.manual ? "<span>dicatat manual di rincian PAR</span>" : "") + "</div></li>";
    }).join("");
  }
  function renderTahap() {
    var R = C.R, s = S.sla, b = C.bln;
    var st = [
      { t: "Persetujuan PAR", s: "Maksimal " + s.app + " hari dari PAR dibuat", p: X.persen(R.appOk, R.appN), m: med(R.app), q: p90(R.app), sp: b.map(function (x) { return x.pApp; }) },
      { t: "Penerbitan PO", s: "Maksimal " + s.po + " hari setelah disetujui", p: X.persen(R.poOk, R.poN), m: med(R.po), q: p90(R.po), sp: b.map(function (x) { return x.pPo; }) },
      { t: "Pengiriman supplier", s: "Diterima gudang paling lambat tanggal target PO", p: X.persen(R.delOk, R.delN), m: med(R.kirim), q: p90(R.kirim), sp: b.map(function (x) { return x.pDel; }), pre: " dari PO" },
      { t: "Total PAR sampai LPB", s: "Maksimal " + s.total + " hari", p: X.persen(R.totOk, R.totN), m: med(R.total), q: p90(R.total),
        sp: b.map(function (x) { return x.tot.length ? X.persen(x.tot.filter(function (v) { return v <= s.total; }).length, x.tot.length) : null; }) }
    ];
    $("#tahap").innerHTML = st.map(function (x) {
      return '<div class="k"><h3>' + x.t + '</h3><div class="ket">' + x.s + '</div><div class="isi"><div><div class="big num ' + warnaP(x.p, s.target) + '">' + pct(x.p) + '</div><div class="xs mute">sesuai SLA</div></div>' + spark(x.sp) + "</div>" +
        '<dl><div><dt>Median' + (x.pre || "") + '</dt><dd class="num">' + hr(x.m) + '</dd></div><div><dt>Terlama 10%</dt><dd class="num">' + hr(x.q) + "</dd></div></dl></div>";
    }).join("");
  }
  function renderGrafik() {
    if (S.page !== "tren") return; // grafik digambar saat halamannya dibuka, supaya lebarnya terukur
    $("#tren").innerHTML = trenSvg(C.bln, S.sla.target, lebar($("#tren")));
    $("#seb").innerHTML = sebSvg(C.seb, lebar($("#seb")));
  }
  function renderKerja() {
    var k = C.kerja, hal = Math.min(S.hal, Math.max(1, Math.ceil(k.length / PER))); S.hal = hal;
    $("#tabs").innerHTML = TAB.map(function (t) {
      return '<button role="tab" id="tab-' + t[0] + '" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '">' + t[1] + ' <span class="n num">' + nf.format(C.jumlahTab[t[0]]) + "</span></button>";
    }).join("");
    $("#btnEkspor").textContent = "Unduh CSV (" + nf.format(k.length) + ")";
    if (!k.length) { $("#kerja").innerHTML = '<p class="aman">Tidak ada item di daftar ini. Semua sesuai jadwal.</p>'; return; }
    var rows = k.slice((hal - 1) * PER, hal * PER).map(function (o) {
      var l = o.l, d = o.d;
      return '<tr class="klik" tabindex="0" data-par="' + esc(l.par) + '"><td class="num nw">' + esc(l.par) + '</td><td class="t-barang"><b>' + esc(l.nama) + '</b><span class="num xs mute">' + esc(l.kode) + " · " + nf.format(l.qty) + ' unit</span></td>' +
        '<td class="xs" style="min-width:160px">' + esc(l.sup) + '</td><td class="num xs nw">' + esc(l.po || "-") + '</td><td class="num xs nw">' + X.fmtTgl(l.tTarget) + '</td><td class="xs" style="min-width:140px">' + esc(l.alok) + "</td><td>" + chip(X.STATUS[d.st].c, X.labelStatus(d)) + "</td></tr>";
    }).join("");
    var maxH = Math.ceil(k.length / PER);
    $("#kerja").innerHTML = '<div class="tw"><table class="tbl-wide"><thead><tr><th>PAR</th><th>Barang</th><th>Supplier</th><th>PO</th><th>Target kirim</th><th>Toko tujuan</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      (k.length > PER ? '<div class="hal"><span class="xs mute">Halaman ' + hal + " dari " + maxH + '</span><div class="btns"><button class="btn" id="btnPrev" ' + (hal <= 1 ? "disabled" : "") + '>Sebelumnya</button><button class="btn" id="btnNext" ' + (hal >= maxH ? "disabled" : "") + ">Berikutnya</button></div></div>" : "");
  }
  function renderGrup() {
    var s = S.sla;
    var def = [["Supplier", "sup", C.sup, "#grupSup", "Klik nama untuk memfilter semua halaman ke supplier itu."], ["Toko tujuan", "alok", C.tok, "#grupTok", "Klik nama untuk memfilter semua halaman ke toko itu."]];
    def.forEach(function (g) {
      var u = S.urut[g[1]], arr = g[2].slice().sort(function (a, b) { var x = a[u.k] == null ? -1 : a[u.k], y = b[u.k] == null ? -1 : b[u.k]; return (u.asc ? 1 : -1) * (x < y ? -1 : x > y ? 1 : 0); }).slice(0, 30);
      var th = function (k, t) { return '<th class="r" aria-sort="' + (u.k === k ? (u.asc ? "ascending" : "descending") : "none") + '"><button data-urut="' + g[1] + '" data-k="' + k + '">' + t + (u.k === k ? (u.asc ? " ↑" : " ↓") : "") + "</button></th>"; };
      var body = arr.map(function (o) {
        return '<tr><td style="min-width:200px"><button class="link" data-fk="' + g[1] + '" data-fv="' + esc(o.k) + '">' + esc(o.k) + '</button></td><td class="num nw r">' + nf.format(o.n) + '</td>' +
          '<td class="nw r"><span class="num ' + warnaP(o.pTepat, s.target) + '">' + pct(o.pTepat) + '</span></td><td class="num xs nw r">' + (o.rataTelat ? o.rataTelat.toFixed(1).replace(".", ",") + " hari" : "-") + '</td>' +
          '<td class="num nw r">' + nf.format(o.open) + (o.urgent ? ' <span class="bad" title="Lewat target atau PO tertunda">· ' + o.urgent + "</span>" : "") + "</td></tr>";
      }).join("");
      $(g[3]).innerHTML = '<section class="card"><div class="hd"><div><h2>' + g[0] + ' (' + Math.min(30, g[2].length) + ' dari ' + nf.format(g[2].length) + ')</h2><p class="note">' + g[4] + ' Angka merah di kolom Terbuka: lewat target atau PO tertunda.</p></div></div><div class="tw"><table class="tbl-mid"><thead><tr><th>' + g[0] + "</th>" +
        th("n", "Item") + th("pTepat", "Tepat") + th("rataTelat", "Rata telat") + th("open", "Terbuka") + "</tr></thead><tbody>" + body + "</tbody></table></div></section>";
    });
  }
  function renderAktif() {
    var n = Object.keys(S.f).filter(function (k) { return S.f[k] !== ""; }).length, el = $("#aktif");
    el.hidden = !n;
    if (n) el.innerHTML = "<span>" + n + " filter aktif · " + nf.format(C.R.n) + ' item</span><button class="btn sm" id="btnHapusFilter">Hapus semua filter</button>';
  }
  /* ---------- ikon, menu, dan perpindahan halaman ---------- */
  var IC = {
    menu: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
    ringkasan: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    tren: '<path d="M3 17l5-5 4 3 8-9"/><path d="M15 6h5v5"/>',
    tindak: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M3.5 6l1.2 1.2L7 5M3.5 12l1.2 1.2L7 11M3.5 18l1.2 1.2L7 17"/>',
    supplier: '<path d="M2 6h12v10H2zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    toko: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M5 12v8h14v-8M10 20v-5h4v5"/>',
    atur: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    pengguna: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20a6 6 0 0 1 12 0"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2a4.6 4.6 0 0 1 4.5 4.8"/>',
    terima: '<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M8 12.2l2.7 2.8L16 9.4"/>',
    alarm: '<path d="M6 17h12l-1.5-2.2V10a4.5 4.5 0 0 0-9 0v4.8z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    akun: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    kunci: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
  };
  var ikon = function (n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + IC[n] + "</svg>"; };
  var HALAMAN = [
    { k: "menu", nav: "Menu", t: "Menu" },
    { k: "terima", nav: "Terima", t: "Penerimaan Barang", d: "Centang diterima gudang dan toko" },
    { k: "alarm", nav: "Alarm", t: "Alarm Jatuh Tempo", d: "Lewat jatuh tempo atau belum diterima" },
    { k: "ringkasan", nav: "Ringkasan", t: "Ringkasan", d: "Angka utama dan alur tiap tahap" },
    { k: "tren", nav: "Grafik", t: "Grafik dan Tren", d: "Kepatuhan SLA per bulan dan per tahap" },
    { k: "tindak", nav: "Tindakan", t: "Tindak Lanjut", d: "Item yang perlu dikejar sekarang" },
    { k: "supplier", nav: "Supplier", t: "Supplier", d: "Siapa yang tepat dan siapa yang telat" },
    { k: "toko", nav: "Toko", t: "Toko Tujuan", d: "Barang yang menuju tiap toko" },
    { k: "atur", nav: "SLA", t: "Atur SLA", d: "Ubah batas waktu tiap tahap", izin: "admin" },
    { k: "pengguna", nav: "Pengguna", t: "Pengguna", d: "Tambah admin dan pengguna", izin: "admin" },
    { k: "akun", nav: null, t: "Akun Saya", d: "Ganti password dan lihat peran" }
  ];
  var DATA_P = { alarm: 1, terima: 1, ringkasan: 1, tren: 1, tindak: 1, supplier: 1, toko: 1 };
  var boleh = function (h) { return h.izin !== "admin" || Auth.isAdmin(); };
  function buatNav() {
    $("#rail").innerHTML = HALAMAN.filter(function (h) { return h.nav && boleh(h); }).map(function (h) {
      return '<a href="#' + h.k + '" data-p="' + h.k + '" title="' + h.t + '">' + ikon(h.k) + "<span>" + h.nav + "</span>" + (h.k === "tindak" ? '<b class="bdg" id="navBadge" hidden></b>' : h.k === "alarm" ? '<b class="bdg" id="navBadgeA" hidden></b>' : "") + "</a>";
    }).join("");
    document.querySelectorAll("[data-ic]").forEach(function (el) { el.innerHTML = ikon(el.dataset.ic); });
  }
  function renderMenu() {
    var R = C.R, s = S.sla, tind = R.lewat + R.tungguTelat, pDel = X.persen(R.delOk, R.delN), me = Auth.me();
    var live = {
      ringkasan: nf.format(R.n) + " item · " + pct(X.persen(R.done, R.n)) + " diterima",
      tren: "Tepat waktu " + pct(pDel),
      tindak: tind ? '<span class="bad">' + nf.format(tind) + " perlu tindakan</span>" : '<span class="good">Semua sesuai jadwal</span>',
      supplier: nf.format(C.sup.length) + " supplier",
      toko: nf.format(C.tok.length) + " toko",
      atur: "Persetujuan " + s.app + " hari · PO " + s.po + " hari",
      alarm: (function () { var a = C.alarm; var n = a.lewat.length + a.toko.length; return n ? '<span class="bad">' + nf.format(n) + " alarm aktif</span>" : '<span class="good">Tidak ada alarm</span>'; })(),
      terima: (function () { var t = hitungTerima(); return t.siap ? '<span class="bad">' + nf.format(t.siap) + " menunggu centang toko</span>" : '<span class="good">Semua sudah dicentang</span>'; })(),
      pengguna: nf.format(Auth.list().length) + " akun",
      akun: me ? esc(me.name) : ""
    };
    $("#tiles").innerHTML = HALAMAN.filter(function (h) { return h.k !== "menu" && boleh(h); }).map(function (h) {
      return '<a class="tile" href="#' + h.k + '"><span class="ic">' + ikon(h.k) + "</span><h3>" + h.t + "</h3><p>" + h.d + '</p><div class="live num">' + live[h.k] + "</div></a>";
    }).join("");
    var adm = Auth.isAdmin(), t = hitungTerima(), ak = Auth.list();
    $("#menuHead").innerHTML = adm
      ? '<div class="mh"><div><h3>Panel admin</h3><p>' + nf.format(ak.length) + " akun · " + nf.format(ak.filter(function (a) { return a.must || a.weak; }).length) + ' perlu ganti password · batas SLA persetujuan ' + s.app + " hari, PO " + s.po + ' hari</p></div><a class="btn pri" href="#pengguna">Kelola pengguna</a></div>'
      : '<div class="mh"><div><h3>Tugas Anda: centang penerimaan</h3><p>' + (t.siap ? nf.format(t.siap) + " barang sudah di gudang dan menunggu dicentang tim toko." : "Tidak ada barang yang menunggu dicentang.") + '</p></div><a class="btn pri" href="#terima">Buka penerimaan</a></div>';
    var ba = $("#navBadgeA"), na = C.alarm ? C.alarm.lewat.length + C.alarm.toko.length : 0; if (ba) { ba.hidden = !na; ba.textContent = na > 999 ? "999+" : na; }
    var b = $("#navBadge"); if (b) { b.hidden = !tind; b.textContent = tind > 999 ? "999+" : tind; }
  }
  function route() {
    var me = Auth.me(); if (!me || !D) return;
    var cur = (location.hash || "").slice(1), h = cur;
    if (!HALAMAN.some(function (x) { return x.k === h && boleh(x); })) h = "menu";
    if (me.must) h = "akun";
    if (cur !== h && !(cur === "" && h === "menu")) history.replaceState(null, "", "#" + h);
    var ganti = S.page !== h; S.page = h;
    document.querySelectorAll(".page").forEach(function (p) { p.hidden = p.dataset.page !== h; });
    $("#filter").hidden = !DATA_P[h];
    document.querySelectorAll("#rail a").forEach(function (a) { if (a.dataset.p === h) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    if (h === "tren" && C.R) renderGrafik();
    if (h === "terima") renderTerima();
    if (h === "alarm") renderAlarm();
    if (h === "pengguna") renderPengguna(true);
    if (h === "akun") renderAkun();
    if (ganti) window.scrollTo(0, 0);
  }

  function renderSemua() {
    hitung(); renderHeader(); renderAktif();
    var kosong = C.R.n === 0;
    document.body.classList.toggle("kosong", kosong);
    if (kosong) { renderMenu(); renderAlarmBar(); return; }
    renderKpi(); renderAlur(); renderTahap(); renderKerja(); renderGrup(); renderTerima(); renderAlarm(); renderMenu(); renderGrafik(); renderAlarmBar();
  }

  /* ---------- penerimaan barang: centang gudang dan toko ---------- */
  function statusTerima(l, d) { var t = TR(l.id); return { g: !!(d.done || t.g), gSistem: !!d.done, k: !!t.k, tg: t.g, tk: t.k, gp: t.gp || "", kp: t.kp || "" }; }
  function hitungTerima() {
    var r = { belum: 0, siap: 0, sudah: 0 };
    if (!C.rows) return r;
    C.rows.forEach(function (l, i) { var d = C.ds[i]; if (!d.hasPo) return; var st = statusTerima(l, d); if (st.k) r.sudah++; else { r.belum++; if (st.g) r.siap++; } });
    return r;
  }
  /* alarm: lewat jatuh tempo, hampir jatuh tempo, dan sudah di gudang tetapi belum dicentang toko */
  function hitungAlarm(rows, ds, ref) {
    var A = { lewat: [], segera: [], toko: [] }, s = S.sla;
    rows.forEach(function (l, i) {
      var d = ds[i]; if (!d.hasPo) return; var st = statusTerima(l, d);
      if (!st.g) {
        if (d.over != null && d.over > 0) A.lewat.push({ l: l, d: d, st: st, hari: d.over, ket: "Lewat target " + d.over + " hari", tone: "bad" });
        else if (d.st === "segera") A.segera.push({ l: l, d: d, st: st, hari: -d.over, ket: "Jatuh tempo " + (-d.over) + " hari lagi", tone: "warn" });
      } else if (!st.k) {
        var tg = d.done ? l.tReal : X.tgl(st.tg); if (tg == null) return;
        var umur = X.selisih(tg, ref);
        if (umur > s.toko && umur <= s.arsip) A.toko.push({ l: l, d: d, st: st, hari: umur, ket: "Di gudang " + umur + " hari, toko belum menerima", tone: "bad" });
      }
    });
    A.lewat.sort(function (a, b) { return b.hari - a.hari; }); A.toko.sort(function (a, b) { return b.hari - a.hari; }); A.segera.sort(function (a, b) { return a.hari - b.hari; });
    return A;
  }
  function barisTerima(o, extra) {
    var l = o.l, d = o.d, st = o.st, id = esc(l.id);
    var gKet = d.done ? "Dari LPB sistem" + (l.lpb ? " " + esc(l.lpb) : "") + " · " + X.fmtTgl(l.tReal) : st.g ? "Dicentang " + X.fmtTgl(X.tgl(st.tg)) : "Belum datang di gudang";
    var kKet = st.k ? "Dicentang " + X.fmtTgl(X.tgl(st.tk)) : st.g ? "Centang saat tiba di toko" : "Tunggu diterima gudang";
    var pn = function (w, on, v, ph) { return on ? '<input class="pn" type="text" maxlength="40" data-pn="' + w + '" data-id="' + id + '" value="' + esc(v) + '" placeholder="' + ph + '" aria-label="' + ph + '" autocomplete="off">' : ""; };
    return '<div class="trm-row"><div class="trm-info"><b>' + esc(l.nama) + '</b><span class="num xs mute">' + esc(l.kode) + " · " + nf.format(l.qty) + " unit · PAR " + esc(l.par) + (l.po ? " · PO " + esc(l.po) : "") + '</span><span class="xs mute">' + esc(l.sup) + " → " + esc(l.alok) + "</span>" +
      (extra ? chip(extra.tone, extra.ket) : "") + '<button class="link" data-lihat="' + esc(l.par) + '">Lihat rincian PAR</button></div>' +
      '<div class="trm-col"><label class="ck' + (st.g ? " on" : "") + (d.done ? " off" : "") + '"><input type="checkbox" data-trm="g" data-id="' + id + '"' + (st.g ? " checked" : "") + (d.done ? " disabled" : "") + '><span class="ckb"></span><span class="ckt"><b>Diterima gudang</b><small>' + gKet + "</small></span></label>" + pn("g", st.g, st.gp, "Nama penerima di gudang") + "</div>" +
      '<div class="trm-col"><label class="ck' + (st.k ? " on" : "") + (st.g ? "" : " off") + '"><input type="checkbox" data-trm="k" data-id="' + id + '"' + (st.k ? " checked" : "") + (st.g ? "" : " disabled") + '><span class="ckb"></span><span class="ckt"><b>Diterima toko</b><small>' + kKet + "</small></span></label>" + pn("k", st.k, st.kp, "Nama penerima di toko") + "</div></div>";
  }
  function halamanHtml(hal, maxH, tag) {
    return maxH > 1 ? '<div class="hal"><span class="xs mute">Halaman ' + hal + " dari " + maxH + '</span><div class="btns"><button class="btn" data-' + tag + '="-1" ' + (hal <= 1 ? "disabled" : "") + '>Sebelumnya</button><button class="btn" data-' + tag + '="1" ' + (hal >= maxH ? "disabled" : "") + ">Berikutnya</button></div></div>" : "";
  }
  function renderTerima() {
    var el = $("#terimaList"); if (!el || !C.rows) return;
    var n = hitungTerima(), TT = [["belum", "Belum diterima toko", n.belum], ["sudah", "Sudah diterima toko", n.sudah], ["semua", "Semua", n.belum + n.sudah]];
    $("#tabsT").innerHTML = TT.map(function (t) { return '<button role="tab" data-tt="' + t[0] + '" aria-selected="' + (S.tabT === t[0]) + '">' + t[1] + ' <span class="n num">' + nf.format(t[2]) + "</span></button>"; }).join("");
    var out = [];
    C.rows.forEach(function (l, i) { var d = C.ds[i]; if (!d.hasPo) return; var st = statusTerima(l, d); if (S.tabT === "belum" ? !st.k : S.tabT === "sudah" ? st.k : true) out.push({ l: l, d: d, st: st }); });
    out.sort(function (a, b) { return (b.st.g - a.st.g) || ((b.l.tReal || 0) - (a.l.tReal || 0)); });
    var maxH = Math.max(1, Math.ceil(out.length / PER)); S.halT = Math.min(S.halT, maxH);
    var rows = out.slice((S.halT - 1) * PER, S.halT * PER).map(function (o) { return barisTerima(o); }).join("");
    el.innerHTML = (S.trmMsg ? '<p class="msg bad" role="alert">' + esc(S.trmMsg) + "</p>" : "") +
      (out.length ? rows : '<p class="aman">' + (S.tabT === "belum" ? "Semua barang di daftar ini sudah diterima toko." : "Belum ada barang di daftar ini.") + "</p>") + halamanHtml(S.halT, maxH, "ph") +
      '<p class="xs mute" style="margin-top:10px">Centang dan nama penerima disimpan ' + (Auth.mode === "db" ? "bersama dan terlihat di semua perangkat." : "di browser ini. Untuk menyatukan antar perangkat, admin memakai cadangan di menu Pengguna.") + " Hanya barang yang sudah punya PO yang tampil.</p>";
  }
  var TABA = [["lewat", "Lewat jatuh tempo"], ["toko", "Belum diterima toko"], ["segera", "Segera jatuh tempo"]];
  function renderAlarm() {
    var el = $("#alarmList"); if (!el || !C.alarm) return;
    var A = C.alarm, s = S.sla;
    $("#tabsA").innerHTML = TABA.map(function (t) { return '<button role="tab" data-ta="' + t[0] + '" aria-selected="' + (S.tabA === t[0]) + '">' + t[1] + ' <span class="n num">' + nf.format(A[t[0]].length) + "</span></button>"; }).join("");
    $("#alarmAturan").textContent = "Lewat jatuh tempo: belum diterima gudang padahal target kirim sudah lewat. Belum diterima toko: sudah di gudang lebih dari " + s.toko + " hari (yang lebih lama dari " + s.arsip + " hari dianggap arsip). Batas ini diatur admin di menu SLA.";
    var out = A[S.tabA], maxH = Math.max(1, Math.ceil(out.length / PER)); S.halA = Math.min(S.halA, maxH);
    el.innerHTML = (S.trmMsg ? '<p class="msg bad" role="alert">' + esc(S.trmMsg) + "</p>" : "") +
      (out.length ? out.slice((S.halA - 1) * PER, S.halA * PER).map(function (o) { return barisTerima(o, o); }).join("") : '<p class="aman">Tidak ada alarm di daftar ini.</p>') + halamanHtml(S.halA, maxH, "pa");
    var bt = $("#btnBunyi"); bt.textContent = "Bunyi alarm: " + (S.bunyi ? "hidup" : "mati"); bt.setAttribute("aria-pressed", S.bunyi); var bn = $("#btnNotif"); bn.textContent = "Notifikasi: " + (S.notif ? "hidup" : "mati"); bn.setAttribute("aria-pressed", S.notif);
  }
  function renderAlarmBar() {
    var bar = $("#alarmbar"), A = C.alarm, me = Auth.me();
    if (!me || !A || me.must || (A.lewat.length + A.toko.length + A.segera.length) === 0) { bar.hidden = true; return; }
    var bagian = [];
    if (A.lewat.length) bagian.push(nf.format(A.lewat.length) + " lewat jatuh tempo");
    if (A.toko.length) bagian.push(nf.format(A.toko.length) + " belum diterima toko");
    if (A.segera.length) bagian.push(nf.format(A.segera.length) + " segera jatuh tempo");
    bar.hidden = false; bar.innerHTML = '<div><b>Alarm</b><span>' + bagian.join(" · ") + (Object.keys(S.f).some(function (k) { return S.f[k] !== ""; }) ? " (sesuai filter)" : "") + '</span><a href="#alarm">Lihat daftar</a></div>';
  }
  /* nada peringatan: sirene dua nada untuk lewat jatuh tempo, tiga bip lembut untuk segera jatuh tempo */
  var bisaUcap = function () { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); };
  function ucap(jenis) {
    try {
      var kal = jenis === "segera" ? "Ada yang segera jatuh tempo." : "Ada yang jatuh tempo. Ada yang jatuh tempo.";
      var u = new SpeechSynthesisUtterance(kal); u.lang = "id-ID"; u.rate = .95; u.volume = 1;
      var v = (speechSynthesis.getVoices() || []).filter(function (x) { return /^id([-_]|$)/i.test(x.lang); })[0]; if (v) u.voice = v;
      speechSynthesis.cancel(); speechSynthesis.speak(u);
    } catch (e) {}
  }
  function bunyi(jenis) {
    try {
      var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      var c = new AC(), t0 = c.currentTime + .05, akhir = t0;
      var nada = function (f, mulai, dur, tipe, vol) {
        var o = c.createOscillator(), g = c.createGain(); o.type = tipe; o.frequency.value = f; o.connect(g); g.connect(c.destination);
        g.gain.setValueAtTime(.0001, t0 + mulai); g.gain.exponentialRampToValueAtTime(vol, t0 + mulai + .02); g.gain.setValueAtTime(vol, t0 + mulai + dur - .04); g.gain.exponentialRampToValueAtTime(.0001, t0 + mulai + dur);
        o.start(t0 + mulai); o.stop(t0 + mulai + dur + .02); akhir = Math.max(akhir, t0 + mulai + dur);
      };
      if (bisaUcap()) { nada(784, 0, .22, "sine", .25); nada(988, .24, .3, "sine", .25); setTimeout(function () { ucap(jenis); }, 650); }
      else if (jenis === "segera") { for (var i = 0; i < 3; i++) nada(660, i * .34, .2, "sine", .22); }
      else { for (var j = 0; j < 4; j++) { nada(988, j * .56, .26, "square", .1); nada(740, j * .56 + .28, .26, "square", .1); } }
      setTimeout(function () { try { c.close(); } catch (e) {} }, (akhir - c.currentTime + .4) * 1000);
    } catch (e) {}
  }
  var jenisAlarm = function () { var A = C.alarm; return !A ? null : (A.lewat.length + A.toko.length) ? "lewat" : A.segera.length ? "segera" : null; };
  /* peringatan lengkap: nada, getar (HP), dan notifikasi browser bila diizinkan */
  function kabari(j) {
    if (!j) return;
    if (S.bunyi) { bunyi(j); try { if (navigator.vibrate) navigator.vibrate(j === "lewat" ? [400, 150, 400, 150, 400] : [200, 120, 200]); } catch (e) {} }
    if (S.notif && "Notification" in window && Notification.permission === "granted") {
      var A = C.alarm, tx = [];
      if (A.lewat.length) tx.push(nf.format(A.lewat.length) + " lewat jatuh tempo"); if (A.toko.length) tx.push(nf.format(A.toko.length) + " belum diterima toko"); if (A.segera.length) tx.push(nf.format(A.segera.length) + " segera jatuh tempo");
      var opt = { body: tx.join(" · "), tag: "psla-alarm", renotify: true, requireInteraction: j === "lewat", vibrate: j === "lewat" ? [400, 150, 400] : [200, 120, 200], icon: "img/favicon.png" };
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) navigator.serviceWorker.getRegistration().then(function (r) { if (r && r.showNotification) r.showNotification("Alarm jatuh tempo", opt); else new Notification("Alarm jatuh tempo", opt); }).catch(function () { try { new Notification("Alarm jatuh tempo", opt); } catch (e) {} });
        else new Notification("Alarm jatuh tempo", opt);
      } catch (e) {}
    }
  }
  var pengingat = null;
  function pasangPengingat() {
    clearInterval(pengingat);
    pengingat = setInterval(function () { var j = jenisAlarm(); if ((S.bunyi || S.notif) && j && Auth.me()) kabari(j); }, 30 * 60 * 1000);
  }
  function segarAlarm() { renderAlarmBar(); if (S.page === "alarm") renderAlarm(); renderMenu(); }
  async function setTerima(id, which, on) {
    var cur = TR(id), nv = { g: cur.g || null, k: cur.k || null, gp: cur.gp || null, kp: cur.kp || null }, me = Auth.me(), nama = me ? me.name : "";
    var idx = C.rows.findIndex(function (l) { return l.id === id; }), d = C.ds[idx], sistem = d && d.done;
    if (which === "g") { nv.g = on ? hariIni() : null; nv.gp = on ? (nv.gp || nama) : null; if (!on) { nv.k = null; nv.kp = null; } }
    else { if (!sistem && !nv.g) { S.trmMsg = "Centang diterima gudang dulu."; renderTerima(); renderAlarm(); return; } nv.k = on ? hariIni() : null; nv.kp = on ? (nv.kp || nama) : null; }
    try { await Auth.terimaSet(id, nv); S.trmMsg = ""; } catch (e) { S.trmMsg = e && e.user ? e.message : "Gagal menyimpan centang: " + (e && e.message || e); }
    hitung(); renderTerima(); renderAlarm(); renderAlur(); segarAlarm();
  }
  async function setPenerima(id, which, nama) {
    var cur = TR(id), nv = { g: cur.g || null, k: cur.k || null, gp: cur.gp || null, kp: cur.kp || null };
    nama = String(nama || "").trim().slice(0, 40) || null; if (which === "g") nv.gp = nama; else nv.kp = nama;
    try { await Auth.terimaSet(id, nv); S.trmMsg = ""; } catch (e) { S.trmMsg = e && e.user ? e.message : "Gagal menyimpan nama: " + (e && e.message || e); renderTerima(); renderAlarm(); }
  }

  /* ---------- rincian satu PAR ---------- */
  function langkah(ok, bad, judul, t, ket) {
    return '<li><span class="dot ' + (bad ? "bad" : ok ? "ok" : "") + '"></span><div class="bd"><div class="row"><b class="' + (ok ? "" : "pend") + '" style="' + (ok ? "" : "font-weight:400") + '">' + judul + '</b><span class="num xs mute">' + X.fmtTgl(t) + "</span></div>" + (ket ? '<div class="ket ' + (bad ? "bad" : "") + '">' + ket + "</div>" : "") + "</div></li>";
  }
  function bukaRincian(par) {
    S.par = par; var s = S.sla, ref = C.ref, items = D.lines.filter(function (l) { return l.par === par; });
    var tg = items.map(function (l) { return l.tPar; }).filter(Boolean);
    var kartu = items.slice(0, 40).map(function (l) {
      var d = X.derive(l, s, ref), mk = TR(l.id).k;
      var ketLpb = d.hasPo ? "Target " + X.fmtTgl(l.tTarget) + (d.done ? ", " + (d.late > 0 ? "telat " + d.late + " hari" : d.late < 0 ? "lebih awal " + (-d.late) + " hari" : "tepat waktu") : d.over > 0 ? ", lewat " + d.over + " hari" : ", " + (-d.over) + " hari lagi") : "Menunggu PO";
      var tombol = d.done ? (mk ? '<button class="btn sm" data-batal="' + esc(l.id) + '">Batalkan</button>' : '<button class="btn sm pri" data-tandai="' + esc(l.id) + '">Tandai diterima</button>') : "";
      return '<article><div class="ah"><div style="min-width:0"><b>' + esc(l.nama) + '</b><div class="num xs mute">' + esc(l.kode) + " · " + nf.format(l.qty) + " unit · " + X.rp(l.nominal) + "</div></div>" + chip(X.STATUS[d.st].c, X.labelStatus(d)) + "</div>" +
        '<div class="xs mute" style="margin-top:4px">' + esc(l.sup) + " → " + esc(l.alok) + "</div><ol class=\"lk\">" +
        langkah(true, false, "Permintaan cabang (PAR)", l.tPar) +
        langkah(true, d.okApp === false, "Disetujui", l.tApp, d.dApp + " hari, SLA " + s.app + " hari") +
        langkah(d.hasPo, d.okPo === false || d.st === "tunggu-telat", "PO terbit" + (l.po ? " (" + esc(l.po) + ")" : ""), l.tPo, d.hasPo ? d.dPo + " hari setelah disetujui, SLA " + s.po + " hari" : "Belum terbit, sudah " + d.waitPo + " hari sejak disetujui") +
        langkah(d.done, d.okDel === false || d.st === "lewat", "Diterima gudang" + (l.lpb ? " (LPB " + esc(l.lpb) + ")" : ""), l.tReal, ketLpb) +
        '<li><span class="dot ' + (mk ? "ok" : "") + '"></span><div class="bd"><div class="row"><b style="' + (mk ? "" : "font-weight:400;color:var(--mute)") + '">Diterima user / toko' + (mk ? " · " + X.fmtTgl(X.tgl(mk)) : "") + "</b>" + tombol + "</div>" +
        (d.done ? "" : '<div class="ket">Bisa ditandai setelah barang diterima gudang.</div>') + "</div></li></ol></article>";
    }).join("");
    $("#rincian").innerHTML = '<div class="dr" role="dialog" aria-modal="true" aria-label="Rincian PAR ' + esc(par) + '"><button class="tabir" data-tutup="1" aria-label="Tutup rincian"></button><aside><header><div style="min-width:0"><div class="xs mute" style="text-transform:uppercase;letter-spacing:.05em">Rincian PAR</div>' +
      '<h2 class="num">' + esc(par) + '</h2><div class="xs mute" style="margin-top:4px">' + items.length + " barang · dibuat " + X.fmtTgl(Math.min.apply(null, tg)) + " · " + (items[0] && items[0].jenis === "FAA" ? "Aktiva tetap (FAA)" : "Barang habis pakai (OSA)") +
      '</div></div><button class="btn" id="tutupRincian" data-tutup="1">Tutup</button></header><div class="isi">' + kartu + (items.length > 40 ? '<p class="xs mute">Menampilkan 40 dari ' + items.length + " barang.</p>" : "") + '<p class="xs mute">Centang penerimaan juga bisa dilakukan di menu Terima.</p></div></aside></div>';
    if (!$("#rincian").dataset.fokus) { var b = $("#tutupRincian"); if (b) b.focus(); }
  }
  function tutupRincian() { S.par = ""; $("#rincian").innerHTML = ""; }

  /* ---------- ekspor ---------- */
  function ekspor() {
    var head = ["PAR", "PO", "Kode", "Barang", "Qty", "Supplier", "Toko", "Tgl PAR", "Tgl PO", "Target kirim", "Status", "Nilai"];
    var iso = function (t) { return t == null ? "" : new Date(t).toISOString().slice(0, 10); };
    var body = C.kerja.map(function (o) { var l = o.l; return [l.par, l.po, l.kode, l.nama, l.qty, l.sup, l.alok, iso(l.tPar), iso(l.tPo), iso(l.tTarget), X.labelStatus(o.d), l.nominal]; });
    simpanBerkas("tindak-lanjut-pengadaan-" + (S.ref || D.meta.printed.slice(0, 10)) + ".csv", "﻿" + [head].concat(body).map(function (r) { return r.map(csv).join(","); }).join("\r\n"));
  }

  /* ---------- isian dan peristiwa ---------- */
  function isiOpsi() {
    var uniq = function (a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }).sort(); };
    var opt = function (arr, lab) { return '<option value="">Semua</option>' + arr.map(function (v) { return '<option value="' + esc(v) + '">' + esc(lab ? lab(v) : v) + "</option>"; }).join(""); };
    var bulan = uniq(D.lines.map(function (l) { return l.mon; }));
    $("#fFrom").innerHTML = opt(bulan, X.bulanLabel); $("#fTo").innerHTML = opt(bulan, X.bulanLabel);
    $("#fSup").innerHTML = opt(uniq(D.lines.map(function (l) { return l.sup; }))); $("#fAlok").innerHTML = opt(uniq(D.lines.map(function (l) { return l.alok; })));
    $("#fSrc").innerHTML = '<option value="">Semua</option>' + X.SUMBER.map(function (s, i) { return '<option value="' + i + '">' + s + "</option>"; }).join("");
  }
  function sinkronFilter() { $("#fFrom").value = S.f.from; $("#fTo").value = S.f.to; $("#fJenis").value = S.f.jenis; $("#fSrc").value = S.f.src; $("#fSup").value = S.f.sup; $("#fAlok").value = S.f.alok; $("#fQ").value = S.f.q; }
  function sinkronAtur() { $("#sApp").value = S.sla.app; $("#sPo").value = S.sla.po; $("#sTot").value = S.sla.total; $("#sTarget").value = S.sla.target; $("#sToko").value = S.sla.toko; $("#sArsip").value = S.sla.arsip; $("#sRef").value = S.ref || D.meta.printed.slice(0, 10); }
  function setFilter(k, v) { S.f[k] = v; S.hal = 1; renderSemua(); }

  function pasang() {
    [["fFrom", "from"], ["fTo", "to"], ["fJenis", "jenis"], ["fSrc", "src"], ["fSup", "sup"], ["fAlok", "alok"]].forEach(function (p) { $("#" + p[0]).addEventListener("change", function (e) { setFilter(p[1], e.target.value); }); });
    var tm; $("#fQ").addEventListener("input", function (e) { clearTimeout(tm); var v = e.target.value; tm = setTimeout(function () { setFilter("q", v); }, 160); });
    [["sApp", "app"], ["sPo", "po"], ["sTot", "total"], ["sTarget", "target"], ["sToko", "toko"], ["sArsip", "arsip"]].forEach(function (p) {
      $("#" + p[0]).addEventListener("change", function (e) { var mx = p[1] === "target" ? 100 : p[1] === "arsip" ? 3650 : 365; S.sla[p[1]] = Math.max(1, Math.min(mx, +e.target.value || 1)); if (S.sla.arsip <= S.sla.toko) { S.sla.arsip = S.sla.toko + 1; $("#sArsip").value = S.sla.arsip; } e.target.value = S.sla[p[1]]; ls.set("psla-sla", S.sla); simpanCfg(); S.hal = 1; renderSemua(); });
    });
    $("#sRef").addEventListener("change", function (e) { S.ref = e.target.value; ls.set("psla-ref", S.ref); simpanCfg(); S.hal = 1; renderSemua(); });
    $("#btnReset").addEventListener("click", function () { S.sla = slaBaru(); S.ref = ""; ls.set("psla-sla", S.sla); ls.set("psla-ref", ""); simpanCfg(); sinkronAtur(); S.hal = 1; renderSemua(); });
    window.addEventListener("hashchange", route);
    $("#btnEkspor").addEventListener("click", ekspor);
    document.addEventListener("click", async function (e) {
      var t = e.target, el;
      if ((el = t.closest("[data-tab]"))) { S.tab = el.dataset.tab; S.hal = 1; renderSemua(); return; }
      if (t.closest("#btnPrev")) { S.hal--; renderKerja(); return; }
      if (t.closest("#btnNext")) { S.hal++; renderKerja(); return; }
      if (t.closest("#btnHapusFilter")) { S.f = Object.assign({}, FILTER0); sinkronFilter(); S.hal = 1; renderSemua(); return; }
      if ((el = t.closest("[data-urut]"))) { var u = S.urut[el.dataset.urut], k = el.dataset.k; S.urut[el.dataset.urut] = { k: k, asc: u.k === k ? !u.asc : false }; renderGrup(); return; }
      if ((el = t.closest("[data-fk]"))) { S.f[el.dataset.fk] = el.dataset.fv; sinkronFilter(); S.hal = 1; renderSemua(); return; }
      if ((el = t.closest("[data-tandai]"))) { var yy = document.querySelector("#rincian .isi").scrollTop; await setTerima(el.dataset.tandai, "k", true); bukaRincian(S.par); document.querySelector("#rincian .isi").scrollTop = yy; return; }
      if (false) { var y = document.querySelector("#rincian .isi").scrollTop; bukaRincian(S.par); document.querySelector("#rincian .isi").scrollTop = y; hitung(); renderAlur(); return; }
      if ((el = t.closest("[data-batal]"))) { var yb = document.querySelector("#rincian .isi").scrollTop; await setTerima(el.dataset.batal, "k", false); bukaRincian(S.par); document.querySelector("#rincian .isi").scrollTop = yb; return; }
      if (false) { var y2 = document.querySelector("#rincian .isi").scrollTop; bukaRincian(S.par); document.querySelector("#rincian .isi").scrollTop = y2; hitung(); renderAlur(); return; }
      if (t.closest("[data-tutup]")) { tutupRincian(); return; }
      if ((el = t.closest("tr[data-par]"))) { bukaRincian(el.dataset.par); return; }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && S.par) tutupRincian();
      if (e.key === "Enter") { var r = e.target.closest && e.target.closest("tr[data-par]"); if (r) bukaRincian(r.dataset.par); }
    });
    var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(function () { if (D && C.R && S.page === "tren") renderGrafik(); }, 120); });
  }

  /* ---------- masuk, keluar, akun, dan pengguna ---------- */
  var ROLE = { admin: "Admin", user: "Pengguna" };
  function simpanCfg() {
    if (!Auth.isAdmin()) return;
    var m = $("#aturMsg"); m.textContent = "";
    Auth.cfgSet({ sla: S.sla, ref: S.ref }).then(function (ok) { if (!ok) m.textContent = "Pengaturan tersimpan di browser ini saja. Akun Anda tidak punya izin menulis ke penyimpanan bersama."; });
  }
  function tampilLogin(pesan) {
    document.body.classList.add("locked"); document.body.classList.remove("must");
    var h = $("#authHost"); h.hidden = false;
    h.innerHTML = '<div class="auth-card"><img class="auth-logo" src="img/logo.jpg" width="84" height="84" alt="Logo Branch Palu"><h1>Masuk</h1><p class="sub">Purchasing SLA Monitor · ' + esc(D ? D.meta.branch : "Branch Palu 2") + '</p>' +
      '<form id="formLogin" autocomplete="on"><label class="field" for="auUser">NIK<input id="auUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>' +
      '<label class="field" for="auPw">Password<input id="auPw" name="password" type="password" autocomplete="current-password" required></label>' +
      '<label class="chk"><input type="checkbox" id="auShow"> Tampilkan password</label><div class="msg bad" id="auErr" role="alert">' + esc(pesan || "") + '</div>' +
      '<button class="btn pri" id="auGo" type="submit">Masuk</button></form>' +
      '<p class="auth-foot">Akun dibuat oleh admin. Lupa password? Minta admin untuk mereset.</p></div>' +
      '<div class="auth-copy"><b>© 2026 NURHIDAYAT TURILAH</b>Branch Fixed Asset Administrator</div>';
    var u = $("#auUser"); if (u) u.focus();
  }
  function renderWho() {
    var me = Auth.me(), w = $("#whoami");
    w.hidden = !me; $("#btnKeluar").hidden = !me;
    var rb = $("#roleband");
    if (!me) { $("#warnbar").hidden = true; $("#alarmbar").hidden = true; rb.hidden = true; delete document.body.dataset.role; return; }
    document.body.dataset.role = me.role; rb.hidden = false;
    rb.innerHTML = me.role === "admin"
      ? '<div><b>Mode Admin</b><span>Atur SLA, kelola akun, unduh CSV, dan centang penerimaan barang.</span></div>'
      : '<div><b>Mode Pengguna</b><span>Lihat pantauan pengadaan dan centang penerimaan barang di gudang dan toko.</span></div>';
    w.innerHTML = esc(me.name) + ' · <b>' + ROLE[me.role] + "</b>";
    var wb = $("#warnbar");
    if (me.must) { wb.hidden = false; wb.innerHTML = '<div>Akun Anda baru dibuat atau direset. <b>Ganti password dulu</b> sebelum memakai aplikasi.</div>'; }
    else if (me.weak) { wb.hidden = false; wb.innerHTML = '<div>Password bawaan masih dipakai dan mudah ditebak. <a href="#akun">Ganti sekarang</a>.</div>'; }
    else wb.hidden = true;
  }
  async function masuk(segar) {
    var me = Auth.me(); if (!me) { tampilLogin(); return; }
    $("#authHost").hidden = true; $("#authHost").innerHTML = ""; document.body.classList.remove("locked");
    document.body.classList.toggle("must", me.must);
    try { var c = await Auth.cfgGet(); if (c) { if (c.sla) S.sla = slaBaru(c.sla); if (c.ref != null) S.ref = c.ref; } } catch (e) {}
    try {
      await Auth.terimaMuat();
      var lama = ls.get("psla-serah", {}), ids = Object.keys(lama), t0 = Auth.terimaAll();
      for (var q = 0; q < ids.length; q++) if (!(t0[ids[q]] && t0[ids[q]].k)) await Auth.terimaSet(ids[q], { g: (t0[ids[q]] || {}).g || null, k: lama[ids[q]] });
      if (ids.length) ls.set("psla-serah", {});
    } catch (e) {}
    S.f = Object.assign({}, FILTER0); S.tab = "tindak"; S.tabT = "belum"; S.halT = 1; S.tabA = "lewat"; S.halA = 1; S.trmMsg = ""; S.hal = 1; S.page = ""; sinkronFilter(); sinkronAtur();
    buatNav(); renderWho(); $("#btnEkspor").hidden = !Auth.isAdmin(); renderSemua(); renderAlarmBar(); if ((S.bunyi || S.notif) && !me.must) kabari(jenisAlarm()); pasangPengingat();
    if (segar && !me.must && location.hash !== "#menu") history.replaceState(null, "", "#menu");
    route();
  }
  function keluar() { Auth.logout(); tutupRincian(); S.pesan = null; S.resetU = ""; history.replaceState(null, "", location.pathname + location.search); S.page = ""; renderWho(); tampilLogin(); }

  function pesanHtml() { return S.pesan ? '<p class="msg ' + S.pesan.tone + '" role="status">' + esc(S.pesan.t) + "</p>" : '<p class="msg"></p>'; }
  var setPesan = function (t, tone) { S.pesan = t ? { t: t, tone: tone || "good" } : null; };
  async function renderPengguna(segar) {
    if (!Auth.isAdmin()) return;
    if (segar) { try { await Auth.refresh(); } catch (e) {} if (!Auth.me()) { keluar(); return; } }
    var me = Auth.me(), L = Auth.list();
    var baris = L.map(function (a) {
      var diri = a.u === me.u, st = a.must ? chip("warn", "Wajib ganti password") : a.weak ? chip("bad", "Password bawaan") : chip("good", "Aktif");
      var ke = a.role === "admin" ? "user" : "admin", yakin = S.hapusKonfirm === a.u;
      return "<tr><td style=\"min-width:160px\"><b>" + esc(a.name) + "</b>" + (diri ? ' <span class="chip mute">Anda</span>' : "") + '</td><td class="num nw">' + esc(a.u) + "</td><td>" + chip(a.role === "admin" ? "acc" : "mute", ROLE[a.role]) + "</td><td>" + st + "</td>" +
        '<td><div class="aksi"><button class="btn sm" data-reset="' + esc(a.u) + '">Reset password</button><button class="btn sm" data-peran="' + esc(a.u) + '" data-ke="' + ke + '">Jadikan ' + (ke === "admin" ? "admin" : "pengguna") + "</button>" +
        '<button class="btn sm bahaya' + (yakin ? " yakin" : "") + '" data-hapus="' + esc(a.u) + '"' + (diri ? " disabled" : "") + ">" + (yakin ? "Yakin hapus?" : "Hapus") + "</button></div></td></tr>";
    }).join("");
    var reset = S.resetU && L.some(function (a) { return a.u === S.resetU; }) ? '<section class="card"><div class="hd"><div><h2>Reset password</h2><p class="note">Untuk ' + esc(L.filter(function (a) { return a.u === S.resetU; })[0].name) + ' (' + esc(S.resetU) + '). Pengguna wajib menggantinya saat masuk berikutnya.</p></div></div>' +
      '<form id="formReset" class="form-grid"><label class="field full" for="rsPw">Password baru (minimal 6 karakter)<input id="rsPw" type="text" autocomplete="off" required minlength="6"></label></form><div class="form-act"><button class="btn pri" form="formReset" type="submit">Simpan password</button><button class="btn" data-batal-reset="1">Batal</button></div></section>' : "";
    var cad = Auth.mode === "local" ? '<section class="card"><div class="hd"><div><h2>Cadangan akun</h2><p class="note">Akun tersimpan di browser perangkat ini. Untuk memakai akun yang sama di perangkat lain, simpan cadangan di sini, lalu gabungkan di perangkat itu (masuk sebagai admin, buka halaman ini). Berkas berisi hash password dan batas SLA, simpan seperlunya.</p></div></div><div class="form-act" style="margin-top:0"><button class="btn" id="bkExport">Simpan cadangan (.json)</button><label class="btn" for="bkFile" style="cursor:pointer;display:inline-flex;align-items:center">Gabung dari cadangan…</label><input id="bkFile" type="file" accept=".json,application/json" style="position:absolute;width:1px;height:1px;opacity:0"></div></section>' : "";
    $("#penIsi").innerHTML = '<div class="stack">' +
      '<section class="card"><div class="hd"><div><h2>Tambah akun</h2><p class="note">Pengguna hanya melihat data. Admin juga mengatur SLA, mengunduh CSV, dan mengelola akun. Password awal wajib diganti saat masuk pertama.</p></div></div>' +
      '<form id="formTambah"><div class="form-grid"><label class="field" for="tbU">NIK<input id="tbU" autocomplete="off" required></label><label class="field" for="tbN">Nama lengkap<input id="tbN" autocomplete="off" required></label>' +
      '<label class="field" for="tbR">Peran<select id="tbR"><option value="user">Pengguna</option><option value="admin">Admin</option></select></label><label class="field" for="tbP">Password awal<input id="tbP" type="text" autocomplete="off" required minlength="6"></label></div>' +
      '<div class="form-act"><button class="btn pri" type="submit" id="btnTambah">Tambah akun</button></div></form>' + pesanHtml() + "</section>" + reset +
      '<section class="card"><div class="hd"><div><h2>Daftar akun (' + L.length + ')</h2><p class="note">Penyimpanan akun: ' + (Auth.mode === "db" ? "bersama, terlihat di semua perangkat." : "di browser ini.") + '</p></div></div><div class="tw"><table class="tbl-wide"><thead><tr><th>Nama</th><th>NIK</th><th>Peran</th><th>Status</th><th class="r">Aksi</th></tr></thead><tbody>' + baris + "</tbody></table></div></section>" + cad + "</div>";
  }
  function renderAkun() {
    var me = Auth.me(); if (!me) return;
    $("#akunBack").hidden = !!me.must;
    $("#akunIsi").innerHTML = '<div class="stack"><section class="card"><dl class="kv"><dt>Nama</dt><dd>' + esc(me.name) + "</dd><dt>NIK</dt><dd class=\"num\">" + esc(me.u) + "</dd><dt>Peran</dt><dd>" + chip(me.role === "admin" ? "acc" : "mute", ROLE[me.role]) + "</dd></dl></section>" +
      '<section class="card"><div class="hd"><div><h2>Ganti password</h2><p class="note">' + (me.must ? "Wajib dilakukan sebelum memakai aplikasi. " : "") + 'Minimal 6 karakter dan berbeda dari yang lama.</p></div></div><form id="formGanti" autocomplete="on"><div class="form-grid">' +
      '<input type="text" name="username" value="' + esc(me.u) + '" autocomplete="username" hidden>' +
      '<label class="field" for="gpLama">Password lama<input id="gpLama" type="password" autocomplete="current-password" required></label><label class="field" for="gpBaru">Password baru<input id="gpBaru" type="password" autocomplete="new-password" required minlength="6"></label><label class="field" for="gpUlang">Ulangi password baru<input id="gpUlang" type="password" autocomplete="new-password" required></label></div>' +
      '<div class="form-act"><button class="btn pri" type="submit" id="btnGanti">Simpan password</button></div></form>' + pesanHtml() + "</section></div>";
  }
  async function jalankan(fn, sukses, ulang) {
    try { await fn(); setPesan(sukses, "good"); } catch (e) { setPesan(e && e.user ? e.message : "Gagal menyimpan: " + (e && e.message || e), "bad"); }
    ulang();
  }
  function pasangAkun() {
    document.addEventListener("submit", async function (e) {
      var f = e.target.id; if (!f) return;
      if (f === "formLogin") {
        e.preventDefault(); var go = $("#auGo"), er = $("#auErr"); go.disabled = true; er.textContent = "";
        try { await Auth.login($("#auUser").value, $("#auPw").value); await masuk(true); }
        catch (x) { er.textContent = x && x.user ? x.message : "Gagal masuk: " + (x && x.message || x); go.disabled = false; $("#auPw").value = ""; $("#auPw").focus(); }
      } else if (f === "formTambah") {
        e.preventDefault(); var v = function (i) { return $("#" + i).value; };
        await jalankan(function () { return Auth.add(v("tbU"), v("tbN"), v("tbR"), v("tbP")); }, "Akun " + v("tbN").trim() + " ditambahkan. Berikan NIK dan password awalnya kepada yang bersangkutan.", function () { renderPengguna(false); });
      } else if (f === "formReset") {
        e.preventDefault(); var u = S.resetU, pw = $("#rsPw").value;
        await jalankan(function () { return Auth.reset(u, pw); }, "Password " + u + " direset. Pengguna wajib menggantinya saat masuk.", function () { S.resetU = ""; renderPengguna(false); });
      } else if (f === "formGanti") {
        e.preventDefault(); var b = $("#gpBaru").value;
        if (b !== $("#gpUlang").value) { setPesan("Password baru dan ulangannya tidak sama.", "bad"); renderAkun(); return; }
        var lama = $("#gpLama").value, wasMust = Auth.me().must;
        try { await Auth.changePw(lama, b); setPesan("Password diganti.", "good"); } catch (x) { setPesan(x && x.user ? x.message : "Gagal: " + (x && x.message || x), "bad"); renderAkun(); return; }
        renderWho(); document.body.classList.remove("must"); buatNav(); renderMenu();
        if (wasMust) { S.pesan = null; history.replaceState(null, "", "#menu"); route(); } else renderAkun();
      }
    });
    $("#btnKeluar").addEventListener("click", keluar);
    document.addEventListener("change", async function (e) {
      if (e.target.dataset && e.target.dataset.pn) { await setPenerima(e.target.dataset.id, e.target.dataset.pn, e.target.value); return; }
      if (e.target.dataset && e.target.dataset.trm) { await setTerima(e.target.dataset.id, e.target.dataset.trm, e.target.checked); return; }
      if (e.target.id === "auShow") { $("#auPw").type = e.target.checked ? "text" : "password"; return; }
      if (e.target.id === "bkFile") {
        var f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
        try { var r = await Auth.impor(await f.text()); if (r.cfg && r.cfg.sla) { S.sla = slaBaru(r.cfg.sla); S.ref = r.cfg.ref || ""; ls.set("psla-sla", S.sla); ls.set("psla-ref", S.ref); simpanCfg(); sinkronAtur(); renderSemua(); }
          setPesan("Cadangan digabung: " + r.baru + " akun baru" + (r.cfg && r.cfg.sla ? ", batas SLA ikut diterapkan" : "") + ".", "good"); }
        catch (x) { setPesan(x && x.user ? x.message : "Gagal membaca cadangan.", "bad"); }
        renderPengguna(false);
      }
    });
    document.addEventListener("click", async function (e) {
      var t = e.target, el;
      if (t.closest("#auShow")) return;
      if ((el = t.closest("[data-tt]"))) { S.tabT = el.dataset.tt; S.halT = 1; renderTerima(); return; }
      if (t.closest("#btnNotif")) {
        var nm = $("#notifMsg");
        if (S.notif) { S.notif = false; ls.set("psla-notif", false); renderAlarm(); return; }
        if (!("Notification" in window)) { nm.textContent = "Browser ini tidak mendukung notifikasi. Nada dan getar tetap berfungsi bila Bunyi alarm dihidupkan."; return; }
        var izin = Notification.permission; try { if (izin !== "granted") izin = await Notification.requestPermission(); } catch (x) {}
        if (izin === "granted") { S.notif = true; ls.set("psla-notif", true); renderAlarm(); kabari(jenisAlarm() || "segera"); }
        else nm.textContent = "Notifikasi tidak diizinkan. Buka pengaturan situs di browser dan izinkan notifikasi, lalu coba lagi. Di halaman yang dibuka di dalam claude.ai notifikasi biasanya diblokir, buka berkas aplikasi langsung bila perlu.";
        return;
      }
      if (t.closest("#btnUji")) { bunyi("lewat"); return; }
      if (t.closest("#btnBunyi")) { S.bunyi = !S.bunyi; ls.set("psla-bunyi", S.bunyi); renderAlarm(); if (S.bunyi) { bunyi("lewat"); try { if (navigator.vibrate) navigator.vibrate([300, 120, 300]); } catch (e) {} } return; }
      if ((el = t.closest("[data-ta]"))) { S.tabA = el.dataset.ta; S.halA = 1; renderAlarm(); return; }
      if ((el = t.closest("[data-pa]"))) { S.halA = Math.max(1, S.halA + (+el.dataset.pa)); renderAlarm(); window.scrollTo(0, 0); return; }
      if ((el = t.closest("[data-ph]"))) { S.halT = Math.max(1, S.halT + (+el.dataset.ph)); renderTerima(); window.scrollTo(0, 0); return; }
      if ((el = t.closest("[data-lihat]"))) { bukaRincian(el.dataset.lihat); return; }
      if ((el = t.closest("[data-reset]"))) { S.resetU = el.dataset.reset; setPesan(null); renderPengguna(false); setTimeout(function () { var i = $("#rsPw"); if (i) i.focus(); }, 0); return; }
      if (t.closest("[data-batal-reset]")) { S.resetU = ""; renderPengguna(false); return; }
      if ((el = t.closest("[data-peran]"))) { var u = el.dataset.peran, ke = el.dataset.ke; await jalankan(function () { return Auth.setRole(u, ke); }, "Peran " + u + " diubah menjadi " + ROLE[ke] + ".", function () { renderPengguna(false); renderWho(); buatNav(); }); return; }
      if ((el = t.closest("[data-hapus]"))) {
        var h = el.dataset.hapus;
        if (S.hapusKonfirm !== h) { S.hapusKonfirm = h; setPesan(null); renderPengguna(false); setTimeout(function () { if (S.hapusKonfirm === h) { S.hapusKonfirm = ""; if (S.page === "pengguna") renderPengguna(false); } }, 4000); return; }
        S.hapusKonfirm = ""; await jalankan(function () { return Auth.remove(h); }, "Akun " + h + " dihapus.", function () { renderPengguna(false); }); return;
      }
      if (t.closest("#bkExport")) {
        var teks = Auth.ekspor({ sla: S.sla, ref: S.ref }), d = new Date(), n = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
        simpanBerkas("cadangan-akun-sla-" + n + ".json", teks, "application/json"); return;
      }
    });
  }

  /* ---------- mulai ---------- */
  async function muat() {
    var arr = window.PSLA_DATA;
    if (!arr) { var r = await fetch(DATA_URL); if (!r.ok) throw new Error("HTTP " + r.status); arr = await r.json(); }
    return X.decode(arr);
  }
  Promise.all([muat(), Auth.init()]).then(function (hasil) {
    D = hasil[0]; $("#muat").hidden = true; isiOpsi(); sinkronAtur(); pasang(); pasangAkun();
    if (Auth.me()) masuk(false); else tampilLogin();
  }).catch(function (e) {
    document.body.classList.remove("locked"); $("#muat").hidden = false;
    $("#muat").textContent = "Data tidak bisa dimuat: " + (e && e.message || e) + ". Pastikan berkas data/data.js atau data/data.json ada.";
  });
})();
