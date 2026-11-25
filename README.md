# Purchasing SLA Monitor

Dashboard untuk memantau siklus pengadaan barang: **permintaan cabang (PAR) → persetujuan → PO terbit → barang diterima gudang (LPB) → diterima user/toko**, lengkap dengan SLA tiap tahap.

Ditulis dengan **HTML, CSS, dan JavaScript biasa**. Tidak ada framework, tidak ada proses build, tidak perlu install apa pun. Memakai data nyata Branch Palu 2 dari aplikasi Monitoring LPB (9.260 item, 4.648 PAR, periode 01 Jan 2026 sampai 18 Nov 2026).

Hak cipta (c) 2026 NURHIDAYAT TURILAH, Branch Fixed Asset Administrator.

## Cara membuka

- **Tanpa jaringan, tanpa server:** klik dua kali `index.html`. Data dibaca dari `data/data.js`.
- **GitHub Pages:** unggah semua berkas ke repositori, lalu aktifkan Pages (atau pakai `.github/workflows/pages.yml` agar terbit otomatis setiap commit).
- **Server lokal (opsional):** `python3 -m http.server 8000`, lalu buka `http://localhost:8000`.

## Menu ikon dan halaman

Semua bagian dipisah ke halaman sendiri dan dibuka lewat menu ikon. Menu ikon ada di sisi kiri (komputer) atau di bawah layar (HP), dan halaman Menu menampilkan ikon besar dengan angka ringkas tiap bagian.

| Ikon | Halaman | Isi |
|---|---|---|
| Menu | Menu | pintu masuk ke semua halaman |
| Ringkasan | Ringkasan | angka utama dan alur pengadaan |
| Grafik | Grafik dan Tren | tren bulanan, kinerja per tahap, sebaran keterlambatan |
| Tindakan | Tindak Lanjut | daftar item yang perlu dikejar, rincian PAR, unduh CSV |
| Supplier | Supplier | ketepatan tiap supplier |
| Toko | Toko Tujuan | barang yang menuju tiap toko |
| SLA | Atur SLA | batas waktu tiap tahap dan tanggal acuan |

Alamat tiap halaman memakai tanda `#`, misalnya `index.html#tindak`, jadi bisa dibookmark dan tombol Kembali browser berfungsi. Filter berlaku di semua halaman data dan tetap aktif saat berpindah halaman.

## Fitur

- Ringkasan: item, PAR, PO, nilai pengadaan, persen diterima, tepat waktu, median PAR sampai LPB, jumlah yang perlu tindakan.
- Alur pengadaan per tahap dengan lama median dan status terhadap SLA.
- Kepatuhan per bulan PAR, tren mini tiap tahap, dan sebaran selisih tanggal terima dengan target kirim.
- Daftar tindak lanjut urut dari yang paling mendesak, dengan unduh CSV.
- Rincian satu PAR: jejak tanggal tiap tahap dan tombol tandai "diterima user" (disimpan di browser).
- Kinerja supplier dan toko tujuan; klik nama untuk memfilter semua tampilan.
- Filter bulan, jenis (FAA/OSA), sumber, supplier, toko, dan pencarian PAR/PO/LPB/barang.
- Batas SLA dan tanggal acuan bisa diubah di halaman **Atur SLA**.
- Tema terang/gelap mengikuti perangkat, tampilan menyesuaikan layar HP.

## Aturan SLA awal (bisa diubah di aplikasi)

| Tahap | Aturan |
|---|---|
| Persetujuan PAR | maksimal 5 hari sejak PAR dibuat |
| Penerbitan PO | maksimal 3 hari sejak disetujui |
| Pengiriman supplier | diterima paling lambat tanggal target di PO |
| Total PAR sampai LPB | maksimal 30 hari |
| Target tepat waktu | 90% |

Hari dihitung hari kalender. Barang yang belum diterima dihitung terhadap **tanggal acuan** (awalnya tanggal laporan). Isi dengan hari ini untuk pantauan berjalan.

## Login, admin, dan pengguna

| | Pengguna | Admin |
|---|---|---|
| Ringkasan, Grafik, Tindakan, Supplier, Toko | ya | ya |
| Rincian PAR | ya | ya |
| Unduh CSV | tidak | ya |
| Centang diterima gudang dan diterima toko | ya | ya |
| Atur SLA | tidak | ya |
| Kelola akun (tambah, reset, ubah peran, hapus) | tidak | ya |
| Ganti password sendiri | ya | ya |

- Admin awal: NIK `0222060969`, password awal `1`. **Ganti segera** lewat menu Akun. Di kode hanya tersimpan salt dan hash.
- Tidak ada pendaftaran sendiri. Admin menambah akun di menu Pengguna. Akun baru atau yang direset wajib ganti password saat masuk pertama.
- Aplikasi menolak menghapus diri sendiri dan menurunkan admin terakhir.
- Salah password 5 kali: ditunda 30 detik.
- Penyimpanan akun: di browser perangkat (localStorage). Untuk memakai akun yang sama di perangkat lain, pakai **Simpan cadangan** lalu **Gabung dari cadangan** di menu Pengguna. Bila dibuka lewat claude.ai dengan fitur database, akun dan batas SLA tersimpan bersama.
- **Penting:** login ini hanya pembatas tampilan di sisi browser. `data/data.js` tetap terbaca siapa saja yang bisa membuka situs. Untuk data sensitif, jaga repositori dan situs tetap Private.

## Penerimaan barang (centang tim toko)

Menu **Terima** menampilkan barang yang sudah punya PO. Tiap barang punya dua kotak centang:

1. **Diterima gudang**: otomatis tercentang dan terkunci bila LPB sudah ada di laporan. Bila belum ada, tim bisa mencentangnya manual.
2. **Diterima toko**: baru bisa dicentang setelah gudang menerima. Membatalkan centang gudang ikut membatalkan centang toko.

Filter toko dan pencarian di atas halaman ikut berlaku. Centang tersimpan bersama (semua perangkat) bila memakai fitur database claude.ai, selain itu di browser perangkat dan ikut cadangan akun. Centang lama dari versi sebelumnya dipindahkan otomatis.

## Penerima barang dan alarm

- Tiap centang **Diterima gudang** dan **Diterima toko** punya kolom **nama penerima**. Saat dicentang, isinya otomatis nama akun yang login dan bisa diganti.
- Menu **Alarm** dan pita merah di atas halaman menandai tiga kondisi: **lewat jatuh tempo** (target kirim lewat, gudang belum menerima), **segera jatuh tempo** (7 hari ke depan), dan **belum diterima toko** (sudah di gudang lebih dari 3 hari tetapi belum dicentang). Barang bisa langsung dicentang dari daftar alarm.
- Batas "3 hari" dan batas arsip (60 hari, yang lebih lama tidak dihitung) diatur admin di menu SLA. Tombol "Bunyi alarm" membunyikan nada peringatan saat login bila ada alarm, lalu mengulang tiap 30 menit selama halaman terbuka. Bunyinya berupa denting singkat lalu suara orang berbicara bahasa Indonesia: "Ada yang jatuh tempo" (dua kali) untuk lewat jatuh tempo dan "Ada yang segera jatuh tempo" untuk yang hampir jatuh tempo. Bila browser tidak punya suara ucapan, dipakai sirene dua nada atau tiga bip. Tombol "Uji nada" untuk mencoba suaranya. Di HP alarm juga bergetar, dan tombol "Notifikasi" menampilkan notifikasi browser (perlu izin). Alarm hanya aktif selama aplikasi terbuka di browser; aplikasi yang sudah ditutup tidak bisa membunyikan alarm karena tidak ada server pengirim notifikasi.

## Isi repositori

```
index.html        halaman
css/style.css     tampilan dan token warna terang/gelap
js/sla.js         perhitungan SLA (murni JavaScript)
img/logo.jpg      logo Branch Palu
js/auth.js        akun, login, peran (PBKDF2)
js/app.js         tampilan, filter, grafik, rincian PAR
data/data.js      data yang dibaca halaman (jalan tanpa server)
data/data.json    salinan data yang sama
tools/            skrip pembuat data.js
```

## Memperbarui data secara berkala

1. Ambil `data.json` terbaru dari aplikasi Monitoring LPB (tab Upload Data, tombol **Unduh data.json**).
2. Timpa `data/data.json`, lalu jalankan `python tools/buat-data-js.py` agar `data/data.js` ikut diperbarui.
3. Commit dan push. GitHub Pages terbit ulang otomatis.

## Catatan

- Tahap "diterima user/toko" tidak ada di laporan sistem, jadi ditandai manual dan hanya tersimpan di browser perangkat itu.
- Hari kalender dipakai karena laporan tidak memuat kalender libur.
- Repositori sebaiknya Private karena berisi data pengadaan.
