// lib/agent/devagent.js — agent yang mengubah kode repo bot sendiri lewat LLM.
// Dijalankan sebagai child process oleh commands/owner/agent.js (bot tidak ikut nge-block).
// Protokol: model balas satu objek JSON per langkah ({"tool":...} atau {"done":true}).
// Rem: path jail, denylist rahasia, whitelist command, node --check, rollback via git.
// Kalau berhenti di tengah, posisi disimpan di .agent-state.json -> `.agent lanjutkan`.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadEnv } = require("../env");
const llm = require("./llm");

// supaya bisa dijalankan manual dari CLI VPS juga (bukan cuma dari bot)
loadEnv();

const ROOT = path.resolve(__dirname, "../..");
const LOCK = path.join(ROOT, ".agent.lock");
const STATE = path.join(ROOT, ".agent-state.json");
const MAX_READ = 400;
const MAX_OUT = 4000;
const LOCK_TTL_MS = 15 * 60000;
const STALE_MS = 24 * 60 * 60000;

const DENY_DIRS = ["session/", "database/", "node_modules/", ".git/", "backup/", "ex/"];
const DENY_FILES = [".env", ".agent.lock", ".agent-state.json"];

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || lo));
const stepMax = () => clamp(process.env.AGENT_MAX_STEPS || 12, 1, 40);
const deadlineMs = () => clamp(process.env.AGENT_DEADLINE_MS || 900000, 30000, 3600000);

const isDenied = (rel) =>
  DENY_FILES.includes(rel) || DENY_DIRS.some((d) => rel === d.slice(0, -1) || rel.startsWith(d));

// satu pintu masuk untuk semua path dari model
const safePath = (raw) => {
  const p = String(raw || "").trim();
  if (!p) throw new Error("path kosong");
  if (p.includes("..")) throw new Error(`path ditolak (..): ${p}`);
  if (/[;|&><`$()]/.test(p)) throw new Error(`path ditolak (karakter shell): ${p}`);

  const abs = path.resolve(ROOT, p);
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error(`path di luar repo: ${p}`);
  if (isDenied(rel)) throw new Error(`path diblokir (rahasia/data): ${rel}`);
  return { abs, rel };
};

const gitOut = (args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 });
  return { ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim() };
};

// rollback = reset --hard, jadi repo wajib bersih sebelum run baru
const checkpoint = () => gitOut(["rev-parse", "HEAD"]).out;
const dirty = () => gitOut(["status", "--porcelain"]).out;

const listFiles = ({ dir = ".", limit = 120 } = {}) => {
  const { abs } = safePath(dir);
  const cap = clamp(limit, 1, 400);
  const out = [];

  const walk = (d) => {
    if (out.length >= cap) return;
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      const child = path.join(d, e.name);
      const rel = path.relative(ROOT, child).split(path.sep).join("/");
      if (isDenied(rel)) continue;
      if (e.isDirectory()) walk(child);
      else out.push(rel);
    }
  };

  walk(abs);
  return out.length ? `${out.join("\n")}${out.length >= cap ? `\n... (dipotong di ${cap})` : ""}` : "(kosong)";
};

const readFile = ({ path: p, offset = 1, limit = MAX_READ } = {}) => {
  const { abs, rel } = safePath(p);
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const start = Math.max(0, Number(offset) - 1 || 0);
  const take = clamp(limit, 1, MAX_READ);
  const slice = lines.slice(start, start + take);
  const sisa = lines.length - (start + slice.length);
  const note = sisa > 0 ? `\n... (${lines.length} baris total, lanjut offset ${start + slice.length + 1})` : "";
  return `${rel} — ${lines.length} baris\n${slice.join("\n")}${note}`;
};

const writeFile = ({ path: p, content = "" } = {}) => {
  const { abs, rel } = safePath(p);
  const next = String(content);
  let prev = null;
  try {
    prev = fs.readFileSync(abs, "utf8");
  } catch {
    prev = null;
  }

  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, next);

  if (rel.endsWith(".js")) {
    const chk = spawnSync(process.execPath, ["--check", abs], { encoding: "utf8", timeout: 30000 });
    if (chk.status !== 0) {
      // file yang bikin syntax error tidak boleh tinggal di repo
      if (prev === null) fs.unlinkSync(abs);
      else fs.writeFileSync(abs, prev);
      const why = String(chk.stderr || "").split(/\r?\n/).filter(Boolean).slice(0, 3).join(" ");
      throw new Error(`node --check gagal, perubahan dibatalkan: ${why}`);
    }
  }

  return `ok ${rel} ditulis (${next.length} byte)`;
};

const GIT_SUB = ["status", "diff", "log", "show", "add", "commit", "rev-parse"];

const checkRun = (argv) => {
  if (!argv.length) throw new Error("cmd kosong");
  for (const a of argv) {
    if (/[;|&><`$()]/.test(a)) throw new Error("operator shell dilarang");
    if (a.includes("..")) throw new Error("path '..' dilarang");
  }

  const [bin, sub, ...rest] = argv;

  if (bin === "node" && sub === "--check") {
    if (rest.length !== 1) throw new Error("pakai: node --check <file>");
    safePath(rest[0]);
    return;
  }

  if (bin === "node" && sub === "--test") {
    if (!rest.length) throw new Error("pakai: node --test <file> [file...]");
    rest.filter((a) => !a.startsWith("-")).forEach((a) => safePath(a));
    return;
  }

  if (bin === "git" && GIT_SUB.includes(sub)) return;

  throw new Error(`command tidak diizinkan: ${argv.join(" ")}`);
};

const runTool = ({ cmd } = {}) => {
  const argv = String(cmd || "").trim().split(/\s+/).filter(Boolean);
  checkRun(argv);

  const [bin, ...rest] = argv;
  const r = spawnSync(bin, rest, { cwd: ROOT, encoding: "utf8", timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  if (!out) return `(selesai, exit ${r.status ?? "?"})`;
  return out.slice(0, MAX_OUT);
};

const TOOLS = {
  list_files: listFiles,
  read_file: readFile,
  write_file: writeFile,
  run: runTool
};

const SYSTEM = [
  "Kamu dev agent untuk repo WhatsApp bot Node.js (Baileys, CommonJS) di ROOT.",
  "REPO: commands/<kategori>/*.js (module.exports: name, command[], category, description, execute), lib/*.js helper, tests/*.test.js pakai node:test.",
  "",
  "ATURAN KERAS:",
  "1. Balas HANYA satu objek JSON, tanpa penjelasan, tanpa code fence.",
  "   Aksi:  {\"tool\":\"write_file\",\"args\":{\"path\":\"lib/x.js\",\"content\":\"...\"}}",
  "   Selesai: {\"done\":true,\"summary\":\"ringkasan singkat bahasa Indonesia\"}",
  "2. Tool: list_files{dir,limit} | read_file{path,offset,limit} | write_file{path,content} | run{cmd}",
  "3. run hanya: node --check <file>, node --test <file>, git status/diff/log/show/add/commit.",
  "4. Baca file sebelum mengubahnya. Perubahan sekecil mungkin, ikuti gaya kode sekitarnya, jangan refactor.",
  "5. Dilarang menyentuh .env, session/, database/, node_modules/.",
  "6. Setelah menulis file .js, syntax otomatis dicek; kalau ada error, perbaiki.",
  "7. Kalau butuh tes: tulis tests/<nama>.test.js lalu jalankan node --test tests/<nama>.test.js.",
  "8. Satu permintaan = satu fitur. Jangan membaca file yang sama dua kali; setelah info cukup, langsung tulis.",
  "9. ringkasan wajib menyebut file yang diubah dan apa yang belum dites."
].join("\n");

// model gratis sering menulis alasan dulu sebelum JSON
const jsonChunks = (text) => {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "{") continue;
    let depth = 0;
    for (let j = i; j < text.length; j++) {
      if (text[j] === "{") depth++;
      else if (text[j] === "}") {
        depth--;
        if (!depth) {
          out.push(text.slice(i, j + 1));
          i = j;
          break;
        }
      }
    }
  }
  return out;
};

const parseAction = (raw) => {
  const text = String(raw || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  for (const chunk of [text, ...jsonChunks(text)]) {
    try {
      const obj = JSON.parse(chunk);
      if (obj && typeof obj === "object" && (obj.tool || obj.done)) return obj;
    } catch {
      // coba kandidat berikutnya
    }
  }
  return null;
};

const firstLine = (s) => String(s || "").split(/\r?\n/).find((l) => l.trim()) || "";
const brief = (args) =>
  (args && typeof args === "object" ? String(args.path || args.cmd || args.dir || JSON.stringify(args)) : "").slice(0, 90);

// ---------- state (resume) ----------
const RESUME_RE = /^(lanjut|lanjutin|lanjutkan|continue)\b/i;

const trimMessages = (messages) =>
  messages.map((m) => ({ ...m, content: String(m.content || "").slice(0, 8000) }));

const readState = () => {
  let st;
  try {
    st = JSON.parse(fs.readFileSync(STATE, "utf8"));
  } catch {
    return null;
  }
  if (!st || typeof st !== "object" || !Array.isArray(st.messages) || !st.prompt) return null;
  st.stale = Date.now() - Number(st.updatedAt || 0) > STALE_MS;
  return st;
};

const saveState = (st) => {
  const payload = { ...st, messages: trimMessages(st.messages || []), updatedAt: Date.now() };
  fs.writeFileSync(STATE, JSON.stringify(payload));
  return payload;
};

const clearState = () => {
  try {
    fs.unlinkSync(STATE);
    return true;
  } catch {
    return false;
  }
};

// ---------- lock ----------
const acquireLock = () => {
  try {
    const st = fs.statSync(LOCK);
    if (Date.now() - st.mtimeMs < LOCK_TTL_MS) return false;
  } catch {
    // belum ada lock
  }
  fs.writeFileSync(LOCK, String(process.pid));
  return true;
};

const releaseLock = () => {
  try {
    fs.unlinkSync(LOCK);
  } catch {
    // sudah hilang
  }
};

const run = async () => {
  const prompt = String(process.env.AGENT_PROMPT || process.argv.slice(2).join(" ") || "").trim();
  const deploy = process.env.AGENT_DEPLOY === "1";

  if (!prompt) return "❌ Perintah kosong. Contoh: .agent buatin fitur cuaca";
  if (!llm.enabled()) return "❌ AGENT_API_KEY belum diatur di .env VPS.";

  const wantResume = RESUME_RE.test(prompt);
  const prev = readState();
  if (wantResume && !prev) return "ℹ️ Tidak ada pekerjaan tertunda. Kirim perintah baru.";
  if (wantResume && prev?.stale) {
    return "⚠️ Pekerjaan tertunda lebih dari 24 jam, dianggap basi.\nBersihkan dengan `.agent batal --yes`, lalu kirim perintah baru.";
  }

  if (!acquireLock()) return "⏳ Agent lain masih jalan. Tunggu sampai selesai.";

  const resume = wantResume && !!prev;
  if (!resume) {
    const kotor = dirty();
    if (kotor) {
      releaseLock();
      return [
        "❌ *AGENT DITOLAK*",
        "",
        "Repo VPS masih punya perubahan yang belum di-commit:",
        ...kotor.split(/\r?\n/).slice(0, 8),
        "",
        "Kalau itu sisa agent sebelumnya: `.agent lanjutkan` atau `.agent batal --yes`."
      ].join("\n");
    }
  }

  const startedAt = Date.now();
  const deadline = startedAt + deadlineMs();
  const hash = resume ? prev.hash || checkpoint() : checkpoint();
  const changed = new Set(resume ? prev.changed || [] : []);
  const log = [];
  const startStep = resume ? Number(prev.steps || 0) : 0;
  const messages = resume
    ? [...prev.messages, { role: "user", content: `LANJUTKAN dari langkah ${startStep}. Sisa permintaan: ${prompt}` }]
    : [
        { role: "system", content: SYSTEM },
        { role: "user", content: `PERMINTAAN OWNER:\n${prompt}` }
      ];

  const original = resume ? prev.prompt : prompt;
  let summary = "";
  let broken = [];
  let testOut = "-";
  let commitMsg = "-";
  let pushMsg = "-";
  let stopped = "";

  const persist = (extra = {}) =>
    saveState({
      prompt: original,
      messages,
      changed: [...changed],
      steps: startStep + log.filter((l) => /^\d+\./.test(l)).length,
      hash,
      model: llm.model(),
      error: stopped || extra.error || "",
      deploy,
      startedAt: resume ? prev.startedAt || startedAt : startedAt
    });

  try {
    for (let step = startStep + 1; step <= stepMax(); step++) {
      const left = deadline - Date.now();
      if (left < 5000) {
        stopped = `batas waktu ${Math.round(deadlineMs() / 1000)}s habis di langkah ${step}`;
        log.push(`⚠️ ${stopped}`);
        break;
      }

      let raw;
      try {
        raw = await llm.chat(messages, {
          timeoutMs: Math.min(left, 90000),
          deadline,
          onRetry: (info) => {
            if (info.attempt % 5 !== 0) return;
            log.push(`… percobaan ${info.attempt}/${info.max} (${info.model}): ${info.error.slice(0, 60)}`);
          }
        });
      } catch (err) {
        stopped = err.message;
        log.push(`⚠️ LLM error: ${stopped}`);
        break;
      }

      messages.push({ role: "assistant", content: raw });
      const act = parseAction(raw);

      if (!act) {
        log.push(`${step}. (balasan bukan JSON, diulang)`);
        messages.push({ role: "user", content: "Balasan bukan JSON valid. Balas HANYA satu objek JSON." });
        persist();
        continue;
      }

      if (act.done) {
        summary = String(act.summary || "").trim();
        log.push(`${step}. selesai`);
        break;
      }

      const name = String(act.tool || "");
      const args = act.args && typeof act.args === "object" ? act.args : {};
      let out;

      try {
        if (!TOOLS[name]) throw new Error(`tool tak dikenal: ${name}`);
        out = TOOLS[name](args);
        if (name === "write_file") changed.add(safePath(args.path).rel);
      } catch (err) {
        out = `ERROR: ${err.message}`;
      }

      log.push(`${step}. ${name} ${brief(args)} → ${firstLine(out)}`);
      messages.push({ role: "user", content: `HASIL ${name}: ${String(out).slice(0, 3000)}` });
      persist();
    }

    for (const rel of changed) {
      if (!rel.endsWith(".js")) continue;
      const r = spawnSync(process.execPath, ["--check", path.join(ROOT, rel)], { encoding: "utf8", timeout: 30000 });
      if (r.status !== 0) broken.push(rel);
    }

    if (broken.length) {
      gitOut(["reset", "--hard", hash]);
      changed.clear();
      clearState();
    } else {
      const testFiles = [...changed].filter((r) => r.startsWith("tests/") && r.endsWith(".js"));
      if (testFiles.length) {
        const r = spawnSync(process.execPath, ["--test", ...testFiles], {
          cwd: ROOT,
          encoding: "utf8",
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024
        });
        const hits = `${r.stdout || ""}${r.stderr || ""}`.match(/ℹ (tests|pass|fail) \d+/g);
        testOut = hits ? hits.join(", ") : `exit ${r.status}`;
      }

      if (changed.size && summary) {
        gitOut(["add", "-A"]);
        const message = `agent: ${original.replace(/\s+/g, " ").slice(0, 60)}`;
        const c = gitOut(["commit", "-m", message]);
        commitMsg = c.ok ? gitOut(["rev-parse", "--short", "HEAD"]).out || "ok" : `gagal: ${firstLine(c.out)}`;
        if (c.ok) clearState();

        if (c.ok && deploy) {
          const p = gitOut(["push", "origin", "main"]);
          pushMsg = p.ok ? "ok" : `gagal: ${firstLine(p.out)}`;
        }
      } else if (changed.size) {
        commitMsg = "belum di-commit (agent belum selesai)";
      }
    }
  } catch (err) {
    gitOut(["reset", "--hard", hash]);
    clearState();
    releaseLock();
    return [`❌ *AGENT ERROR*`, "", `Sebab : ${err.message}`, `Rollback: ${hash.slice(0, 7)}`].join("\n");
  } finally {
    releaseLock();
  }

  const totalStep = startStep + log.filter((l) => /^\d+\./.test(l)).length;
  const head = [
    `🤖 *AGENT ${resume ? "LANJUTAN " : ""}${summary ? "SELESAI" : "BERHENTI"}*`,
    "",
    `Perintah : ${original.slice(0, 300)}`,
    `Langkah  : ${totalStep}/${stepMax()}${resume ? ` (lanjutan dari ${startStep})` : ""}`,
    `File     : ${changed.size ? [...changed].join(", ") : "tidak ada yang diubah"}`,
    `Commit   : ${commitMsg}`,
    `Push     : ${deploy ? pushMsg : "tidak diminta (pakai --deploy)"}`
  ];

  if (broken.length) head.push(`❌ Syntax error, dirollback: ${broken.join(", ")}`);
  if (testOut !== "-") head.push(`Test     : ${testOut}`);
  head.push("", `Ringkasan: ${summary || "belum tuntas"}`);

  if (stopped) head.push(`Sebab    : ${stopped}`, "", "Lanjutkan: *.agent lanjutkan*");

  if (log.length) head.push("", "*Jejak:*", ...log.slice(-12));

  return head.join("\n");
};

module.exports = {
  run,
  _internal: {
    safePath,
    checkRun,
    parseAction,
    isDenied,
    TOOLS,
    ROOT,
    STATE,
    RESUME_RE,
    readState,
    saveState,
    clearState
  }
};

if (require.main === module) {
  run()
    .then((text) => {
      console.log(text);
      process.exit(0);
    })
    .catch((err) => {
      console.log(`❌ agent error: ${err.message}`);
      process.exit(1);
    });
}
