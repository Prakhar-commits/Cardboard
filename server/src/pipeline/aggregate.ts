import { StyleSpecSchema, type StyleSpec } from "../schema/styleSpec.js";
import type { VisionOutput } from "../schema/styleSpec.js";
import type { Job } from "../jobs.js";
import { resolveFont } from "./fonts.js";
import { resolveAnimationPreset } from "./presets.js";

function buildSuggestedActions(spec: Omit<StyleSpec, "suggestedActions">): StyleSpec["suggestedActions"] {
  const actions: StyleSpec["suggestedActions"] = [];

  actions.push({
    attribute: "color.grade",
    action: "apply_lut",
    params: {
      temperature: spec.color.grade.temperature,
      contrast: spec.color.grade.contrast,
      saturation: spec.color.grade.saturation,
      lutSuggestion: spec.color.grade.lutSuggestion ?? null,
    },
  });

  actions.push({
    attribute: "color.palette",
    action: "set_palette",
    params: { colors: spec.color.palette.map((p) => p.hex) },
  });

  for (const style of spec.typography.styles) {
    actions.push({
      attribute: "typography.styles",
      action: "add_text_preset",
      params: {
        role: style.role,
        fontFamily: style.resolvedFont?.family ?? style.fontFamilyGuess,
        weight: style.weight,
        case: style.case,
        colorHex: style.colorHex,
        placement: style.placement,
        // The executable half: a preset name from the editor's inventory,
        // with the free-text description kept alongside it for context.
        animationPreset: style.resolvedAnimation?.preset ?? null,
        animationPresetConfidence: style.resolvedAnimation?.confidence ?? null,
        animationPresetAvailable: style.resolvedAnimation?.source === "editor-library",
        animationPresetAlternative: style.resolvedAnimation?.alternativePreset ?? null,
        animationStyle: style.animationStyle,
      },
    });
  }

  actions.push({
    attribute: "pacing",
    action: "set_target_shot_length",
    params: {
      avgShotLengthSec: spec.pacing.avgShotLengthSec,
      cutsPerMinute: spec.pacing.cutsPerMinute,
      rhythm: spec.pacing.rhythm,
    },
  });

  actions.push({
    attribute: "transitions",
    action: "set_transition_style",
    params: {
      dominantStyle: spec.transitions.dominantStyle,
      types: spec.transitions.types,
    },
  });

  actions.push({
    attribute: "motion",
    action: "apply_camera_motion",
    params: {
      cameraMovement: spec.motion.cameraMovement,
      speedRamps: spec.motion.speedRamps,
    },
  });

  if (spec.audio.estimatedBpm !== null) {
    actions.push({
      attribute: "audio",
      action: "sync_cuts_to_bpm",
      params: { estimatedBpm: spec.audio.estimatedBpm, energyProfile: spec.audio.energyProfile },
    });
  }

  actions.push({
    attribute: "mood",
    action: "tag_mood",
    params: { keywords: spec.mood.keywords },
  });

  return actions;
}

export function aggregateStyleSpec(job: Job, visionOutput: VisionOutput): StyleSpec {
  if (!job.source || !job.shots || !job.pacing || !job.audio || !job.palette) {
    throw new Error("Job is missing required pipeline outputs for aggregation.");
  }

  const withoutActions: Omit<StyleSpec, "suggestedActions"> = {
    version: "1.0",
    source: {
      filename: job.originalFilename,
      durationSec: job.source.durationSec,
      resolution: job.source.resolution,
      aspectRatio: job.source.aspectRatio,
      fps: job.source.fps,
    },
    pacing: job.pacing,
    color: {
      palette: job.palette,
      grade: visionOutput.color.grade,
    },
    typography: {
      present: visionOutput.typography.present,
      styles: visionOutput.typography.styles.map((style) => ({
        ...style,
        resolvedFont: resolveFont(style),
        resolvedAnimation: resolveAnimationPreset(style),
      })),
    },
    transitions: visionOutput.transitions,
    motion: visionOutput.motion,
    audio: job.audio,
    mood: visionOutput.mood,
  };

  const spec: StyleSpec = {
    ...withoutActions,
    suggestedActions: buildSuggestedActions(withoutActions),
  };

  return StyleSpecSchema.parse(spec);
}
