import { useEffect, useState } from "react";
import type { StyleSpec } from "../lib/types.js";

function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Shot-length timeline. Width is the only duration encoding — the strip is
 * proportional to real time, so cut density reads directly as rhythm.
 * Deliberately NOT also encoding duration in height: that would make each
 * bar's area duration², which exaggerates long takes.
 */
export function PacingRibbon({ pacing, durationSec }: { pacing: StyleSpec["pacing"]; durationSec: number }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const lengths = pacing.shotLengths.length ? pacing.shotLengths : [durationSec];
  const min = Math.min(...lengths);
  const max = Math.max(...lengths);
  const longestIndex = lengths.indexOf(max);

  return (
    <div className="border border-hairline bg-surface p-4">
      <div className="relative h-24 pt-5">
        {/* Recessive gridlines — the cap rule doubles as the chart's top axis. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-hairline" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-hairline" />

        <div className="flex h-full items-end gap-[2px]">
          {lengths.map((len, i) => {
            const widthPct = (len / durationSec) * 100;
            const isLongest = i === longestIndex;
            return (
              <div
                key={i}
                title={`shot ${i}: ${len.toFixed(1)}s`}
                className="group relative h-full cursor-pointer border-t-2 border-accent"
                style={{
                  width: `${widthPct}%`,
                  minWidth: "3px",
                  // The bars have to be LIGHTER than the surface, not darker.
                  // The previous fill sat one step off the background at
                  // ~1.3:1, so the 2px gaps — which are the cuts, the actual
                  // information — had no edges to read against. This clears
                  // the 3:1 floor for graphical marks.
                  backgroundImage: "linear-gradient(180deg, #5C636E 0%, #383E47 100%)",
                  transform: mounted ? "scaleY(1)" : "scaleY(0)",
                  transformOrigin: "bottom",
                  transition: `transform 300ms ease-out ${Math.min(i * 40, 800)}ms`,
                }}
              >
                {isLongest && (
                  <span className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] uppercase tracking-widest text-text-dim">
                    longest · {len.toFixed(1)}s
                  </span>
                )}
                <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap border border-hairline-strong bg-bg px-1.5 py-0.5 font-mono text-[12px] text-text opacity-0 transition-opacity group-hover:opacity-100">
                  shot {i} · {len.toFixed(1)}s
                </span>
              </div>
            );
          })}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-hairline-strong" />
      </div>

      <div className="mt-2 flex justify-between font-mono text-[12px] text-text-faint">
        <span>00:00</span>
        <span>{formatClock(durationSec / 2)}</span>
        <span>{formatClock(durationSec)}</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-hairline pt-3 font-mono text-[13px] text-text-dim">
        <span>
          RHYTHM · <span className="text-accent">{pacing.rhythm}</span>
        </span>
        <span>
          SHOTS · <span className="text-text">{lengths.length}</span>
        </span>
        <span>AVG · {pacing.avgShotLengthSec.toFixed(2)}s</span>
        <span>MIN · {min.toFixed(2)}s</span>
        <span>MAX · {max.toFixed(2)}s</span>
        <span>CUTS/MIN · {pacing.cutsPerMinute.toFixed(1)}</span>
      </div>

      <p className="mt-2 font-mono text-[12px] text-text-faint">
        bar width = shot duration · hover a shot for its timecode
      </p>
    </div>
  );
}
