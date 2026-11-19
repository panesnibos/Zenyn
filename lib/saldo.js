// lib/saldo.js — saldo rupiah per pembeli (bukan gold RPG).
// Sumber utama: nokos gagal, uangnya dikreditkan otomatis, bukan refund manual.
// Setiap mutasi punya `ref` supaya aman dipanggil ulang (idempoten).
const path = require("path");
const { readJson, writeJson } = require("./rpgjson");

const FILE = path.join(__dirname, "../database/saldo.json");
const MAX_LOG = 500;
const MIN_ADD = 1;

let cache = null;
const load = () => {
  if (!cache) {
    const data = readJson(FILE, {});
    cache = {
      users: data && typeof data.users === "object" ? data.users : {},
      log: Array.isArray(data.log) ? data.log : []
    };
  }
  return cache;
};
const save = () => writeJson(FILE, load());

const rp = (n) => `Rp${Number(n || 0).toLocaleString("id-ID")}`;
const get = (uid) => Math.max(0, Math.floor(Number(load().users[uid]?.amount) || 0));
const seen = (ref) => !!ref && load().log.some((e) => e.ref === ref);

const record = (uid, amount, ref, note) => {
  const st = load();
  const user = st.users[uid] || (st.users[uid] = { amount: 0 });
  user.amount = Math.floor((Number(user.amount) || 0) + amount);
  user.updatedAt = Date.now();
  st.log.push({ uid, amount, ref: ref || "", note: note || "", at: user.updatedAt, after: user.amount });
  if (st.log.length > MAX_LOG) st.log.splice(0, st.log.length - MAX_LOG);
  save();
  return user.amount;
};

const add = (uid, amount, ref, note) => {
  const n = Math.floor(Number(amount));
  if (!uid || !Number.isFinite(n) || n < MIN_ADD) return get(uid);
  if (seen(ref)) return get(uid);
  return record(uid, n, ref, note);
};

const sub = (uid, amount, ref, note) => {
  const n = Math.floor(Number(amount));
  if (!uid || !Number.isFinite(n) || n < MIN_ADD) throw new Error("Jumlah saldo tidak valid.");
  if (seen(ref)) return get(uid);
  const cur = get(uid);
  if (cur < n) {
    throw Object.assign(new Error(`Saldo ${rp(cur)} tidak cukup (butuh ${rp(n)}).`), { user: true });
  }
  return record(uid, -n, ref, note);
};

const history = (uid, limit = 5) =>
  load().log
    .filter((e) => e.uid === uid)
    .slice(-Math.max(1, limit))
    .reverse();

module.exports = { FILE, rp, get, add, sub, history, _internal: { reset: () => { cache = null; } } };
