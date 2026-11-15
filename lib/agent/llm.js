// lib/agent/llm.js — klien chat completions OpenAI-compatible (free.ai.id).
// Key HANYA dikirim ke base URL sebagai header Bearer. Jangan pernah commit key.
const fetch = require("node-fetch");

const DEFAULT_BASE = "https://free.ai.id/v1";
const DEFAULT_MODEL = "prem/deepseek-v4.1-flash-1017";

const apiKey = () => String(process.env.AGENT_API_KEY || "").trim();
const enabled = () => !!apiKey();
const base = () => String(process.env.AGENT_BASE || DEFAULT_BASE).replace(/\/+$/, "");
const model = () => String(process.env.AGENT_MODEL || DEFAULT_MODEL).trim();
// model utama free.ai.id kadang balas "insufficient_funds" sesaat -> ada cadangan gratis
const models = () => {
  const list = [model()];
  const fb = String(process.env.AGENT_MODEL_FALLBACK || "ovh-free/gpt-oss-120b").trim();
  if (fb && !list.includes(fb)) list.push(fb);
  return list;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// upstream free.ai.id kadang balas 429/5xx atau "Billing: insufficient_funds" sesaat
const RETRYABLE = /insufficient_funds|rate.?limit|timeout|HTTP 5\d\d|HTTP 429|ECONNRESET|ETIMEDOUT|socket hang up/i;

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
      throw new Error(String(body?.error?.message || `HTTP ${res.status}`).slice(0, 300));
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

const chat = async (messages, opts = {}) => {
  if (!enabled()) throw new Error("AGENT_API_KEY belum diatur di .env");

  const props = {
    timeoutMs: opts.timeoutMs || 120000,
    maxTokens: opts.maxTokens || 4096,
    temperature: opts.temperature ?? 0.2
  };

  let last;
  for (const useModel of models()) {
    for (let i = 1; i <= 2; i++) {
      try {
        return await chatOnce(messages, { ...props, model: useModel });
      } catch (err) {
        last = err;
        if (!RETRYABLE.test(err.message)) return Promise.reject(err);
        if (i === 2) break;
        await sleep(1500 * i);
      }
    }
  }
  throw last;
};

module.exports = { chat, enabled, base, model, models, apiKey, DEFAULT_MODEL };
