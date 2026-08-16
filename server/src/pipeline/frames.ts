import { spawn } from "node:child_process";
import path from "node:path";
import type { Shot, Keyframe } from "../jobs.js";

const MAX_FRAMES = 20;
const MAX_WIDTH = 768;
const JPEG_QFACTOR = "4"; // ffmpeg mjpeg qscale, 2(best)-31(worst); ~4 approximates quality 80

/** Evenly samples shots down to at most `max` entries, always keeping first and last. */
function sampleShots(shots: Shot[], max: number): Shot[] {
  if (shots.length <= max) return shots;
  const step = (shots.length - 1) / (max - 1);
  const picked: Shot[] = [];
  for (let i = 0; i < max; i++) {
    picked.push(shots[Math.round(i * step)]);
  }
  return Array.from(new Set(picked));
}

function extractFrame(videoPath: string, timestampSec: number, outPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      "-ss",
      timestampSec.toFixed(3),
      "-i",
      videoPath,
      "-vframes",
      "1",
      "-vf",
      `scale='min(${MAX_WIDTH},iw)':-2`,
      "-q:v",
      JPEG_QFACTOR,
      "-y",
      outPath,
    ];
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg frame extraction failed (${outPath}): ${stderr.slice(-500)}`));
    });
  });
}

export async function extractKeyframes(
  videoPath: string,
  shots: Shot[],
  framesDir: string,
  jobId: string,
  mediaBaseUrl: string
): Promise<Keyframe[]> {
  const sampled = sampleShots(shots, MAX_FRAMES);
  const keyframes: Keyframe[] = [];

  for (const shot of sampled) {
    const midpoint = shot.startSec + shot.durationSec / 2;
    const filename = `${jobId}_shot${shot.index}.jpg`;
    const outPath = path.join(framesDir, filename);
    await extractFrame(videoPath, midpoint, outPath);
    keyframes.push({
      shotIndex: shot.index,
      timestampSec: Math.round(midpoint * 100) / 100,
      url: `${mediaBaseUrl}/${filename}`,
      filePath: outPath,
    });
  }

  return keyframes;
}
