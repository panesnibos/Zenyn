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

const chunk = (type, data) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, "ascii");
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.alloc(1) : Buffer.alloc(0)]);
};

const withExif = (buf, { pack = config.botName, author = config.ownerContact } = {}) => {
  if (!isWebp(buf)) return buf;

  const chunks = [];
  let offset = 12;
  let width = 0;
  let height = 0;
  let flags = 0;
  let animated = false;

  while (offset + 8 <= buf.length) {
    const type = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    const body = buf.subarray(offset + 8, offset + 8 + size);

    if (type === "VP8X") {
      flags = body.readUInt8(0);
      width = body.readUIntLE(4, 3) + 1;
      height = body.readUIntLE(7, 3) + 1;
      animated = !!(flags & 0x02);
    } else if (type === "VP8 ") {
      width = body.readUInt16LE(6) & 0x3fff;
      height = body.readUInt16LE(8) & 0x3fff;
    } else if (type === "VP8L") {
      const bits = body.readUInt32LE(1);
      width = (bits & 0x3fff) + 1;
      height = ((bits >> 14) & 0x3fff) + 1;
      flags |= 0x10;
    } else if (type === "ANIM" || type === "ANMF") {
      animated = true;
      flags |= 0x02;
    }

    if (type !== "VP8X") chunks.push(chunk(type, body));
    offset = end;
  }

  if (!width || !height) return buf;

  const filtered = chunks.filter((c) => c.toString("ascii", 0, 4) !== "EXIF");
  const hasAnim = filtered.some((c) => c.toString("ascii", 0, 4) === "ANIM");
  if (animated && !hasAnim) return buf;

  const vp8x = Buffer.alloc(10);
  vp8x.writeUInt8(flags | 0x08 | (hasAnim ? 0x02 : 0), 0);
  vp8x.writeUIntLE(width - 1, 4, 3);
  vp8x.writeUIntLE(height - 1, 7, 3);

  const body = Buffer.concat([
    chunk("VP8X", vp8x),
    chunk("EXIF", buildExif(pack, author)),
    ...filtered
  ]);

  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(body.length + 4, 4);
  riff.write("WEBP", 8, "ascii");

  return Buffer.concat([riff, body]);
};

module.exports = { isWebp, buildExif, withExif };
