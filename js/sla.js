/* Hak cipta (c) 2026 NURHIDAYAT TURILAH - Branch Fixed Asset Administrator */
(function () {
// Hak cipta (c) 2026 NURHIDAYAT TURILAH - Branch Fixed Asset Administrator
// Logika perhitungan SLA pengadaan. Murni JavaScript, tanpa React, jadi mudah diuji.

const SUMBER = ["Non Online", "Online", "Toko GO"];
const SLA_AWAL = { app: 5, po: 3, total: 30, target: 90 };
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const HARI = 86400000;

const tgl = s => (s ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) : null);
const selisih = (a, b) => (a == null || b == null ? null : Math.round((b - a) / HARI));
const fmtTgl = t => (t == null ? "-" : `${new Date(t).getUTCDate()} ${BULAN[new Date(t).getUTCMonth()]} ${String(new Date(t).getUTCFullYear()).slice(2)}`);
const nf = new Intl.NumberFormat("id-ID");
const rp = v => (v >= 1e9 ? `Rp ${(v / 1e9).toFixed(2).replace(".", ",")} M` : v >= 1e6 ? `Rp ${(v / 1e6).toFixed(1).replace(".", ",")} jt` : `Rp ${nf.format(Math.round(v))}`);
const bulanLabel = k => `${BULAN[+k.slice(5, 7) - 1]} ${k.slice(2, 4)}`;

/** Mengubah data.json (format ringkas) menjadi daftar baris barang. */
function decode(arr) {
  const m = arr[0];
  const lines = arr.slice(1).map(r => ({
    id: r[29], src: r[0], par: r[2], jenis: m.jenis[r[3]], grp: m.grp[r[6]], kat: m.kat[r[8]],
    kode: r[9], nama: r[10], qty: r[11], alok: m.alok[r[12]], sup: m.sup[r[13]], nominal: +r[18] || 0,
    tPar: tgl(r[19]), tApp: tgl(r[20]), tPo: tgl(r[21]), po: r[22], tTarget: tgl(r[23]),
    tReal: tgl(r[24]) ?? tgl(r[25]), lpb: r[26], mon: (r[19] || "").slice(0, 7),
  }));
  return { meta: { branch: m.branch, printed: m.printed, periode: m.periode }, lines };
}

/** Menghitung durasi dan status SLA satu baris barang terhadap tanggal acuan. */
function derive(l, S, ref) {
  const hasPo = l.tPo != null, done = l.tReal != null;
  const dApp = selisih(l.tPar, l.tApp);
  const dPo = hasPo ? Math.max(0, selisih(l.tApp, l.tPo)) : null;
  const waitPo = !hasPo ? Math.max(0, selisih(l.tApp, ref)) : null;
  const dKirim = hasPo && done ? selisih(l.tPo, l.tReal) : null;
  const late = done && l.tTarget != null ? selisih(l.tTarget, l.tReal) : null; // positif = terlambat
  const over = !done && hasPo && l.tTarget != null ? selisih(l.tTarget, ref) : null; // positif = lewat target
  const total = selisih(l.tPar, done ? l.tReal : ref);
  let st;
  if (done) st = late != null && late > 0 ? "telat" : "tepat";
  else if (!hasPo) st = waitPo > S.po ? "tunggu-telat" : "tunggu-po";
  else if (over != null && over > 0) st = "lewat";
  else if (over != null && over >= -7) st = "segera";
  else st = "jalan";
  return {
    dApp, dPo, waitPo, dKirim, late, over, total, st, done, hasPo,
    okApp: dApp != null ? dApp <= S.app : null,
    okPo: hasPo ? dPo <= S.po : null,
    okDel: late != null ? late <= 0 : null,
    okTotal: done ? total <= S.total : null,
  };
}

const persen = (a, b) => (b ? (a / b) * 100 : null);
function kuantil(arr, q) {
  const v = arr.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return v[lo] + (v[hi] - v[lo]) * (i - lo);
}

/** Ringkasan seluruh baris yang lolos filter. d adalah hasil derive() per baris. */
function ringkas(rows, ds) {
  const r = { n: rows.length, nominal: 0, pars: new Set(), pos: new Set(), done: 0, tepat: 0, telat: 0, lewat: 0, segera: 0, tungguPo: 0, tungguTelat: 0,
    appOk: 0, appN: 0, poOk: 0, poN: 0, delOk: 0, delN: 0, totOk: 0, totN: 0, app: [], po: [], kirim: [], total: [], telatHari: [] };
  rows.forEach((l, i) => {
    const d = ds[i];
    r.nominal += l.nominal; r.pars.add(l.par); if (l.po) r.pos.add(l.po);
    if (d.okApp != null) { r.appN++; if (d.okApp) r.appOk++; r.app.push(d.dApp); }
    if (d.okPo != null) { r.poN++; if (d.okPo) r.poOk++; r.po.push(d.dPo); }
    if (d.okDel != null) { r.delN++; if (d.okDel) r.delOk++; r.telatHari.push(d.late); }
    if (d.done) { r.done++; r.kirim.push(d.dKirim); r.total.push(d.total); r.totN++; if (d.okTotal) r.totOk++; }
    if (d.st === "tepat") r.tepat++; else if (d.st === "telat") r.telat++;
    else if (d.st === "lewat") r.lewat++; else if (d.st === "segera") r.segera++;
    else if (d.st === "tunggu-po") r.tungguPo++; else if (d.st === "tunggu-telat") r.tungguTelat++;
  });
  return r;
}

/** Kepatuhan per bulan PAR untuk grafik dan sparkline. */
function perBulan(rows, ds) {
  const m = new Map();
  rows.forEach((l, i) => {
    if (!l.mon) return;
    const d = ds[i];
    const o = m.get(l.mon) || { k: l.mon, n: 0, appOk: 0, appN: 0, poOk: 0, poN: 0, delOk: 0, delN: 0, tot: [] };
    o.n++;
    if (d.okApp != null) { o.appN++; if (d.okApp) o.appOk++; }
    if (d.okPo != null) { o.poN++; if (d.okPo) o.poOk++; }
    if (d.okDel != null) { o.delN++; if (d.okDel) o.delOk++; }
    if (d.done) o.tot.push(d.total);
    m.set(l.mon, o);
  });
  return [...m.values()].sort((a, b) => (a.k < b.k ? -1 : 1)).map(o => ({
    ...o, pApp: persen(o.appOk, o.appN), pPo: persen(o.poOk, o.poN), pDel: persen(o.delOk, o.delN),
  }));
}

/** Sebaran selisih hari antara tanggal terima dan target kirim (negatif = lebih awal). */
const SEBARAN = [
  ["Awal 15+", -9999, -15], ["Awal 8-14", -14, -8], ["Awal 1-7", -7, -1], ["Tepat", 0, 0],
  ["Telat 1-7", 1, 7], ["Telat 8-14", 8, 14], ["Telat 15+", 15, 9999],
];
function sebaran(ds) {
  const c = SEBARAN.map(() => 0);
  ds.forEach(d => { if (d.late == null) return; const i = SEBARAN.findIndex(([, a, b]) => d.late >= a && d.late <= b); if (i >= 0) c[i]++; });
  return SEBARAN.map(([label, a], i) => ({ label, n: c[i], telat: a > 0 }));
}

/** Kartu nilai kinerja per pemasok atau toko. */
function kelompok(rows, ds, kunci) {
  const m = new Map();
  rows.forEach((l, i) => {
    const k = l[kunci] || "-"; const d = ds[i];
    const o = m.get(k) || { k, n: 0, nominal: 0, delN: 0, delOk: 0, late: 0, lateN: 0, open: 0, urgent: 0 };
    o.n++; o.nominal += l.nominal;
    if (d.okDel != null) { o.delN++; if (d.okDel) o.delOk++; else { o.late += d.late; o.lateN++; } }
    if (!d.done) { o.open++; if (d.st === "lewat" || d.st === "tunggu-telat") o.urgent++; }
    m.set(k, o);
  });
  return [...m.values()].map(o => ({ ...o, pTepat: persen(o.delOk, o.delN), rataTelat: o.lateN ? o.late / o.lateN : 0 }));
}

const STATUS = {
  tepat: { t: "Tepat waktu", c: "good" }, telat: { t: "Selesai terlambat", c: "warn" },
  lewat: { t: "Lewat target", c: "bad" }, segera: { t: "Jatuh tempo ≤ 7 hari", c: "warn" },
  jalan: { t: "Dalam proses", c: "mute" }, "tunggu-po": { t: "Menunggu PO", c: "mute" }, "tunggu-telat": { t: "PO tertunda", c: "bad" },
};
function labelStatus(d) {
  if (d.st === "lewat") return `Lewat ${d.over} hari`;
  if (d.st === "segera") return d.over === 0 ? "Jatuh tempo hari ini" : `${-d.over} hari lagi`;
  if (d.st === "tunggu-telat") return `PO tertunda ${d.waitPo} hari`;
  if (d.st === "tunggu-po") return `Menunggu PO ${d.waitPo} hari`;
  if (d.st === "telat") return `Telat ${d.late} hari`;
  if (d.st === "tepat") return d.late < 0 ? `Awal ${-d.late} hari` : "Tepat waktu";
  return "Dalam proses";
}

window.SLA = { SUMBER, SLA_AWAL, BULAN, tgl, selisih, fmtTgl, nf, rp, bulanLabel, decode, derive, persen, kuantil, ringkas, perBulan, SEBARAN, sebaran, kelompok, STATUS, labelStatus };
})();
