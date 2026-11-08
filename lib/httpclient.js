const fetch = require("node-fetch");

const getJson = async (url, { timeout = 12000 } = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  timer.unref?.();
  try {
    const response = await fetch(url, {
      signal: controller.signal, size: 1024 * 1024, follow: 2,
      headers: { "User-Agent": "ZenynBot/1.0", Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Layanan merespons HTTP ${response.status}.`);
    return await response.json();
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Layanan timeout. Coba lagi nanti.");
    throw err;
  } finally { clearTimeout(timer); }
};

module.exports = { getJson };
