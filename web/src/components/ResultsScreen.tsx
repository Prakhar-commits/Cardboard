import { useState } from "react";
import type { AttributeKey, Job } from "../lib/types.js";
import { ATTRIBUTE_KEYS } from "../lib/types.js";
import { PacingRibbon } from "./PacingRibbon.js";
import { AttributeCard } from "./AttributeCard.js";
import { PaletteStrip } from "./PaletteStrip.js";
import { TypographyPreview } from "./TypographyPreview.js";
import { FallbackLadder } from "./FallbackLadder.js";
import { FrameGallery } from "./FrameGallery.js";
import { SpecPanel } from "./SpecPanel.js";
import { ApplyPanel } from "./ApplyPanel.js";

export function ResultsScreen({ job }: { job: Job }) {
  const spec = job.spec!;
  const [active, setActive] = useState<Record<AttributeKey, boolean>>(() =>
    Object.fromEntries(ATTRIBUTE_KEYS.map((k) => [k, true])) as Record<AttributeKey, boolean>
  );

  const toggle = (key: AttributeKey) => setActive((prev) => ({ ...prev, [key]: !prev[key] }));

  const dominantColor = spec.color.palette.find((p) => p.role === "dominant");

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-8 px-6 py-10 lg:grid-cols-[1fr_420px]">
      <div>
        <section>
          <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">Reel 01 · Source</span>
          <div className="mt-3 border border-hairline bg-surface p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[13px] text-text-dim">
              <span>{spec.source.durationSec.toFixed(1)}s</span>
              <span>{spec.source.resolution}</span>
              <span>{spec.source.aspectRatio}</span>
              <span>{spec.source.fps}fps</span>
            </div>
            <div className="mt-4">
              <PacingRibbon pacing={spec.pacing} durationSec={spec.source.durationSec} />
            </div>
          </div>
        </section>

        <section className="mt-8">
          <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">Reel 02 · Attributes</span>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AttributeCard
              eyebrow="COLOR · GRADE"
              value={`${spec.color.grade.temperature} / ${spec.color.grade.contrast} contrast`}
              detail={spec.color.grade.description}
              active={active.color}
              onToggle={() => toggle("color")}
            >
              <PaletteStrip palette={spec.color.palette} />
              <a
                href={`/api/jobs/${job.id}/lut.cube`}
                download
                className="mt-3 inline-block border border-hairline-strong px-2 py-1 font-mono text-[12px] uppercase tracking-wide text-text-dim transition-colors hover:border-accent hover:text-accent"
              >
                Download .cube — drops into Premiere, Resolve, or FCP
              </a>
            </AttributeCard>

            <AttributeCard
              eyebrow="TYPOGRAPHY"
              value={spec.typography.present ? spec.typography.styles[0]?.fontFamilyGuess ?? "—" : "No on-screen text"}
              detail={
                spec.typography.present
                  ? `${spec.typography.styles.length} style${spec.typography.styles.length === 1 ? "" : "s"} detected`
                  : "typography.present: false"
              }
              active={active.typography}
              onToggle={() => toggle("typography")}
            >
              {spec.typography.present && spec.typography.styles[0] && (
                <>
                  <TypographyPreview style={spec.typography.styles[0]} />
                  <FallbackLadder style={spec.typography.styles[0]} />
                </>
              )}
            </AttributeCard>

            <AttributeCard
              eyebrow="PACING"
              value={spec.pacing.rhythm}
              detail={`${spec.pacing.cutsPerMinute.toFixed(1)} cuts/min · avg ${spec.pacing.avgShotLengthSec.toFixed(2)}s`}
              active={active.pacing}
              onToggle={() => toggle("pacing")}
            />

            <AttributeCard
              eyebrow="TRANSITIONS"
              value={spec.transitions.dominantStyle}
              detail={`${spec.transitions.types.length} type${spec.transitions.types.length === 1 ? "" : "s"} identified`}
              active={active.transitions}
              onToggle={() => toggle("transitions")}
            />

            <AttributeCard
              eyebrow="MOTION"
              value={spec.motion.cameraMovement}
              detail={spec.motion.speedRamps ? "speed ramps present" : "no speed ramps"}
              active={active.motion}
              onToggle={() => toggle("motion")}
            />

            <AttributeCard
              eyebrow="MOOD"
              value={spec.mood.keywords.join(" · ")}
              detail={spec.mood.description}
              active={active.mood}
              onToggle={() => toggle("mood")}
            />
          </div>
        </section>

        <section className="mt-8">
          <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
            Reel 03 · Keyframes
          </span>
          <div className="mt-3">
            <FrameGallery keyframes={job.keyframes} />
          </div>
        </section>

        <ApplyPanel spec={spec} />

        {dominantColor && (
          <p className="mt-8 font-mono text-[12px] text-text-faint">
            dominant: {dominantColor.hex} · palette is programmatic, never model-guessed
          </p>
        )}
      </div>

      <SpecPanel spec={spec} active={active} />
    </div>
  );
}
