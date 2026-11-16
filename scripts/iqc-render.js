// Anak proses render `.iqc`: buka SPA 3scode/iqc-generator dan screenshot kartunya.
// Dipanggil lib/iqc-browser.js: node scripts/iqc-render.js <url> <out.png> [scale]
const fs = require("node:fs");

const [url, out, scaleArg] = process.argv.slice(2);
const scale = Number(scaleArg || 2);

const main = async () => {
  const { default: chromium } = await import("@sparticuz/chromium");
  const { default: puppeteer } = await import("puppeteer-core");

  const browser = await puppeteer.launch({
    args: [...chromium.args, "--disable-dev-shm-usage", "--disable-gpu", "--disable-accelerated-2d-canvas", "--disable-lcd-text"],
    executablePath: await chromium.executablePath(),
    headless: true,
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 440, height: 956, deviceScaleFactor: scale });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector("[data-export-root]", { timeout: 10000 });
    await page.evaluate(() => document.fonts.ready);
    await new Promise((r) => setTimeout(r, 250));
    const png = await page.screenshot({
      type: "png",
      clip: { x: 0, y: 0, width: 440, height: 956 },
      captureBeyondViewport: false,
      optimizeForSpeed: true,
    });
    fs.writeFileSync(out, png);
  } finally {
    await browser.close().catch(() => {});
  }
};

main().catch((err) => {
  console.error(String(err && err.message ? err.message : err).slice(0, 300));
  process.exit(1);
});
