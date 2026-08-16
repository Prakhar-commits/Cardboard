import { z } from "zod";

export const StyleSpecSchema = z.object({
  version: z.literal("1.0"),
  source: z.object({
    filename: z.string(),
    durationSec: z.number(),
    resolution: z.string(),
    aspectRatio: z.string(),
    fps: z.number(),
  }),
  pacing: z.object({
    totalCuts: z.number(),
    cutsPerMinute: z.number(),
    avgShotLengthSec: z.number(),
    shotLengths: z.array(z.number()),
    rhythm: z.enum(["steady", "accelerating", "decelerating", "erratic", "beat-synced"]),
    notes: z.string(),
  }),
  color: z.object({
    palette: z.array(
      z.object({
        hex: z.string(),
        role: z.enum(["dominant", "secondary", "accent"]),
        coverage: z.number(),
      })
    ),
    grade: z.object({
      temperature: z.enum(["warm", "neutral", "cool"]),
      contrast: z.enum(["low", "medium", "high"]),
      saturation: z.enum(["muted", "natural", "vivid"]),
      description: z.string(),
      lutSuggestion: z.string().optional(),
    }),
  }),
  typography: z.object({
    present: z.boolean(),
    styles: z.array(
      z.object({
        role: z.enum(["title", "subtitle", "caption", "lower-third", "other"]),
        fontFamilyGuess: z.string(),
        weight: z.string(),
        case: z.enum(["upper", "lower", "title", "mixed"]),
        colorHex: z.string(),
        placement: z.string(),
        animationStyle: z.string(),
        // Vision-supplied classification, used only as input to the fallback
        // ladder in pipeline/fonts.ts when fontFamilyGuess has no name match.
        classification: z.string().optional(),
        weightClass: z.enum(["light", "regular", "medium", "bold", "black"]).optional(),
        // Vision-supplied animation signals, used only as input to the preset
        // ladder in pipeline/presets.ts — the animation analogue of the two
        // font fields above.
        animationPresetGuess: z.string().optional(),
        animationClassification: z.string().optional(),
        animationIntensity: z.enum(["subtle", "moderate", "punchy"]).optional(),
        resolvedFont: z
          .object({
            family: z.string(),
            rung: z.enum(["exact", "sourced", "matched", "fallback"]),
            source: z.enum(["local-library", "google-fonts", "default"]),
            confidence: z.enum(["high", "approximate"]),
            reason: z.string(),
            classification: z.string().optional(),
            weightClass: z.string().optional(),
          })
          .optional(),
        resolvedAnimation: z
          .object({
            preset: z.string(),
            rung: z.enum(["exact", "sourced", "matched", "fallback"]),
            source: z.enum(["editor-library", "external-catalog", "default"]),
            confidence: z.enum(["high", "approximate"]),
            reason: z.string(),
            classification: z.string().optional(),
            intensity: z.string().optional(),
            // On the "sourced" rung the effect is real but absent from the
            // library. Naming the closest shipped preset is the difference
            // between blocking the edit and offering a way forward.
            alternativePreset: z.string().optional(),
          })
          .optional(),
      })
    ),
  }),
  transitions: z.object({
    types: z.array(
      z.object({
        type: z.string(),
        countEstimate: z.number(),
        description: z.string(),
      })
    ),
    dominantStyle: z.string(),
  }),
  motion: z.object({
    cameraMovement: z.string(),
    speedRamps: z.boolean(),
    notes: z.string(),
  }),
  audio: z.object({
    hasMusic: z.boolean(),
    hasSpeech: z.boolean(),
    energyProfile: z.enum(["low", "building", "high", "dynamic"]),
    estimatedBpm: z.number().nullable(),
  }),
  mood: z.object({
    keywords: z.array(z.string()).max(5),
    description: z.string(),
  }),
  suggestedActions: z.array(
    z.object({
      attribute: z.string(),
      action: z.string(),
      params: z.record(z.any()),
    })
  ),
});

export type StyleSpec = z.infer<typeof StyleSpecSchema>;

// Sub-schema the vision model is asked to fill in directly (everything
// except palette, which is always programmatic — see palette.ts).
export const VisionOutputSchema = z.object({
  color: z.object({ grade: StyleSpecSchema.shape.color.shape.grade }),
  typography: StyleSpecSchema.shape.typography,
  transitions: StyleSpecSchema.shape.transitions,
  motion: StyleSpecSchema.shape.motion,
  mood: StyleSpecSchema.shape.mood,
});

export type VisionOutput = z.infer<typeof VisionOutputSchema>;
