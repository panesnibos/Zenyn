// commands/tools/tts.js — teks jadi voice note (Google TTS + ffmpeg).
const fetch = require("node-fetch");
const { guarded, reply } = require("../../lib/featureutil");
const { getPrefix } = require("../../lib/prefix");
const { audioToVoice } = require("../../lib/voice");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
const MAX_CHARS = 300;
const TIMEOUT_MS = 15000;
const LANG = process.env.TTS_LANG || "id";

const speak = async (text, { fetchImpl = fetch } = {}) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  timer.unref?.();
  try {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(LANG) +
      "&q=" +
      encodeURIComponent(text);
    const res = await fetchImpl(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, referer: "https://translate.google.com/", accept: "audio/mpeg,*/*" }
    });
    if (!res.ok) throw new Error(`TTS menolak permintaan (HTTP ${res.status}).`);
    const buffer = typeof res.buffer === "function" ? await res.buffer() : Buffer.from(await res.arrayBuffer());
    if (!buffer?.length || buffer.length < 1000) throw new Error("TTS tidak mengembalikan audio.");
    if (buffer.length > 5 * 1024 * 1024) throw new Error("Audio TTS terlalu besar.");
    return buffer;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("TTS timeout. Coba lagi.");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const execute = async (client, message, args) => {
  const p = getPrefix(message);
  const text = args.join(" ").replace(/\s+/g, " ").trim();

  if (!text) {
    await reply(client, message, `🔊 Format: *${p}tts <teks>*\nContoh: ${p}tts halo semuanya\nMaksimal ${MAX_CHARS} karakter (bahasa: ${LANG}).`);
    return false;
  }
  if (text.length > MAX_CHARS) throw new Error(`Teks maksimal ${MAX_CHARS} karakter.`);

  const mp3 = await speak(text);
  const voice = await audioToVoice(mp3);

  return client.sendMessage(
    message.key.remoteJid,
    { audio: voice, mimetype: "audio/ogg; codecs=opus", ptt: true },
    { quoted: message }
  );
};

module.exports = {
  name: "tts",
  command: ["tts", "say", "ucapkan"],
  category: "tools",
  visible: true,
  limit: 1,
  description: "Teks jadi voice note (Google TTS, maks 300 karakter)",
  execute: guarded("tts", execute),
  _internal: { speak, MAX_CHARS }
};
