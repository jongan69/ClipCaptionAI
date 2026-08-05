/**
 * FFmpeg worker — async ffmpeg/ffprobe execution with progress streaming.
 *
 * Usage from main process:
 *   const worker = new Worker('./desktop/workers/ffmpeg-worker.mjs');
 *   worker.postMessage({ type: 'probe', payload: { videoPath: '...' } });
 *   worker.on('message', (msg) => { ... });
 */

import { parentPort } from "node:worker_threads";
import { spawn } from "node:child_process";
import path from "node:path";
import { commandPath } from "../../scripts/command-utils.mjs";

/**
 * Probe a video file — returns width, height, fps, duration, codec.
 */
async function probeVideo(videoPath) {
  const ffprobe = commandPath("ffprobe") || "ffprobe";

  return new Promise((resolve, reject) => {
    const child = spawn(ffprobe, [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ]);

    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`));

      try {
        const data = JSON.parse(output);
        const videoStream = data.streams?.find((s) => s.codec_type === "video");

        const result = {
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: parseFps(videoStream?.r_frame_rate),
          durationSeconds: parseFloat(data.format?.duration) || 0,
          codec: videoStream?.codec_name || "unknown",
          bitrate: parseInt(data.format?.bit_rate) || 0,
        };

        parentPort?.postMessage({ type: "probe:result", payload: result });
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  });
}

function parseFps(rFrameRate) {
  if (!rFrameRate) return 0;
  const parts = rFrameRate.split("/");
  if (parts.length === 2) return parseFloat(parts[0]) / parseFloat(parts[1]);
  return parseFloat(rFrameRate) || 0;
}

/**
 * Extract audio from video.
 */
async function extractAudio({ videoPath, outputPath, bitrate = "48k", sampleRate = 16000 }) {
  const ffmpeg = commandPath("ffmpeg") || "ffmpeg";

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-y",
      "-i", videoPath,
      "-vn",
      "-acodec", "libmp3lame",
      "-ar", String(sampleRate),
      "-ac", "1",
      "-ab", bitrate,
      outputPath,
    ]);

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      // Parse progress
      const timeMatch = stderr.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const secs =
          parseInt(timeMatch[1]) * 3600 +
          parseInt(timeMatch[2]) * 60 +
          parseFloat(timeMatch[3]);
        parentPort?.postMessage({
          type: "progress",
          stage: "Extract Audio",
          timeSeconds: secs,
        });
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
      parentPort?.postMessage({ type: "extract:result", payload: { outputPath } });
      resolve({ outputPath });
    });
  });
}

/**
 * Encode video with CRF.
 */
async function encodeVideo({ inputPath, outputPath, crf = 23, codec = "libx264", preset = "medium", scale }) {
  const ffmpeg = commandPath("ffmpeg") || "ffmpeg";

  const args = ["-y", "-i", inputPath];
  if (scale) args.push("-vf", `scale=${scale}`);
  args.push("-c:v", codec, "-crf", String(crf), "-preset", preset);
  args.push("-c:a", "aac", "-b:a", "128k");
  args.push("-progress", "pipe:1", "-nostats");
  args.push(outputPath);

  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      const timeMatch = text.match(/out_time_ms=(\d+)/);
      if (timeMatch) {
        parentPort?.postMessage({
          type: "progress",
          stage: "Encode",
          timeMs: parseInt(timeMatch[1], 10),
        });
      }
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += chunk.toString()));

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg exited with code ${code}`));
      parentPort?.postMessage({ type: "encode:result", payload: { outputPath } });
      resolve({ outputPath });
    });
  });
}

// ─── Message handler ──────────────────────────────────────────────

if (parentPort) {
  parentPort.on("message", async ({ type, payload }) => {
    try {
      switch (type) {
        case "probe":
          await probeVideo(payload.videoPath);
          break;
        case "extract-audio":
          await extractAudio(payload);
          break;
        case "encode":
          await encodeVideo(payload);
          break;
        default:
          parentPort.postMessage({ type: "error", message: `Unknown operation: ${type}` });
      }
    } catch (error) {
      parentPort.postMessage({ type: "error", message: error.message, stack: error.stack });
    }
  });
}
