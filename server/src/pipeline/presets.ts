import type { StyleSpec } from "../schema/styleSpec.js";
import {
  ANIMATION_CLASSIFICATION_LOOKUP,
  EXTERNAL_PRESET_CATALOG,
  PRESET_LIBRARY,
  findLibraryPreset,
  isInExternalCatalog,
  normalizeAnimationClassification,
  type AnimationIntensity,
  type AnimationPreset,
} from "./presetCatalog.js";

type TypographyStyleInput = Omit<
  StyleSpec["typography"]["styles"][number],
  "resolvedFont" | "resolvedAnimation"
>;
export type ResolvedAnimation = NonNullable<
  StyleSpec["typography"]["styles"][number]["resolvedAnimation"]
>;

const INTENSITY_ORDER: AnimationIntensity[] = ["subtle", "moderate", "punchy"];

function closestByIntensity(candidates: AnimationPreset[], target?: AnimationIntensity): AnimationPreset {
  if (!target) return candidates[0];
  const targetIdx = INTENSITY_ORDER.indexOf(target);
  return candidates.reduce((best, current) => {
    const bestDistance = Math.abs(INTENSITY_ORDER.indexOf(best.intensity) - targetIdx);
    const currentDistance = Math.abs(INTENSITY_ORDER.indexOf(current.intensity) - targetIdx);
    return currentDistance < bestDistance ? current : best;
  }, candidates[0]);
}

/**
 * The detected animation is free text ("word-by-word pop-in with slight
 * overshoot"). A named preset may still be quoted verbatim inside it, so
 * check the library and the external catalog for a name that appears in the
 * description before falling back to the taxonomy.
 */
function namedPresetIn(text: string, names: string[]): string | undefined {
  const haystack = text.toLowerCase();
  return names.find((name) => haystack.includes(name.toLowerCase()));
}

/**
 * Resolves a detected text animation to a named preset the editor could
 * actually run, in the same four rungs as the font ladder. Without this,
 * typography.animationStyle is prose no agent can execute — the whole point
 * of the spec is that every attribute resolves against a real capability
 * inventory, with the reasoning visible. See CLAUDE.md "Phase 1 — The
 * fallback ladder".
 */
export function resolveAnimationPreset(style: TypographyStyleInput): ResolvedAnimation {
  const described = style.animationStyle?.trim() ?? "";
  const declared = style.animationPresetGuess?.trim();
  const libraryNames = PRESET_LIBRARY.map((p) => p.name);
  const externalNames = EXTERNAL_PRESET_CATALOG;

  // Rung 1 — exact: the detected name is a preset the editor ships.
  const libraryHit =
    (declared ? findLibraryPreset(declared) : undefined) ??
    (described ? findLibraryPreset(described) : undefined) ??
    (described ? findLibraryPreset(namedPresetIn(described, libraryNames) ?? "") : undefined);

  if (libraryHit) {
    return {
      preset: libraryHit.name,
      rung: "exact",
      source: "editor-library",
      confidence: "high",
      reason: `detected animation "${declared ?? described}" matches the shipped preset "${libraryHit.name}"`,
      classification: libraryHit.classification,
      intensity: libraryHit.intensity,
    };
  }

  // Rung 2 — sourced: a real, nameable effect the editor does not ship.
  const externalName =
    (declared && isInExternalCatalog(declared) ? declared : undefined) ??
    namedPresetIn(described, externalNames);

  const classification = style.animationClassification
    ? normalizeAnimationClassification(style.animationClassification)
    : undefined;

  if (externalName) {
    // Name the closest shipped preset alongside it. The editor can't run the
    // sourced effect today, and an answer of "we don't have it" that stops
    // there obstructs the edit — this offers the way forward without
    // pretending the substitute is the same thing.
    const candidates = classification ? ANIMATION_CLASSIFICATION_LOOKUP[classification] ?? [] : [];
    const alternative = candidates.length
      ? closestByIntensity(candidates, style.animationIntensity)
      : undefined;

    return {
      preset: externalName,
      rung: "sourced",
      source: "external-catalog",
      confidence: "high",
      reason: `"${externalName}" is a known named effect but is not in the editor's preset library — it would have to be sourced or authored${
        alternative ? `; closest shipped preset is "${alternative.name}"` : ""
      }`,
      classification,
      intensity: style.animationIntensity,
      alternativePreset: alternative?.name,
    };
  }

  // Rung 3 — matched: no name, so fall back to the taxonomy.
  if (classification) {
    const candidates = ANIMATION_CLASSIFICATION_LOOKUP[classification];
    if (candidates?.length) {
      const chosen = closestByIntensity(candidates, style.animationIntensity);
      return {
        preset: chosen.name,
        rung: "matched",
        source: "editor-library",
        confidence: "approximate",
        reason: `no preset name in "${described || "no description"}"; classified ${classification}${
          style.animationIntensity ? `/${style.animationIntensity}` : ""
        } → closest shipped preset`,
        classification,
        intensity: chosen.intensity,
      };
    }
  }

  // Rung 4 — fallback: no name and no usable classification.
  const isStatic = /\b(none|static|no animation)\b/i.test(described);
  const chosen = isStatic ? "Hold" : "Fade In";
  return {
    preset: chosen,
    rung: "fallback",
    source: "default",
    confidence: "approximate",
    reason: isStatic
      ? `described as static ("${described}") — no animation preset applied`
      : `no preset name and no usable classification for "${described || "no description"}"; used the neutral default`,
  };
}
