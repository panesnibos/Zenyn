const config = require("../config");

const isWebp = (buf) =>
  Buffer.isBuffer(buf) && buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP";

const buildExif = (packname, author) =>
  Buffer.concat([
    Buffer.from("Exif\0\0", "binary"),
    Buffer.from(
      JSON.stringify({
        "sticker-pack-id": `zenyn-${packname}`.replace(/[^a-zA-Z0-9-_]/g, ""),
        "sticker-pack-name": packname,
        "sticker-pack-publisher": author,
        emojis: ["🎮"]
      })
    )
  ]);

const hasStickerExif = (buf) => {
  const idx = isWebp(buf) ? buf.indexOf(Buffer.from("Exif\0\0", "binary")) : -1;
  if (idx < 0) return false;
  return buf.toString("utf8", idx + 6, Math.min(buf.length, idx + 120)).includes("sticker-pack-name");
};

const riffChunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32LE(data.length, 4);
  const pad = data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0);
  return Buffer.concat([head, data, pad]);
};

const withExif = (buf, opts = {}) => {
  const pack = opts.pack || config.phoneNumber;
  const author = opts.author || `${config.botName} Bot`;

  if (!isWebp(buf) || hasStickerExif(buf)) return buf;

  let offset = 12;
  let width = 0;
  let height = 0;
  let flags = 0;
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
      flags |= 0x10;
    } else if (type === "ANIM" || type === "ANMF") {
      flags |= 0x02;
    }

    if (type !== "VP8X" && type !== "EXIF" && type !== "XMP ") {
      rest.push(riffChunk(type, body));
    }
    offset += 8 + size + (size % 2);
  }

  if (!width || !height || !rest.length) return buf;

  const exif = Buffer.concat([
    Buffer.from("Exif\0\0", "binary"),
    buildExif(pack, author).subarray(6)
  ]);

  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(flags | 0x08 | (rest.some((c) => c.toString("ascii", 0, 4) === "ANIM") ? 0x02 : 0), 0);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);

  const body = Buffer.concat([riffChunk("VP8X", vp8x), riffChunk("EXIF", exif), ...rest]);

  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write("WEBP", 8, "ascii");

  return Buffer.concat([riff, body]);
};

module.exports = { isWebp, buildExif, withExif, hasStickerExif };
