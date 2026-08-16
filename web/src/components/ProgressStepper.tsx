import type { Job, JobStatus } from "../lib/types.js";

interface Stage {
  code: string;
  label: string;
  status: JobStatus;
}

const STAGES: Stage[] = [
  { code: "01", label: "INGEST", status: "ingesting" },
  { code: "02", label: "SCENES", status: "detecting_scenes" },
  { code: "03", label: "FRAMES", status: "extracting_frames" },
  { code: "04", label: "AUDIO", status: "analyzing_audio" },
  { code: "05", label: "PALETTE", status: "extracting_palette" },
  { code: "06", label: "VISION", status: "analyzing_vision" },
  { code: "07", label: "SPEC", status: "aggregating" },
];

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

function stageDetail(stage: Stage, job: Job): string {
  switch (stage.status) {
    case "ingesting":
      return job.source
        ? `src probed · ${job.source.durationSec.toFixed(1)}s · ${job.source.resolution}`
        : "";
    case "detecting_scenes":
      return job.shots ? `${Math.max(job.shots.length - 1, 0)} cuts detected` : "";
    case "extracting_frames":
      return job.keyframes.length ? `sampling ${job.keyframes.length} frames` : "";
    case "analyzing_audio":
      return job.audio ? `${job.audio.hasMusic ? "music" : "no music"} · ${job.audio.energyProfile}` : "";
    case "extracting_palette":
      return job.palette ? `${job.palette.length} colors extracted` : "";
    case "analyzing_vision":
      return job.status === "aggregating" || job.status === "done" ? "vision analysis complete" : "";
    case "aggregating":
      return job.spec ? "spec validated" : "";
    default:
      return "";
  }
}

export function ProgressStepper({ job }: { job: Job }) {
  const currentIdx = STATUS_ORDER.indexOf(job.status);

  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-16">
      <span className="font-mono text-[13px] uppercase tracking-widest text-accent">
        {job.originalFilename}
      </span>
      <h1 className="mt-2 mb-8 text-2xl font-semibold text-text">Decomposing reference…</h1>

      <div className="border border-hairline bg-surface divide-y divide-hairline">
        {STAGES.map((stage) => {
          const stageIdx = STATUS_ORDER.indexOf(stage.status);
          const isDone = currentIdx > stageIdx || job.status === "done";
          const isActive = job.status === stage.status;
          const isQueued = !isDone && !isActive;
          const detail = stageDetail(stage, job);

          return (
            <div key={stage.code} className="flex items-center gap-4 px-5 py-3 font-mono text-[13px]">
              <span className="text-text-faint">{stage.code}</span>
              <span
                className={
                  isActive ? "text-accent" : isDone ? "text-text" : "text-text-faint"
                }
              >
                {stage.label}
              </span>
              <span
                className={`uppercase ${
                  isDone ? "text-ok" : isActive ? "text-accent" : "text-text-faint"
                }`}
              >
                [{isDone ? "done" : isActive ? "active" : "queued"}]
              </span>
              <span className="text-text-dim flex-1 text-right truncate">{detail}</span>
            </div>
          );
        })}
      </div>

      {job.status === "failed" && (
        <p className="mt-6 font-mono text-[13px] text-accent">{job.error ?? "Pipeline failed."}</p>
      )}

      {job.keyframes.length > 0 && (
        <div className="mt-8">
          <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
            keyframes · {job.keyframes.length}
          </span>
          <div className="mt-3 grid grid-cols-6 gap-2">
            {job.keyframes.map((kf) => (
              <div key={kf.shotIndex} className="aspect-video overflow-hidden border border-hairline bg-surface-2">
                <img src={kf.url} alt={`Shot ${kf.shotIndex}`} className="w-full h-full object-cover" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
