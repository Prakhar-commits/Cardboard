import type { Shot } from "../jobs.js";
import type { StyleSpec } from "../schema/styleSpec.js";
import type { FidelityReport, FidelityRow, Verdict } from "../schema/fidelity.js";
import type { ApplyJob } from "../applyJobs.js";
import { probeVideo } from "./ingest.js";
import { extractKeyframes } from "./frames.js";
import { extractPalette } from "./palette.js";
import { analyzeVision } from "./vision.js";
import { deltaE, hexToLab, type Lab } from "./colorMath.js";
import { resolveFont } from "./fonts.js";

/** Frames sampled from the render for re-extraction. Fewer than the 20 the
 *  reference pass uses — the grade and the burned title are constant across
 *  the whole clip, so more frames would buy nothing and cost tokens. */
const VERIFY_FRAMES = 8;

/** ΔE below which two colors count as the same color for our purposes. */
const COLOR_MATCH_DELTA_E = 8;
const COLOR_DRIFT_DELTA_E = 25;

/** ΔE the graded output must close on the reference hue to count as moved. */
const PALETTE_SHIFT_EPSILON = 3;

const SCALES = {
  temperature: ["cool", "neutral", "warm"],
  contrast: ["low", "medium", "high"],
  saturation: ["muted", "natural", "vivid"],
} as const;

/** Evenly spaced pseudo-shots. The render's own cut structure is irrelevant
 *  here — we only need frames spread across it — so this skips a full
 *  scene-detection decode pass. */
function evenlySpacedShots(durationSec: number, count: number): Shot[] {
  const span = durationSec / count;
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    startSec: i * span,
    endSec: (i + 1) * span,
    durationSec: span,
  }));
}

function enumRow(
  attribute: string,
  scale: readonly string[],
  intended: string,
  achieved: string
): FidelityRow {
  const from = scale.indexOf(intended);
  const to = scale.indexOf(achieved);
  if (from < 0 || to < 0) {
    return {
      attribute,
      intended,
      achieved: achieved || "not reported",
      verdict: "missed",
      delta: "unrecognized value",
    };
  }
  const distance = Math.abs(from - to);
  return {
    attribute,
    intended,
    achieved,
    verdict: distance === 0 ? "matched" : distance === 1 ? "drifted" : "missed",
    delta: distance === 0 ? "exact" : `off by ${distance} step${distance === 1 ? "" : "s"}`,
  };
}

function colorRow(attribute: string, intendedHex: string, achievedHex: string, caveat?: string): FidelityRow {
  const distance = deltaE(intendedHex, achievedHex);
  if (distance === null) {
    return {
      attribute,
      intended: intendedHex,
      achieved: achievedHex || "not reported",
      verdict: "missed",
      delta: "could not parse one of the colors",
      caveat,
    };
  }
  return {
    attribute,
    intended: intendedHex,
    achieved: achievedHex,
    verdict:
      distance <= COLOR_MATCH_DELTA_E ? "matched" : distance <= COLOR_DRIFT_DELTA_E ? "drifted" : "missed",
    delta: `ΔE ${distance.toFixed(1)}`,
    caveat,
  };
}

/** Reduces a free-text placement to the tokens apply.ts actually acts on, so
 *  "lower third, left aligned" and "lower-third left" compare equal. */
function placementTokens(placement: string): string {
  const p = placement.toLowerCase();
  const vertical = p.includes("lower")
    ? "lower"
    : p.includes("bottom")
    ? "bottom"
    : p.includes("top") || p.includes("upper")
    ? "top"
    : "center";
  const horizontal = p.includes("left") ? "left" : p.includes("right") ? "right" : "center";
  return `${vertical}/${horizontal}`;
}

/**
 * Coverage-weighted mean Lab across the whole palette — the "color centre"
 * of the footage. Deliberately not the single dominant swatch: which swatch
 * wins is unstable across different frame samplings of the same video, so
 * comparing dominants produces verdicts that swing on sampling noise rather
 * than on the grade.
 */
function paletteCentroid(palette: StyleSpec["color"]["palette"]): Lab | null {
  let l = 0;
  let a = 0;
  let b = 0;
  let totalWeight = 0;

  for (const swatch of palette) {
    const lab = hexToLab(swatch.hex);
    if (!lab) continue;
    const weight = swatch.coverage > 0 ? swatch.coverage : 1;
    l += lab.l * weight;
    a += lab.a * weight;
    b += lab.b * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return null;
  return { l: l / totalWeight, a: a / totalWeight, b: b / totalWeight };
}

function labDistance(x: Lab, y: Lab): number {
  return Math.sqrt((x.l - y.l) ** 2 + (x.a - y.a) ** 2 + (x.b - y.b) ** 2);
}

interface Reextraction {
  palette: StyleSpec["color"]["palette"];
  grade: StyleSpec["color"]["grade"];
  typography: StyleSpec["typography"];
  framesAnalyzed: number;
}

/** Runs the existing extractor over an already-rendered file. No new
 *  machinery — frames → palette → vision, exactly as the reference pass. */
async function reextract(
  videoPath: string,
  framesDir: string,
  idPrefix: string,
  mediaBaseUrl: string
): Promise<Reextraction> {
  const probe = await probeVideo(videoPath);
  const shots = evenlySpacedShots(probe.durationSec, VERIFY_FRAMES);
  const keyframes = await extractKeyframes(videoPath, shots, framesDir, idPrefix, mediaBaseUrl);
  const palette = await extractPalette(keyframes, shots);
  const vision = await analyzeVision(keyframes, probe.durationSec);
  return {
    palette,
    grade: vision.color.grade,
    typography: vision.typography,
    framesAnalyzed: keyframes.length,
  };
}

/** Palette from the *ungraded* target, so the grade can be scored as a
 *  movement rather than an absolute match. Programmatic only — no vision
 *  call, which keeps a verified apply at roughly two model passes total. */
async function paletteOnly(
  videoPath: string,
  framesDir: string,
  idPrefix: string,
  mediaBaseUrl: string
): Promise<StyleSpec["color"]["palette"]> {
  const probe = await probeVideo(videoPath);
  const shots = evenlySpacedShots(probe.durationSec, VERIFY_FRAMES);
  const keyframes = await extractKeyframes(videoPath, shots, framesDir, idPrefix, mediaBaseUrl);
  return extractPalette(keyframes, shots);
}

function buildGradeRows(
  intended: StyleSpec["color"]["grade"],
  achieved: StyleSpec["color"]["grade"]
): FidelityRow[] {
  return [
    enumRow("color.grade.temperature", SCALES.temperature, intended.temperature, achieved.temperature),
    enumRow("color.grade.contrast", SCALES.contrast, intended.contrast, achieved.contrast),
    enumRow("color.grade.saturation", SCALES.saturation, intended.saturation, achieved.saturation),
  ];
}

/**
 * The reference's palette and the target's palette describe different
 * footage, so an absolute match would be the wrong test — a correct grade
 * applied to unrelated content still yields unrelated colors. What the grade
 * claims is *direction*: it should move the target's dominant hue toward the
 * reference's. That is what this measures.
 */
function buildPaletteRow(
  referencePalette: StyleSpec["color"]["palette"],
  beforePalette: StyleSpec["color"]["palette"],
  afterPalette: StyleSpec["color"]["palette"]
): FidelityRow | null {
  const reference = paletteCentroid(referencePalette);
  const before = paletteCentroid(beforePalette);
  const after = paletteCentroid(afterPalette);
  if (!reference || !before || !after) return null;

  const distanceBefore = labDistance(reference, before);
  const distanceAfter = labDistance(reference, after);
  const closedBy = distanceBefore - distanceAfter;

  const verdict: Verdict =
    closedBy > PALETTE_SHIFT_EPSILON
      ? "matched"
      : closedBy >= -PALETTE_SHIFT_EPSILON
      ? "drifted"
      : "missed";

  return {
    attribute: "color.palette (shift toward reference)",
    intended: "move the color centre toward the reference's",
    achieved: `${closedBy >= 0 ? "closer by" : "further by"} ΔE ${Math.abs(closedBy).toFixed(1)}`,
    verdict,
    delta: `ΔE to reference ${distanceBefore.toFixed(1)} → ${distanceAfter.toFixed(1)}`,
    caveat:
      distanceBefore <= COLOR_MATCH_DELTA_E
        ? `the target already sat at the reference's colour centre (ΔE ${distanceBefore.toFixed(
            1
          )}), so any grade on top necessarily moves it away — this reads double-grading, not a failed apply`
        : Math.abs(closedBy) <= PALETTE_SHIFT_EPSILON
        ? `movement is under the ΔE ${PALETTE_SHIFT_EPSILON} noise floor — treated as no measurable shift`
        : "target footage is not the reference footage, so this measures direction of travel, not an absolute colour match",
  };
}

type TypographyStyle = StyleSpec["typography"]["styles"][number];

/** How well a re-extracted text style matches the one we meant to burn. */
function candidateScore(candidate: TypographyStyle, intended: TypographyStyle): number {
  let score = 0;
  if (candidate.role === intended.role) score += 3;
  if (placementTokens(candidate.placement) === placementTokens(intended.placement)) score += 2;
  const distance = deltaE(intended.colorHex, candidate.colorHex);
  if (distance !== null) {
    if (distance <= COLOR_MATCH_DELTA_E) score += 2;
    else if (distance <= COLOR_DRIFT_DELTA_E) score += 1;
  }
  return score;
}

function buildTypographyRows(
  intended: StyleSpec["typography"]["styles"][number],
  achievedTypography: StyleSpec["typography"]
): FidelityRow[] {
  if (!achievedTypography.present || achievedTypography.styles.length === 0) {
    return [
      {
        attribute: "typography.title",
        intended: `${intended.role} in ${intended.resolvedFont?.family ?? intended.fontFamilyGuess}`,
        achieved: "no text detected in the render",
        verdict: "missed",
        delta: "re-extraction found no typography at all",
      },
    ];
  }

  // A render can contain the target's own on-screen text as well as the title
  // we burned. Matching on role alone picks the wrong one, so score every
  // candidate on role, placement and colour and take the best.
  const candidates = achievedTypography.styles;
  const achieved = candidates.reduce((best, current) =>
    candidateScore(current, intended) > candidateScore(best, intended) ? current : best
  );
  const ambiguity =
    candidates.length > 1
      ? `the render contained ${candidates.length} distinct text styles (the target's own text as well as the burned title); these rows score the closest match to the intended one`
      : undefined;

  const rows: FidelityRow[] = [
    colorRow(
      "typography.colorHex",
      intended.colorHex,
      achieved.colorHex,
      "the burned title is drawn after the LUT, so its color should survive intact; the achieved hex is the model's read of it"
    ),
    {
      attribute: "typography.case",
      intended: intended.case,
      achieved: achieved.case,
      verdict: intended.case === achieved.case ? "matched" : "drifted",
      delta: intended.case === achieved.case ? "exact" : "re-detected as a different case",
      caveat: ambiguity,
    },
  ];

  const intendedPlacement = placementTokens(intended.placement);
  const achievedPlacement = placementTokens(achieved.placement);
  rows.push({
    attribute: "typography.placement",
    intended: `${intended.placement} (${intendedPlacement})`,
    achieved: `${achieved.placement} (${achievedPlacement})`,
    verdict: intendedPlacement === achievedPlacement ? "matched" : "drifted",
    delta: intendedPlacement === achievedPlacement ? "exact" : "different region",
  });

  const intendedFamily = intended.resolvedFont?.family;
  if (intendedFamily) {
    // Put both sides through the same Phase 1 ladder before comparing. The
    // re-extracted guess is free text ("a rounded geometric sans similar to
    // Nunito or Poppins"), and a substring test against that would score a
    // hedge as a clean match — exactly the inflated number the report exists
    // to avoid.
    const achievedResolved = resolveFont(achieved);
    const survived = achievedResolved.family.toLowerCase() === intendedFamily.toLowerCase();
    rows.push({
      attribute: "typography.resolvedFont.family",
      intended: intendedFamily,
      achieved: `${achievedResolved.family} (via ${achievedResolved.rung})`,
      verdict: survived ? "matched" : "drifted",
      delta: `re-detected as "${achieved.fontFamilyGuess}"`,
      caveat:
        "identifying a font by eye from a render is approximate in both directions — a disagreement here is a finding about substitution quality, not proof the wrong font was burned",
    });
  }

  return rows;
}

/**
 * Re-runs the extractor on our own render and diffs it against the spec we
 * asked for. Scores only what apply actually touched: pacing, audio, motion
 * and transitions pass through untouched and are reported as unscored rather
 * than counted as passes. See CLAUDE.md "Phase 4 — Verify the spec".
 */
export async function buildFidelityReport(
  job: ApplyJob,
  renderedPath: string,
  framesDir: string,
  mediaBaseUrl: string
): Promise<FidelityReport> {
  const rows: FidelityRow[] = [];
  const notScored: Array<{ attribute: string; reason: string }> = [
    { attribute: "pacing", reason: "apply does not touch cuts — the target's own pacing is unchanged" },
    { attribute: "audio", reason: "audio is copied through unmodified" },
    { attribute: "motion", reason: "apply does not touch camera movement or speed" },
    { attribute: "transitions", reason: "apply does not insert or alter transitions" },
  ];

  const intendedStyle = job.spec.typography.present ? job.spec.typography.styles[0] : undefined;
  const willScoreTypography = Boolean(job.titleApplied && intendedStyle);

  // Nothing was applied, so there is nothing to verify. Return the empty
  // report rather than burning a vision pass to confirm a no-op.
  if (!job.gradeApplied && !willScoreTypography) {
    notScored.push(
      { attribute: "color.grade", reason: job.gradeSkipReason ?? "grade was not applied" },
      { attribute: "typography", reason: job.titleSkipReason ?? "no title was burned" }
    );
    return { rows, scored: 0, matched: 0, notScored, framesAnalyzed: 0 };
  }

  const after = await reextract(renderedPath, framesDir, `${job.id}_verify`, mediaBaseUrl);

  if (job.gradeApplied) {
    rows.push(...buildGradeRows(job.spec.color.grade, after.grade));

    const before = await paletteOnly(job.targetVideoPath, framesDir, `${job.id}_before`, mediaBaseUrl);
    const paletteRow = buildPaletteRow(job.spec.color.palette, before, after.palette);
    if (paletteRow) rows.push(paletteRow);
    else notScored.push({ attribute: "color.palette", reason: "no dominant swatch available to compare" });
  } else {
    notScored.push({
      attribute: "color.grade",
      reason: job.gradeSkipReason ?? "grade was not applied",
    });
  }

  if (willScoreTypography && intendedStyle) {
    rows.push(...buildTypographyRows(intendedStyle, after.typography));
  } else {
    notScored.push({
      attribute: "typography",
      reason: job.titleSkipReason ?? "no title was burned",
    });
  }

  return {
    rows,
    scored: rows.length,
    matched: rows.filter((r) => r.verdict === "matched").length,
    notScored,
    framesAnalyzed: after.framesAnalyzed,
  };
}
