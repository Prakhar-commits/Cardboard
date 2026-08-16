/**
 * Minimal CIELAB conversion + ΔE, used by the verifier to compare intended
 * colors against re-extracted ones. Deliberately CIE76 (plain euclidean
 * distance in Lab): it is the metric the UI names, and an honest simple
 * number beats an unexplained sophisticated one. Rough reading of the scale:
 * <2 imperceptible, <10 close, >25 clearly a different color.
 */

export interface Lab {
  l: number;
  a: number;
  b: number;
}

const D65 = { x: 0.95047, y: 1.0, z: 1.08883 };
const DELTA = 6 / 29;

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const int = parseInt(match[1], 16);
  return { r: ((int >> 16) & 255) / 255, g: ((int >> 8) & 255) / 255, b: (int & 255) / 255 };
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function pivot(t: number): number {
  return t > DELTA ** 3 ? Math.cbrt(t) : t / (3 * DELTA ** 2) + 4 / 29;
}

export function hexToLab(hex: string): Lab | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;

  const r = srgbToLinear(rgb.r);
  const g = srgbToLinear(rgb.g);
  const b = srgbToLinear(rgb.b);

  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / D65.x;
  const y = (0.2126729 * r + 0.7151522 * g + 0.072175 * b) / D65.y;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / D65.z;

  const fx = pivot(x);
  const fy = pivot(y);
  const fz = pivot(z);

  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** ΔE (CIE76) between two hex colors, or null if either fails to parse. */
export function deltaE(hexA: string, hexB: string): number | null {
  const a = hexToLab(hexA);
  const b = hexToLab(hexB);
  if (!a || !b) return null;
  return Math.sqrt((a.l - b.l) ** 2 + (a.a - b.a) ** 2 + (a.b - b.b) ** 2);
}
