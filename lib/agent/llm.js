// lib/agent/llm.js — klien chat completions OpenAI-compatible (free.ai.id).
// Key HANYA dikirim ke base URL sebagai header Bearer. Jangan pernah commit key.
const fetch = require("node-fetch");

const DEFAULT_BASE = "https://free.ai.id/v1";
const DEFAULT_MODELS = ["prem/deepseek-v4.1-flash-1017", "prem/minimax-m2.7", "prem/glm-5.3-flash"];

const apiKey = () => String(process.env.AGENT_API_KEY || "").trim();
const enabled = () => !!apiKey();
const base = () => String(process.env.AGENT_BASE || DEFAULT_BASE).replace(/\/+$/, "");

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || lo));

// urutan rotasi: dipakai saat model kena billing/limit sesaat
const models = () => {
  const raw = String(process.env.AGENT_MODELS || "").trim();
  if (raw) return raw.split(",").map((s) => s.trim()).filter(Boolean);
  const single = [process.env.AGENT_MODEL, process.env.AGENT_MODEL_FALLBACK]
    .map((m) => String(m || "").trim())
    .filter(Boolean);
  return single.length ? single : DEFAULT_MODELS;
};

const model = () => models()[0];
const retryMax = () => clamp(process.env.AGENT_RETRY_MAX || 50, 1, 200);
const retryDelayMs = () => clamp(process.env.AGENT_RETRY_DELAY_MS || 15000, 200, 300000);

const RETRYABLE =
  /insufficient_funds|rate.?limit|too many requests|HTTP 5\d\d|HTTP 429|timeout|ECONNRESET|ETIMEDOUT|socket hang up|upstream unavailable|fetch failed/i;
const FATAL = /invalid.?api.?key|unauthorized|HTTP 401|HTTP 403|no auth|missing.*key/i;
const MISSING_MODEL = /model.*(not found|does not exist|unknown|unavailable)|HTTP 404/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chatOnce = async (messages, { timeoutMs, maxTokens, temperature, model: useModel }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${base()}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ model: useModel, messages, max_tokens: maxTokens, temperature })
    });

    const raw = await res.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }

    if (!res.ok) {
      const detail = body?.error?.message || body?.message || raw.slice(0, 200);
      throw new Error(String(detail || `HTTP ${res.status}`).slice(0, 300));
    }

    const content = body?.choices?.[0]?.message?.content;
    if (!content) throw new Error("balasan model kosong");
    return String(content);
  } catch (err) {
    if (err.name === "AbortError") throw new Error(`timeout ${Math.round(timeoutMs / 1000)}s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
};

// Retry hanya untuk gangguan sesaat; error fatal (key salah) langsung dilempar.
// Tiap percobaan pindah model (round-robin) supaya model yang kena billing ditinggal.
const chat = async (messages, opts = {}) => {
  if (!enabled()) throw new Error("AGENT_API_KEY belum diatur di .env");

  const props = {
    timeoutMs: opts.timeoutMs || 120000,
    maxTokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.2
  };
  const max = clamp(opts.attempts || retryMax(), 1, 200);
  const delay = clamp(opts.delayMs ?? retryDelayMs(), 0, 300000);
  const deadline = Number(opts.deadline) || 0;
  const pool = models();

  let attempt = 0;
  let last;
  let used = "";

  while (attempt < max) {
    if (deadline && Date.now() > deadline) {
      throw new Error(`batas waktu habis di percobaan ${attempt}/${max} (${last?.message || "-"})`);
    }

    used = pool[attempt % pool.length];
    attempt++;

    try {
      return await chatOnce(messages, { ...props, model: used });
    } catch (err) {
      last = err;
      const msg = String(err.message || "");

      if (MISSING_MODEL.test(msg)) {
        const idx = pool.indexOf(used);
        if (idx >= 0 && pool.length > 1) pool.splice(idx, 1); // model hilang, buang dari rotasi
        if (!pool.length) throw err;
        attempt--;
        continue;
      }

      if (FATAL.test(msg) || !RETRYABLE.test(msg)) throw err;

      if (typeof opts.onRetry === "function") opts.onRetry({ attempt, max, model: used, error: msg });
      if (attempt >= max) break;
      await sleep(delay);
    }
  }

  throw new Error(`${last?.message || "gagal"} — ${attempt} percobaan (${pool.join(" → ")})`);
};

module.exports = {
  chat,
  enabled,
  base,
  model,
  models,
  retryMax,
  retryDelayMs,
  apiKey,
  DEFAULT_MODELS
};
