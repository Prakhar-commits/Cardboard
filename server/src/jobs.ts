import { randomUUID } from "node:crypto";
import type { StyleSpec } from "./schema/styleSpec.js";

export type JobStatus =
  | "queued"
  | "ingesting"
  | "detecting_scenes"
  | "extracting_frames"
  | "analyzing_audio"
  | "extracting_palette"
  | "analyzing_vision"
  | "aggregating"
  | "done"
  | "failed";

export interface Shot {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface Keyframe {
  shotIndex: number;
  timestampSec: number;
  url: string; // served via /media
  filePath: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;

  originalFilename: string;
  videoPath?: string;

  source?: {
    durationSec: number;
    resolution: string;
    aspectRatio: string;
    fps: number;
  };

  shots?: Shot[];
  pacing?: StyleSpec["pacing"];
  keyframes: Keyframe[];

  audio?: {
    hasMusic: boolean;
    hasSpeech: boolean;
    energyProfile: "low" | "building" | "high" | "dynamic";
    estimatedBpm: number | null;
  };

  palette?: Array<{ hex: string; role: "dominant" | "secondary" | "accent"; coverage: number }>;

  visionRaw?: unknown;

  spec?: StyleSpec;
}

const STATUS_ORDER: JobStatus[] = [
  "queued",
  "ingesting",
  "detecting_scenes",
  "extracting_frames",
  "analyzing_audio",
  "extracting_palette",
  "analyzing_vision",
  "aggregating",
  "done",
];

const jobs = new Map<string, Job>();

export function createJob(originalFilename: string): Job {
  const job: Job = {
    id: randomUUID(),
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    originalFilename,
    keyframes: [],
  };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

export function updateJob(id: string, patch: Partial<Job>): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Job ${id} not found`);
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function setStatus(id: string, status: JobStatus): Job {
  return updateJob(id, { status });
}

export function failJob(id: string, error: string): Job {
  return updateJob(id, { status: "failed", error });
}

export function statusIndex(status: JobStatus): number {
  return STATUS_ORDER.indexOf(status);
}
