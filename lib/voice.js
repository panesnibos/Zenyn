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

const muxVideoAudio = async (videoBuffer, audioBuffer, { tempRoot = os.tmpdir() } = {}) => {
  const dir = await fs.promises.mkdtemp(path.join(tempRoot, "zenyn-mux-"));
  const input = path.join(dir, "input.mp4");
  const audio = path.join(dir, "audio.mp3");
  const output = path.join(dir, "output.mp4");
  try {
    await fs.promises.writeFile(input, videoBuffer);
    await fs.promises.writeFile(audio, audioBuffer);
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", input, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+faststart",
      output
    ], { timeout: 90000, maxBuffer: 256 * 1024, windowsHide: true });
    const result = await fs.promises.readFile(output);
    if (!result.length) throw new Error("Hasil mux kosong.");
    return result;
  } catch (err) {
    if (err.killed) throw new Error("Konversi timeout.");
    throw new Error("Gagal menggabungkan audio ke video.");
  } finally {
    await Promise.all([input, audio, output].map((file) => fs.promises.unlink(file).catch(() => {})));
    await fs.promises.rmdir(dir).catch(() => {});
  }
};

const imageToVideoWithAudio = async (imageBuffer, audioBuffer, { tempRoot = os.tmpdir() } = {}) => {
  const dir = await fs.promises.mkdtemp(path.join(tempRoot, "zenyn-imgvid-"));
  const input = path.join(dir, "input.jpg");
  const audio = path.join(dir, "audio.mp3");
  const output = path.join(dir, "output.mp4");
  try {
    await fs.promises.writeFile(input, imageBuffer);
    await fs.promises.writeFile(audio, audioBuffer);
    // -loop 1 = gambar berulang; -shortest = durasi video mengikuti audio TTS.
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-loop", "1", "-i", input, "-i", audio,
      "-map", "0:v:0", "-map", "1:a:0",
      "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k",
      "-shortest", "-movflags", "+faststart",
      output
    ], { timeout: 90000, maxBuffer: 256 * 1024, windowsHide: true });
    const result = await fs.promises.readFile(output);
    if (!result.length) throw new Error("Hasil konversi kosong.");
    return result;
  } catch (err) {
    if (err.killed) throw new Error("Konversi timeout.");
    throw new Error("Gagal membuat video dari gambar.");
  } finally {
    await Promise.all([input, audio, output].map((file) => fs.promises.unlink(file).catch(() => {})));
    await fs.promises.rmdir(dir).catch(() => {});
  }
};

const videoToGifPlayback = async (buffer, { size = 512, fps = 15, maxSeconds = 10 } = {}) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "zenyn-gif-"));
  const input = path.join(dir, "input.mp4");
  const output = path.join(dir, "output.mp4");
  try {
    await fs.promises.writeFile(input, buffer);
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", input,
      "-t", String(maxSeconds),
      "-map", "0:v:0", "-map", "0:a:0?",
      "-vf", `fps=${fps},scale=${size}:${size}:force_original_aspect_ratio=decrease,pad=${size}:${size}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28",
      "-c:a", "aac", "-b:a", "64k",
      "-movflags", "+faststart",
      output
    ], { timeout: 90000, maxBuffer: 256 * 1024, windowsHide: true });
    const result = await fs.promises.readFile(output);
    if (!result.length) throw new Error("Hasil konversi kosong.");
    return result;
  } catch (err) {
    if (err.killed) throw new Error("Konversi timeout.");
    throw new Error("Gagal membuat video GIF bersuara.");
  } finally {
    await Promise.all([input, output].map((file) => fs.promises.unlink(file).catch(() => {})));
    await fs.promises.rmdir(dir).catch(() => {});
  }
};

// Ekstrak trek audio video jadi OGG Opus mono (untuk stiker bersuara).
const extractAudioOpus = async (buffer, { maxSeconds = 10 } = {}) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "zenyn-ssaudio-"));
  const input = path.join(dir, "input.media");
  const output = path.join(dir, "sound.ogg");
  try {
    await fs.promises.writeFile(input, buffer);
    await run(ffmpegPath(), [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", input, "-vn", "-map", "0:a:0", "-t", String(maxSeconds),
      "-c:a", "libopus", "-ac", "1", "-b:a", "64k", "-f", "ogg", output
    ], { timeout: 60000, maxBuffer: 256 * 1024, windowsHide: true });
    const result = await fs.promises.readFile(output);
    if (result.toString("ascii", 0, 4) !== "OggS") throw new Error("bukan OGG");
    return result;
  } catch (err) {
    if (err.killed) throw new Error("Konversi audio timeout.");
    throw new Error("Video tidak punya suara atau format audio tidak didukung.");
  } finally {
    await Promise.all([input, output].map((file) => fs.promises.unlink(file).catch(() => {})));
    await fs.promises.rmdir(dir).catch(() => {});
  }
};

module.exports = { audioToVoice, muxVideoAudio, imageToVideoWithAudio, videoToGifPlayback, extractAudioOpus };
