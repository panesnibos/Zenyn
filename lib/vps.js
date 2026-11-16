// VPS health for the owner command. Local reads only: no IP, user, port or env
// value ever reaches the output.
const fs = require("fs");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const sh = promisify(execFile);
const read = (file, fallback = "") => {
  try { return fs.readFileSync(file, "utf8"); } catch { return fallback; }
};

const cpuSample = () => {
  const parts = read("/proc/stat").split("\n")[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = (parts[3] || 0) + (parts[4] || 0);
  return { idle, total: parts.reduce((a, b) => a + b, 0) };
};

const cpuPercent = async () => {
  const a = cpuSample();
  await new Promise((r) => setTimeout(r, 200));
  const b = cpuSample();
  const dt = b.total - a.total;
  return dt > 0 ? Math.round((1 - (b.idle - a.idle) / dt) * 100) : 0;
};

const meminfo = () => {
  const out = {};
  for (const line of read("/proc/meminfo").split("\n")) {
    const m = /^(\w+):\s+(\d+) kB/.exec(line);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
};

const pm2Bot = async () => {
  try {
    const { stdout } = await sh("pm2", ["jlist"], { timeout: 5000 });
    const proc = JSON.parse(stdout).find((p) => p.name === "zenyn");
    if (!proc) return null;
    return {
      status: proc.pm2_env.status,
      restarts: proc.pm2_env.restart_time,
      mem_mb: Math.round((proc.monit?.memory || 0) / 1048576),
    };
  } catch {
    return null;
  }
};

const collect = async () => {
  const mi = meminfo();
  const release = read("/etc/os-release");
  const pretty = (/^PRETTY_NAME="?(.+?)"?$/m.exec(release) || [])[1] || os.type();
  const df = await sh("df", ["-B1", "/"], { timeout: 5000 }).then((r) => r.stdout).catch(() => "");
  const cols = (df.split("\n")[1] || "").trim().split(/\s+/);
  const gateway = await sh("systemctl", ["is-active", "llm-gw"], { timeout: 5000 })
    .then((r) => r.stdout.trim())
    .catch((e) => String(e.stdout || "").trim() || "tidak diketahui");
  const totalMb = Math.round((mi.MemTotal || 0) / 1024);
  const availMb = Math.round((mi.MemAvailable || 0) / 1024);
  return {
    os: pretty,
    kernel: os.release(),
    uptime_s: os.uptime(),
    cores: os.cpus().length,
    load: os.loadavg().map((v) => Number(v.toFixed(2))),
    cpu_pct: await cpuPercent(),
    mem_total_mb: totalMb,
    mem_used_mb: totalMb - availMb,
    mem_avail_mb: availMb,
    swap_total_mb: Math.round((mi.SwapTotal || 0) / 1024),
    swap_used_mb: Math.round(((mi.SwapTotal || 0) - (mi.SwapFree || 0)) / 1024),
    disk_total_b: Number(cols[1]) || 0,
    disk_used_b: Number(cols[2]) || 0,
    gateway,
    bot: await pm2Bot(),
  };
};

const gb = (bytes) => (bytes / 1024 ** 3).toFixed(1) + " GB";
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);
const dur = (sec) => {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}h ${h}j`;
  if (h) return `${h}j ${m}m`;
  return `${m}m`;
};

const formatVps = (s) => {
  const bot = s.bot ? `${s.bot.status} · restart ${s.bot.restarts} · ${s.bot.mem_mb} MB` : "tidak diketahui";
  return [
    "🖥️ *VPS STATUS*",
    "",
    `• OS      : ${s.os} · kernel ${s.kernel}`,
    `• uptime  : ${dur(s.uptime_s)}`,
    `• load    : ${s.load.join(" / ")} — ${s.cores} core`,
    `• CPU     : ${s.cpu_pct}%`,
    `• RAM     : ${s.mem_used_mb} MB / ${s.mem_total_mb} MB (${pct(s.mem_used_mb, s.mem_total_mb)}%) · tersedia ${s.mem_avail_mb} MB`,
    `• swap    : ${s.swap_used_mb} MB / ${s.swap_total_mb} MB`,
    `• disk /  : ${gb(s.disk_used_b)} / ${gb(s.disk_total_b)} (${pct(s.disk_used_b, s.disk_total_b)}%)`,
    `• gateway : ${s.gateway} · llm-gw`,
    `• bot     : ${bot}`,
  ].join("\n");
};

module.exports = { collect, formatVps };
