import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { forgetJobsOlderThan } from "./jobs.js";
import { forgetApplyJobsOlderThan } from "./applyJobs.js";

/**
 * Nothing in the pipeline deletes what it writes, so a public demo fills its
 * disk in about a day. This sweeps by file age rather than by tracking every
 * path the pipeline produces — the verifier writes frames under its own id
 * prefixes, and an age sweep catches those without bookkeeping that can drift
 * out of sync with the code that creates them.
 *
 * Job state lives in memory and dies with the process, so files older than a
 * job's useful life are already orphaned. Nothing here needs to survive a
 * restart.
 */

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour
const SWEEP_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

async function sweepDirectory(dir: string, maxAgeMs: number, now: number): Promise<number> {
  let removed = 0;
  let entries: string[];

  try {
    entries = await readdir(dir);
  } catch {
    return 0; // directory not created yet — nothing to do
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) continue;
      if (now - info.mtimeMs > maxAgeMs) {
        await unlink(filePath);
        removed++;
      }
    } catch {
      // A file vanishing mid-sweep is fine — that is the outcome we wanted.
    }
  }

  return removed;
}

export interface CleanupConfig {
  /** Swept by file age. Deliberately excludes the font cache, which is a
   *  genuine cache: re-fetching every TTL would waste time and bandwidth. */
  directories: string[];
  ttlMs?: number;
}

export async function runSweep(config: CleanupConfig): Promise<number> {
  const ttlMs = config.ttlMs ?? DEFAULT_TTL_MS;
  const now = Date.now();

  let removed = 0;
  for (const dir of config.directories) {
    removed += await sweepDirectory(dir, ttlMs, now);
  }

  const jobsDropped = forgetJobsOlderThan(ttlMs) + forgetApplyJobsOlderThan(ttlMs);
  if (removed > 0 || jobsDropped > 0) {
    console.log(`[cleanup] removed ${removed} file(s), dropped ${jobsDropped} job record(s)`);
  }

  return removed;
}

export function startCleanupLoop(config: CleanupConfig): void {
  const tick = () => {
    void runSweep(config).catch((err) => console.error("[cleanup] sweep failed:", err));
  };
  tick();
  // unref so a pending sweep never holds the process open on shutdown.
  setInterval(tick, SWEEP_INTERVAL_MS).unref();
}
