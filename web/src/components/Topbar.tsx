import { useTimecode } from "../lib/useTimecode.js";

export type AppStatus = "IDLE" | "ANALYZING" | "READY" | "ERROR";

const STATUS_COLOR: Record<AppStatus, string> = {
  IDLE: "bg-text-faint",
  ANALYZING: "bg-accent",
  READY: "bg-ok",
  ERROR: "bg-accent",
};

export function Topbar({ status, jobId }: { status: AppStatus; jobId?: string }) {
  const tc = useTimecode();

  return (
    <header className="relative border-b border-hairline px-6 py-3 flex items-center justify-between">
      <span className="absolute left-2 top-2 w-2 h-2 border-l border-t border-accent" aria-hidden />
      <span className="absolute right-2 top-2 w-2 h-2 border-r border-t border-accent" aria-hidden />

      <div className="flex items-center gap-3">
        <div className="w-6 h-6 border border-accent flex items-center justify-center" aria-hidden>
          <div className="w-2.5 h-2.5 bg-accent" />
        </div>
        <span className="font-mono uppercase tracking-wider text-[15px] text-text">style/decomposer</span>
      </div>

      <div className="flex items-center gap-4 font-mono text-[13px] text-text-dim">
        {jobId && (
          <span className="hidden sm:inline">
            JOB <span className="text-text-faint">{jobId.slice(0, 8)}</span>
          </span>
        )}
        <span className="tabular-nums">{tc}</span>
        <span className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${STATUS_COLOR[status]} ${
              status === "ANALYZING" ? "motion-safe:animate-pulse" : ""
            }`}
            aria-hidden
          />
          <span>{status}</span>
        </span>
      </div>
    </header>
  );
}
