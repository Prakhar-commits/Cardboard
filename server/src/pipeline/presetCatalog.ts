// The animation-preset equivalent of fontCatalog.ts. Same shape, same
// purpose: a finite, named inventory to resolve a detected style against,
// so `animationStyle` stops being prose an agent can't execute.
//
// The library below is modelled on the kind of named caption presets a
// browser NLE actually ships (Cardboard's captions panel is the reference
// point). Swap the names for a host editor's real catalog and the ladder
// keeps working unchanged — that is the point of resolving against an
// inventory rather than hardcoding one substitution.

export type AnimationClassification =
  | "word-by-word"
  | "character-reveal"
  | "scale-pop"
  | "slide"
  | "fade"
  | "blur-focus"
  | "highlight"
  | "kinetic-emphasis"
  | "static";

export type AnimationIntensity = "subtle" | "moderate" | "punchy";

export interface AnimationPreset {
  name: string;
  classification: AnimationClassification;
  intensity: AnimationIntensity;
  description: string;
}

/** Rung 1 — presets the target editor ships. */
export const PRESET_LIBRARY: AnimationPreset[] = [
  {
    name: "Word Pop",
    classification: "word-by-word",
    intensity: "punchy",
    description: "each word snaps in on its own beat with a slight scale overshoot",
  },
  {
    name: "Rapid Reveal",
    classification: "word-by-word",
    intensity: "punchy",
    description: "fast sequential word reveal, minimal easing",
  },
  {
    name: "Cascade",
    classification: "word-by-word",
    intensity: "moderate",
    description: "words stagger in with a soft vertical offset",
  },
  {
    name: "Beast Mode",
    classification: "kinetic-emphasis",
    intensity: "punchy",
    description: "keyword scales and recolors hard against the surrounding line",
  },
  {
    name: "Stacked Emphasis",
    classification: "kinetic-emphasis",
    intensity: "moderate",
    description: "lines stack and the active line grows to carry emphasis",
  },
  {
    name: "Pulse Cut",
    classification: "scale-pop",
    intensity: "punchy",
    description: "whole line pulses on the cut, scale in and settle",
  },
  {
    name: "Scale Pop",
    classification: "scale-pop",
    intensity: "moderate",
    description: "line pops up from a smaller scale and settles",
  },
  {
    name: "Slide Up",
    classification: "slide",
    intensity: "moderate",
    description: "line slides up into place from below its baseline",
  },
  {
    name: "Typewriter",
    classification: "character-reveal",
    intensity: "moderate",
    description: "characters reveal one at a time, left to right",
  },
  {
    name: "Karaoke Highlight",
    classification: "highlight",
    intensity: "moderate",
    description: "full line is present, active word is color-highlighted in time",
  },
  {
    name: "Soft Focus",
    classification: "blur-focus",
    intensity: "subtle",
    description: "line resolves from blurred to sharp",
  },
  {
    name: "Fade In",
    classification: "fade",
    intensity: "subtle",
    description: "plain opacity fade, no movement",
  },
  {
    name: "Hold",
    classification: "static",
    intensity: "subtle",
    description: "no animation — the text is simply present",
  },
];

const PRESET_BY_NAME = new Map(PRESET_LIBRARY.map((p) => [normalizePresetName(p.name), p]));

export function normalizePresetName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

export function findLibraryPreset(name: string): AnimationPreset | undefined {
  return PRESET_BY_NAME.get(normalizePresetName(name));
}

/**
 * Rung 2 — named effects that exist in the wider ecosystem (After Effects
 * presets, Lottie packs, common motion-graphics vocabulary) but that the
 * editor does not ship. A hit here means "this is a real, nameable effect we
 * would have to source or author", which is a materially different answer
 * from "we guessed something close".
 */
export const EXTERNAL_PRESET_CATALOG: string[] = [
  "Kinetic Typography",
  "Elastic Pop",
  "Text Bounce",
  "Glitch In",
  "Neon Flicker",
  "Split Reveal",
  "Mask Wipe",
  "Odometer Roll",
  "Handwritten Draw",
  "3D Flip",
  "Shake",
  "Wave",
  "Liquid Morph",
  "Chromatic Aberration Reveal",
];

const EXTERNAL_SET = new Set(EXTERNAL_PRESET_CATALOG.map(normalizePresetName));

export function isInExternalCatalog(name: string): boolean {
  return EXTERNAL_SET.has(normalizePresetName(name));
}

/** classification → library presets that implement it. */
export const ANIMATION_CLASSIFICATION_LOOKUP: Record<AnimationClassification, AnimationPreset[]> =
  groupByClassification();

function groupByClassification(): Record<AnimationClassification, AnimationPreset[]> {
  const groups = {} as Record<AnimationClassification, AnimationPreset[]>;
  for (const preset of PRESET_LIBRARY) {
    (groups[preset.classification] ??= []).push(preset);
  }
  return groups;
}

export function normalizeAnimationClassification(raw: string): AnimationClassification | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (Object.keys(ANIMATION_CLASSIFICATION_LOOKUP) as AnimationClassification[]).includes(
    key as AnimationClassification
  )
    ? (key as AnimationClassification)
    : undefined;
}
