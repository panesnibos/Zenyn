const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_HEIGHT = 720;

const URL_REGEX = /(https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com\/(?:watch\?[^\s]*v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)[A-Za-z0-9_-]{11})/i;
const ID_REGEX = /^[A-Za-z0-9_-]{11}$/;

const FFMPEG = (() => {
  try {
    const p = require("@ffmpeg-installer/ffmpeg").path;
    if (p && fs.existsSync(p)) return p;
  } catch {}
  try {
    const p = require("ffmpeg-static");
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
})();

let corePromise = null;
let session = null;

const loadCore = () => {
  if (!corePromise) corePromise = import("@distube/ytdl-core");
  return corePromise;
};

const getSession = async () => {
  if (!session) {
    const { Ytdl } = await loadCore();
    session = new Ytdl();
  }
  return session;
};

const parseUrl = (input) => {
  const text = String(input || "").trim();
  const match = text.match(URL_REGEX);
  if (match) return match[1];
  if (ID_REGEX.test(text)) return `https://www.youtube.com/watch?v=${text}`;
  return null;
};

const getInfo = async (url) => {
  const ytdl = await getSession();
  return ytdl.getInfo(url);
};

const isUsable = (f) => !f.isDrm && !f.isOtf;

const pickAudio = (formats) => {
  const pool = (formats || []).filter((f) => f.hasAudio && !f.hasVideo && isUsable(f));
  const mp4 = pool.filter((f) => f.container === "mp4" && /mp4a/i.test(f.audioCodec || ""));
  const list = (mp4.length ? mp4 : pool).slice().sort(
    (a, b) => (b.audioBitrate || b.bitrate || 0) - (a.audioBitrate || a.bitrate || 0)
  );
  return list.find((f) => !f.contentLength || f.contentLength <= MAX_BYTES) || list[0] || null;
};

const pickVideoOnly = (formats, audioBytes = 0, maxBytes = MAX_BYTES) => {
  const pool = (formats || [])
    .filter(
      (f) =>
        f.hasVideo &&
        !f.hasAudio &&
        isUsable(f) &&
        f.container === "mp4" &&
        /^avc1/i.test(f.videoCodec || "") &&
        (f.height || 0) > 0 &&
        f.height <= MAX_HEIGHT
    )
    .sort((a, b) => b.height - a.height || (b.bitrate || 0) - (a.bitrate || 0));

  return (
    pool.find((f) => !f.contentLength || f.contentLength + audioBytes <= maxBytes) || null
  );
};

const pickProgressive = (formats, maxBytes = MAX_BYTES) => {
  const pool = (formats || [])
    .filter(
      (f) =>
        f.hasVideo &&
        f.hasAudio &&
        isUsable(f) &&
        f.container === "mp4" &&
        /^avc1/i.test(f.videoCodec || "") &&
        (f.height || 0) > 0 &&
        f.height <= MAX_HEIGHT
    )
    .sort((a, b) => b.height - a.height || (b.bitrate || 0) - (a.bitrate || 0));

  return pool.find((f) => !f.contentLength || f.contentLength <= maxBytes) || null;
};

const collect = (stream, maxBytes = MAX_BYTES) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let done = false;

    const fail = (err) => {
      if (done) return;
      done = true;
      stream.destroy();
      reject(err);
    };

    stream.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        fail(new Error("Ukuran media terlalu besar"));
        return;
      }
      chunks.push(chunk);
    });
    stream.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks));
    });
    stream.on("error", fail);
  });

const download = async (info, format) => {
  const ytdl = await getSession();
  return collect(ytdl.open(info, format).read());
};

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg tidak tersedia"));

    const proc = spawn(FFMPEG, args);
    let err = "";
    proc.stderr.on("data", (d) => {
      err += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) return resolve();
      reject(
        new Error(
          err.split("\n").filter(Boolean).slice(-2).join(" ").trim() || `ffmpeg exit ${code}`
        )
      );
    });
  });

const withTemp = async (fn) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "zenyt-"));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
};

const mux = (videoBuf, audioBuf) =>
  withTemp(async (dir) => {
    const videoPath = path.join(dir, "video.mp4");
    const audioPath = path.join(dir, "audio.m4a");
    const outPath = path.join(dir, "out.mp4");

    await fs.promises.writeFile(videoPath, videoBuf);
    await fs.promises.writeFile(audioPath, audioBuf);

    await runFfmpeg([
      "-y",
      "-i", videoPath,
      "-i", audioPath,
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart",
      outPath
    ]);

    return await fs.promises.readFile(outPath);
  });

const toMp3 = (audioBuf, container) =>
  withTemp(async (dir) => {
    const ext = container === "webm" ? "webm" : container === "mp4" ? "m4a" : "bin";
    const audioPath = path.join(dir, `audio.${ext}`);
    const outPath = path.join(dir, "out.mp3");

    await fs.promises.writeFile(audioPath, audioBuf);

    await runFfmpeg([
      "-y",
      "-i", audioPath,
      "-vn",
      "-c:a", "libmp3lame",
      "-b:a", "192k",
      outPath
    ]);

    return await fs.promises.readFile(outPath);
  });

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
};

const safeName = (value) =>
  String(value || "youtube")
    .replace(/[\\/:*?"<>|\n\r\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "youtube";

module.exports = {
  MAX_BYTES,
  MAX_HEIGHT,
  parseUrl,
  getInfo,
  pickAudio,
  pickVideoOnly,
  pickProgressive,
  download,
  mux,
  toMp3,
  formatDuration,
  safeName
};
