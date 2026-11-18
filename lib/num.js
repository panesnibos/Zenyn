// lib/num.js — format angka ringkas untuk tampilan RPG (k/M/B).
// "diatas 10 ribu" -> 10k, 12,3k, 13,2M, 2,5B. Nilai asli tidak diubah.
const THRESHOLD = 10000;

const fmtUnit = (value) => String(Math.round(value * 10) / 10).replace(".", ",");

const short = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  const abs = Math.abs(n);
  if (abs < THRESHOLD) return String(n);

  const sign = n < 0 ? "-" : "";
  if (abs >= 1e9) return sign + fmtUnit(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + fmtUnit(abs / 1e6) + "M";

  // 999.950 -> "1M" (bukan "1000k")
  if (Math.round((abs / 1e3) * 10) / 10 >= 1000) return sign + fmtUnit(abs / 1e6) + "M";
  return sign + fmtUnit(abs / 1e3) + "k";
};

// angka penuh dengan pemisah ribuan, untuk invoice/nominal uang asli
const full = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString("id-ID") : "0");

// ganti angka >= 5 digit di teks jadi bentuk ringkas; jangan sentuh mention (@628...)
const shortText = (text) =>
  String(text ?? "").replace(/(^|[^@\d])(\d{5,})(?!\d)/g, (_all, prefix, digits) => prefix + short(Number(digits)));

module.exports = { THRESHOLD, short, full, shortText };
