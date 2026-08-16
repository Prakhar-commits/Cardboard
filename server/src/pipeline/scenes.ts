import { spawn } from "node:child_process";
import type { Shot } from "../jobs.js";
import type { StyleSpec } from "../schema/styleSpec.js";

const SCENE_THRESHOLD = 0.3;
const PTS_TIME_RE = /pts_time:([\d.]+)/g;

/**
 * Runs ffmpeg's scene-change filter and parses `pts_time` values out of the
 * showinfo stderr log. This is the entire pacing block, computed with no AI.
 */
export function detectCutTimestamps(filePath: string): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      filePath,
      "-filter:v",
      `select='gt(scene,${SCENE_THRESHOLD})',showinfo`,
      "-f",
      "null",
      "-",
    ];
    const proc = spawn("ffmpeg", args);

    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", (err) => reject(err));
    proc.on("close", () => {
      const timestamps: number[] = [];
      let match: RegExpExecArray | null;
      PTS_TIME_RE.lastIndex = 0;
      while ((match = PTS_TIME_RE.exec(stderr)) !== null) {
        timestamps.push(Number(match[1]));
      }
      resolve(timestamps);
    });
  });
}

export function buildShots(cutTimestamps: number[], durationSec: number): Shot[] {
  const boundaries = [0, ...cutTimestamps.filter((t) => t > 0 && t < durationSec), durationSec];
  const uniqueSorted = Array.from(new Set(boundaries)).sort((a, b) => a - b);

  const shots: Shot[] = [];
  for (let i = 0; i < uniqueSorted.length - 1; i++) {
    const startSec = uniqueSorted[i];
    const endSec = uniqueSorted[i + 1];
    if (endSec - startSec < 0.1) continue; // drop degenerate near-zero shots
    shots.push({
      index: shots.length,
      startSec,
      endSec,
      durationSec: endSec - startSec,
    });
  }
  // Re-index in case any were dropped.
  return shots.map((s, i) => ({ ...s, index: i }));
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function computeRhythm(shotLengths: number[]): StyleSpec["pacing"]["rhythm"] {
  if (shotLengths.length < 3) return "steady";

  const m = mean(shotLengths);
  const sd = stddev(shotLengths);
  const coefficientOfVariation = m > 0 ? sd / m : 0;

  if (coefficientOfVariation > 0.75) return "erratic";

  // Trend: compare mean of first half vs second half.
  const mid = Math.floor(shotLengths.length / 2);
  const firstHalf = mean(shotLengths.slice(0, mid));
  const secondHalf = mean(shotLengths.slice(mid));
  const trendRatio = firstHalf > 0 ? (secondHalf - firstHalf) / firstHalf : 0;

  if (trendRatio < -0.25) return "accelerating"; // shots getting shorter
  if (trendRatio > 0.25) return "decelerating"; // shots getting longer
  return "steady";
}

export interface PacingResult {
  shots: Shot[];
  pacing: StyleSpec["pacing"];
}

export function computePacing(cutTimestamps: number[], durationSec: number): PacingResult {
  const shots = buildShots(cutTimestamps, durationSec);
  const shotLengths = shots.map((s) => s.durationSec);
  const totalCuts = Math.max(shots.length - 1, 0);
  const avgShotLengthSec = shotLengths.length ? mean(shotLengths) : durationSec;
  const cutsPerMinute = durationSec > 0 ? (totalCuts / durationSec) * 60 : 0;
  const rhythm = computeRhythm(shotLengths);

  return {
    shots,
    pacing: {
      totalCuts,
      cutsPerMinute: Math.round(cutsPerMinute * 10) / 10,
      avgShotLengthSec: Math.round(avgShotLengthSec * 100) / 100,
      shotLengths: shotLengths.map((v) => Math.round(v * 100) / 100),
      rhythm,
      notes: `${shots.length} shot${shots.length === 1 ? "" : "s"} detected, avg ${avgShotLengthSec.toFixed(2)}s.`,
    },
  };
}
