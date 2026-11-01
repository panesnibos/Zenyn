const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const logger = require("./lib/logger");

const entry = path.join(__dirname, "index.js");
const lockPath = path.join(__dirname, ".bot.lock");
const restartDelay = Number(process.env.RESTART_DELAY_MS) || 3000;

let child = null;
let shuttingDown = false;
let restarts = 0;
let startedAt = 0;

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function acquireLock() {
  try {
    const pid = parseInt(fs.readFileSync(lockPath, "utf-8"), 10);
    if (pid && pid !== process.pid && isProcessAlive(pid)) {
      logger.error(`Bot sudah berjalan (PID ${pid}). Hentikan instance itu dulu.`);
      process.exit(1);
    }
  } catch {}

  fs.writeFileSync(lockPath, String(process.pid));
}

function releaseLock() {
  try {
    const pid = parseInt(fs.readFileSync(lockPath, "utf-8"), 10);
    if (pid === process.pid) fs.unlinkSync(lockPath);
  } catch {}
}

function start() {
  if (shuttingDown) return;

  startedAt = Date.now();
  logger.info(`Menjalankan bot (restart ke-${restarts})...`);

  child = spawn(process.execPath, [entry], {
    cwd: __dirname,
    env: process.env,
    stdio: "inherit"
  });

  child.on("error", (err) => {
    logger.error(`Gagal menjalankan bot: ${err.message}`);
  });

  child.on("close", (code, signal) => {
    child = null;
    if (shuttingDown) return;

    if (Date.now() - startedAt > 60000) restarts = 0;
    restarts++;

    logger.warn(`Bot berhenti (code=${code ?? "-"}, signal=${signal ?? "-"}). Restart dalam ${restartDelay / 1000}s...`);
    setTimeout(start, restartDelay);
  });
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.warn(`Menerima ${signal}, menghentikan bot...`);

  if (!child) return process.exit(0);

  const forceKill = setTimeout(() => {
    if (child) child.kill("SIGKILL");
    process.exit(0);
  }, 5000);

  child.once("close", () => {
    clearTimeout(forceKill);
    process.exit(0);
  });

  child.kill("SIGTERM");
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => logger.error(`Launcher error: ${err.message}`));
process.on("unhandledRejection", (err) => logger.error(`Launcher rejection: ${err?.message || err}`));
process.on("exit", releaseLock);

acquireLock();
start();
