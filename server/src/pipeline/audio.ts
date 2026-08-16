import { spawn } from "node:child_process";
import type { StyleSpec } from "../schema/styleSpec.js";

interface VolumeStats {
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
}

function runFfmpegStderr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", () => resolve(stderr));
  });
}

async function getVolumeStats(filePath: string): Promise<VolumeStats> {
  const stderr = await runFfmpegStderr(["-i", filePath, "-af", "volumedetect", "-f", "null", "-"]);
  const meanMatch = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
  const maxMatch = stderr.match(/max_volume:\s*(-?[\d.]+)\s*dB/);
  return {
    meanVolumeDb: meanMatch ? Number(meanMatch[1]) : null,
    maxVolumeDb: maxMatch ? Number(maxMatch[1]) : null,
  };
}

interface SilenceSegment {
  start: number;
  end: number;
}

async function getSilenceSegments(filePath: string): Promise<SilenceSegment[]> {
  const stderr = await runFfmpegStderr([
    "-i",
    filePath,
    "-af",
    "silencedetect=noise=-30dB:d=0.3",
    "-f",
    "null",
    "-",
  ]);
  const starts = [...stderr.matchAll(/silence_start:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end:\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const segments: SilenceSegment[] = [];
  for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
    segments.push({ start: starts[i], end: ends[i] });
  }
  return segments;
}

export async function analyzeAudio(filePath: string, durationSec: number): Promise<StyleSpec["audio"]> {
  const [{ meanVolumeDb, maxVolumeDb }, silenceSegments] = await Promise.all([
    getVolumeStats(filePath),
    getSilenceSegments(filePath),
  ]);

  const hasAudioSignal = meanVolumeDb !== null && meanVolumeDb > -50;

  // Speech tends to leave short, frequent pauses; sustained music leaves few/none.
  const speechLikeGaps = silenceSegments.filter((s) => s.end - s.start >= 0.15 && s.end - s.start <= 1.5);
  const hasSpeech = hasAudioSignal && speechLikeGaps.length >= 2;

  const totalSilenceSec = silenceSegments.reduce((sum, s) => sum + (s.end - s.start), 0);
  const silenceRatio = durationSec > 0 ? totalSilenceSec / durationSec : 0;
  const hasMusic = hasAudioSignal && silenceRatio < 0.4;

  const dynamicRangeDb = meanVolumeDb !== null && maxVolumeDb !== null ? maxVolumeDb - meanVolumeDb : 0;

  let energyProfile: StyleSpec["audio"]["energyProfile"] = "low";
  if (!hasAudioSignal) {
    energyProfile = "low";
  } else if (dynamicRangeDb > 18) {
    energyProfile = "dynamic";
  } else if (meanVolumeDb !== null && meanVolumeDb > -18) {
    energyProfile = "high";
  } else if (silenceRatio > 0.15 && silenceRatio < 0.5) {
    energyProfile = "building";
  } else {
    energyProfile = "low";
  }

  return {
    hasMusic,
    hasSpeech,
    energyProfile,
    estimatedBpm: null, // not worth the analysis cost per CLAUDE.md guidance
  };
}
