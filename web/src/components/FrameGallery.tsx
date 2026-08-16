import type { Keyframe } from "../lib/types.js";

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export function FrameGallery({ keyframes }: { keyframes: Keyframe[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {keyframes.map((kf) => (
        <div key={kf.shotIndex} className="group relative overflow-hidden border border-hairline bg-surface-2">
          <img src={kf.url} alt={`Shot ${kf.shotIndex}`} className="aspect-video w-full object-cover" />
          <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 font-mono text-[11px] text-white/90">
            {formatClock(kf.timestampSec)}
          </span>
        </div>
      ))}
    </div>
  );
}
