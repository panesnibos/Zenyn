const fetch = require("node-fetch");
const sharp = require("sharp");
const config = require("../config");

const TIMEOUT_MS = 60000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const IMAGE_MAX_DIM = 1024;

const SUPPORTED_DOCS = new Set([
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/html",
  "text/markdown",
  "application/json"
]);

const apiKey = () => String(process.env.GEMINI_API_KEY || "").trim();

const isConfigured = () => !!apiKey();

const toInlineData = async (media) => {
  if (!media || !media.buffer?.length) return null;

  if (media.kind === "image") {
    const out = await sharp(media.buffer)
      .resize({ width: IMAGE_MAX_DIM, height: IMAGE_MAX_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    return { mime_type: "image/jpeg", data: out.toString("base64") };
  }

  if (media.kind === "document") {
    const mime = String(media.mimetype || "").toLowerCase();
    if (!SUPPORTED_DOCS.has(mime)) {
      throw new Error(`Tipe dokumen ${mime || "tidak dikenal"} belum didukung`);
    }
    if (media.buffer.length > MAX_MEDIA_BYTES) {
      throw new Error("Dokumen terlalu besar (maks 4 MB)");
    }
    return { mime_type: mime, data: media.buffer.toString("base64") };
  }

  return null;
};

const errorFromStatus = (status, body) => {
  if (status === 429) return new Error("Kuota AI habis, coba lagi nanti");
  if (status === 400 && /safety|blocked/i.test(body)) return new Error("Pertanyaan tidak bisa dijawab (diblokir filter)");
  if (status === 401 || status === 403) return new Error("API key AI tidak valid");
  return new Error(`AI gagal merespons (HTTP ${status})`);
};

const ask = async ({ prompt, media } = {}) => {
  const key = apiKey();
  if (!key) throw new Error("AI belum dikonfigurasi oleh owner");

  const question = String(prompt || "").trim();
  const parts = [];

  if (question) parts.push({ text: question });

  const inline = await toInlineData(media);
  if (inline) parts.push({ inline_data: inline });

  if (!parts.length) throw new Error("Tidak ada pertanyaan atau media");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${config.aiApiUrl}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      }),
      signal: controller.signal
    });

    const text = await res.text();

    if (!res.ok) {
      let detail = text;
      try {
        detail = JSON.parse(text)?.error?.message || text;
      } catch {}
      const err = errorFromStatus(res.status, detail);
      err.detail = detail;
      throw err;
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Respons AI tidak bisa dibaca");
    }

    const candidate = json?.candidates?.[0];
    const blockReason = json?.promptFeedback?.blockReason;
    if (blockReason) throw new Error("Pertanyaan diblokir filter AI");

    const answer = (candidate?.content?.parts || [])
      .map((p) => p?.text || "")
      .join("")
      .trim();

    if (!answer) {
      if (candidate?.finishReason === "SAFETY") throw new Error("Jawaban diblokir filter AI");
      throw new Error("AI tidak memberi jawaban");
    }

    return answer;
  } catch (err) {
    if (err.name === "AbortError") throw new Error("AI timeout, coba lagi");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

module.exports = { ask, isConfigured, SUPPORTED_DOCS, MAX_MEDIA_BYTES };
