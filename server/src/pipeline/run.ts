import { updateJob, setStatus, failJob, type Job } from "../jobs.js";
import { probeVideo, IngestError } from "./ingest.js";
import { detectCutTimestamps, computePacing } from "./scenes.js";
import { extractKeyframes } from "./frames.js";
import { analyzeAudio } from "./audio.js";
import { extractPalette } from "./palette.js";
import { analyzeVision } from "./vision.js";
import { aggregateStyleSpec } from "./aggregate.js";

export async function runPipeline(job: Job, framesDir: string, mediaBaseUrl: string): Promise<void> {
  try {
    if (!job.videoPath) throw new Error("Job has no video path.");

    setStatus(job.id, "ingesting");
    const probe = await probeVideo(job.videoPath);
    updateJob(job.id, {
      source: {
        durationSec: probe.durationSec,
        resolution: probe.resolution,
        aspectRatio: probe.aspectRatio,
        fps: probe.fps,
      },
    });

    setStatus(job.id, "detecting_scenes");
    const cutTimestamps = await detectCutTimestamps(job.videoPath);
    const { shots, pacing } = computePacing(cutTimestamps, probe.durationSec);
    updateJob(job.id, { shots, pacing });

    setStatus(job.id, "extracting_frames");
    const keyframes = await extractKeyframes(job.videoPath, shots, framesDir, job.id, mediaBaseUrl);
    updateJob(job.id, { keyframes });

    setStatus(job.id, "analyzing_audio");
    const audio = await analyzeAudio(job.videoPath, probe.durationSec);
    updateJob(job.id, { audio });

    setStatus(job.id, "extracting_palette");
    const palette = await extractPalette(keyframes, shots);
    updateJob(job.id, { palette });

    setStatus(job.id, "analyzing_vision");
    const visionOutput = await analyzeVision(keyframes, probe.durationSec);
    updateJob(job.id, { visionRaw: visionOutput });

    setStatus(job.id, "aggregating");
    const spec = aggregateStyleSpec(job, visionOutput);
    updateJob(job.id, { spec });

    setStatus(job.id, "done");
  } catch (err) {
    const message =
      err instanceof IngestError
        ? err.message
        : err instanceof Error
        ? err.message
        : "Unknown pipeline error.";
    failJob(job.id, message);
  }
}
