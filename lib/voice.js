const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFile } = require("child_process");
const { promisify } = require("util");

const run = promisify(execFile);
const ffmpegPath = () => {
  try { return require("@ffmpeg-installer/ffmpeg").path; } catch {}
  try { return require("ffmpeg-static"); } catch {}
  throw new Error("FFmpeg belum tersedia. Jalankan npm install di server.");
};

const audioToVoice = async (buffer, { tempRoot = os.tmpdir() } = {}) => {
  const dir = await fs.promises.mkdtemp(path.join(tempRoot, "zenyn-vn-"));
  const input = path.join(dir, "input.media");
  const output = path.join(dir, "voice.ogg");
  try {
    await fs.promises.writeFile(input, buffer);
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", input, "-map", "0:a:0", "-t", "60", "-vn", "-c:a", "libopus",
      "-b:a", "48k", "-ar", "48000", "-ac", "1", "-application", "voip", "-f", "ogg", output
    ], { timeout: 45000, maxBuffer: 256 * 1024, windowsHide: true });
    const result = await fs.promises.readFile(output);
    if (result.toString("ascii", 0, 4) !== "OggS") throw new Error("Hasil konversi bukan audio OGG.");
    return result;
  } catch (err) {
    if (err.killed) throw new Error("Konversi timeout. Coba media yang lebih pendek.");
    throw new Error("Gagal membuat voice note. Pastikan media memiliki suara dan formatnya didukung.");
  } finally {
    // Only remove this invocation's two temporary files and its empty directory.
    await Promise.all([input, output].map((file) => fs.promises.unlink(file).catch(() => {})));
    await fs.promises.rmdir(dir).catch(() => {});
  }
};

module.exports = { audioToVoice };
