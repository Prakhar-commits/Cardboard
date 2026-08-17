import type { StyleSpec } from "../schema/styleSpec.js";

/**
 * Renders the resolved animation preset as an ffmpeg filter chain.
 *
 * Without this, the spec resolves `animationStyle` to a named preset and then
 * burns a static title — the ladder's conclusion never executes. This closes
 * that loop: the preset the ladder picked is the thing you see move.
 *
 * Two deliberate limits, both surfaced in the UI rather than papered over:
 *
 * - This is not transcript-driven captioning. It animates the supplied title,
 *   not speech. Caption timing belongs to the editor, which already owns the
 *   transcript; the spec's job is to say *which preset* runs.
 * - `drawtext` animates `alpha`, `x` and `y` per frame dependably, but
 *   `fontsize` expressions vary across ffmpeg builds. Presets whose real
 *   behaviour is a scale overshoot are approximated with position and opacity,
 *   and reported as approximated.
 */

export type AnimationKind =
  | "static"
  | "fade"
  | "slide"
  | "word-by-word"
  | "character-reveal";

export interface TextAnimationInput {
  text: string;
  fontFile: string;
  fontSizeExpr: string;
  colorHex: string;
  x: string;
  y: string;
  classification?: string;
  intensity?: string;
  durationSec: number;
}

export interface TextAnimationResult {
  filters: string[];
  kind: AnimationKind;
  /** True when the preset's real behaviour could not be reproduced exactly. */
  approximated: boolean;
  /** Human-readable note for the UI — never claim a match we didn't achieve. */
  note: string;
}

/** Seconds per step. Punchier presets step faster. */
function stepFor(intensity?: string): number {
  switch (intensity) {
    case "punchy":
      return 0.18;
    case "subtle":
      return 0.4;
    default:
      return 0.28;
  }
}

/**
 * Maps the taxonomy onto what drawtext can actually do. Several
 * classifications collapse onto the same mechanism — that is honest, and the
 * caller reports it as approximated rather than implying an exact match.
 */
function kindFor(classification?: string): { kind: AnimationKind; approximated: boolean } {
  switch (classification) {
    case "word-by-word":
      return { kind: "word-by-word", approximated: false };
    case "character-reveal":
      return { kind: "character-reveal", approximated: false };
    case "fade":
      return { kind: "fade", approximated: false };
    case "slide":
      return { kind: "slide", approximated: false };
    case "static":
      return { kind: "static", approximated: false };
    // Real behaviour is a scale overshoot or a per-word colour change; both
    // need per-frame fontsize or per-word layout that drawtext won't give us.
    case "scale-pop":
    case "kinetic-emphasis":
      return { kind: "slide", approximated: true };
    case "highlight":
      return { kind: "word-by-word", approximated: true };
    case "blur-focus":
      return { kind: "fade", approximated: true };
    default:
      return { kind: "fade", approximated: true };
  }
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "’") // sidestep quote escaping inside a quoted value
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

interface DrawtextOptions {
  input: TextAnimationInput;
  text: string;
  /** Omitted for the always-on final segment. */
  from?: number;
  to?: number;
  alpha?: string;
  y?: string;
}

function drawtext({ input, text, from, to, alpha, y }: DrawtextOptions): string {
  const parts = [
    `fontfile='${input.fontFile}'`,
    `text='${escapeText(text)}'`,
    `fontsize=${input.fontSizeExpr}`,
    `fontcolor=${input.colorHex}`,
    `x=${input.x}`,
    `y=${y ?? input.y}`,
    "box=0",
  ];
  if (alpha) parts.push(`alpha='${alpha}'`);
  if (from !== undefined) {
    parts.push(
      to !== undefined
        ? `enable='between(t,${from.toFixed(2)},${to.toFixed(2)})'`
        : `enable='gte(t,${from.toFixed(2)})'`
    );
  }
  return `drawtext=${parts.join(":")}`;
}

/**
 * Cumulative reveal: each stage draws the text built so far, so the line grows
 * and the final stage holds. Stages are mutually exclusive on `enable`, which
 * matters — overlapping windows would double-draw and read as bold.
 */
function cumulativeFilters(input: TextAnimationInput, segments: string[], step: number): string[] {
  const filters: string[] = [];
  segments.forEach((segment, index) => {
    const from = index * step;
    const isLast = index === segments.length - 1;
    filters.push(
      drawtext({
        input,
        text: segment,
        from,
        to: isLast ? undefined : (index + 1) * step,
      })
    );
  });
  return filters;
}

/** Cap on generated drawtext filters — a long typewriter title would
 *  otherwise build a filtergraph long enough to trip ffmpeg's arg limits. */
const MAX_SEGMENTS = 36;

function characterSegments(text: string): string[] {
  const chars = Array.from(text);
  if (chars.length <= MAX_SEGMENTS) {
    return chars.map((_, i) => chars.slice(0, i + 1).join(""));
  }
  // Reveal in even chunks rather than dropping the tail of the title.
  const chunk = Math.ceil(chars.length / MAX_SEGMENTS);
  const segments: string[] = [];
  for (let end = chunk; end < chars.length; end += chunk) {
    segments.push(chars.slice(0, end).join(""));
  }
  segments.push(text);
  return segments;
}

export function buildTextAnimation(input: TextAnimationInput): TextAnimationResult {
  const { kind, approximated } = kindFor(input.classification);
  const step = stepFor(input.intensity);

  if (kind === "static") {
    return {
      filters: [drawtext({ input, text: input.text })],
      kind,
      approximated: false,
      note: "preset reads as static — text is held, not animated",
    };
  }

  if (kind === "fade") {
    const fadeSec = Math.max(step * 2, 0.4);
    return {
      filters: [
        drawtext({
          input,
          text: input.text,
          alpha: `if(lt(t,${fadeSec.toFixed(2)}),t/${fadeSec.toFixed(2)},1)`,
        }),
      ],
      kind,
      approximated,
      note: approximated
        ? "approximated as an opacity ramp — the preset's real motion needs per-frame scaling"
        : "opacity ramp",
    };
  }

  if (kind === "slide") {
    const riseSec = Math.max(step * 2, 0.4);
    // Ease the baseline up from below and fade in together, so the settle
    // reads as motion rather than a hard cut.
    const y = `${input.y}+max(0\\,(1-t/${riseSec.toFixed(2)}))*(h*0.05)`;
    return {
      filters: [
        drawtext({
          input,
          text: input.text,
          y,
          alpha: `if(lt(t,${riseSec.toFixed(2)}),t/${riseSec.toFixed(2)},1)`,
        }),
      ],
      kind,
      approximated,
      note: approximated
        ? "approximated as a rise and fade — the preset's scale overshoot needs per-frame fontsize, which drawtext does not reliably support"
        : "rise and settle",
    };
  }

  if (kind === "character-reveal") {
    return {
      filters: cumulativeFilters(input, characterSegments(input.text), step / 2),
      kind,
      approximated,
      note: "character-by-character reveal",
    };
  }

  // word-by-word
  const words = input.text.split(/\s+/).filter(Boolean);
  const segments = words.map((_, i) => words.slice(0, i + 1).join(" "));
  return {
    filters: cumulativeFilters(input, segments.slice(0, MAX_SEGMENTS), step),
    kind: "word-by-word",
    approximated,
    note: approximated
      ? "approximated as a word-by-word build — the preset also recolours the emphasised word, which needs per-word layout"
      : "word-by-word build",
  };
}
