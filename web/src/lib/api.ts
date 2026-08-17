import type { ApplyJob, Job, StyleSpec } from "./types.js";

export interface SessionState {
  required: boolean;
  authenticated: boolean;
}

export async function fetchSession(): Promise<SessionState> {
  const res = await fetch("/api/session");
  if (!res.ok) throw new Error(`Session check failed (${res.status}).`);
  return res.json();
}

export async function login(password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Sign in failed (${res.status}).`);
  }
}

export async function uploadVideo(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("video", file);

  const res = await fetch("/api/jobs", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Upload failed (${res.status}).`);
  }
  return res.json();
}

export async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${jobId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch job (${res.status}).`);
  }
  return res.json();
}

export async function applyStyle(
  targetVideo: File,
  spec: StyleSpec,
  titleText: string
): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append("video", targetVideo);
  formData.append("spec", JSON.stringify(spec));
  if (titleText.trim()) formData.append("title", titleText);

  const res = await fetch("/api/apply", { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Apply failed (${res.status}).`);
  }
  return res.json();
}

export async function fetchApplyJob(jobId: string): Promise<ApplyJob> {
  const res = await fetch(`/api/apply/${jobId}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Failed to fetch apply job (${res.status}).`);
  }
  return res.json();
}
