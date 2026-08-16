import type { StyleSpec } from "../schema/styleSpec.js";

const LUT_SIZE = 33;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

const TEMPERATURE_SHIFT: Record<StyleSpec["color"]["grade"]["temperature"], number> = {
  warm: 0.04,
  neutral: 0,
  cool: -0.04,
};

const CONTRAST_FACTOR: Record<StyleSpec["color"]["grade"]["contrast"], number> = {
  low: 0.85,
  medium: 1.0,
  high: 1.25,
};

const SATURATION_FACTOR: Record<StyleSpec["color"]["grade"]["saturation"], number> = {
  muted: 0.85,
  natural: 1.0,
  vivid: 1.18,
};

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function hexToRgb01(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return {
    r: ((int >> 16) & 255) / 255,
    g: ((int >> 8) & 255) / 255,
    b: (int & 255) / 255,
  };
}

function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Applies the graded transform to a single RGB sample. Deliberately subtle —
 * a LUT that visibly wrecks skin tones reads as a bug, not a style. See
 * CLAUDE.md "Phase 2 — Interchange artifacts".
 */
function applyGrade(input: Rgb, grade: StyleSpec["color"]["grade"], dominant: Rgb | null): Rgb {
  let { r, g, b } = input;

  // Temperature: warm lifts red / cuts blue, cool the inverse.
  const shift = TEMPERATURE_SHIFT[grade.temperature];
  r += shift;
  b -= shift;

  // Contrast: linear scale around mid-grey.
  const contrastFactor = CONTRAST_FACTOR[grade.contrast];
  r = (r - 0.5) * contrastFactor + 0.5;
  g = (g - 0.5) * contrastFactor + 0.5;
  b = (b - 0.5) * contrastFactor + 0.5;

  // Saturation: scale each channel's distance from luma.
  const satFactor = SATURATION_FACTOR[grade.saturation];
  const l = luma({ r, g, b });
  r = l + (r - l) * satFactor;
  g = l + (g - l) * satFactor;
  b = l + (b - l) * satFactor;

  // Dominant palette hue: a gentle push in the midtones only, tapering off
  // toward shadows and highlights via a bell curve on luma, and scaled by how
  // strong the grade itself is — a truly neutral grade stays exact identity
  // rather than acquiring a tint the spec never described.
  if (dominant) {
    const gradeIntensity = Math.max(
      Math.abs(shift) / 0.04,
      Math.abs(contrastFactor - 1) / 0.25,
      Math.abs(satFactor - 1) / 0.18
    );
    const midtoneWeight = 0.06 * gradeIntensity * Math.exp(-((l - 0.5) ** 2) / (2 * 0.35 ** 2));
    r += (dominant.r - r) * midtoneWeight;
    g += (dominant.g - g) * midtoneWeight;
    b += (dominant.b - b) * midtoneWeight;
  }

  return { r: clamp01(r), g: clamp01(g), b: clamp01(b) };
}

/**
 * Generates a standard 33x33x33 .cube LUT from color.grade and the dominant
 * palette hue. Plain text, no dependencies. R varies fastest per the .cube
 * spec (loop order b, then g, then r).
 */
export function generateCubeLut(spec: StyleSpec): string {
  const { grade, palette } = spec.color;
  const dominantHex = palette.find((p) => p.role === "dominant")?.hex ?? palette[0]?.hex;
  const dominant = dominantHex ? hexToRgb01(dominantHex) : null;

  const lines: string[] = [
    `TITLE "style-decomposer — ${spec.color.grade.temperature}/${spec.color.grade.contrast}/${spec.color.grade.saturation}"`,
    `LUT_3D_SIZE ${LUT_SIZE}`,
    "DOMAIN_MIN 0.0 0.0 0.0",
    "DOMAIN_MAX 1.0 1.0 1.0",
  ];

  const step = 1 / (LUT_SIZE - 1);
  for (let bIdx = 0; bIdx < LUT_SIZE; bIdx++) {
    for (let gIdx = 0; gIdx < LUT_SIZE; gIdx++) {
      for (let rIdx = 0; rIdx < LUT_SIZE; rIdx++) {
        const out = applyGrade({ r: rIdx * step, g: gIdx * step, b: bIdx * step }, grade, dominant);
        lines.push(`${out.r.toFixed(6)} ${out.g.toFixed(6)} ${out.b.toFixed(6)}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}
