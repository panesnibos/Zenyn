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
const LOAD_MAX = Number(process.env.IQC_LOAD_MAX || 0.7); // 70% dari 1 core

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

// status mesin: jangan tambah beban kalau core sudah terpakai > LOAD_MAX
const engineStatus = () => {
  const problems = [];
  if (!fs.existsSync(path.join(DIST, "index.html"))) problems.push("dist belum dibangun");
  if (!fs.existsSync(path.join(ROOT, "node_modules/puppeteer-core"))) problems.push("puppeteer-core belum terpasang");
  if (!fs.existsSync(path.join(ROOT, "node_modules/@sparticuz/chromium"))) problems.push("chromium belum terpasang");
  const cores = os.cpus().length || 1;
  const load = os.loadavg()[0];
  if (load > LOAD_MAX * cores) problems.push(`load ${load.toFixed(2)} > ${(LOAD_MAX * cores).toFixed(2)}`);
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

const renderQuote = async (state) => {  const status = engineStatus();
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
  const useLimit = has("cpulimit");
  const cmd = useLimit ? "cpulimit" : "nice";
  const args = useLimit
    ? [`-l`, String(CPU_PERCENT), "-i", "--", process.execPath, ...nodeArgs]
    : ["-n", "10", process.execPath, ...nodeArgs];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"], detached: true });
      let stderr = "";
      const kill = () => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try { child.kill("SIGKILL"); } catch {}
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
