import type { StyleSpec } from "../schema/styleSpec.js";
import {
  CLASSIFICATION_LOOKUP,
  findLocalFont,
  isInGoogleFontsCatalog,
  normalizeClassification,
  type WeightClass,
} from "./fontCatalog.js";

type TypographyStyleInput = Omit<StyleSpec["typography"]["styles"][number], "resolvedFont">;
export type ResolvedFont = NonNullable<StyleSpec["typography"]["styles"][number]["resolvedFont"]>;

const WEIGHT_ORDER: WeightClass[] = ["light", "regular", "medium", "bold", "black"];

function closestByWeight(candidates: { family: string; weightClass: WeightClass }[], target?: WeightClass) {
  if (!target) return candidates[0];
  const targetIdx = WEIGHT_ORDER.indexOf(target);
  return candidates.reduce((best, cur) => {
    const bestDist = Math.abs(WEIGHT_ORDER.indexOf(best.weightClass) - targetIdx);
    const curDist = Math.abs(WEIGHT_ORDER.indexOf(cur.weightClass) - targetIdx);
    return curDist < bestDist ? cur : best;
  }, candidates[0]);
}

// The neutral default per role: display-ish roles get a display font,
// UI-ish roles get a workhorse sans. Used only when even the classification
// lookup can't produce an answer.
function neutralDefault(role: TypographyStyleInput["role"]): string {
  return role === "caption" || role === "subtitle" ? "Inter" : "Anton";
}

/**
 * Resolves the detected typography style to a font this pipeline can
 * actually render with, in ranked rungs — stopping at the first hit. Every
 * rung records *why* it was chosen; that reason string is what makes the
 * result honest instead of a silent substitution. See CLAUDE.md
 * "Phase 1 — The fallback ladder".
 */
export function resolveFont(style: TypographyStyleInput): ResolvedFont {
  const guess = style.fontFamilyGuess?.trim();

  // Rung 1 — exact: the detected name matches a bundled font.
  if (guess) {
    const local = findLocalFont(guess);
    if (local) {
      return {
        family: local.family,
        rung: "exact",
        source: "local-library",
        confidence: "high",
        reason: `detected name "${style.fontFamilyGuess}" matches bundled font "${local.family}"`,
      };
    }
  }

  // Rung 2 — sourced: the detected name exists in the Google Fonts catalog.
  if (guess && isInGoogleFontsCatalog(guess)) {
    return {
      family: guess,
      rung: "sourced",
      source: "google-fonts",
      confidence: "high",
      reason: `detected name "${style.fontFamilyGuess}" not bundled locally, but found in the Google Fonts catalog`,
    };
  }

  // Rung 3 — matched: no name match, fall back to the taxonomy classification.
  const classification = style.classification ? normalizeClassification(style.classification) : undefined;
  if (classification) {
    const candidates = CLASSIFICATION_LOOKUP[classification];
    const chosen = closestByWeight(candidates, style.weightClass);
    return {
      family: chosen.family,
      rung: "matched",
      source: "local-library",
      confidence: "approximate",
      reason: `no name match for "${style.fontFamilyGuess}"; classified ${classification}${
        style.weightClass ? `/${style.weightClass}` : ""
      } → closest bundled family`,
      classification,
      weightClass: style.weightClass,
    };
  }

  // Rung 4 — fallback: classification itself is missing or unrecognized.
  const family = neutralDefault(style.role);
  return {
    family,
    rung: "fallback",
    source: "default",
    confidence: "approximate",
    reason: `no name match and no usable classification for "${style.fontFamilyGuess}"; used the neutral default for role "${style.role}"`,
  };
}
