import { randomUUID } from "node:crypto";
import type { StyleSpec } from "./schema/styleSpec.js";
import type { FidelityReport, VerifyStatus } from "./schema/fidelity.js";

export type ApplyJobStatus = "queued" | "grading" | "titling" | "rendering" | "done" | "failed";

export interface ApplyJob {
  id: string;
  status: ApplyJobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;

  targetVideoPath: string;
  targetOriginalFilename: string;
  spec: StyleSpec;
  titleText?: string;

  gradeApplied?: boolean;
  gradeSkipReason?: string;

  titleApplied?: boolean;
  titleSkipReason?: string;
  resolvedFontFamily?: string;

  outputUrl?: string;
  outputPath?: string;

  // Phase 4. Verification runs *after* the job reaches "done" so a failing
  // verifier can never withhold a render that already succeeded.
  verifyStatus?: VerifyStatus;
  verifyError?: string;
  fidelity?: FidelityReport;
}

const applyJobs = new Map<string, ApplyJob>();

export function createApplyJob(
  targetOriginalFilename: string,
  spec: StyleSpec,
  titleText: string | undefined
): ApplyJob {
  const job: ApplyJob = {
    id: randomUUID(),
    status: "queued",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    targetVideoPath: "",
    targetOriginalFilename,
    spec,
    titleText,
  };
  applyJobs.set(job.id, job);
  return job;
}

export function getApplyJob(id: string): ApplyJob | undefined {
  return applyJobs.get(id);
}

export function updateApplyJob(id: string, patch: Partial<ApplyJob>): ApplyJob {
  const job = applyJobs.get(id);
  if (!job) throw new Error(`Apply job ${id} not found`);
  Object.assign(job, patch, { updatedAt: Date.now() });
  return job;
}

export function setApplyStatus(id: string, status: ApplyJobStatus): ApplyJob {
  return updateApplyJob(id, { status });
}

export function failApplyJob(id: string, error: string): ApplyJob {
  return updateApplyJob(id, { status: "failed", error });
}
