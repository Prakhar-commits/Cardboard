/**
 * A rolling cap on how much model spend the demo can incur.
 *
 * Tracked separately from the job store because cleanup drops job records
 * after an hour — counting the map would silently turn a daily budget into an
 * hourly one.
 *
 * Honest limitation: this lives in memory, so a restart resets the budget.
 * That is acceptable for a demo gate whose real backstop is a spend limit on
 * the Anthropic key itself; it is not a billing control.
 */

const WINDOW_MS = 24 * 60 * 60 * 1000;

/** Timestamps of billable runs (extraction and apply each cost model calls). */
const runs: number[] = [];

function prune(now: number): void {
  const cutoff = now - WINDOW_MS;
  while (runs.length > 0 && runs[0] < cutoff) {
    runs.shift();
  }
}

export function runsInWindow(): number {
  prune(Date.now());
  return runs.length;
}

export function recordRun(): void {
  runs.push(Date.now());
}

export interface CapCheck {
  allowed: boolean;
  used: number;
  limit: number;
}

export function checkCap(limit: number): CapCheck {
  const used = runsInWindow();
  return { allowed: used < limit, used, limit };
}
