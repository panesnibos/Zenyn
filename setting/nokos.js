// setting/nokos.js — konfigurasi fitur nomor virtual (nokos / OTP).
// Dipakai lewat config.nokos (lihat config.js).
module.exports = {
  enabled: true, // butuh saldo AutoOrder owner setelah pembeli bayar QRIS

  pollMs: 6000, // interval pantau OTP (jangan < 6000, batas AutoOrder)
  pageSize: 8, // produk per halaman (maks 9 + baris navigasi = 10 baris list)

  defaultSort: "pop", // pop (terlaris/rekomendasi) | cheap (termurah) | exp (termahal)

  markup: { percent: 20, flat: 0 }, // harga jual = modal API + markup, dibulatkan ke atas

  // paket yang diutamakan di urutan "Terlaris"
  tierPriority: ["standar", "ekonomi"],

  // prioritas negara di urutan "Terlaris" (kode ISO 2 huruf)
  countryPriority: [
    "id", // Indonesia
    "my", "sg", "th", "ph", "vn", // Asia Tenggara
    "in", "pk", "bd", // Asia Selatan
    "ru", "kz", "ua", "ng", "ke", "ge", "za", // murah lain
    "us", "gb", "de", "nl", "fr", "ca", "au" // Barat
  ]
};
