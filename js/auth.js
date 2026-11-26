/* Hak cipta (c) 2026 NURHIDAYAT TURILAH - Branch Fixed Asset Administrator
   Akun admin dan pengguna. Password tidak pernah disimpan: hanya hash PBKDF2-SHA256 (150.000 putaran) dengan garam acak.
   Penyimpanan: bersama (database claude.ai) kalau tersedia, selain itu di browser (localStorage).
   Catatan: ini penjaga di sisi tampilan. Data di data/data.js tetap bisa dibaca orang yang punya akses ke berkasnya. */
(function () {
  "use strict";
  var IT = 150000;
  /* Akun admin awal. Hanya garam dan hash yang tersimpan di kode, bukan password-nya. Segera ganti password setelah masuk. */
  var SEED = { u: "0222060969", name: "NURHIDAYAT TURILAH", salt: "Ds2VdVDBuNOgfv8SkY2OCw==", hash: "bKpPrLqyyrXNWsJOR2vIIaDMYDTckjoWSncPbvuGNkk=" };
  var KEY_ACC = "psla-accounts", KEY_SESS = "psla-sess", KEY_FAIL = "psla-gagal";
  var db = null, mode = "local", map = new Map(), sess = null;

  /* ---------- penyimpanan kecil ---------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function ssGet(k, d) { try { var v = sessionStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
  function ssSet(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  /* PBKDF2-SHA256 murni JavaScript: cadangan untuk jaringan lokal (http://192.168.x.x) yang tidak punya crypto.subtle. Hasilnya sama persis dengan WebCrypto. */
  const K256=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const IV256=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  function sha256Block(H,W){
    for(let i=16;i<64;i++){
      const a=W[i-15],b=W[i-2];
      W[i]=(W[i-16]+(((a>>>7)|(a<<25))^((a>>>18)|(a<<14))^(a>>>3))+W[i-7]+(((b>>>17)|(b<<15))^((b>>>19)|(b<<13))^(b>>>10)))|0;
    }
    let a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
    for(let i=0;i<64;i++){
      const t1=(h+(((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))+((e&f)^(~e&g))+K256[i]+W[i])|0;
      const t2=((((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))+((a&b)^(a&c)^(b&c)))|0;
      h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
  }
  function sha256From(state,bytes,prefixLen){
    const H=Int32Array.from(state),W=new Int32Array(64),total=prefixLen+bytes.length,padLen=((bytes.length+9+63)>>6)<<6,buf=new Uint8Array(padLen);
    buf.set(bytes); buf[bytes.length]=0x80;
    const bits=total*8, dv=new DataView(buf.buffer); dv.setUint32(padLen-8,Math.floor(bits/4294967296)); dv.setUint32(padLen-4,bits>>>0);
    for(let o=0;o<padLen;o+=64){ for(let i=0;i<16;i++) W[i]=dv.getInt32(o+i*4); sha256Block(H,W); }
    return H;
  }
  function pbkdf2Js(pw,salt,it){
    let key=new TextEncoder().encode(pw);
    if(key.length>64){ const d=sha256From(IV256,key,0), t=new Uint8Array(32), v=new DataView(t.buffer); d.forEach((x,i)=>v.setInt32(i*4,x)); key=t; }
    const ip=new Uint8Array(64),op=new Uint8Array(64); for(let i=0;i<64;i++){ const k=key[i]||0; ip[i]=k^0x36; op[i]=k^0x5c; }
    const blk=bytes=>{ const H=Int32Array.from(IV256),W=new Int32Array(64),dv=new DataView(bytes.buffer); for(let i=0;i<16;i++) W[i]=dv.getInt32(i*4); sha256Block(H,W); return H; };
    const is=blk(ip), os=blk(op);
    const msg=new Uint8Array(salt.length+4); msg.set(salt); msg[msg.length-1]=1;
    let u=sha256From(os,(()=>{ const d=sha256From(is,msg,64), t=new Uint8Array(32), v=new DataView(t.buffer); d.forEach((x,i)=>v.setInt32(i*4,x)); return t; })(),64);
    const out=Int32Array.from(u), Hi=new Int32Array(8), Ho=new Int32Array(8), Wi=new Int32Array(64), Wo=new Int32Array(64);
    Wi[8]=Wo[8]=-2147483648; Wi[15]=Wo[15]=768;
    for(let n=1;n<it;n++){
      for(let i=0;i<8;i++){ Wi[i]=u[i]; Hi[i]=is[i]; } sha256Block(Hi,Wi);
      for(let i=0;i<8;i++){ Wo[i]=Hi[i]; Ho[i]=os[i]; } sha256Block(Ho,Wo);
      u=Ho; for(let i=0;i<8;i++) out[i]^=Ho[i];
    }
    const res=new Uint8Array(32), v=new DataView(res.buffer); for(let i=0;i<8;i++) v.setInt32(i*4,out[i]); return res;
  }

  /* ---------- hash password ---------- */
  var enc = function (s) { return new TextEncoder().encode(s); };
  function b64(u8) { var s = ""; for (var i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s); }
  function unb64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  async function derive(pw, salt, it) {
    if (window.crypto && crypto.subtle) {
      var k = await crypto.subtle.importKey("raw", enc(pw), "PBKDF2", false, ["deriveBits"]);
      return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt, iterations: it }, k, 256));
    }
    await new Promise(function (r) { setTimeout(r, 20); });
    return pbkdf2Js(pw, salt, it);
  }
  async function bikinHash(pw) { var salt = crypto.getRandomValues(new Uint8Array(16)); return { salt: b64(salt), hash: b64(await derive(pw, salt, IT)), it: IT }; }
  async function cocok(acc, pw) {
    var h = await derive(pw, unb64(acc.salt), acc.it || IT), g = unb64(acc.hash), d = h.length ^ g.length;
    for (var i = 0; i < h.length && i < g.length; i++) d |= h[i] ^ g[i];
    return d === 0;
  }

  /* ---------- baca dan tulis akun ---------- */
  function dariSnap(snap) { var m = new Map(); snap.docs.forEach(function (d) { var v = d.data(); if (v && v.u) m.set(v.u, v); }); return m; }
  async function muat() {
    if (mode === "db") {
      map = await new Promise(function (ok, no) {
        var un, tm = setTimeout(function () { no(new Error("Database tidak menjawab.")); }, 8000);
        un = db.collection("accounts").onSnapshot(function (s) { clearTimeout(tm); ok(dariSnap(s)); setTimeout(function () { try { un && un(); } catch (e) {} }, 0); }, function (e) { clearTimeout(tm); no(e); });
      });
    } else {
      var o = lsGet(KEY_ACC, {}); map = new Map(Object.keys(o).map(function (k) { return [k, o[k]]; }));
    }
    return map;
  }
  async function simpan(acc) {
    if (mode === "db") await db.collection("accounts").doc(acc.u).set(acc);
    else { var o = lsGet(KEY_ACC, {}); o[acc.u] = acc; if (!lsSet(KEY_ACC, o)) throw new Error("Penyimpanan browser penuh atau diblokir."); }
    map.set(acc.u, acc);
  }
  async function hapus(u) {
    if (mode === "db") await db.collection("accounts").doc(u).delete();
    else { var o = lsGet(KEY_ACC, {}); delete o[u]; lsSet(KEY_ACC, o); }
    map["delete"](u);
  }
  var publik = function (a) { return a ? { u: a.u, name: a.name, role: a.role, must: !!a.must, weak: !!a.weak, created: a.created || "", by: a.by || "" } : null; };
  var jmlAdmin = function () { var n = 0; map.forEach(function (a) { if (a.role === "admin") n++; }); return n; };
  var gagal = function (pesan) { var e = new Error(pesan); e.user = true; return e; };

  /* ---------- pengaturan bersama (batas SLA) ---------- */
  async function cfgGet() {
    try {
      if (mode === "db") { var d = await db.collection("config").doc("sla").get(); return d && d.exists ? d.data() : null; }
    } catch (e) {}
    return null;
  }
  async function cfgSet(o) { if (mode === "db") { try { await db.collection("config").doc("sla").set(o); } catch (e) { return false; } } return true; }

  /* ---------- penerimaan barang (centang gudang dan toko) ---------- */
  var KEY_TRM = "psla-terima", terima = {};
  var kid = function (id) { return String(id).replace(/[^A-Za-z0-9_~-]/g, "_"); };
  async function terimaMuat() {
    var o = {};
    if (mode === "db") {
      try {
        o = await new Promise(function (ok, no) {
          var un, tm = setTimeout(function () { no(new Error("t")); }, 8000);
          un = db.collection("terima").onSnapshot(function (s) { clearTimeout(tm); var m = {}; s.docs.forEach(function (d) { var v = d.data(); if (v && v.id) m[v.id] = v; }); ok(m); setTimeout(function () { try { un && un(); } catch (e) {} }, 0); }, function (e) { clearTimeout(tm); no(e); });
        });
      } catch (e) { o = terima; }
    } else o = lsGet(KEY_TRM, {});
    terima = o; return terima;
  }
  async function terimaSet(id, v) {
    if (!sess) throw gagal("Sesi berakhir. Masuk lagi.");
    if (v) { var nm = function (x) { return x ? String(x).trim().slice(0, 40) || null : null; }; v = { id: id, g: v.g || null, k: v.k || null, gp: nm(v.gp), kp: nm(v.kp) }; if (!v.g && !v.k && !v.gp && !v.kp) v = null; }
    if (mode === "db") { var r = db.collection("terima").doc(kid(id)); if (v) await r.set(v); else await r["delete"](); }
    else { var o = lsGet(KEY_TRM, {}); if (v) o[id] = v; else delete o[id]; if (!lsSet(KEY_TRM, o)) throw gagal("Penyimpanan browser penuh atau diblokir."); }
    if (v) terima[id] = v; else delete terima[id];
  }

  /* ---------- antarmuka publik ---------- */
  var Auth = {
    get mode() { return mode; },
    async init() {
      try { if (window.claude && claude.use) db = await claude.use("db"); } catch (e) { db = null; }
      mode = db ? "db" : "local";
      try { await muat(); } catch (e) { if (mode === "db") { mode = "local"; db = null; await muat(); } }
      if (!map.size) {
        await simpan({ u: SEED.u, name: SEED.name, role: "admin", salt: SEED.salt, hash: SEED.hash, it: IT, must: false, weak: true, created: new Date().toISOString().slice(0, 10), by: "bawaan" }).catch(function () {});
      }
      var s = ssGet(KEY_SESS, null);
      if (s && map.has(s.u)) sess = s.u; else ssSet(KEY_SESS, null);
    },
    me: function () { return sess ? publik(map.get(sess)) : null; },
    isAdmin: function () { var a = sess && map.get(sess); return !!a && a.role === "admin"; },
    async refresh() { await muat(); if (sess && !map.has(sess)) { sess = null; ssSet(KEY_SESS, null); } },
    list: function () { return Array.from(map.values()).map(publik).sort(function (a, b) { return (a.role === b.role ? 0 : a.role === "admin" ? -1 : 1) || a.name.localeCompare(b.name); }); },
    sisaTunggu: function () { var f = ssGet(KEY_FAIL, { n: 0, until: 0 }); return Math.max(0, Math.ceil((f.until - Date.now()) / 1000)); },
    async login(u, pw) {
      var w = Auth.sisaTunggu(); if (w) throw gagal("Terlalu banyak percobaan. Coba lagi dalam " + w + " detik.");
      u = String(u || "").trim();
      try { await muat(); } catch (e) { throw gagal("Daftar akun tidak bisa dibaca. Periksa koneksi lalu coba lagi."); }
      var a = map.get(u), ok = a ? await cocok(a, String(pw || "")) : (await derive(String(pw || ""), unb64(SEED.salt), IT), false);
      if (!ok) {
        var f = ssGet(KEY_FAIL, { n: 0, until: 0 }); f.n++;
        if (f.n >= 5) { f = { n: 0, until: Date.now() + 30000 }; }
        ssSet(KEY_FAIL, f);
        throw gagal(f.until > Date.now() ? "Terlalu banyak percobaan. Coba lagi dalam 30 detik." : "NIK atau password salah.");
      }
      ssSet(KEY_FAIL, null); sess = a.u; ssSet(KEY_SESS, { u: a.u }); return publik(a);
    },
    logout: function () { sess = null; ssSet(KEY_SESS, null); },
    async add(u, name, role, pw) {
      if (!Auth.isAdmin()) throw gagal("Hanya admin yang bisa menambah akun.");
      u = String(u || "").trim(); name = String(name || "").trim().replace(/\s+/g, " ");
      if (!/^[A-Za-z0-9._-]{3,24}$/.test(u)) throw gagal("NIK 3 sampai 24 karakter: huruf, angka, titik, garis bawah, atau strip.");
      if (name.length < 2 || name.length > 60) throw gagal("Nama lengkap 2 sampai 60 karakter.");
      if (role !== "admin" && role !== "user") throw gagal("Pilih peran admin atau pengguna.");
      if (String(pw || "").length < 6) throw gagal("Password awal minimal 6 karakter.");
      await muat(); if (map.has(u)) throw gagal("NIK " + u + " sudah terdaftar.");
      var h = await bikinHash(pw);
      await simpan({ u: u, name: name, role: role, salt: h.salt, hash: h.hash, it: h.it, must: true, weak: false, created: new Date().toISOString().slice(0, 10), by: sess });
    },
    async reset(u, pw) {
      if (!Auth.isAdmin()) throw gagal("Hanya admin yang bisa mereset password.");
      if (String(pw || "").length < 6) throw gagal("Password baru minimal 6 karakter.");
      await muat(); var a = map.get(u); if (!a) throw gagal("Akun tidak ditemukan.");
      var h = await bikinHash(pw); await simpan(Object.assign({}, a, { salt: h.salt, hash: h.hash, it: h.it, must: u !== sess, weak: false }));
    },
    async setRole(u, role) {
      if (!Auth.isAdmin()) throw gagal("Hanya admin yang bisa mengubah peran.");
      await muat(); var a = map.get(u); if (!a) throw gagal("Akun tidak ditemukan.");
      if (a.role === "admin" && role !== "admin" && jmlAdmin() <= 1) throw gagal("Harus ada minimal satu admin. Jadikan orang lain admin dulu.");
      await simpan(Object.assign({}, a, { role: role }));
    },
    async remove(u) {
      if (!Auth.isAdmin()) throw gagal("Hanya admin yang bisa menghapus akun.");
      if (u === sess) throw gagal("Akun yang sedang dipakai tidak bisa dihapus.");
      await muat(); var a = map.get(u); if (!a) return;
      if (a.role === "admin" && jmlAdmin() <= 1) throw gagal("Harus ada minimal satu admin.");
      await hapus(u);
    },
    async changePw(lama, baru) {
      if (!sess) throw gagal("Masuk dulu.");
      await muat(); var a = map.get(sess); if (!a) throw gagal("Akun tidak ditemukan.");
      if (!(await cocok(a, String(lama || "")))) throw gagal("Password lama salah.");
      if (String(baru || "").length < 6) throw gagal("Password baru minimal 6 karakter.");
      if (baru === lama) throw gagal("Password baru harus berbeda dari yang lama.");
      var h = await bikinHash(baru); await simpan(Object.assign({}, a, { salt: h.salt, hash: h.hash, it: h.it, must: false, weak: false }));
    },
    cfgGet: cfgGet, cfgSet: cfgSet, db: function () { return db; },
    terimaMuat: terimaMuat, terimaSet: terimaSet, terimaAll: function () { return terima; },
    /* cadangan akun untuk dipindah antar perangkat (mode browser) */
    ekspor: function (cfg) { return JSON.stringify({ app: "purchasing-sla-monitor", v: 1, at: new Date().toISOString(), accounts: Array.from(map.values()), cfg: cfg || null, terima: mode === "local" ? lsGet(KEY_TRM, {}) : null }); },
    async impor(teks) {
      if (!Auth.isAdmin()) throw gagal("Hanya admin yang bisa menggabung cadangan.");
      var j; try { j = JSON.parse(teks); } catch (e) { throw gagal("Berkas bukan JSON yang valid."); }
      if (!j || j.app !== "purchasing-sla-monitor" && j.app !== "procurement-sla-monitor" || !Array.isArray(j.accounts)) throw gagal("Bukan berkas cadangan Purchasing SLA Monitor.");
      await muat(); var baru = 0;
      for (var i = 0; i < j.accounts.length; i++) { var a = j.accounts[i]; if (a && /^[A-Za-z0-9._-]{3,24}$/.test(a.u || "") && a.salt && a.hash && (a.role === "admin" || a.role === "user") && !map.has(a.u)) { await simpan({ u: a.u, name: String(a.name || a.u).slice(0, 60), role: a.role, salt: a.salt, hash: a.hash, it: a.it || IT, must: !!a.must, weak: false, created: a.created || "", by: a.by || "impor" }); baru++; } }
      var nt = 0;
      if (j.terima && typeof j.terima === "object") { var cur = lsGet(KEY_TRM, {}); Object.keys(j.terima).forEach(function (k) { var v = j.terima[k]; if (v && (v.g || v.k)) { var c = cur[k] || {}; var g = c.g || v.g || null, kk = c.k || v.k || null; if (!cur[k] || (!c.g && v.g) || (!c.k && v.k)) nt++; cur[k] = { id: k, g: g, k: kk, gp: c.gp || v.gp || null, kp: c.kp || v.kp || null }; } }); if (mode === "local") lsSet(KEY_TRM, cur); }
      return { baru: baru, cfg: j.cfg || null, terima: nt };
    }
  };
  window.Auth = Auth;
})();
