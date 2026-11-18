// lib/rpgnum.js — bungkus client untuk command RPG supaya angka besar
// (gold/EXP) tampil ringkas di teks, caption, tip, dan footer.
// Hanya pesan keluar yang diformat; data & nilai transaksi tetap utuh.
const { shortText } = require("./num");

const FIELDS = ["text", "caption", "tip", "footer"];

const formatPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;
  let next = null;
  for (const field of FIELDS) {
    const value = payload[field];
    if (typeof value !== "string" || !value) continue;
    const formatted = shortText(value);
    if (formatted === value) continue;
    if (!next) next = { ...payload };
    next[field] = formatted;
  }
  return next || payload;
};

// Proxy ringan: hanya sendMessage & sendInteractiveMessage yang diformat.
const shortClient = (client) =>
  new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (prop !== "sendMessage" && prop !== "sendInteractiveMessage") return value;
      return (jid, payload, options) => value.call(target, jid, formatPayload(payload), options);
    }
  });

module.exports = { shortClient, formatPayload };
