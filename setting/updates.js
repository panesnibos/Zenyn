// setting/updates.js — changelog bot untuk `.update`.
// Satu entri per tanggal (WIB). Teks dibuat polos supaya gampang disalin.
module.exports = [
  {
    date: "2026-11-20",
    items: [
      "Upgrade equipment kini menempel ke item: ganti senjata lalu balik lagi, level + tetap ada (termasuk setelah .unequip)",
      "Pasar gelap berganti nama: Black Market (stok pribadi) dan Super Black Market (global, belum dibuka)",
      "Super Black Market sudah muncul di menu .bm; stok bareng semua pemain menyusul",
      "Crate dirombak: 1 buka = 1 gold + 3 item; item bertanda bintang maksimal 1 per buka",
      "Crate baru Shadow Crate; shadow key hanya bisa didapat dari premium crate",
      "Premium key bisa dibeli dengan IDR lewat .key — 5 key Rp1.000",
      "Kunci (bronze, premium, shadow) tidak bisa dijual atau diperdagangkan",
      "Black Market: total 10 unit per sesi, 6-9 baris, bahan rotasi + promo diskon",
      "Player market dua arah: Barang Dijual dan Dicari Pembeli (gold pembeli ditahan)",
      "Dungeon diperpanjang sampai floor 200; tiap 20 floor dapat premium key (total 10 key)",
      "Boss dungeon di atas floor 50 diskalakan ulang (tidak one-shot) dan equipment Epic mulai floor 100",
      "Greater Potion sekarang benar-benar bisa dipakai lewat .heal atau tombol menu",
      "Prestige mereset progres dungeon ke floor 1; batas dungeon naik 50 tiap prestige (maks 500)",
      "Premium key dungeon diberikan tiap 25 floor (25, 50, 75, dst)",
      "Transfer gold dibatasi cooldown 30 detik",
      "Market: listing & buy order kedaluwarsa 3 hari, barang dan gold dikembalikan otomatis",
      ".inventory menampilkan level upgrade (+N) pada equipment",
      "Fitur baru .mulung: kantong sampah (bisa dijual) + 2 item acak, cooldown 4 detik (premium 2,5 detik)",
      "Nokos sekarang hanya bisa dibeli pakai saldo Rp; pembayaran QRIS untuk nomor virtual dinonaktifkan",
      "Batal nokos otomatis mengembalikan dana ke saldo Rp"
    ]
  },
  {
    date: "2026-11-19",
    items: [
      "Tombol/list di chat pribadi dikirim sebagai teks + perintah ketik (menu, nokos, premium, register, addbot, catur, tebak, dll) supaya tampil di PC maupun HP",
      "Di grup tombol tetap seperti biasa; link Join Group di DM tampil sebagai URL teks",
      "Saldo Rp per pembeli: dana nokos yang gagal otomatis masuk saldo (bukan refund manual)",
      "Saldo bisa dipakai untuk nokos, premium, dan sewa bot; cek dengan .saldo",
      ".raid diperbaiki: menu dan pilih boss tampil lagi (sebelumnya gagal kirim tombol)",
      "Log lebih rapi: kesalahan input pemain dicatat WARN, bukan ERROR (mis. .use item yang tidak punya)",
      "Pasar gelap baru: buka 06:00-12:00 dan 18:00-00:00 WIB, stok per pemain per sesi, kuota 7 item/hari",
      "Pasar gelap punya dua pilihan: Global (belum dibuka) dan Pribadi",
      "Kunci keluar dari toko: premium key hanya di Black Market (stok 2), bronze key dari daily, dungeon, dan pasar",
      "Bahan baru Void Shard & Shadow Silk hanya di Black Market",
      "Resep baru: Smugglers Blade, Nightshade Armor, Cutthroat Ring, Ancient Scroll (+500 EXP)",
      "Command baru .item: lihat stat, sumber, bahan craft, dan harga jual item"
    ]
  },
  {
    date: "2026-11-18",
    items: [
      "Lelang item antar pemain: .lelang jual/bid/beli/batal/saya — 10 menit, anti-snipe, pajak 5%",
      "Pity gacha: 50 buka crate = jaminan Diamond (counter tampil di hasil)",
      "Bank gold: .bank setor/tarik/top — bunga 0,5%/hari, maksimal 50.000",
      "Pasar gelap: .bm beli — stok & harga acak, ganti tiap 6 jam",
      "Konten RPG: gear Mythic (Celestial), bahan Mithril Ore/Crystal/Dragon Scale, tambang dalam .mine deep (level 10+)",
      "Item baru di shop: Greater Potion (+120 HP), Guardian Amulet (Epic)",
      ".pin / .pinterest: simpan gambar/video dari link Pinterest (1 media per pin)",
      "Perbaikan limit: teks bantuan tidak lagi memotong limit (.ai, .qr, .pin, .iqc, .translate, dll)",
      ".bcgc sekarang bisa broadcast gambar + caption (reply foto)",
      "Utilitas baru: .hash, .b64, .pw, .calc, .remind (remind gratis)",
      ".expand: buka shortlink, tampilkan URL final (link jaringan lokal diblokir)",
      ".tw: unduh video/gambar dari post X (twitter)",
      ".img resize/crop/compress dan .tts (teks jadi voice note)",
      ".ss: screenshot website (khusus premium, 2 limit)",
      ".fb: unduh video Facebook; .ytsearch: cari 5 video YouTube + tombol unduh",
      ".hdr / .hd: enhance foto 2x auto-level (varian strong & soft khusus premium)",
      "Format angka ringkas: gold/EXP di atas 10.000 tampil 12,3k / 13,2M / 2,5B",
      "Gear baru di shop: Silver Dagger, Hunter Bow, Obsidian Armor, Vanguard Plate, Phantom Cloak, Sage Amulet, Merchant Ring",
      "Colossus Blade (Legendary) lewat resep; resep bahan Iron Ingot & Steel Ingot ditambahkan",
      "Consumable baru dengan .use: Exp Scroll (+150 EXP), Pet Food, Strength Tonic (+20% ATK 1 battle), Anti-Death Charm, Bait",
      "Format k/M/B kini ikut di konfirmasi beli/jual dan label tombol (.shop, .market, .equip, dll)",
      "Raid dirombak: menu + tombol list, boss grup (15 menit, level maks 200) dan world boss global via .raid join",
      "Raid: boss membalas damage, mati = terkunci 60 detik, hadiah dibagi sesuai share damage + DM tiap peserta"
    ]
  },
  {
    date: "2026-11-17",
    items: [
      ".antilink per grup: hapus link terlarang, 3x peringatan = keluar grup",
      "Pengaturan .antilink: on/off, add domain, delete nomor — khusus admin grup, bot wajib admin",
      "Gateway LLM: cooldown breaker 10 detik, 402 hanya mengunci model itu saja, fallback otomatis ke model lain"
    ]
  }
];
