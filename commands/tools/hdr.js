// commands/tools/hdr.js — enhance foto ala HD/HDR tanpa API (sharp).
// Format: .hdr | .hdr soft | .hdr strong  (reply foto / caption foto)
const sharp = require("sharp");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const { findMedia, download } = require("../../lib/mediautil");
const { db } = require("../../lib/rpgdb");
const { getUserId } = require("../../lib/rpgutil");
const { isOwner } = require("../../lib/owner");
const { statusOf } = require("../../lib/rpglimit");

const MAX_IN = 10 * 1024 * 1024;
const MAX_OUT = 5 * 1024 * 1024;
const MAX_WIDTH = 2560;

// tiga rasa: soft untuk foto yang sudah kontras, strong untuk foto gelap/datar
const MODES = {
  soft: { normalize: { lower: 2, upper: 98 }, sigma: 0.7, brightness: 1.03, saturation: 1.08 },
  normal: { normalize: { lower: 1, upper: 99 }, sigma: 1.1, brightness: 1.05, saturation: 1.18 },
  strong: { normalize: { lower: 0.5, upper: 99.5 }, sigma: 1.8, brightness: 1.08, saturation: 1.3 }
};

const encode = async (buffer, cfg, { width, quality }) =>
  sharp(buffer)
    .rotate()
    .resize({ width, kernel: "lanczos3" })
    .normalize(cfg.normalize)
    .sharpen({ sigma: cfg.sigma })
    .modulate({ brightness: cfg.brightness, saturation: cfg.saturation })
    .jpeg({ quality, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();

const process = async (buffer, { mode = "normal" } = {}) => {
  const cfg = MODES[mode] || MODES.normal;
  const meta = await sharp(buffer).metadata();
  const sourceWidth = meta.width || 0;
  if (!sourceWidth) throw new Error("Ukuran foto tidak terbaca.");

  // 2x supaya detail naik, tapi tidak melebihi MAX_WIDTH
  let width = Math.min(MAX_WIDTH, Math.max(sourceWidth, Math.round(sourceWidth * 2)));

  let out = await encode(buffer, cfg, { width, quality: 92 });
  for (const quality of [85, 75]) {
    if (out.length <= MAX_OUT) break;
    out = await encode(buffer, cfg, { width, quality });
  }
  if (out.length > MAX_OUT) {
    width = Math.max(320, Math.round(width * 0.75));
    out = await encode(buffer, cfg, { width, quality: 70 });
  }

  return out;
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const mode = String(args[0] || "").toLowerCase();
  const found = findMedia(message, ["image"]);
  const useMode = ["soft", "strong"].includes(mode) ? mode : "normal";

  if (!found || !["", "soft", "strong", "normal", "hd"].includes(mode)) {
    await reply(
      client,
      message,
      `✨ *HDR / HD FOTO*\n\nReply foto (atau kirim foto dengan caption), lalu:\n` +
        `• *${p}hdr* — enhance standar (2x, auto-level, tajam)\n` +
        `• *${p}hdr strong* — untuk foto gelap/datar\n` +
        `• *${p}hdr soft* — untuk foto yang sudah kontras\n\n` +
        "Proses lokal di server, tanpa upload ke layanan lain. Biaya 1 limit."
    );
    return false;
  }

  const buffer = await download(found, { maxBytes: MAX_IN });

  // varian strong/soft khusus premium; mode default tetap gratis
  if (useMode !== "normal") {
    const uid = getUserId(message);
    const user = uid ? db.getUser(uid, message.pushName || "Player") : null;
    const premium = isOwner(message) || (user && statusOf(user) !== "User");
    if (!premium) {
      await reply(
        client,
        message,
        `🔒 *HDR ${useMode.toUpperCase()} = PREMIUM*\n\nMode *${p}hdr* tetap gratis (1 limit).\nVarian *${useMode}* khusus Premium/Donatur: *${p}premium*`
      );
      return false;
    }
  }

  const out = await process(buffer, { mode: useMode });
  const meta = await sharp(out).metadata();

  return client.sendMessage(
    message.key.remoteJid,
    {
      image: out,
      caption: `✨ HDR ${useMode === "normal" ? "" : useMode + " "}· ${meta.width}x${meta.height} · ${Math.round(out.length / 1024)} KB`.replace("  ", " ")
    },
    { quoted: message }
  );
};

module.exports = {
  name: "hdr",
  command: ["hdr", "hd", "enhance"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Enhance foto ala HD/HDR (2x, auto-level, tajam) — reply foto",
  execute: guarded("hdr", execute),
  _internal: { process, MODES, MAX_IN, MAX_OUT, MAX_WIDTH }
};
