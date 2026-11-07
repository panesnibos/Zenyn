const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile, spawn } = require("child_process");
const sharp = require("sharp");
const config = require("../config");

const isWebp = (buf) =>
  Buffer.isBuffer(buf) && buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";

const buildExif = (packname, author) => {
  const data = JSON.stringify({
    "sticker-pack-id": crypto.randomUUID(),
    "sticker-pack-name": packname,
    "sticker-pack-publisher": author,
    emojis: ["🎮"]
  });

  const exif = Buffer.concat([
    Buffer.from([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
      0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x16, 0x00, 0x00, 0x00
    ]),
    Buffer.from(data, "utf8")
  ]);

  exif.writeUIntLE(Buffer.byteLength(data, "utf8"), 14, 4);

  return exif;
};

const hasStickerExif = (buf) =>
  isWebp(buf) && buf.includes(Buffer.from("sticker-pack-name", "utf8"));

const riffChunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, data, pad]);
};

const botNumber = () => String(config.phoneNumber || "").replace(/[^\d]/g, "");

const defaultPack = () => `wa.me/${botNumber()}`;

const withExif = (buf, opts = {}) => {
  const pack = opts.pack || defaultPack();
  const author = opts.author || `${config.botName} Bot`;

  if (!isWebp(buf) || hasStickerExif(buf)) return buf;

  let offset = 12;
  let width = 0;
  let height = 0;
  let flags = 0;
  let animated = false;
  const rest = [];

  while (offset + 8 <= buf.length) {
    const type = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (size <= 0 || offset + 8 + size > buf.length) break;

    const body = buf.subarray(offset + 8, offset + 8 + size);

    if (type === "VP8X" && body.length >= 10) {
      flags = body.readUInt8(0);
      width = body.readUIntLE(4, 3) + 1;
      height = body.readUIntLE(7, 3) + 1;
    } else if (type === "VP8 " && body.length >= 10) {
      width = body.readUInt16LE(6) & 0x3fff;
      height = body.readUInt16LE(8) & 0x3fff;
    } else if (type === "VP8L" && body.length >= 5) {
      const bits = body.readUInt32LE(1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
    } else if (type === "ANIM" || type === "ANMF") {
      animated = true;
    }

    if (type !== "VP8X" && type !== "EXIF" && type !== "XMP ") {
      rest.push({ type, body });
    }
    offset += 8 + size + (size % 2);
  }

  if (!width || !height || !rest.length) return buf;

  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(flags | 0x08 | (animated ? 0x02 : 0), 0);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);

  const body = Buffer.concat([
    riffChunk("VP8X", vp8x),
    ...rest.map((c) => riffChunk(c.type, c.body)),
    riffChunk("EXIF", buildExif(pack, author))
  ]);

  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write("WEBP", 8, "ascii");

  return Buffer.concat([riff, body]);
};

const exifEnabled = () => String(process.env.STICKER_EXIF ?? "1").toLowerCase() !== "0";

const safeWithExif = async (buf, opts) => {
  if (!exifEnabled()) return buf;

  const out = withExif(buf, opts);
  if (out === buf) return buf;

  try {
    const meta = await sharp(out, { animated: true }).metadata();
    if (!meta.width || meta.format !== "webp") return buf;
    return out;
  } catch {
    return buf;
  }
};

const imageToWebp = (buffer, { size = 512 } = {}) =>
  sharp(buffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .webp({ quality: 90, effort: 4 })
    .toBuffer();

const ffmpegPath = () => {
  try {
    return require("@ffmpeg-installer/ffmpeg").path;
  } catch {}
  try {
    return require("ffmpeg-static");
  } catch {}
  return null;
};

const videoToWebp = async (buffer, { size = 512, fps = 15, maxSeconds = 5 } = {}) => {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg tidak tersedia untuk konversi video");

  const id = crypto.randomBytes(8).toString("hex");
  const inPath = path.join(os.tmpdir(), `stk-${id}.mp4`);
  const outPath = path.join(os.tmpdir(), `stk-${id}.webp`);

  await fs.promises.writeFile(inPath, buffer);

  const cleanup = () => {
    fs.promises.unlink(inPath).catch(() => {});
    fs.promises.unlink(outPath).catch(() => {});
  };

  try {
    await new Promise((resolve, reject) => {
      execFile(
        bin,
        [
          "-y",
          "-i", inPath,
          "-t", String(maxSeconds),
          "-vf", `fps=${fps},scale=${size}:${size}:force_original_aspect_ratio=decrease,format=rgba,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`,
          "-c:v", "libwebp",
          "-lossless", "0",
          "-q:v", "60",
          "-loop", "0",
          "-preset", "default",
          "-an",
          "-vsync", "0",
          outPath
        ],
        { timeout: 90000 },
        (err) => (err ? reject(err) : resolve())
      );
    });

    const out = await fs.promises.readFile(outPath);
    if (!isWebp(out)) throw new Error("Konversi video gagal");
    return out;
  } finally {
    cleanup();
  }
};

const stickerToVideo = async (buffer, { fps = 15, maxSeconds = 10 } = {}) => {
  const bin = ffmpegPath();
  if (!bin) throw new Error("ffmpeg tidak tersedia untuk konversi video");

  const meta = await sharp(buffer, { animated: true }).metadata();
  const width = meta.width || 512;
  const pageHeight = meta.pageHeight || meta.height || width;
  const pages = Math.max(1, meta.pages || 1);

  const delays = Array.isArray(meta.delay) ? meta.delay.filter((d) => d > 0) : [];
  const avgDelay = delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : 1000 / fps;
  const sourceFps = Math.min(Math.max(Math.round(1000 / avgDelay) || fps, 1), 50);
  const outFps = Math.min(sourceFps, fps);

  const { data } = await sharp(buffer, { animated: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const frameSize = width * pageHeight * 4;
  const available = Math.floor(data.length / frameSize);
  const maxFrames = Math.max(1, Math.min(pages, Math.floor(outFps * maxSeconds)));
  const frames = Math.min(available, maxFrames);
  if (!frames) throw new Error("Sticker tidak punya frame yang bisa dikonversi");

  const raw = data.subarray(0, frames * frameSize);

  const id = crypto.randomBytes(8).toString("hex");
  const outPath = path.join(os.tmpdir(), `stv-${id}.mp4`);

  try {
    await new Promise((resolve, reject) => {
      const proc = spawn(
        bin,
        [
          "-y",
          "-f", "rawvideo",
          "-pix_fmt", "rgba",
          "-s", `${width}x${pageHeight}`,
          "-r", String(outFps),
          "-i", "-",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-an",
          outPath
        ],
        { stdio: ["pipe", "ignore", "pipe"] }
      );

      let err = "";
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Konversi sticker ke video timeout"));
      }, 90000);

      proc.stderr.on("data", (d) => {
        err += d.toString();
      });
      proc.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(err.split("\n").filter(Boolean).slice(-2).join(" ").trim() || `ffmpeg exit ${code}`));
      });

      proc.stdin.on("error", () => {});
      proc.stdin.end(raw);
    });

    const out = await fs.promises.readFile(outPath);
    if (!out.length) throw new Error("Konversi sticker ke video gagal");
    return out;
  } finally {
    fs.promises.unlink(outPath).catch(() => {});
  }
};

module.exports = { isWebp, buildExif, withExif, safeWithExif, hasStickerExif, imageToWebp, videoToWebp, stickerToVideo };
