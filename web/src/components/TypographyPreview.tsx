import type { StyleSpec } from "../lib/types.js";

export function TypographyPreview({ style }: { style: StyleSpec["typography"]["styles"][number] }) {
  const displayText =
    style.case === "upper" ? "SAMPLE TITLE" : style.case === "lower" ? "sample title" : "Sample Title";

  return (
    <div className="border border-hairline bg-gradient-to-b from-surface-2 to-bg p-4">
      <p
        className="text-2xl font-bold leading-none"
        style={{ color: style.colorHex, fontWeight: style.weight === "bold" ? 700 : undefined }}
      >
        {displayText}
      </p>
      <p className="mt-3 font-mono text-[12px] uppercase tracking-wide text-text-dim">
        {style.resolvedFont ? (
          <>
            DETECTED → CLOSEST AVAILABLE: <span className="text-text">{style.resolvedFont.family}</span> ·{" "}
            {style.resolvedFont.confidence}
          </>
        ) : (
          <>
            DETECTED · <span className="text-text">{style.fontFamilyGuess}</span>
          </>
        )}
      </p>
    </div>
  );
}
