// lib/bank.js — tabungan gold dengan bunga harian (money sink ringan).
// Bunga dihitung saat diakses (bukan cron): 0.5%/hari, saldo maksimal 50.000.
const path = require("path");
const { readJson, writeJson } = require("./rpgjson");
const { db } = require("./rpgdb");

const FILE = path.join(__dirname, "../database/rpg/bank.json");
const RATE = 0.005;
const CAP = 50000;
const MIN_SETOR = 100;
const DAY_MS = 24 * 60 * 60 * 1000;

let cache = null;
const load = () => {
  if (!cache) cache = readJson(FILE, {}) || {};
  return cache;
};
const save = () => writeJson(FILE, load());

const stateOf = (uid) => ({ amount: 0, last: Date.now(), ...(load()[uid] || {}) });
const put = (uid, state) => {
  load()[uid] = state;
  save();
  return state;
};

// bunga masuk per hari penuh; dipanggil setiap kali bank disentuh
const accrue = (uid) => {
  const st = stateOf(uid);
  if (!st.amount) {
    st.last = Date.now();
    return put(uid, st);
  }
  const days = Math.floor((Date.now() - (st.last || Date.now())) / DAY_MS);
  if (days > 0) {
    st.amount = Math.min(CAP, Math.floor(st.amount * (1 + RATE) ** days));
    st.last = (st.last || Date.now()) + days * DAY_MS;
    put(uid, st);
  }
  return st;
};

const deposit = (uid, amount) => {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < MIN_SETOR) throw new Error(`Minimal setor ${MIN_SETOR} gold.`);
  const user = db.getUser(uid);
  if ((user.money || 0) < n) throw new Error(`Gold tidak cukup. Saldo ${user.money}.`);
  const st = accrue(uid);
  if (st.amount + n > CAP) throw new Error(`Saldo bank maksimal ${CAP}. Sisa ruang ${CAP - st.amount}.`);
  db.addMoney(uid, -n);
  st.amount += n;
  put(uid, st);
  return st;
};

const withdraw = (uid, amount) => {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 1) throw new Error("Jumlah tarik tidak valid.");
  const st = accrue(uid);
  if (st.amount < n) throw new Error(`Saldo bank ${st.amount}, tidak cukup untuk tarik ${n}.`);
  db.addMoney(uid, n);
  st.amount -= n;
  put(uid, st);
  return st;
};

const top = (limit = 3) =>
  Object.entries(load())
    .map(([uid, st]) => ({ uid, amount: Number(st.amount) || 0 }))
    .filter((r) => r.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);

module.exports = {
  FILE,
  RATE,
  CAP,
  MIN_SETOR,
  stateOf,
  accrue,
  deposit,
  withdraw,
  top,
  _internal: {
    reset: () => { cache = null; },
    set: (uid, state) => put(uid, { amount: 0, last: Date.now(), ...state })
  }
};
