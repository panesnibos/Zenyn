# Fun dan tools

Fitur baru otomatis masuk `.menu`. Semua game hanya hiburan: **tidak memberi
gold/EXP dan tidak menggunakan ekonomi RPG**. Gunakan prefix bot yang aktif
(contoh di bawah memakai `.`).

## Fun (10 fitur)

| Command | Pemakaian |
| --- | --- |
| `.tebak` / `.kuis` | Kuis tombol, 60 detik; hanya pembuat kuis bisa menjawab. `.tebak stop` menghentikan sesi. |
| `.suit @lawan` | Mulai di grup atau reply lawan; lawan menerima/menolak lewat tombol. Pilihan dikirim lewat **DM** (60 detik), hasil di grup. Kedua pemain harus bisa dihubungi bot. |
| `.truthdare` / `.tod` | Tombol Truth/Dare; bisa langsung `.truth` / `.dare`, mention/reply target opsional. Tantangan boleh dilewati. |
| `.roast` | Roast ringan dari template. Mention/reply target opsional. |
| `.gombalan` | Gombalan acak dengan kartu PNG. |
| `.jodoh Ana \| Budi` | Skor hiburan dua nama, hasil konsisten meskipun urutan nama dibalik. |
| `.zodiak 21-03` | Zodiak dari DD-MM dan pesan hiburan harian (WIB). |
| `.rate rajin @teman` | Rating acak harian dalam kartu; bisa reply target. Bukan penilaian faktual. |
| `.pantun` | Pantun acak dalam kartu, gratis. `.pantun ai persahabatan` khusus premium/owner dan membutuhkan `GEMINI_API_KEY`. |
| `.undian` | Pilih anggota grup acak, tanpa admin/bot. Kocok Lagi hanya untuk pembuat undian (tombol 60 detik). Tidak memberikan hadiah otomatis. |

Bank konten lokal: `database/fun.json`. Tidak perlu API untuk mode fun biasa.
Sesi permainan hanya disimpan di memori; restart bot membatalkan sesi/tombol lama.

## Tools (5 fitur)

| Command | Pemakaian |
| --- | --- |
| `.qr https://example.org` | Buat QR; bisa reply teks. Opsional `.qr --warna=334499 teks`. Maks 1200 byte UTF-8; warna terlalu terang ditolak. |
| `.tovn` | Reply audio/video, atau kirim media dengan caption command. Maks input 12 MB, hasil dipotong sampai 60 detik, OGG/Opus voice note. Sticker tidak punya audio. |
| `.smeme TEKS ATAS \| TEKS BAWAH` | Reply gambar/sticker statis atau caption gambar. Maks 8 MB dan 100 karakter per bagian. |
| `.cuaca Bandung` | Cuaca dan prakiraan 3 hari dari Open-Meteo (tanpa key), cache 5 menit. Lokasi memakai hasil pencarian pertama. |
| `.translate en Halo dunia` | Atau reply teks lalu `.translate en`. Deteksi bahasa sumber otomatis, maks 2000 karakter. `.translate` menampilkan kode bahasa. |

Terjemahan menggunakan endpoint Google Translate tanpa key; ketersediaannya tidak
dijamin. Jika gagal, bot mencoba AI hanya bila `GEMINI_API_KEY` sudah dikonfigurasi.
Cuaca/terjemahan membutuhkan koneksi internet; teks terjemahan dikirim ke layanan
tersebut (atau AI saat fallback). Hindari mengirim data rahasia.

Media view-once tidak dibuka oleh tools. Batas unduh dan timeout konversi mencegah
file besar menggantungkan proses. Semua fitur memiliki cooldown singkat; tidak ada
dependensi npm tambahan.

## Update di VPS

Dalam instalasi standar (`/root/zenyn`, PM2 `zenyn`):

```bash
bash update.sh
```

Untuk lokasi/nama PM2 lain:

```bash
APP_DIR=/path/ke/zenyn PM2_NAME=nama-proses bash update.sh
```

`update.sh` menjalankan pull fast-forward, npm install, lalu restart PM2 jika
proses ditemukan. Jika PM2 belum berjalan, ikuti instruksi yang ditampilkan script.

## Pengujian

```bash
node --test tests/fun-tools.test.js
```

Test memakai mock WhatsApp/network, plus render gambar/QR/sticker asli. Opsional
uji FFmpeg nyata dengan direktori sementara yang diizinkan:

```bash
ZENYN_TEST_TMP=/direktori/temp/yang/diizinkan node --test tests/fun-tools.test.js
```

Tampilan tombol dan pengiriman voice note tetap perlu smoke test di WhatsApp asli.
