// Render kartu `.iqc` memakai SPA asli 3scode/iqc-generator (vendor/iqc-generator/dist)
// lewat Chromium headless. Chromium di-spawn per render, di-throttle cpulimit,
// dan hanya dipakai kalau CPU box sedang longgar — kalau tidak, caller fallback
// ke renderer canvas (lib/iqc.js).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DIST = process.env.IQC_DIST || path.join(ROOT, "vendor/iqc-generator/dist");
const SCRIPT = path.join(ROOT, "scripts/iqc-render.js");
const SCALE = Number(process.env.IQC_SCALE || 2);
const TIMEOUT_MS = Number(process.env.IQC_TIMEOUT_MS || 20000);
const CPU_PERCENT = Math.min(95, Math.max(20, Number(process.env.IQC_CPU_PERCENT || 70)));
const CPU_MAX = Math.min(95, Math.max(10, Number(process.env.IQC_CPU_MAX || 70))); // batas pemakaian CPU saat mau render

let server = null;

// SPA statis untuk Chromium: /export harus balas index.html
const startServer = () =>
  new Promise((resolve, reject) => {
    if (server) return resolve(server.address().port);
    const http = require("http");
    const MIME = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript",
      ".css": "text/css",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".ico": "image/x-icon",
    };
    server = http.createServer((req, res) => {
      const p = new URL(req.url, "http://x").pathname;
      let file = path.join(DIST, p === "/" ? "index.html" : p);
      try {
        if (!fs.statSync(file).isFile()) throw new Error("not a file");
      } catch {
        file = path.join(DIST, "index.html");
      }
      res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });

const has = (name) => {
  const dirs = String(process.env.PATH || "").split(path.delimiter);
  return dirs.some((d) => {
    try {
      fs.accessSync(path.join(d, name), fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  });
};

// loadavg tertinggal beberapa menit; sampling /proc/stat memberi kondisi CPU saat ini
const cpuBusy = async (ms = 150) => {
  const sample = () => {
    const l = fs.readFileSync("/proc/stat", "utf8").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
    return { idle: (l[3] || 0) + (l[4] || 0), total: l.reduce((a, b) => a + b, 0) };
  };
  const a = sample();
  await new Promise((r) => setTimeout(r, ms));
  const b = sample();
  const total = b.total - a.total;
  return total > 0 ? Math.round((1 - (b.idle - a.idle) / total) * 100) : 0;
};

// status mesin: jangan tambah beban kalau CPU sudah terpakai > IQC_CPU_MAX
const engineStatus = async () => {
  const problems = [];
  if (!fs.existsSync(path.join(DIST, "index.html"))) problems.push("dist belum dibangun");
  if (!fs.existsSync(path.join(ROOT, "node_modules/puppeteer-core"))) problems.push("puppeteer-core belum terpasang");
  if (!fs.existsSync(path.join(ROOT, "node_modules/@sparticuz/chromium"))) problems.push("chromium belum terpasang");
  if (!problems.length && process.env.IQC_FORCE !== "1") {
    const busy = await cpuBusy();
    if (busy > CPU_MAX) problems.push(`cpu ${busy}% > ${CPU_MAX}%`);
  }
  return { ok: problems.length === 0, problems };
};

// ExportState yang dibaca src/pages/ExportPage.tsx dari location.hash
const buildState = (text, { contact = "Zenyn", outgoing = false, time, battery = 85, carrier = "Axis" } = {}) => ({
  messages: [{ id: "msg_1", text: String(text), sender: outgoing ? "you" : "other" }],
  senderName: String(contact || "Zenyn").slice(0, 24) || "Zenyn",
  time: time || clock(),
  battery,
  carrier,
  quoteMessageId: "msg_1",
  bgType: "gradient",
  bgColor: "#1a1a2e",
  bgGradientEnd: "#16213e",
  bgImage: null,
  layout: "9:16",
  showWifi: true,
  airplaneMode: false,
  showContact: true,
  contactAvatar: null,
  headerColor: "#075E54",
  chatMode: "personal",
  groupName: "Grup",
  groupAvatar: null,
  memberCount: 0,
  showSenderName: true,
  isMuted: false,
  isVerified: false,
});

const clock = () =>
  new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .replace(":", ".");

const renderQuote = async (state) => {
  const status = await engineStatus();
  if (!status.ok) {
    const err = new Error(`engine chromium tidak dipakai (${status.problems.join(", ")})`);
    err.code = "IQC_ENGINE_BUSY";
    throw err;
  }

  const port = await startServer();
  const out = path.join(os.tmpdir(), `iqc-${process.pid}-${Date.now()}.png`);
  const hash = Buffer.from(JSON.stringify(state)).toString("base64");
  const url = `http://127.0.0.1:${port}/export#${hash}`;

  const nodeArgs = [SCRIPT, url, out, String(SCALE)];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, nodeArgs, { stdio: ["ignore", "ignore", "pipe"], detached: true });
      // cpulimit men-throttle PID anak + turunannya (Chromium), bukan node lain di server
      let limiter = null;
      if (has("cpulimit")) {
        limiter = spawn("cpulimit", ["-l", String(CPU_PERCENT), "-p", String(child.pid), "-i", "-m", "-z", "-q"], {
          stdio: "ignore",
          detached: true,
        });
        limiter.on("error", () => {});
      }
      let stderr = "";
      const kill = () => {
        for (const p of [limiter, child]) {
          if (!p || p.killed) continue;
          try { process.kill(-p.pid, "SIGKILL"); } catch { try { p.kill("SIGKILL"); } catch {} }
        }
      };
      const timer = setTimeout(() => {
        kill();
        reject(new Error(`render timeout ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);
      child.stderr.on("data", (c) => { stderr += c.toString(); });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (limiter && !limiter.killed) { try { process.kill(-limiter.pid, "SIGKILL"); } catch { try { limiter.kill("SIGKILL"); } catch {} } }
        if (code === 0) resolve();
        else reject(new Error(`render exit ${code}: ${stderr.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 160)}`));
      });
    });
    return fs.readFileSync(out);
  } finally {
    try { fs.unlinkSync(out); } catch {}
  }
};

module.exports = { renderQuote, buildState, engineStatus, distDir: DIST, scale: SCALE };
