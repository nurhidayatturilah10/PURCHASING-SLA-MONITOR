# Hak cipta (c) 2026 NURHIDAYAT TURILAH - Branch Fixed Asset Administrator
# Mengubah data/data.json menjadi data/data.js supaya halaman bisa dibuka langsung (klik dua kali index.html) tanpa server.
# Jalankan dari folder utama:  python tools/buat-data-js.py
import json
raw = open("data/data.json", encoding="utf-8").read().strip()
json.loads(raw)
open("data/data.js", "w", encoding="utf-8").write("/* Data pengadaan. Dibuat dari data.json oleh tools/buat-data-js.py. */\nwindow.PSLA_DATA=" + raw + ";\n")
print("data/data.js dibuat")
