import Vibrant from "node-vibrant";
import type { Keyframe, Shot } from "../jobs.js";
import type { StyleSpec } from "../schema/styleSpec.js";

const TOP_N = 6;

interface WeightedSwatch {
  hex: string;
  weightedPopulation: number;
}

async function swatchesForFrame(filePath: string): Promise<Array<{ hex: string; population: number }>> {
  const palette = await Vibrant.from(filePath).getPalette();
  return Object.values(palette)
    .filter((swatch): swatch is NonNullable<typeof swatch> => swatch !== null && swatch !== undefined)
    .map((swatch) => ({ hex: swatch.hex, population: swatch.population }));
}

/**
 * Programmatic color extraction only — never let a vision-model hex code
 * into the palette, models hallucinate hex values.
 */
export async function extractPalette(
  keyframes: Keyframe[],
  shots: Shot[]
): Promise<StyleSpec["color"]["palette"]> {
  const shotByIndex = new Map(shots.map((s) => [s.index, s]));
  const weighted = new Map<string, WeightedSwatch>();

  for (const kf of keyframes) {
    const shot = shotByIndex.get(kf.shotIndex);
    const weight = shot ? shot.durationSec : 1;
    const swatches = await swatchesForFrame(kf.filePath);
    for (const { hex, population } of swatches) {
      const contribution = population * weight;
      const existing = weighted.get(hex);
      if (existing) {
        existing.weightedPopulation += contribution;
      } else {
        weighted.set(hex, { hex, weightedPopulation: contribution });
      }
    }
  }

  const sorted = Array.from(weighted.values()).sort((a, b) => b.weightedPopulation - a.weightedPopulation);
  const top = sorted.slice(0, TOP_N);
  const total = top.reduce((sum, s) => sum + s.weightedPopulation, 0) || 1;

  return top.map((s, i) => ({
    hex: s.hex,
    role: i === 0 ? "dominant" : i <= 2 ? "secondary" : "accent",
    coverage: Math.round((s.weightedPopulation / total) * 1000) / 1000,
  }));
}
