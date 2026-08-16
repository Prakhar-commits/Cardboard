import { useEffect, useRef, useState } from "react";
import type { ApplyJob, FidelityReport as FidelityReportType, StyleSpec } from "../lib/types.js";
import { applyStyle, fetchApplyJob } from "../lib/api.js";
import { FidelityReport } from "./FidelityReport.js";

const POLL_INTERVAL_MS = 1500;

const STAGES: Array<{ status: ApplyJob["status"]; label: string }> = [
  { status: "grading", label: "GRADE" },
  { status: "titling", label: "TITLE" },
  { status: "rendering", label: "RENDER" },
];
const STAGE_ORDER = ["queued", "grading", "titling", "rendering", "done"];

/** Verification runs after the job reports "done", so polling has to outlive
 *  the terminal render status. */
function isSettled(job: ApplyJob): boolean {
  if (job.status === "failed") return true;
  if (job.status !== "done") return false;
  return job.verifyStatus === "done" || job.verifyStatus === "failed";
}

/**
 * The verification result, stated above the players rather than under them.
 * The report below carries the per-attribute detail, but the headline number
 * has to be visible without hunting for it — it is the part of the demo that
 * distinguishes this from a before/after GIF.
 */
function VerdictBanner({
  status,
  report,
  error,
}: {
  status?: ApplyJob["verifyStatus"];
  report?: FidelityReportType;
  error?: string;
}) {
  if (!status || status === "not_started") return null;

  if (status === "running") {
    return (
      <div className="mt-4 flex items-center gap-2 border border-hairline-strong bg-surface-2 px-3 py-2.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        <span className="font-mono text-[13px] uppercase tracking-widest text-text">Verifying</span>
        <span className="text-[13px] text-text-dim">re-extracting the style from our own render…</span>
      </div>
    );
  }

  if (status === "failed" || !report) {
    return (
      <div className="mt-4 border border-hairline-strong bg-surface-2 px-3 py-2.5">
        <span className="font-mono text-[13px] uppercase tracking-widest text-warn">
          Verification unavailable
        </span>
        <p className="mt-1 text-[13px] text-text-dim">The render above is unaffected. {error}</p>
      </div>
    );
  }

  if (report.scored === 0) {
    return (
      <div className="mt-4 border border-hairline-strong bg-surface-2 px-3 py-2.5">
        <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
          Nothing applied — nothing scored
        </span>
      </div>
    );
  }

  const drifted = report.rows.filter((r) => r.verdict === "drifted").length;
  const missed = report.rows.filter((r) => r.verdict === "missed").length;

  return (
    <div className="mt-4 border border-hairline-strong bg-surface-2 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] uppercase tracking-widest text-text">Verified</span>
        <span className="text-[15px] text-text">
          <span className="text-ok">{report.matched}</span> of {report.scored} attributes matched
        </span>
        {drifted > 0 && <span className="font-mono text-[12px] text-warn">{drifted} drifted</span>}
        {missed > 0 && <span className="font-mono text-[12px] text-accent">{missed} missed</span>}
      </div>

      {/* One cell per scored attribute — the shape of the result, readable at a glance. */}
      <div className="mt-2 flex gap-1">
        {report.rows.map((row) => (
          <span
            key={row.attribute}
            title={`${row.attribute}: ${row.verdict}`}
            className={`h-1.5 flex-1 ${
              row.verdict === "matched" ? "bg-ok" : row.verdict === "drifted" ? "bg-warn" : "bg-accent"
            }`}
          />
        ))}
      </div>

      <p className="mt-2 text-[13px] text-text-dim">
        Full per-attribute breakdown below — what was asked for, what came back, and what we did not
        measure.
      </p>
    </div>
  );
}

export function ApplyPanel({ spec }: { spec: StyleSpec }) {
  const [targetFile, setTargetFile] = useState<File | null>(null);
  const [titleText, setTitleText] = useState("");
  const [applyJob, setApplyJob] = useState<ApplyJob | null>(null);
  const [error, setError] = useState<string | undefined>();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const beforeUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (beforeUrlRef.current) URL.revokeObjectURL(beforeUrlRef.current);
    };
  }, []);

  const handleFile = (file: File | null) => {
    setTargetFile(file);
    if (beforeUrlRef.current) URL.revokeObjectURL(beforeUrlRef.current);
    beforeUrlRef.current = file ? URL.createObjectURL(file) : null;
  };

  const handleApply = async () => {
    if (!targetFile) return;
    setError(undefined);
    try {
      const { jobId } = await applyStyle(targetFile, spec, titleText);
      const initial = await fetchApplyJob(jobId);
      setApplyJob(initial);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await fetchApplyJob(jobId);
          setApplyJob(updated);
          if (isSettled(updated)) {
            if (pollRef.current) clearInterval(pollRef.current);
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed.");
    }
  };

  const busy = applyJob && applyJob.status !== "done" && applyJob.status !== "failed";

  return (
    <section className="mt-8">
      <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
        Reel 04 · Apply this style
      </span>

      <div className="mt-3 border border-hairline bg-surface p-4">
        {!applyJob && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">
                Target footage
              </span>
              <input
                type="file"
                accept="video/mp4,video/quicktime"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                className="font-mono text-[13px] text-text-dim file:mr-3 file:border file:border-hairline-strong file:bg-transparent file:px-2 file:py-1 file:font-mono file:text-[12px] file:uppercase file:tracking-widest file:text-text hover:file:border-accent"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">
                Title text {!spec.typography.present && "(typography.present is false — titling will be skipped)"}
              </span>
              <input
                type="text"
                value={titleText}
                onChange={(e) => setTitleText(e.target.value)}
                placeholder="Sample Title"
                className="border border-hairline-strong bg-transparent px-2 py-1.5 text-[15px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
              />
            </label>

            <button
              onClick={handleApply}
              disabled={!targetFile}
              className="self-start border border-hairline-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-widest text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              Apply style
            </button>

            {error && <p className="font-mono text-[12px] text-accent">{error}</p>}
          </div>
        )}

        {applyJob && (
          <div>
            <div className="flex flex-wrap gap-2 font-mono text-[12px] uppercase tracking-wide">
              {STAGES.map((stage) => {
                const idx = STAGE_ORDER.indexOf(stage.status);
                const currentIdx = STAGE_ORDER.indexOf(applyJob.status);
                const isDone = currentIdx > idx || applyJob.status === "done";
                const isActive = applyJob.status === stage.status;
                return (
                  <span
                    key={stage.status}
                    className={`border px-2 py-1 ${
                      isActive
                        ? "border-accent text-accent"
                        : isDone
                        ? "border-hairline-strong text-text"
                        : "border-hairline text-text-faint"
                    }`}
                  >
                    {stage.label}
                    {isDone && !isActive ? " ✓" : ""}
                  </span>
                );
              })}
              {applyJob.status === "done" && applyJob.verifyStatus && (
                <span
                  className={`border px-2 py-1 ${
                    applyJob.verifyStatus === "running"
                      ? "border-accent text-accent"
                      : applyJob.verifyStatus === "failed"
                      ? "border-hairline-strong text-warn"
                      : "border-hairline-strong text-text"
                  }`}
                >
                  VERIFY
                  {applyJob.verifyStatus === "done" ? " ✓" : ""}
                </span>
              )}
            </div>

            {applyJob.status === "failed" && (
              <p className="mt-3 font-mono text-[13px] text-accent">{applyJob.error ?? "Apply failed."}</p>
            )}

            {(applyJob.status === "done" || applyJob.gradeSkipReason || applyJob.titleSkipReason) && (
              <div className="mt-3 flex flex-col gap-1 font-mono text-[12px] text-text-dim">
                <span>
                  color grade:{" "}
                  {applyJob.gradeApplied ? (
                    <span className="text-ok">applied</span>
                  ) : (
                    <span className="text-text-faint">skipped — {applyJob.gradeSkipReason}</span>
                  )}
                </span>
                <span>
                  title:{" "}
                  {applyJob.titleApplied ? (
                    <span className="text-ok">
                      applied in <span className="text-text">{applyJob.resolvedFontFamily}</span>
                    </span>
                  ) : (
                    <span className="text-text-faint">skipped — {applyJob.titleSkipReason}</span>
                  )}
                </span>
              </div>
            )}

            {busy && <p className="mt-3 font-mono text-[13px] text-text-dim">Rendering…</p>}

            {applyJob.status === "done" && (
              <>
                <VerdictBanner
                  status={applyJob.verifyStatus}
                  report={applyJob.fidelity}
                  error={applyJob.verifyError}
                />

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">Before</span>
                    {beforeUrlRef.current && (
                      <video src={beforeUrlRef.current} controls className="mt-1 w-full border border-hairline" />
                    )}
                  </div>
                  <div>
                    <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">After</span>
                    {applyJob.outputUrl && (
                      <video src={applyJob.outputUrl} controls className="mt-1 w-full border border-hairline" />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {applyJob?.status === "done" && (
        <FidelityReport
          report={applyJob.fidelity}
          status={applyJob.verifyStatus}
          error={applyJob.verifyError}
        />
      )}
    </section>
  );
}
