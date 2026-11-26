/* Pembaca laporan PAR (xls HTML, xlsx, csv) dan pembuat dataset. Disalin dari aplikasi Monitoring LPB supaya format sama. */
(function () {
"use strict";
const SRC = ["Non Online","Online","Toko GO"];
const JN = {FAA:"Aktiva tetap", OSA:"Habis pakai"};
const norm = s => String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const pad=n=>String(n).padStart(2,"0");
const dayDiff = (a,b)=> Math.round((Date.parse(b)-Date.parse(a))/864e5);

// [kunci, judul di template, wajib, alias hasil norm()]
const COLS = [
 ["no","NO",0],["kuu","KUU",0],["par","NO PAR (CPM)",1],["jenis","JENIS PAR",1],
 ["ref1","NO PB / REKAP PB",0,["NOREKAPPBOSA","NOPBONLINE","NOREKAPPB"]],
 ["ref2","NO PAR REF / ONLINE",0,["NOPARREF","NOPARONLINE"]],
 ["grp","GROUP DEPT",0],["sub","SUB GROUP",0],["kat","NAMA KATEGORI",0],["brg","NAMA BARANG",1],["qty","QTY",1],
 ["alok","ALOKASI",1],["sup","SUPPLIER",0],["harga","HARGA BARANG",1],["ppn","PPN (BARANG & BIAYA LAIN)",0],["biaya","BIAYA LAIN2",0],
 ["ppnb","PPN BIAYA LAIN2",0],["nominal","NOMINAL",1],["tglPar","TGL PAR",1],["tglApp","TGL PAR APPROVED",0],["tglPo","TGL PO",0],
 ["po","NOMOR PO",0],["target","TARGET TERIMA BRG",0],["real","REALISASI TERIMA BRG",0],["tglLpb","TGL LPB",0],["lpb","NOMOR LPB",0],
 ["sel","SELISIH TRM BRG DG TARGET",0],["ket","KETERANGAN",0],["sumber","SUMBER",0,["SUMBEROPSIONAL"]]
];
const HKEY = new Map(); for(const [k,h,,al] of COLS){ HKEY.set(norm(h),k); (al||[]).forEach(a=>HKEY.set(a,k)); }
const MONNUM={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,MEI:5,JUN:6,JUL:7,AUG:8,AGU:8,SEP:9,OCT:10,OKT:10,NOV:11,DEC:12,DES:12};
const sv = x => String(x==null?"":x).replace(/[\t\r\n]+/g," ").trim().replace(/^'/,"").trim();
function colKey(h){ const n=norm(h); const k=HKEY.get(n); if(k) return k;
  if(n.startsWith("NOPAR")&&n!=="NOPARCPM") return "ref2"; if(n.startsWith("NOPB")||n.startsWith("NOREKAPPB")) return "ref1"; return null; }

/* --- pembaca berkas --- */
function readText(buf){ let t=new TextDecoder("utf-8").decode(buf); if(t.includes("\ufffd")) t=new TextDecoder("windows-1252").decode(buf); return t.replace(/^\ufeff/,""); }
function parseCsv(text){
  const first=text.split(/\r?\n/,1)[0]; const c=(ch)=>first.split(ch).length;
  const delim = c(";")>c(",")?";":(c("\t")>c(",")?"\t":",");
  const rows=[]; let row=[],cur="",q=false;
  for(let i=0;i<text.length;i++){ const ch=text[i];
    if(q){ if(ch==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=ch; }
    else if(ch==='"') q=true;
    else if(ch===delim){ row.push(cur); cur=""; }
    else if(ch==="\n"){ row.push(cur); rows.push(row); row=[]; cur=""; }
    else if(ch!=="\r") cur+=ch; }
  if(cur!==""||row.length){ row.push(cur); rows.push(row); }
  return rows;
}
function parseHtmlTable(text){
  const doc=new DOMParser().parseFromString(text,"text/html");
  return Array.from(doc.querySelectorAll("tr"),tr=>Array.from(tr.children).filter(c=>/^(TD|TH)$/.test(c.tagName)).map(c=>c.textContent.replace(/[\t\r\n]+/g," ").trim()));
}
async function inflateRaw(u8){
  if(typeof DecompressionStream==="undefined") throw new Error("Peramban ini belum bisa membaca .xlsx. Simpan file sebagai CSV UTF-8, atau pakai laporan mentah apa adanya.");
  const stream=new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function unzip(buf){
  const dv=new DataView(buf), u8=new Uint8Array(buf); let e=-1;
  for(let i=u8.length-22;i>=Math.max(0,u8.length-65557);i--){ if(dv.getUint32(i,true)===0x06054b50){ e=i; break; } }
  if(e<0) throw new Error("Berkas bukan xlsx yang valid.");
  const n=dv.getUint16(e+10,true); let p=dv.getUint32(e+16,true); const files={};
  for(let k=0;k<n;k++){
    if(dv.getUint32(p,true)!==0x02014b50) break;
    const method=dv.getUint16(p+10,true), csize=dv.getUint32(p+20,true), nl=dv.getUint16(p+28,true), el=dv.getUint16(p+30,true), cl=dv.getUint16(p+32,true), lo=dv.getUint32(p+42,true);
    files[new TextDecoder().decode(u8.subarray(p+46,p+46+nl))]={method,csize,lo}; p+=46+nl+el+cl;
  }
  return { async text(name){ const f=files[name]; if(!f) return null;
    const ln=dv.getUint16(f.lo+26,true), le=dv.getUint16(f.lo+28,true), start=f.lo+30+ln+le, data=u8.subarray(start,start+f.csize);
    return new TextDecoder().decode(f.method===0?data:await inflateRaw(data)); } };
}
function isDateFmt(id,code){
  if((id>=14&&id<=22)||(id>=27&&id<=36)||(id>=45&&id<=47)||(id>=50&&id<=58)) return true;
  if(!code) return false; const c=code.replace(/"[^"]*"/g,"").replace(/\[[^\]]*\]/g,"").replace(/\\./g,"");
  return /[dmyhs]/i.test(c) && !/general/i.test(c);
}
const serialISO = n => { const d=new Date(Math.round((n-25569)*864e5)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}`; };
async function readXlsx(buf){
  const z=await unzip(buf); const X=s=>new DOMParser().parseFromString(s,"application/xml");
  const wbx=await z.text("xl/workbook.xml"); if(!wbx) throw new Error("Berkas xlsx tidak valid.");
  const sheets=Array.from(X(wbx).getElementsByTagName("sheet"));
  const sh=sheets.find(s=>/^data$/i.test(s.getAttribute("name")))||sheets[0]; if(!sh) throw new Error("Tidak ada sheet pada berkas.");
  const rid=sh.getAttribute("r:id"); let target=null;
  const relx=await z.text("xl/_rels/workbook.xml.rels");
  if(relx) for(const r of X(relx).getElementsByTagName("Relationship")) if(r.getAttribute("Id")===rid) target=r.getAttribute("Target");
  const path=target? (target.startsWith("/")?target.slice(1):"xl/"+target.replace(/^\.\//,"")) : "xl/worksheets/sheet1.xml";
  const sst=[]; const sx=await z.text("xl/sharedStrings.xml");
  if(sx) for(const si of X(sx).getElementsByTagName("si")) sst.push(Array.from(si.getElementsByTagName("t")).filter(t=>t.parentNode.nodeName!=="rPh").map(t=>t.textContent).join(""));
  const dateXf=[]; const stx=await z.text("xl/styles.xml");
  if(stx){ const sd=X(stx); const custom={}; for(const nf of sd.getElementsByTagName("numFmt")) custom[nf.getAttribute("numFmtId")]=nf.getAttribute("formatCode");
    const cx=sd.getElementsByTagName("cellXfs")[0]; if(cx) Array.from(cx.children).forEach((xf,i)=>{ const id=+xf.getAttribute("numFmtId"); dateXf[i]=isDateFmt(id,custom[id]); }); }
  const body=await z.text(path); if(!body) throw new Error("Sheet data tidak ditemukan di berkas.");
  const rows=[];
  for(const rw of X(body).getElementsByTagName("row")){
    const rn=+rw.getAttribute("r")||rows.length+1; const arr=(rows[rn-1]=[]);
    for(const c of rw.getElementsByTagName("c")){
      const ref=(c.getAttribute("r")||"").replace(/\d/g,""); let ci=0; for(const ch of ref) ci=ci*26+ch.charCodeAt(0)-64; ci-=1; if(ci<0) ci=arr.length;
      const t=c.getAttribute("t"), s=+c.getAttribute("s")||0, v=c.getElementsByTagName("v")[0]; let val="";
      if(t==="s"&&v) val=sst[+v.textContent]??"";
      else if(t==="inlineStr") val=Array.from(c.getElementsByTagName("t")).map(x=>x.textContent).join("");
      else if(t==="str"||t==="e") val=v?v.textContent:"";
      else if(t==="b") val=v&&v.textContent==="1"?"TRUE":"FALSE";
      else if(v&&v.textContent!==""){ const n=Number(v.textContent); val=dateXf[s]?serialISO(n):n; }
      arr[ci]=val;
    }
  }
  return Array.from(rows,r=>r?Array.from(r,x=>x==null?"":x):[]);
}

function metaFrom(rows,upto){
  const m={};
  for(let i=0;i<upto;i++){ const t=(rows[i]||[]).filter(x=>String(x).trim()!=="").join(" ").trim(); let x;
    if((x=t.match(/Branch\s*:\s*(.+)$/i))) m.branch=x[1].trim();
    else if((x=t.match(/Periode\s*:\s*(.+)$/i))) m.periode=x[1].trim();
    else if((x=t.match(/Status PAR\s*:\s*(.+)$/i))) m.status=x[1].trim();
    else if((x=t.match(/Dicetak Tanggal\s*:\s*(\d{1,2})-\s*([A-Za-z]+)\s*-\s*(\d{4})\s+(\d{1,2}):(\d{2})/i))){ const mo=MONNUM[x[2].slice(0,3).toUpperCase()]; if(mo) m.printed=`${x[3]}-${pad(mo)}-${pad(+x[1])}T${pad(+x[4])}:${x[5]}:00`; }
    else if(/REPORT PROGRESS PAR/i.test(t)){ m.report=true; m.kind=/belum\s+selesai/i.test(t)?0:1; }
  }
  return m;
}
function detectSrc(name,meta){
  if(/toko\s*go/i.test(name)) return 2; if(/non\s*online/i.test(name)) return 0; if(/online/i.test(name)) return 1;
  const s=meta.status||""; if(/GO\s*ONLINE/i.test(s)) return 2; if(/NON/i.test(s)) return 0; if(/ONLINE/i.test(s)) return 1; return 0;
}
async function readUpload(file){
  const buf=await file.arrayBuffer(); const h=new Uint8Array(buf.slice(0,8)); let rows;
  if(h[0]===0x50&&h[1]===0x4b) rows=await readXlsx(buf);
  else if(h[0]===0xD0&&h[1]===0xCF) throw new Error("Ini file .xls biner (format Excel lama). Buka di Excel lalu simpan sebagai .xlsx atau CSV UTF-8. Laporan mentah dari sistem (yang berformat HTML) bisa diunggah apa adanya.");
  else { const text=readText(buf); rows=/<table|<tr[\s>]/i.test(text.slice(0,300000))?parseHtmlTable(text):parseCsv(text); }
  let hi=-1, idx=null;
  for(let i=0;i<rows.length;i++){ const map={}; let n=0; (rows[i]||[]).forEach((c,j)=>{ const k=colKey(c); if(k&&map[k]==null){ map[k]=j; n++; } }); if(n>=8&&map.par!=null){ hi=i; idx=map; break; } }
  if(hi<0) throw new Error("Baris judul kolom tidak ditemukan. Pastikan ada kolom NO PAR (CPM), JENIS PAR, NAMA BARANG, QTY, ALOKASI, dan seterusnya seperti pada template.");
  const miss=COLS.filter(c=>c[2]&&idx[c[0]]==null).map(c=>c[1]); if(miss.length) throw new Error("Kolom wajib tidak ada: "+miss.join(", ")+".");
  const meta=metaFrom(rows,hi); const out=[];
  for(let i=hi+1;i<rows.length;i++){ const r=rows[i]||[]; if(!r.some(x=>String(x).trim()!=="")) continue;
    if(r.filter(x=>String(x).trim()!=="").length<4) continue;   // baris catatan kaki laporan
    const o={_r:i+1}; for(const k in idx) o[k]=r[idx[k]]; out.push(o); }
  return {name:file.name,size:file.size,meta,rows:out,src:detectSrc(file.name,meta),kind:meta.report?meta.kind:null,hasSumber:idx.sumber!=null};
}


/* --- konversi nilai --- */
function pn(x){
  if(typeof x==="number") return Math.round(x*1e6)/1e6;
  let s=sv(x).replace(/rp/i,"").replace(/\s/g,""); if(s==="") return undefined;
  if(/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s=s.replace(/\./g,"").replace(",",".");
  else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s=s.replace(/,/g,"");
  else s=s.replace(",",".");
  const n=Number(s); return Number.isFinite(n)?n:NaN;
}
function pd(x){
  if(typeof x==="number"){ return x>20000&&x<80000?serialISO(x):null; }
  const s=sv(x); if(s===""||s==="-") return ""; let m;
  const ok=(y,mo,d)=>{ y=+y; mo=+mo; d=+d; if(y<100) y+=2000; const t=new Date(Date.UTC(y,mo-1,d)); return (mo>=1&&mo<=12&&d>=1&&t.getUTCMonth()===mo-1&&t.getUTCDate()===d)?`${y}-${pad(mo)}-${pad(d)}`:null; };
  if((m=s.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,9})[-\/ ,]*(\d{2,4})$/))){ const mo=MONNUM[m[2].slice(0,3).toUpperCase()]; return mo?ok(m[3],mo,m[1]):null; }
  if((m=s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return ok(m[1],m[2],m[3]);
  if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/))) return ok(m[3],m[2],m[1]);
  return null;
}
const mkey = l => `${l.par}~${l.kode}~${l.lpb}~${+l.qty}`;
const twin = l => `${l.par}~${l.kode}~${+l.qty}`;

/* --- baris -> data aplikasi --- */
function buildFile(f){
  const lines=[], errors=[], warns=[];
  for(const r of f.rows){
    const par=sv(r.par); const E=m=>errors.push({f:f.name,r:r._r,par,m}); const W=m=>warns.push({f:f.name,r:r._r,par,m});
    if(/^CONTOH/i.test(par)) continue;
    if(!par){ E("No PAR kosong"); continue; }
    let bad=false; const err=m=>{ E(m); bad=true; };
    const jenis=sv(r.jenis).toUpperCase(); if(!jenis) err("JENIS PAR kosong"); else if(!JN[jenis]) W(`JENIS PAR "${jenis}" bukan FAA atau OSA`);
    const brg=sv(r.brg); const bm=brg.match(/^(.*?)\s-\s(.*)$/); if(!brg) err("NAMA BARANG kosong"); else if(!bm) W("NAMA BARANG sebaiknya berformat KODE - NAMA");
    const qty=pn(r.qty); if(qty===undefined||Number.isNaN(qty)||qty<=0) err("QTY harus angka lebih dari 0");
    const alok=sv(r.alok); if(!/^\S+\s-\s.+/.test(alok)) err("ALOKASI harus berformat KODE - NAMA TOKO");
    const harga=pn(r.harga); if(harga===undefined||Number.isNaN(harga)) err("HARGA BARANG harus angka");
    const nominal=pn(r.nominal); if(nominal===undefined||Number.isNaN(nominal)) err("NOMINAL harus angka");
    const ppn=pn(r.ppn), biaya=pn(r.biaya); if(Number.isNaN(ppn)||Number.isNaN(biaya)) err("PPN atau BIAYA LAIN2 harus angka");
    const D={}; for(const [k,lbl] of [["tglPar","TGL PAR"],["tglApp","TGL PAR APPROVED"],["tglPo","TGL PO"],["target","TARGET TERIMA BRG"],["real","REALISASI TERIMA BRG"],["tglLpb","TGL LPB"]]){ D[k]=pd(r[k]); if(D[k]===null) err(`${lbl} tidak dikenali ("${sv(r[k])}"). Pakai 08-DEC-25, 2025-12-08, atau 08/12/2025`); }
    if(!bad && !D.tglPar) err("TGL PAR kosong");
    if(bad) continue;
    const dash=x=>{ const s=sv(x); return s==="-"?"":s; };
    const po=dash(r.po), lpb=dash(r.lpb);
    if(lpb&&!D.tglLpb) W("Ada NOMOR LPB tetapi TGL LPB kosong"); if(lpb&&!D.real) W("Ada NOMOR LPB tetapi REALISASI TERIMA BRG kosong");
    if(lpb&&!po) W("Ada NOMOR LPB tetapi NOMOR PO kosong"); if(po&&!D.tglPo) W("Ada NOMOR PO tetapi TGL PO kosong");
    let sel=pn(r.sel); sel=(sel===undefined||Number.isNaN(sel))?null:Math.round(sel);
    if(sel===null&&D.target&&D.real) sel=dayDiff(D.target,D.real);
    let src=f.src; const sm=sv(r.sumber).toUpperCase(); if(sm){ src=/GO/.test(sm)?2:/NON/.test(sm)?0:/ONLINE/.test(sm)?1:src; }
    lines.push({src,done:!!lpb,par,jenis,ref1:dash(r.ref1),ref2:dash(r.ref2),grp:sv(r.grp)||"-",sub:sv(r.sub)||"-",kat:sv(r.kat)||"-",
      kode:bm?bm[1]:"",nama:bm?bm[2]:brg,qty,alok,sup:sv(r.sup),harga,ppn:ppn||0,biaya:biaya||0,ppnb:sv(r.ppnb).toUpperCase()==="Y"?1:0,nominal,
      tglPar:D.tglPar,tglApp:D.tglApp,tglPo:D.tglPo,po,target:D.target,real:D.real,tglLpb:D.tglLpb,lpb,sel,ket:sv(r.ket),id:""});
  }
  f.lines=lines; f.errors=errors; f.warns=warns;
}
const SAME=["src","jenis","ref1","ref2","grp","sub","kat","kode","nama","qty","alok","sup","harga","ppn","biaya","nominal","tglPar","tglApp","tglPo","po","target","real","tglLpb","lpb","sel","ket"];
const sameLine=(a,b)=>SAME.every(k=>String(a[k]??"")===String(b[k]??""));


function encodeDataset(lines,meta){
  const dicts={jenis:[],grp:[],sub:[],kat:[],alok:[],sup:[]}, idx={}; for(const k in dicts) idx[k]=new Map();
  const D=(k,v)=>{ let i=idx[k].get(v); if(i==null){ i=dicts[k].length; dicts[k].push(v); idx[k].set(v,i); } return i; };
  const rows=lines.map(l=>[l.src,l.done?1:0,l.par,D("jenis",l.jenis),l.ref1,l.ref2,D("grp",l.grp),D("sub",l.sub),D("kat",l.kat),l.kode,l.nama,l.qty,D("alok",l.alok),D("sup",l.sup),l.harga,l.ppn,l.biaya,l.ppnb?1:0,l.nominal,l.tglPar,l.tglApp,l.tglPo,l.po,l.target,l.real,l.tglLpb,l.lpb,l.sel,l.ket,l.id]);
  return [{branch:meta.branch,printed:meta.printed,periode:meta.periode,...dicts},...rows];
}

window.Unggah = { SRC: SRC, buatFile: buildFile, readUpload: readUpload, buildFile: buildFile, encodeDataset: encodeDataset, mkey: mkey, twin: twin, sameLine: sameLine };
})();
