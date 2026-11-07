const fetch = require("node-fetch");
const sharp = require("sharp");
const config = require("../config");
const logger = require("./logger");

const TIMEOUT_MS = 60000;
const IMAGE_TIMEOUT_MS = 90000;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const IMAGE_MAX_DIM = 1024;
const IMAGE_INPUT_DIM = 1024;
const IMAGE_OUTPUT_DIM = 1536;

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

const modelChain = () => {
  const primary = String(process.env.GEMINI_MODEL || config.aiModel || "").trim().replace(/^models\//, "");
  const fallbacks = (config.aiFallbackModels || []).map((m) => String(m).replace(/^models\//, ""));
  return [...new Set([primary, ...fallbacks].filter(Boolean))];
};

const apiUrl = (model) => `${config.aiApiBase}/${model}:generateContent`;

const interactionsUrl = () =>
  String(config.aiInteractionsBase || "https://generativelanguage.googleapis.com/v1beta/interactions");

const imageModelChain = () => {
  const primary = String(process.env.GEMINI_IMAGE_MODEL || config.aiImageModel || "").trim().replace(/^models\//, "");
  const fallbacks = (config.aiImageFallbackModels || []).map((m) => String(m).replace(/^models\//, ""));
  return [...new Set([primary, ...fallbacks].filter(Boolean))];
};

const toWaJpeg = (buffer) =>
  sharp(buffer)
    .resize({ width: IMAGE_OUTPUT_DIM, height: IMAGE_OUTPUT_DIM, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 88 })
    .toBuffer();

const imageInputParts = async ({ prompt, media }) => {
  const parts = [];
  const text = String(prompt || "").trim();
  if (text) parts.push({ text });

  if (media?.buffer?.length) {
    if (media.kind === "document" && !String(media.mimetype || "").startsWith("image/")) {
      throw new Error("Edit gambar hanya menerima gambar, bukan dokumen");
    }

    const buf = await sharp(media.buffer)
      .resize({ width: IMAGE_INPUT_DIM, height: IMAGE_INPUT_DIM, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();

    parts.push({ inline_data: { mime_type: "image/jpeg", data: buf.toString("base64") } });
  }

  if (!parts.length) throw new Error("Tidak ada prompt atau gambar");
  return parts;
};

const parseImageResponse = (json) => {
  const candidate = json?.candidates?.[0];
  const parts = candidate?.content?.parts || [];

  let image = null;
  let text = "";

  for (const part of parts) {
    const inline = part?.inlineData || part?.inline_data;
    if (!image && inline?.data) {
      image = {
        buffer: Buffer.from(inline.data, "base64"),
        mime: inline.mimeType || inline.mime_type || "image/png"
      };
    }
    if (part?.text) text += part.text;
  }

  return { image, text: text.trim(), finishReason: candidate?.finishReason };
};

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

const buildError = (status, body, model) => {
  let err;
  if (status === 429) err = new Error("Kuota AI habis, coba lagi nanti");
  else if (status === 400 && /safety|blocked/i.test(body)) err = new Error("Pertanyaan tidak bisa dijawab (diblokir filter)");
  else if (status === 401 || status === 403) err = new Error("API key AI tidak valid");
  else if (status === 404) err = new Error(`Model AI tidak tersedia (${model})`);
  else if (status === 503) err = new Error("Server AI sedang sibuk, coba lagi");
  else err = new Error(`AI gagal merespons (HTTP ${status})`);
  err.status = status;
  err.detail = body;
  return err;
};

const postModel = async ({ model, key, parts }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${apiUrl(model)}?key=${encodeURIComponent(key)}`, {
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
      throw buildError(res.status, detail, model);
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

const ask = async ({ prompt, media } = {}) => {
  const key = apiKey();
  if (!key) throw new Error("AI belum dikonfigurasi oleh owner");

  const question = String(prompt || "").trim();
  const parts = [];

  if (question) parts.push({ text: question });

  const inline = await toInlineData(media);
  if (inline) parts.push({ inline_data: inline });

  if (!parts.length) throw new Error("Tidak ada pertanyaan atau media");

  const chain = modelChain();
  let lastError = null;

  for (const model of chain) {
    try {
      return await postModel({ model, key, parts });
    } catch (err) {
      lastError = err;
      const retryable = err.status === 503 || err.status === 404;
      if (!retryable) throw err;
    }
  }

  throw lastError || new Error("AI tidak tersedia");
};

const postImageModel = async ({ model, key, parts }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const res = await fetch(`${apiUrl(model)}?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
      }),
      signal: controller.signal
    });

    const raw = await res.text();

    if (!res.ok) {
      let detail = raw;
      try {
        detail = JSON.parse(raw)?.error?.message || raw;
      } catch {}
      throw buildError(res.status, detail, model);
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Respons AI gambar tidak bisa dibaca");
    }

    if (json?.promptFeedback?.blockReason) throw new Error("Prompt gambar diblokir filter AI");

    const { image, text, finishReason } = parseImageResponse(json);

    if (!image) {
      const err = new Error(
        text ? "AI hanya menjawab teks, tidak menghasilkan gambar" : "AI tidak menghasilkan gambar"
      );
      err.text = text;
      err.status = 200;
      err.finishReason = finishReason;
      throw err;
    }

    return { buffer: await toWaJpeg(image.buffer), mime: "image/jpeg", text };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Pembuatan gambar timeout, coba lagi");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const postInteractions = async ({ model, key, parts }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const input = parts.map((part) => {
      if (part.text) return { type: "text", text: part.text };
      const inline = part.inline_data || part.inlineData || {};
      return { type: "image", mime_type: inline.mime_type || inline.mimeType, data: inline.data };
    });

    const res = await fetch(interactionsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": key,
        "Api-Revision": "2026-05-20"
      },
      body: JSON.stringify({ model, input }),
      signal: controller.signal
    });

    const raw = await res.text();

    if (!res.ok) {
      let detail = raw;
      try {
        detail = JSON.parse(raw)?.error?.message || raw;
      } catch {}
      throw buildError(res.status, detail, model);
    }

    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Respons AI gambar tidak bisa dibaca");
    }

    const node = json?.output_image || json?.outputImage || json?.interaction?.output_image;
    const data = node?.data;
    if (!data) {
      const err = new Error("AI tidak menghasilkan gambar");
      err.text = String(json?.output_text || json?.outputText || "").trim();
      throw err;
    }

    return { buffer: await toWaJpeg(Buffer.from(data, "base64")), mime: "image/jpeg", text: "" };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Pembuatan gambar timeout, coba lagi");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const UNSUPPORTED_MODEL_STATUS = new Set([400, 404, 405, 501]);

const fallbackProvider = () => {
  const value = String(process.env.GEMINI_IMAGE_FALLBACK || config.aiImageFallbackProvider || "")
    .trim()
    .toLowerCase();

  if (!value || ["none", "off", "false", "0"].includes(value)) return null;
  return value;
};

const fallbackBase = () =>
  String(config.aiImageFallbackBase || "https://image.pollinations.ai/prompt").replace(/\/+$/, "");

const pollinationsImage = async ({ prompt, model, width = 1024, height = 1024 }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);

  try {
    const query = [
      `width=${width}`,
      `height=${height}`,
      "nologo=true",
      model ? `model=${encodeURIComponent(model)}` : "",
      `seed=${Math.floor(Math.random() * 1e9)}`
    ]
      .filter(Boolean)
      .join("&");

    const res = await fetch(`${fallbackBase()}/${encodeURIComponent(prompt)}?${query}`, {
      signal: controller.signal
    });

    if (!res.ok) throw new Error(`Provider gambar cadangan gagal (HTTP ${res.status})`);

    const type = String(res.headers?.get?.("content-type") || "");
    if (type && !type.startsWith("image/")) {
      throw new Error(`Provider gambar cadangan balas ${type}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error("Provider gambar cadangan balas data kosong");

    return { buffer: await toWaJpeg(buf), mime: "image/jpeg" };
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Provider gambar cadangan timeout, coba lagi");
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

const generateImage = async ({ prompt, media, aspectRatio } = {}) => {
  const key = apiKey();
  if (!key) throw new Error("AI belum dikonfigurasi oleh owner");

  const question = String(prompt || "").trim();
  if (!question && !media?.buffer?.length) throw new Error("Prompt gambar kosong");

  const parts = await imageInputParts({ prompt: question, media });
  const chain = imageModelChain();
  let lastError = null;

  for (const model of chain) {
    try {
      return { ...(await postImageModel({ model, key, parts, aspectRatio })), provider: "gemini", model };
    } catch (err) {
      lastError = err;

      if (UNSUPPORTED_MODEL_STATUS.has(err.status)) {
        try {
          return { ...(await postInteractions({ model, key, parts })), provider: "gemini", model };
        } catch (fallbackErr) {
          lastError = fallbackErr;
        }
      }

      const retryable = err.status === 404 || err.status === 503;
      if (!retryable) break;
    }
  }

  const provider = fallbackProvider();

  if (provider === "pollinations") {
    if (media?.buffer?.length) {
      const err = new Error(
        "Kuota model gambar Gemini habis dan provider cadangan tidak bisa mengedit gambar. Coba lagi nanti, atau set GEMINI_IMAGE_MODEL ke model gambar lain."
      );
      err.status = lastError?.status;
      throw err;
    }

    logger.warn(`ai image: Gemini gagal (${lastError?.status || lastError?.message}), fallback ke ${provider}`);
    const model = String(config.aiImageFallbackModel || "");
    const out = await pollinationsImage({ prompt: question, model });
    return { ...out, text: "", provider, model };
  }

  if (lastError) {
    if (lastError.status === 429) {
      lastError.message =
        "Kuota model gambar Gemini habis (limit API key). Aktifkan billing di project Gemini, atau set GEMINI_IMAGE_MODEL ke model gambar lain.";
    } else if (lastError.status === 404) {
      lastError.message = `${lastError.message}. Set aiImageModel di config.js atau GEMINI_IMAGE_MODEL`;
    }
    throw lastError;
  }

  throw new Error("AI gambar tidak tersedia");
};

module.exports = {
  ask,
  generateImage,
  isConfigured,
  modelChain,
  imageModelChain,
  SUPPORTED_DOCS,
  MAX_MEDIA_BYTES
};
