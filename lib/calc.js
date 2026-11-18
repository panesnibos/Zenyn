// lib/calc.js — evaluator ekspresi aritmetika kecil (tanpa eval).
// Dukung: + - * / % ^ ( ) , unary minus, pi, e, sqrt abs round floor ceil.
const FUNCS = {
  sqrt: Math.sqrt,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil
};

const evaluate = (input) => {
  const s = String(input || "").replace(/\s+/g, "").toLowerCase();
  if (!s) throw new Error("Ekspresi kosong.");
  if (s.length > 200) throw new Error("Ekspresi terlalu panjang (maks 200 karakter).");

  let i = 0;
  const peek = () => s[i] || "";

  const number = () => {
    const m = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(s.slice(i));
    if (!m) throw new Error(`Angka tidak valid di posisi ${i + 1}.`);
    i += m[0].length;
    return Number(m[0]);
  };

  const primary = () => {
    const c = peek();
    if (c === "(") {
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("Kurung tutup hilang.");
      i++;
      return v;
    }
    if (c === "-") { i++; return -primary(); }
    if (c === "+") { i++; return primary(); }
    if (/[a-z]/.test(c)) {
      const m = /^[a-z]+/.exec(s.slice(i));
      i += m[0].length;
      if (m[0] === "pi") return Math.PI;
      if (m[0] === "e") return Math.E;
      const fn = FUNCS[m[0]];
      if (!fn) throw new Error(`Fungsi tidak dikenal: ${m[0]}`);
      if (peek() !== "(") throw new Error(`Fungsi ${m[0]} butuh tanda kurung.`);
      i++;
      const v = expr();
      if (peek() !== ")") throw new Error("Kurung tutup hilang.");
      i++;
      return fn(v);
    }
    return number();
  };

  const power = () => {
    const base = primary();
    if (peek() === "^") {
      i++;
      return Math.pow(base, power());
    }
    return base;
  };

  const term = () => {
    let v = power();
    for (;;) {
      const op = peek();
      if (op === "*") { i++; v *= power(); }
      else if (op === "/") { i++; v /= power(); }
      else if (op === "%") { i++; v %= power(); }
      else break;
    }
    return v;
  };

  const expr = () => {
    let v = term();
    for (;;) {
      const op = peek();
      if (op === "+") { i++; v += term(); }
      else if (op === "-") { i++; v -= term(); }
      else break;
    }
    return v;
  };

  const out = expr();
  if (i !== s.length) throw new Error(`Karakter tak dikenal di posisi ${i + 1}.`);
  if (!Number.isFinite(out)) throw new Error("Hasil tidak bisa dihitung (bagi nol / terlalu besar).");
  return out;
};

const format = (value) => {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 1e10) / 1e10);
};

module.exports = { evaluate, format };
