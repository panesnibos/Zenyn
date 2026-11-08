const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const { unwrap, contextOf } = require("./featureutil");

const findMedia = (message, kinds) => {
  const own = unwrap(message.message);
  const quoted = unwrap(contextOf(message).quotedMessage);
  for (const body of [quoted, own]) {
    for (const kind of kinds) {
      const node = body[`${kind}Message`];
      if (node) return { kind, node };
    }
  }
  return null;
};

const download = async (found, { maxBytes = 12 * 1024 * 1024, timeout = 30000 } = {}) => {
  if (!found) throw new Error("Media tidak ditemukan.");
  if (Number(found.node.fileLength || 0) > maxBytes) throw new Error(`Media maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
  let stream, expired = false;
  let timer;
  const work = async () => {
    stream = await downloadContentFromMessage(found.node, found.kind);
    if (expired) { stream.destroy(); throw new Error("Unduhan timeout."); }
    let size = 0;
    const chunks = [];
    for await (const chunk of stream) {
      size += chunk.length;
      if (size > maxBytes) throw new Error(`Media maksimal ${Math.floor(maxBytes / 1024 / 1024)} MB.`);
      chunks.push(chunk);
    }
    if (!size) throw new Error("Media kosong atau gagal diunduh.");
    return Buffer.concat(chunks, size);
  };
  try {
    return await Promise.race([
      work(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          stream?.destroy();
          reject(new Error("Unduhan media timeout. Coba kirim ulang medianya."));
        }, timeout);
        timer.unref?.();
      })
    ]);
  } finally { clearTimeout(timer); stream?.destroy(); }
};

module.exports = { findMedia, download };
