// setting/updates.js — changelog bot untuk `.update`.
// Satu entri per tanggal (WIB). Teks dibuat polos supaya gampang disalin.
module.exports = [
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
