import type { ReactNode } from "react";
import type { StyleSpec } from "../lib/types.js";
import { useGoogleFont } from "../lib/useGoogleFont.js";

type Rung = "exact" | "sourced" | "matched" | "fallback";

const FONT_RUNGS: Array<{ key: Rung; label: string }> = [
  { key: "exact", label: "bundled library" },
  { key: "sourced", label: "google fonts catalog" },
  { key: "matched", label: "taxonomy match" },
  { key: "fallback", label: "neutral default" },
];

// The same four rungs, read against the editor's animation inventory rather
// than its font library — sourcing a named effect stands in for fetching a
// font file. See CLAUDE.md "Phase 1 — The fallback ladder".
const ANIMATION_RUNGS: Array<{ key: Rung; label: string }> = [
  { key: "exact", label: "editor preset library" },
  { key: "sourced", label: "known named effect" },
  { key: "matched", label: "taxonomy match" },
  { key: "fallback", label: "neutral default" },
];

function Ladder({
  caption,
  rungs,
  hit,
  confidence,
  reason,
  children,
}: {
  caption: string;
  rungs: Array<{ key: Rung; label: string }>;
  hit: Rung;
  confidence: "high" | "approximate";
  reason: string;
  children: ReactNode;
}) {
  const hitIndex = rungs.findIndex((r) => r.key === hit);

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <span className="font-mono text-[11px] uppercase tracking-widest text-text-faint">{caption}</span>

      <div className="mt-1.5 flex flex-wrap items-center gap-1 font-mono text-[11px] uppercase tracking-wide text-text-faint">
        {rungs.map((rung, i) => (
          <span key={rung.key} className="flex items-center gap-1">
            <span
              className={
                i === hitIndex
                  ? "border border-accent px-1 py-0.5 text-accent"
                  : i < hitIndex || hitIndex === -1
                  ? "px-1 py-0.5 text-text-faint line-through"
                  : "px-1 py-0.5 text-text-faint"
              }
            >
              {rung.label}
            </span>
            {i < rungs.length - 1 && <span className="text-text-faint">→</span>}
          </span>
        ))}
      </div>

      {children}

      <p className="mt-1.5 flex items-start gap-1.5 font-mono text-[12px] text-text-dim">
        <span
          className={`shrink-0 border px-1 ${
            confidence === "high" ? "border-accent/60 text-accent" : "border-hairline-strong text-text-faint"
          }`}
        >
          {confidence}
        </span>
        <span>{reason}</span>
      </p>
    </div>
  );
}

export function FallbackLadder({ style }: { style: StyleSpec["typography"]["styles"][number] }) {
  const font = style.resolvedFont;
  const animation = style.resolvedAnimation;
  useGoogleFont(font?.family);

  if (!font && !animation) return null;

  return (
    <>
      {font && (
        <Ladder
          caption="Font resolution"
          rungs={FONT_RUNGS}
          hit={font.rung}
          confidence={font.confidence}
          reason={font.reason}
        >
          <p className="mt-2 text-lg leading-none" style={{ fontFamily: `"${font.family}", sans-serif` }}>
            {font.family}
          </p>
        </Ladder>
      )}

      {animation && (
        <Ladder
          caption="Animation resolution"
          rungs={ANIMATION_RUNGS}
          hit={animation.rung}
          confidence={animation.confidence}
          reason={animation.reason}
        >
          <p className="mt-2 flex flex-wrap items-baseline gap-2 text-lg leading-none text-text">
            {animation.preset}
            {animation.source === "external-catalog" && (
              <span className="font-mono text-[11px] uppercase tracking-widest text-warn">
                not in library
              </span>
            )}
          </p>
          {animation.alternativePreset && (
            <p className="mt-1 font-mono text-[12px] text-text-dim">
              usable now: <span className="text-text">{animation.alternativePreset}</span>
            </p>
          )}
          {style.animationStyle && (
            <p className="mt-1 text-[13px] leading-relaxed text-text-faint">
              detected: “{style.animationStyle}”
            </p>
          )}
        </Ladder>
      )}
    </>
  );
}
