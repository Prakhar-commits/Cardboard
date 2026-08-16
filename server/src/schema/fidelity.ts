/**
 * The Phase 4 output shape. Kept beside the StyleSpec schema rather than in
 * the pipeline so the job store can reference it without importing the
 * verifier. Note what this measures: whether the render matches the spec,
 * not whether the video is good.
 */

export type Verdict = "matched" | "drifted" | "missed";

export interface FidelityRow {
  attribute: string;
  intended: string;
  achieved: string;
  verdict: Verdict;
  delta?: string;
  /** Stated limitation of *this* measurement, surfaced in the UI. */
  caveat?: string;
}

export interface FidelityReport {
  rows: FidelityRow[];
  scored: number;
  matched: number;
  /** Attributes deliberately left unscored, with the reason. Never rendered
   *  as passes — see CLAUDE.md "Never claim a confidence the pipeline didn't earn". */
  notScored: Array<{ attribute: string; reason: string }>;
  framesAnalyzed: number;
}

export type VerifyStatus = "not_started" | "running" | "done" | "failed";
