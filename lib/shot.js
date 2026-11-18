// lib/shot.js — screenshot web dengan Chromium (berat CPU, dipakai `.ss`).
// Chromium di-spawn per permintaan, dibatasi cpulimit, dan hanya dipakai kalau
// CPU mesin sedang longgar (gate sama seperti `.iqc`).
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/shot.js");
const TIMEOUT_MS = Number(process.env.SHOT_TIMEOUT_MS || 25000);
const CPU_PERCENT = Math.min(95, Math.max(20, Number(process.env.SHOT_CPU_PERCENT || process.env.IQC_CPU_PERCENT || 70)));
const CPU_MAX = Math.min(95, Math.max(10, Number(process.env.SHOT_CPU_MAX || process.env.IQC_CPU_MAX || 70)));

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

const engineStatus = async () => {
  const problems = [];
  if (!fs.existsSync(SCRIPT)) problems.push("scripts/shot.js hilang");
  if (!fs.existsSync(path.join(ROOT, "node_modules/puppeteer-core"))) problems.push("puppeteer-core belum terpasang");
  if (!fs.existsSync(path.join(ROOT, "node_modules/@sparticuz/chromium"))) problems.push("chromium belum terpasang");
  if (!problems.length && process.env.SHOT_FORCE !== "1") {
    const busy = await cpuBusy();
    if (busy > CPU_MAX) problems.push(`cpu ${busy}% > ${CPU_MAX}%`);
  }
  return { ok: problems.length === 0, problems };
};

const screenshot = async (url, { width = 1280 } = {}) => {
  const status = await engineStatus();
  if (!status.ok) throw new Error(`Screenshot tidak bisa jalan (${status.problems.join(", ")}).`);

  const out = path.join(os.tmpdir(), `shot-${process.pid}-${Date.now()}.png`);
  const nodeArgs = [SCRIPT, url, out, String(width)];

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, nodeArgs, { stdio: ["ignore", "ignore", "pipe"], detached: true });
      let limiter = null;
      if (has("cpulimit")) {
        limiter = spawn("cpulimit", ["-l", String(CPU_PERCENT), "-p", String(child.pid), "-i", "-m", "-z", "-q"], {
          stdio: "ignore",
          detached: true
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
        reject(new Error(`Screenshot timeout ${TIMEOUT_MS}ms.`));
      }, TIMEOUT_MS);
      child.stderr.on("data", (c) => { stderr += c.toString(); });
      child.on("error", (err) => { clearTimeout(timer); reject(err); });
      child.on("exit", (code) => {
        clearTimeout(timer);
        if (limiter && !limiter.killed) {
          try { process.kill(-limiter.pid, "SIGKILL"); } catch { try { limiter.kill("SIGKILL"); } catch {} }
        }
        if (code === 0) resolve();
        else reject(new Error(`Screenshot gagal: ${stderr.split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 160)}`));
      });
    });
    return fs.readFileSync(out);
  } finally {
    try { fs.unlinkSync(out); } catch {}
  }
};

module.exports = { screenshot, engineStatus };
