// commands/owner/agent.js — dev agent: bikin/ubah/fix fitur bot lewat LLM (khusus owner).
// Patch + test jalan di child process supaya bot tidak nge-block. Deploy hanya dengan --deploy.
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const llm = require("../../lib/agent/llm");
const devagent = require("../../lib/agent/devagent");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "lib/agent/devagent.js");
const LOCK = path.join(ROOT, ".agent.lock");
const WA_LIMIT = 3500;
const PING_MS = 5 * 60000;

const { readState, clearState } = devagent._internal;

const HELP = (p) =>
  [
    "🤖 *DEV AGENT (khusus owner)*",
    "",
    `• *${p}agent <perintah>* — bikin/ubah/fix fitur`,
    `  contoh: ${p}agent buatin fitur cuaca pakai wttr.in`,
    `• *${p}agent --deploy <perintah>* — patch + push + restart bot`,
    `• *${p}agent lanjutkan* — lanjut pekerjaan yang berhenti di tengah`,
    `• *${p}agent status* — lihat pekerjaan tertunda`,
    `• *${p}agent batal --yes* — buang pekerjaan tertunda + rollback`,
    `• *${p}agent tools* — daftar tool agent`,
    "",
    "*Rem:* hanya bisa tulis di dalam repo, dilarang sentuh `.env`/`database/`/`session/`, command whitelist, tiap file `.js` wajib lolos `node --check`, rollback lewat git."
  ].join("\n");

const TOOLS_TEXT = (p) =>
  [
    "🧰 *AGENT*",
    "",
    "• `list_files {dir,limit}` — daftar file repo",
    "• `read_file {path,offset,limit}` — baca file (maks 400 baris)",
    "• `write_file {path,content}` — tulis/timpa (wajib lolos node --check)",
    "• `run {cmd}` — hanya `node --check`, `node --test`, `git status/diff/log/show/add/commit`",
    "",
    `Model rotasi : ${llm.models().join(" → ")}`,
    `Retry        : ${llm.retryMax()}x, jeda ${Math.round(llm.retryDelayMs() / 1000)}s`,
    `API          : ${llm.base()}`,
    `Key          : ${llm.enabled() ? "terpasang" : "❌ belum ada AGENT_API_KEY"}`,
    "",
    `Jalan: *${p}agent <perintah>*`
  ].join("\n");

const statusText = () => {
  const st = readState();
  if (!st) return "✅ Tidak ada pekerjaan tertunda.";

  const umur = Math.round((Date.now() - Number(st.startedAt || st.updatedAt || 0)) / 60000);
  return [
    "⏸️ *PEKERJAAN TERTUNDA*",
    "",
    `Perintah : ${String(st.prompt).slice(0, 200)}`,
    `Langkah  : ${st.steps || 0}`,
    `File     : ${(st.changed || []).join(", ") || "-"}`,
    `Rollback : ${String(st.hash || "-").slice(0, 7)}`,
    `Umur     : ${umur} menit${st.stale ? " (basi >24 jam)" : ""}`,
    st.error ? `Sebab    : ${st.error}` : "",
    "",
    "Lanjutkan: `.agent lanjutkan`",
    "Buang    : `.agent batal --yes`"
  ]
    .filter(Boolean)
    .join("\n");
};

const trim = (text, limit = WA_LIMIT) =>
  text.length > limit ? `${text.slice(0, limit)}\n…(dipotong)` : text;

// AGENT_PROMPT lewat env supaya tidak ada masalah quoting di argv
const runAgent = (prompt, deploy) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [SCRIPT], {
      cwd: ROOT,
      shell: false,
      env: { ...process.env, AGENT_PROMPT: prompt, AGENT_DEPLOY: deploy ? "1" : "0" }
    });

    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", (err) => resolve({ code: 1, out: `❌ gagal start agent: ${err.message}` }));
    child.on("close", (code) => resolve({ code: code ?? 1, out: out.trim() }));
  });

const restartBot = () => {
  const name = process.env.PM2_NAME || "zenyn";
  logger.info(`agent: restart ${name}`);
  const child = spawn("pm2", ["restart", name, "--update-env"], { shell: false, detached: true, stdio: "ignore" });
  child.unref();
};

// batal: buang state + rollback ke titik aman run tersebut
const batal = () => {
  const st = readState();
  clearState();
  try {
    fs.unlinkSync(LOCK);
  } catch {
    // lock sudah hilang
  }

  if (!st) return "✅ Tidak ada pekerjaan tertunda.";

  if (!st.hash) return "🗑️ State dihapus. Tidak ada commit rollback; cek `git status` manual.";

  const r = spawnSync("git", ["reset", "--hard", st.hash], { cwd: ROOT, encoding: "utf8", timeout: 60000 });
  const ok = r.status === 0;
  return [
    ok ? "🗑️ *DIBATALKAN*" : "⚠️ *RESET GAGAL*",
    "",
    `Rollback : ${String(st.hash).slice(0, 7)}`,
    `File     : ${(st.changed || []).join(", ") || "-"}`,
    ok ? "" : `${(r.stderr || "").split("\n")[0]}`,
    "",
    ok ? "Repo kembali ke kondisi sebelum agent jalan." : "Cek `git status` di VPS."
  ]
    .filter(Boolean)
    .join("\n");
};

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  const argv = (args || []).map((a) => String(a));
  const deploy = argv.includes("--deploy");
  const yes = argv.includes("--yes");
  const prompt = argv.filter((a) => a !== "--deploy" && a !== "--yes").join(" ").trim();
  const first = (prompt.split(/\s+/)[0] || "").toLowerCase();
  const send = (text) => client.sendMessage(sender, { text: trim(text) }, { quoted: message });

  if (!prompt || first === "help") return send(HELP(p));
  if (first === "tools") return send(TOOLS_TEXT(p));
  if (first === "status") return send(statusText());

  if (["batal", "revert", "cancel"].includes(first)) {
    if (!yes) return send(`⚠️ Ini menghapus hasil kerja agent dan rollback repo.\nKalau yakin: *${p}agent batal --yes*`);
    logger.cmd(`agent: batal oleh ${message.key.participant || sender}`);
    return send(batal());
  }

  const resume = /^(lanjut|lanjutin|lanjutkan|continue)\b/i.test(prompt);
  if (resume && !readState()) return send("ℹ️ Tidak ada pekerjaan tertunda. Kirim perintah baru.");

  if (!llm.enabled()) {
    return send("❌ `AGENT_API_KEY` belum diatur di `.env` VPS. Isi dulu, lalu restart bot.");
  }

  const budget = Math.round(Number(process.env.AGENT_DEADLINE_MS || 900000) / 1000);
  await client.sendMessage(
    sender,
    {
      text: [
        resume ? "⏳ *AGENT MELANJUTKAN*" : "⏳ *AGENT JALAN*",
        "",
        `Perintah : ${prompt.slice(0, 300)}`,
        `Mode     : ${deploy ? "patch + push + restart" : "patch + test (tanpa deploy)"}`,
        `Batas    : ${budget}s`,
        `Model    : ${llm.models().join(" → ")}`,
        "",
        `Kalau kena limit/billing, agent bisa diam sampai ${Math.round(budget / 60)} menit. Laporan tetap dikirim setelah selesai.`
      ].join("\n")
    },
    { quoted: message }
  );

  const ping = setInterval(() => {
    client
      .sendMessage(sender, { text: `⏳ masih jalan… (${Math.round(PING_MS / 60000)} menit sekali)` })
      .catch(() => {});
  }, PING_MS);

  const { code, out } = await runAgent(prompt, deploy);
  clearInterval(ping);

  const pushed = deploy && /Push\s*:\s*ok/.test(out);
  await send(out || `(agent keluar tanpa output, exit ${code})`);

  if (pushed) {
    // beri jeda supaya pesan terkirim sebelum proses dibunuh pm2
    setTimeout(restartBot, 2000);
  } else if (deploy && code !== 0) {
    logger.warn(`agent: deploy batal (exit ${code})`);
  }
};

module.exports = {
  name: "agent",
  command: ["agent", "devagent"],
  category: "owner",
  description: "Dev agent: bikin/ubah/fix fitur bot lewat LLM (owner)",
  visible: true,
  execute,
  _internal: { runAgent, trim, HELP, TOOLS_TEXT, statusText, batal }
};
