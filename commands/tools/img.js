// commands/tools/img.js — resize/crop/compress gambar (reply foto).
// Format: .img resize <lebar> | .img crop <w:h> | .img compress <1-100>
const sharp = require("sharp");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const { findMedia, download } = require("../../lib/mediautil");

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIM = 4096;

const parseRatio = (raw) => {
  const m = /^(\d{1,3}):(\d{1,3})$/.exec(String(raw || "").trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
};

const transform = async (buffer, sub, arg) => {
  if (sub === "resize") {
    const target = Number(arg);
    if (!Number.isInteger(target) || target < 16 || target > MAX_DIM) throw new Error(`Lebar harus 16-${MAX_DIM}.`);
    return sharp(buffer).rotate().resize({ width: target, withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  }

  if (sub === "compress") {
    const quality = Number(arg);
    if (!Number.isInteger(quality) || quality < 1 || quality > 100) throw new Error("Kualitas harus 1-100.");
    return sharp(buffer).rotate().jpeg({ quality, mozjpeg: true }).toBuffer();
  }

  if (sub === "crop") {
    const ratio = parseRatio(arg);
    if (!ratio) throw new Error("Rasio harus format w:h, contoh 1:1 atau 16:9.");
    const image = sharp(buffer).rotate();
    const meta = await image.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    if (!width || !height) throw new Error("Ukuran gambar tidak terbaca.");
    const targetRatio = ratio.w / ratio.h;
    let cropW = width;
    let cropH = Math.round(width / targetRatio);
    if (cropH > height) {
      cropH = height;
      cropW = Math.round(height * targetRatio);
    }
    return image
      .extract({
        left: Math.max(0, Math.floor((width - cropW) / 2)),
        top: Math.max(0, Math.floor((height - cropH) / 2)),
        width: Math.max(1, cropW),
        height: Math.max(1, cropH)
      })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  return null;
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const sub = String(args[0] || "").toLowerCase();
  const found = findMedia(message, ["image"]);

  if (!found || !["resize", "crop", "compress"].includes(sub)) {
    await reply(
      client,
      message,
      `🖼️ *EDIT GAMBAR*\n\nReply foto, lalu:\n• *${p}img resize 800* — lebar 800 px\n• *${p}img crop 1:1* — potong tengah rasio 1:1\n• *${p}img compress 60* — kualitas JPEG 60`
    );
    return false;
  }

  const buffer = await download(found, { maxBytes: MAX_BYTES });
  const out = await transform(buffer, sub, args[1]);
  if (!out) throw new Error("Perintah tidak dikenal.");

  const meta = await sharp(out).metadata();
  return client.sendMessage(
    message.key.remoteJid,
    { image: out, caption: `🖼️ ${sub} ${args[1] || ""} → ${meta.width}x${meta.height} (${Math.round(out.length / 1024)} KB)` },
    { quoted: message }
  );
};

module.exports = {
  name: "img",
  command: ["img", "gambar"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Resize/crop/compress gambar (reply foto)",
  execute: guarded("img", execute),
  _internal: { transform, parseRatio }
};
