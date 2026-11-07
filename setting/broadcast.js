// setting/broadcast.js — konfigurasi broadcast grup (command owner .bcgc).
module.exports = {
  enabled: true,
  delayMs: 15000, // jeda antar grup (15 detik) supaya aman dari spam
  adLabel: "ADS",
  buttonText: "🔗 Link Group",
  confirmTtlMs: 300000 // masa berlaku konfirmasi .bcgc go (5 menit)
};
