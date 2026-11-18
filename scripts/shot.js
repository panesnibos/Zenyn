// scripts/shot.js — screenshot halaman via Chromium headless.
// Dipanggil lib/shot.js: node scripts/shot.js <url> <out.png> [width] [height]
const fs = require("node:fs");

const [url, out, widthArg, heightArg] = process.argv.slice(2);
const width = Number(widthArg) || 1280;

const main = async () => {
  const { default: chromium } = await import("@sparticuz/chromium");
  const { default: puppeteer } = await import("puppeteer-core");

  const browser = await puppeteer.launch({
    args: [...chromium.args, "--disable-dev-shm-usage", "--disable-gpu", "--disable-accelerated-2d-canvas"],
    executablePath: await chromium.executablePath(),
    headless: true
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height: Number(heightArg) || 800, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await new Promise((r) => setTimeout(r, 1200));
    const docHeight = await page.evaluate(() => document.documentElement.scrollHeight).catch(() => 800);
    const height = Math.max(400, Math.min(Number(docHeight) || 800, 4000));
    await page.setViewport({ width, height, deviceScaleFactor: 1 });
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width, height },
      captureBeyondViewport: true,
      optimizeForSpeed: true
    });
    fs.writeFileSync(out, png);
  } finally {
    await browser.close().catch(() => {});
  }
};

main().catch((err) => {
  console.error(String((err && err.message) || err).slice(0, 300));
  process.exit(1);
});
