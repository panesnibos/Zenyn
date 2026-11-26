// commands/owner/bcgc.js — broadcast promosi ke semua grup (khusus owner).
// Format: .bcgc <teks>  ->  preview  ->  .bcgc go
//         .bcgc --yes <teks>  -> langsung kirim
//         .bcgc 5 <teks>      -> batasi 5 grup (tes)
const config = require("../../config");
const logger = require("../../lib/logger");
const sharp = require("sharp");
const { isOwner } = require("../../lib/owner");
const { getUserId } = require("../../lib/rpgutil");
const { getPrefix } = require("../../lib/prefix");
const { stamp } = require("../../lib/stamp");
const { findMedia, download } = require("../../lib/mediautil");
const gateway = require("../../lib/gateway");

const cfg = () => config.broadcast || {};
const delayMs = () => Math.max(0, Number(cfg().delayMs ?? 15000));
const buttonText = () => String(cfg().buttonText || "🔗 Link Group");
const confirmTtlMs = () => Math.max(1000, Number(cfg().confirmTtlMs ?? 300000));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const buildText = (body) => String(body || "").trim();

const FOOTER_LABEL = "Announcement";
const footerText = () => `${FOOTER_LABEL} ${stamp()}`;

const urlButton = () =>
  config.groupLink
    ? [
        {
          name: "cta_url",
          buttonParamsJson: JSON.stringify({ display_text: buttonText(), url: config.groupLink })
        }
      ]
    : [];

const buildPayload = (body, media) => {
  const text = buildText(body);
  if (media) {
    // gambar + caption: tombol native tidak bisa digabung caption biasa,
    // jadi link grup masuk ke caption (dipotong di batas caption WhatsApp).
    const caption = [text, footerText(), config.groupLink || ""].filter(Boolean).join("\n\n").slice(0, 1024);
    return { image: media.buffer, mimetype: media.mimetype, caption };
  }
  const buttons = urlButton();
  // waktu kirim masuk footer pesan (tip), bukan badan teks
  return buttons.length
    ? { text, tip: footerText(), interactiveButtons: buttons }
    : { text: `${text}\n\n${footerText()}\n\n${config.groupLink || ""}`.trim() };
};

// ---------- media broadcast: khusus gambar ----------
const MAX_MEDIA = 8 * 1024 * 1024;
const IMAGE_MAX_DIM = 1600;

const imageOf = async (message) => {
  const found = findMedia(message, ["image", "video", "document", "audio", "sticker"]);
  if (!found) return null;
  if (found.kind !== "image") {
    throw new Error("Hanya gambar yang bisa dibroadcast. Video, dokumen, audio, dan stiker tidak didukung.");
  }
  const node = found.node || {};
  if (Number(node.fileLength || 0) > MAX_MEDIA) throw new Error("Gambar terlalu besar (maks 8 MB).");

  const buffer = await download(found, { maxBytes: MAX_MEDIA });
  if (!buffer?.length) throw new Error("Gagal mengunduh gambar.");

  const meta = await sharp(buffer).metadata().catch(() => ({}));
  const needShrink = buffer.length > 5 * 1024 * 1024 || (meta.width || 0) > IMAGE_MAX_DIM || (meta.height || 0) > IMAGE_MAX_DIM;
  if (!needShrink) return { buffer, mimetype: "image/jpeg", size: buffer.length };

  const out = await sharp(buffer)
    .rotate()
    .resize({ width: IMAGE_MAX_DIM, height: IMAGE_MAX_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  return { buffer: out, mimetype: "image/jpeg", size: out.length };
};

const groupJids = async (client) => {
  const groups = await client.groupFetchAllParticipating();
  const gatewayJid = await gateway.resolve(client).catch(() => null);
  return Object.keys(groups || {})
    .filter((jid) => jid.endsWith("@g.us") && jid !== gatewayJid)
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
            await client.sendMessage(jid, { text: `${payload.text}\n\n${payload.tip || footerText()}\n\n${config.groupLink || ""}`.trim() });
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

const preview = async (client, sender, message, body, limit, p, media = null) => {
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
    media ? `Media    : 🖼 gambar (${Math.round(media.size / 1024)} KB)` : "",
    "",
    "────────────────",
    previewText,
    "────────────────",
    `Footer : ${footerText()}`,
    "",
    `Kirim  : *${p}bcgc go*`,
    `Batal  : *${p}bcgc batal*`,
    `Belaku : ${Math.round(confirmTtlMs() / 60000)} menit`,
    "",
    "Langsung tanpa preview: *" + `${p}bcgc --yes <teks>` + "*"
  ];

  await client.sendMessage(sender, { text: lines.join("\n") }, { quoted: message });

  const key = uidOf(message);
  pending.set(key, { body, limit, at: Date.now(), media });
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

const runBroadcast = async (client, sender, message, body, limit = 0, media = null) => {
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

  const payload = buildPayload(body, media);
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
    "Kirim promosi ke semua grup + tombol link grup.",
    "",
    `• *${p}bcgc <teks>* — preview dulu`,
    `• *${p}bcgc <teks>* sambil reply gambar — broadcast gambar + caption`,
    `• *${p}bcgc go* — kirim sesuai preview`,
    `• *${p}bcgc batal* — batalkan preview`,
    `• *${p}bcgc --yes <teks>* — kirim langsung`,
    `• *${p}bcgc 5 <teks>* — batasi 5 grup (tes)`,
    "",
    "Hanya gambar yang bisa dibroadcast (video/dokumen/stiker ditolak).",
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
      runBroadcast(client, sender, message, item.body, item.limit, item.media).catch((err) =>
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
    // gambar opsional: reply foto (atau caption foto) -> broadcast gambar + caption
    const media = await imageOf(message);

    if (!body && !media) {
      return await client.sendMessage(
        sender,
        { text: `❌ Teks promosi kosong.\n\nContoh: *${p}bcgc Promo bot murah, cek link!*\nAtau reply gambar lalu *${p}bcgc <caption>*` },
        { quoted: message }
      );
    }

    if (immediate) {
      runBroadcast(client, sender, message, body, limit, media).catch((err) =>
        logger.error(`bcgc: ${err.message}`)
      );
      return;
    }

    return await preview(client, sender, message, body, limit, p, media);
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
  _internal: { buildText, stamp, footerText, buildPayload, runBroadcast, preview, pending, delayMs }
};
