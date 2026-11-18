// lib/rpgnum.js — bungkus client untuk command RPG supaya angka besar
// (gold/EXP) tampil ringkas di teks, caption, dan label tombol.
// Yang TIDAK disentuh: id tombol, url, mentions — mengubahnya merusak aksi.
const { shortText } = require("./num");

const TEXT_FIELDS = ["text", "caption", "tip", "footer", "title"];

const fmt = (value) => {
  if (typeof value !== "string" || !value) return value;
  const out = shortText(value);
  return out === value ? value : out;
};

// display_text / title / description di dalam buttonParamsJson
const formatParams = (params) => {
  if (!params || typeof params !== "object") return params;
  const next = { ...params };
  for (const key of ["display_text", "title", "description", "text"]) {
    if (typeof next[key] === "string") next[key] = fmt(next[key]);
  }
  if (Array.isArray(params.sections)) {
    next.sections = params.sections.map((section) => {
      const sec = { ...section, title: fmt(section?.title) };
      if (Array.isArray(section?.rows)) {
        sec.rows = section.rows.map((row) => ({
          ...row,
          title: fmt(row?.title),
          description: fmt(row?.description)
        }));
      }
      return sec;
    });
  }
  return next;
};

const formatButton = (button) => {
  if (!button || typeof button !== "object") return button;
  let out = button;
  if (typeof button.text === "string") out = { ...out, text: fmt(button.text) };
  if (typeof button.buttonParamsJson === "string") {
    try {
      out = { ...out, buttonParamsJson: JSON.stringify(formatParams(JSON.parse(button.buttonParamsJson))) };
    } catch {
      /* params rusak: biarkan apa adanya */
    }
  }
  return out;
};

const formatPayload = (payload) => {
  if (!payload || typeof payload !== "object") return payload;

  let next = null;
  const set = (field, value) => {
    if (!next) next = { ...payload };
    next[field] = value;
  };

  for (const field of TEXT_FIELDS) {
    const formatted = fmt(payload[field]);
    if (formatted !== payload[field]) set(field, formatted);
  }

  if (Array.isArray(payload.interactiveButtons)) {
    set("interactiveButtons", payload.interactiveButtons.map(formatButton));
  }
  if (Array.isArray(payload.buttons)) {
    set("buttons", payload.buttons.map(formatButton));
  }

  return next || payload;
};

// Proxy ringan: semua jalur kirim yang dipakai command RPG ikut diformat.
const WRAPPED = new Set(["sendMessage", "sendInteractiveMessage", "sendButtons"]);

const shortClient = (client) =>
  new Proxy(client, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (!WRAPPED.has(prop) || typeof value !== "function") return value;
      return (jid, payload, options) => value.call(target, jid, formatPayload(payload), options);
    }
  });

module.exports = { shortClient, formatPayload, formatParams, formatButton };
