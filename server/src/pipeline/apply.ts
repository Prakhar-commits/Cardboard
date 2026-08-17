import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { updateApplyJob, setApplyStatus, failApplyJob, type ApplyJob } from "../applyJobs.js";
import type { StyleSpec } from "../schema/styleSpec.js";
import { generateCubeLut } from "./lut.js";
import { resolveFontFile, FontFileError } from "./fontFiles.js";
import { buildFidelityReport } from "./verify.js";
import { buildTextAnimation } from "./textAnimation.js";
import { probeVideo } from "./ingest.js";

export interface ApplyPaths {
  workDir: string;
  outputsDir: string;
  fontCacheDir: string;
  framesDir: string;
  outputsBaseUrl: string;
  framesBaseUrl: string;
}

// ffmpeg's filtergraph parser splits options on ":" *before* quotes are
// resolved, so a Windows drive letter ends the value early and the whole
// chain fails to parse. Forward slashes avoid backslash-escaping, and the
// colon still has to be escaped explicitly even inside single quotes.
function escapeFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function applyCase(text: string, mode: StyleSpec["typography"]["styles"][number]["case"]): string {
  switch (mode) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return text.replace(/\w\S*/g, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
    default:
      return text;
  }
}

function placementXY(placement: string): { x: string; y: string } {
  const p = placement.toLowerCase();
  let x = "(w-text_w)/2";
  let y = "(h-text_h)/2";
  if (p.includes("lower")) y = "h*0.78-text_h/2";
  else if (p.includes("top") || p.includes("upper")) y = "h*0.08";
  else if (p.includes("bottom")) y = "h*0.88-text_h";
  if (p.includes("left")) x = "w*0.06";
  else if (p.includes("right")) x = "w-text_w-w*0.06";
  return { x, y };
}

function fontSizeForRole(role: StyleSpec["typography"]["styles"][number]["role"]): string {
  switch (role) {
    case "title":
      return "h*0.08";
    case "subtitle":
      return "h*0.05";
    case "lower-third":
      return "h*0.045";
    case "caption":
      return "h*0.035";
    default:
      return "h*0.06";
  }
}

function isNeutralGrade(grade: StyleSpec["color"]["grade"]): boolean {
  return grade.temperature === "neutral" && grade.contrast === "medium" && grade.saturation === "natural";
}

function runFfmpeg(inputPath: string, outputPath: string, filters: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", inputPath];
    if (filters.length > 0) {
      args.push("-vf", filters.join(","), "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy");
    } else {
      args.push("-c", "copy");
    }
    args.push(outputPath);

    const proc = spawn("ffmpeg", args);
    let stderr = "";
    proc.stderr.on("data", (c) => (stderr += c.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg render failed: ${stderr.slice(-800)}`));
    });
  });
}

/**
 * Applies the two Phase 3 attributes — color grade and title typography —
 * to a target video. Either step is a legitimate no-op (neutral grade, no
 * typography present) and is reported as skipped, not forced. See
 * CLAUDE.md "Phase 3 — Apply the spec".
 */
export async function runApplyPipeline(job: ApplyJob, paths: ApplyPaths): Promise<void> {
  try {
    await mkdir(paths.workDir, { recursive: true });
    await mkdir(paths.outputsDir, { recursive: true });

    const filters: string[] = [];

    setApplyStatus(job.id, "grading");
    const grade = job.spec.color.grade;
    if (isNeutralGrade(grade)) {
      updateApplyJob(job.id, {
        gradeApplied: false,
        gradeSkipReason: "grade is neutral (medium contrast, natural saturation) — no-op is the correct outcome",
      });
    } else {
      const cube = generateCubeLut(job.spec);
      const cubePath = path.join(paths.workDir, `${job.id}.cube`);
      await writeFile(cubePath, cube);
      filters.push(`lut3d=file='${escapeFilterPath(cubePath)}'`);
      updateApplyJob(job.id, { gradeApplied: true });
    }

    setApplyStatus(job.id, "titling");
    const style = job.spec.typography.present ? job.spec.typography.styles[0] : undefined;
    if (!style) {
      updateApplyJob(job.id, {
        titleApplied: false,
        titleSkipReason: "typography.present is false — skipped rather than inventing a title",
      });
    } else if (!job.titleText?.trim()) {
      updateApplyJob(job.id, { titleApplied: false, titleSkipReason: "no title text supplied" });
    } else {
      const family = style.resolvedFont?.family ?? style.fontFamilyGuess;
      try {
        const fontPath = await resolveFontFile(family, paths.fontCacheDir);
        const text = applyCase(job.titleText, style.case);
        const { x, y } = placementXY(style.placement);
        const size = fontSizeForRole(style.role);

        // Execute the preset the ladder resolved to, rather than burning a
        // static string and leaving the ladder's conclusion unexercised.
        const probe = await probeVideo(job.targetVideoPath);
        const animation = buildTextAnimation({
          text,
          fontFile: escapeFilterPath(fontPath),
          fontSizeExpr: size,
          colorHex: style.colorHex,
          x,
          y,
          classification: style.resolvedAnimation?.classification,
          intensity: style.resolvedAnimation?.intensity,
          durationSec: probe.durationSec,
        });

        filters.push(...animation.filters);
        updateApplyJob(job.id, {
          titleApplied: true,
          resolvedFontFamily: family,
          animationPreset: style.resolvedAnimation?.preset,
          animationRendered: animation.kind,
          animationApproximated: animation.approximated,
          animationNote: animation.note,
        });
      } catch (err) {
        const reason = err instanceof FontFileError ? err.message : "font asset unavailable";
        updateApplyJob(job.id, { titleApplied: false, titleSkipReason: reason });
      }
    }

    setApplyStatus(job.id, "rendering");
    const outputFilename = `${job.id}.mp4`;
    const outputPath = path.join(paths.outputsDir, outputFilename);
    await runFfmpeg(job.targetVideoPath, outputPath, filters);
    updateApplyJob(job.id, { outputPath, outputUrl: `${paths.outputsBaseUrl}/${outputFilename}` });

    // The render is delivered here. Verification is deliberately kicked off
    // after "done" and never awaited: a failing verifier must not withhold a
    // render that already succeeded.
    setApplyStatus(job.id, "done");
    void runVerification(job, outputPath, paths);
  } catch (err) {
    failApplyJob(job.id, err instanceof Error ? err.message : "Unknown apply error.");
  }
}

async function runVerification(job: ApplyJob, renderedPath: string, paths: ApplyPaths): Promise<void> {
  updateApplyJob(job.id, { verifyStatus: "running" });
  try {
    const fidelity = await buildFidelityReport(job, renderedPath, paths.framesDir, paths.framesBaseUrl);
    updateApplyJob(job.id, { verifyStatus: "done", fidelity });
  } catch (err) {
    updateApplyJob(job.id, {
      verifyStatus: "failed",
      verifyError: err instanceof Error ? err.message : "Unknown verification error.",
    });
  }
}
