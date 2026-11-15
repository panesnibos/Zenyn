// commands/owner/agent.js — dev agent: bikin/ubah/fix fitur bot lewat LLM (khusus owner).
// Patch + test jalan di child process supaya bot tidak nge-block. Deploy hanya dengan --deploy.
const path = require("path");
const { spawn } = require("child_process");
const logger = require("../../lib/logger");
const { isOwner } = require("../../lib/owner");
const { getPrefix } = require("../../lib/prefix");
const llm = require("../../lib/agent/llm");

const ROOT = path.resolve(__dirname, "../..");
const SCRIPT = path.join(ROOT, "lib/agent/devagent.js");
const WA_LIMIT = 3500;

const HELP = (p) =>
  [
    "🤖 *DEV AGENT (khusus owner)*",
    "",
    `• *${p}agent <perintah>* — bikin/ubah/fix fitur`,
    `  contoh: ${p}agent buatin fitur cuaca pakai wttr.in`,
    `• *${p}agent --deploy <perintah>* — patch + push + restart bot`,
    `• *${p}agent tools* — daftar tool agent`,
    "",
    "*Rem:* agent hanya bisa tulis file di dalam repo, dilarang sentuh `.env`/`database/`/`session/`, command dibatasi whitelist, tiap file `.js` wajib lolos `node --check`, dan ada checkpoint git untuk rollback."
  ].join("\n");

const TOOLS_TEXT = (p) =>
  [
    "🧰 *TOOL AGENT*",
    "",
    "• `list_files {dir,limit}` — daftar file repo",
    "• `read_file {path,offset,limit}` — baca file (maks 400 baris)",
    "• `write_file {path,content}` — tulis/timpa file (wajib lolos node --check)",
    "• `run {cmd}` — hanya: `node --check`, `node --test`, `git status/diff/log/show/add/commit`",
    "",
    `Model : ${llm.model()}`,
    `API   : ${llm.base()}`,
    `Key   : ${llm.enabled() ? "terpasang" : "❌ belum ada AGENT_API_KEY"}`,
    "",
    `Jalan: *${p}agent <perintah>*`
  ].join("\n");

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

const execute = async (client, message, args) => {
  const sender = message.key.remoteJid;
  const p = getPrefix(message);

  if (!isOwner(message)) {
    return client.sendMessage(sender, { text: "❌ Command ini khusus owner." }, { quoted: message });
  }

  const argv = (args || []).map((a) => String(a));
  const deploy = argv.includes("--deploy");
  const prompt = argv.filter((a) => a !== "--deploy").join(" ").trim();

  if (!prompt || prompt.toLowerCase() === "help") {
    return client.sendMessage(sender, { text: HELP(p) }, { quoted: message });
  }

  if (prompt.toLowerCase() === "tools") {
    return client.sendMessage(sender, { text: TOOLS_TEXT(p) }, { quoted: message });
  }

  if (!llm.enabled()) {
    return client.sendMessage(
      sender,
      { text: "❌ `AGENT_API_KEY` belum diatur di `.env` VPS. Isi dulu, lalu restart bot." },
      { quoted: message }
    );
  }

  const budget = Math.round(Number(process.env.AGENT_DEADLINE_MS || 180000) / 1000);
  await client.sendMessage(
    sender,
    {
      text: [
        "⏳ *AGENT JALAN*",
        "",
        `Perintah : ${prompt.slice(0, 300)}`,
        `Mode     : ${deploy ? "patch + push + restart" : "patch + test (tanpa deploy)"}`,
        `Batas    : ${budget}s`
      ].join("\n")
    },
    { quoted: message }
  );

  const { code, out } = await runAgent(prompt, deploy);
  const pushed = deploy && /Push\s*:\s*ok/.test(out);

  await client.sendMessage(
    sender,
    { text: trim(out || `(agent keluar tanpa output, exit ${code})`) },
    { quoted: message }
  );

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
  _internal: { runAgent, trim, HELP, TOOLS_TEXT }
};
