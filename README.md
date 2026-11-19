# Peta Kapasitas Fiskal Daerah 2025

Situs statis untuk mencari rasio dan kategori kapasitas fiskal daerah 2025 untuk 38 provinsi dan
508 kabupaten/kota, berdasarkan Lampiran PMK No. 97 Tahun 2025. Situs ini bukan situs resmi pemerintah.

## Isi folder

| File | Isi |
|---|---|
| `index.html`, `style.css`, `app.js` | Halaman situs |
| `vendor/` | Library peta Leaflet 1.9.4 |
| `data/kapasitas_fiskal_2025.json` | Data rasio, kategori, dan peringkat provinsi serta kabupaten/kota |
| `data/kabkota.geo.json` | Batas kabupaten/kota (disederhanakan, sumber: geoBoundaries) |
| `data/provinsi.geo.json` | Batas provinsi, hasil penggabungan batas kabupaten/kota |

## Menjalankan di komputer sendiri

Situs ini membaca file data lewat `fetch`, jadi tidak bisa dibuka dengan klik dua kali pada `index.html`.
Jalankan server lokal dari folder ini:

    python -m http.server 8000

lalu buka http://localhost:8000.

## Memperbarui data tahun berikutnya

Ganti isi `data/kapasitas_fiskal_2025.json` dengan data PMK yang baru (struktur sama),
lalu sesuaikan tahun pada judul di `index.html`.
