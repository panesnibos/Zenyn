// commands/owner/bcgc.js — broadcast promosi ke semua grup (khusus owner).
// Format: .bcgc <teks>  ->  preview  ->  .bcgc go
//         .bcgc --yes <teks>  -> langsung kirim
//         .bcgc 5 <teks>      -> batasi 5 grup (tes)
const config = require("../../config");
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { TZ } = require("../../lib/stamp");

const cfg = () => config.broadcast || {};
const delayMs = () => Math.max(0, Number(cfg().delayMs ?? 15000));
const adLabel = () => String(cfg().adLabel || "ADS");
const buttonText = () => String(cfg().buttonText || "🔗 Link Group");
const confirmTtlMs = () => Math.max(1000, Number(cfg().confirmTtlMs ?? 300000));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// footer: ADS tahun bulan tanggal hari jam (WIB)
const adFooter = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: TZ,
    year: "numeric",
    month: "long",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return `${adLabel()} ${get("year")} ${get("month")} ${get("day")} ${get("weekday")} ${get("hour")}:${get("minute")}`;
};

const buildText = (body, date = new Date()) =>
  ["*IZIN PROMOSI*", "", String(body || "").trim(), "", adFooter(date)].join("\n");

const urlButton = () =>
  config.groupLink
    ? [
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({ display_text: buttonText(), url: config.groupLink })
        }
      ]
    : [];

const buildPayload = (body) => {
  const text = buildText(body);
  const buttons = urlButton();
  return buttons.length ? { text, interactiveButtons: buttons } : { text: `${text}\n\n${config.groupLink || ""}`.trim() };
};

const groupJids = async (client) => {
  const groups = await client.groupFetchAllParticipating();
  return Object.keys(groups || {})
    .filter((jid) => jid.endsWith("@g.us"))
    .map((jid) => ({ jid, subject: groups[jid]?.subject || "" }));
};

const sendOne = async (client, jid, payload) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (payload.interactiveButtons) await client.sendInteractiveMessage(jid, payload);
      else await client.sendMessage(jid, payload);
      return true;
    } catch (err) {
      if (attempt === 1) {
        // fallback: teks biasa tanpa tombol
        try {
          if (payload.interactiveButtons) {
            await client.sendMessage(jid, { text: `${payload.text}\n\n${config.groupLink || ""}`.trim() });
            return true;
          }
        } catch (err2) {
          logger.warn(`bcgc: gagal kirim ${jid}: ${err2.message}`);
        }
        logger.warn(`bcgc: gagal kirim ${jid}: ${err.message}`);
        return false;
      }
    }
  }
  return false;
};

const estimate = (total) => {
  const secs = Math.ceil(Math.max(0, total - 1) * delayMs() / 1000);
  if (secs < 60) return `~${secs} detik`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `~${m} menit ${s} detik` : `~${m} menit`;
};

const preview = async (client, sender, message, body, limit, p) => {
  const groups = await groupJids(client);
  const total = limit > 0 ? Math.min(limit, groups.length) : groups.length;

  if (!total) {
    return client.sendMessage(
      sender,
      { text: "❌ Bot tidak berada di grup mana pun (atau gagal ambil daftar grup)." },
      { quoted: message }
    );
  }

  const previewText = buildText(body);
  const lines = [
    "📢 *BROADCAST GRUP — PREVIEW*",
    "",
    `Target   : ${total} grup`,
    `Jeda     : ${delayMs() / 1000}s/grup`,
    `Estimasi : ${estimate(total)}`,
    "",
    "────────────────",
    previewText,
    "────────────────",
    "",
    `Kirim  : *${p}bcgc go*`,
    `Batal  : *${p}bcgc batal*`,
    `Belaku : ${Math.round(confirmTtlMs() / 60000)} menit`,
    "",
    "Langsung tanpa preview: *" + `${p}bcgc --yes <teks>` + "*"
  ];

  await client.sendMessage(sender, { text: lines.join("\n") }, { quoted: message });

  const key = uidOf(message);
  pending.set(key, { body, limit, at: Date.now() });
  logger.cmd(`bcgc: preview ${total} grup oleh ${key}`);
  return total;
};

// ---------- state konfirmasi ----------
const pending = new Map(); // uid -> { body, limit, at }
const uidOf = (message) => getUserId(message) || String(message.key?.remoteJid || "").split("@")[0];

const takePending = (uid) => {
  const item = pending.get(uid);
  if (!item) return null;
  if (Date.now() - item.at > confirmTtlMs()) {
    pending.delete(uid);
    return null;
  }
  pending.delete(uid);
  return item;
};

const runBroadcast = async (client, sender, message, body, limit = 0) => {
  const groups = await groupJids(client);
  const targets = limit > 0 ? groups.slice(0, limit) : groups;
  const total = targets.length;

  if (!total) {
    return client.sendMessage(
      sender,
      { text: "❌ Tidak ada grup untuk dikirimi." },
      { quoted: message }
    );
  }

  const payload = buildPayload(body);
  let sent = 0;
  let failed = 0;

  await client.sendMessage(
    sender,
    {
      text: `📡 Broadcast dimulai: ${total} grup, jeda ${delayMs() / 1000}s (${estimate(total)}).`,
      quoted: message
    }
  );

  for (let i = 0; i < targets.length; i++) {
    const ok = await sendOne(client, targets[i].jid, payload);
    if (ok) sent++;
    else failed++;

    if ((i + 1) % 10 === 0 && i + 1 < total) {
      await client.sendMessage(sender, {
        text: `📡 ${i + 1}/${total} — ✅ ${sent} terkirim, ❌ ${failed} gagal`
      });
    }

    if (i < targets.length - 1 && delayMs()) await sleep(delayMs());
  }

  const summary = `✅ ${sent}/${total} terkirim${failed ? ` (${failed} gagal)` : ""}`;
  logger.cmd(`bcgc: selesai ${summary}`);
  await client.sendMessage(sender, { text: summary });
  return { sent, failed, total };
};

const usage = (p) =>
  [
    "📢 *BROADCAST GRUP (OWNER)*",
    "",
    "Kirim promosi ke semua grup dengan footer ADS + tombol link grup.",
    "",
    `• *${p}bcgc <teks>* — preview dulu`,
    `• *${p}bcgc go* — kirim sesuai preview`,
    `• *${p}bcgc batal* — batalkan preview`,
    `• *${p}bcgc --yes <teks>* — kirim langsung`,
    `• *${p}bcgc 5 <teks>* — batasi 5 grup (tes)`,
    "",
    `Jeda antar grup ${delayMs() / 1000} detik.`
  ].join("\n");

const execute = async (client, message, args, commands, commandName) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  if (cfg().enabled === false) {
    return client.sendMessage(sender, { text: "❌ Broadcast dimatikan (setting/broadcast.js -> enabled: false)." }, { quoted: message });
  }

  const raw = (args || []).map((a) => String(a));

  try {
    if (!raw.length) {
      return await client.sendMessage(sender, { text: usage(p) }, { quoted: message });
    }

    const head = raw[0].toLowerCase();
    const uid = uidOf(message);

    if (head === "help" || head === "bantuan") {
      return await client.sendMessage(sender, { text: usage(p) }, { quoted: message });
    }

    if (head === "batal" || head === "cancel" || head === "stop") {
      pending.delete(uid);
      return await client.sendMessage(sender, { text: "🛑 Broadcast dibatalkan." }, { quoted: message });
    }

    if (head === "go" || head === "kirim" || head === "send") {
      const item = takePending(uid);
      if (!item) {
        return await client.sendMessage(
          sender,
          { text: `⚠️ Tidak ada preview aktif (kadaluarsa ${Math.round(confirmTtlMs() / 60000)} menit). Ulangi *${p}bcgc <teks>*.` },
          { quoted: message }
        );
      }
      runBroadcast(client, sender, message, item.body, item.limit).catch((err) =>
        logger.error(`bcgc: ${err.message}`)
      );
      return;
    }

    // parse: [--yes] [jumlah] <teks>
    let immediate = false;
    let limit = 0;
    const words = [];
    for (const w of raw) {
      const t = w.trim();
      if (!t) continue;
      if (t === "--yes" || t === "-y" || t === "--now") immediate = true;
      else if (!words.length && /^\d+$/.test(t)) limit = Number(t);
      else words.push(w);
    }

    const body = words.join(" ").trim();
    if (!body) {
      return await client.sendMessage(
        sender,
        { text: `❌ Teks promosi kosong.\n\nContoh: *${p}bcgc Promo bot murah, cek link!*` },
        { quoted: message }
      );
    }

    if (immediate) {
      runBroadcast(client, sender, message, body, limit).catch((err) =>
        logger.error(`bcgc: ${err.message}`)
      );
      return;
    }

    return await preview(client, sender, message, body, limit, p);
  } catch (err) {
    logger.error("bcgc:", err);
    return client.sendMessage(sender, { text: `❌ Error: ${err.message}` }, { quoted: message });
  }
};

module.exports = {
  name: "bcgc",
  command: ["bcgc", "broadcastgc", "bcgrup"],
  category: "owner",
  description: "Broadcast promosi ke semua grup (owner)",
  visible: true,
  execute,
  // internal untuk pengujian
  _internal: { buildText, adFooter, buildPayload, runBroadcast, preview, pending, delayMs }
};
