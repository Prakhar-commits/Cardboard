export const STYLE_ANALYSIS_JSON_SHAPE = `{
  "color": {
    "grade": {
      "temperature": "warm" | "neutral" | "cool",
      "contrast": "low" | "medium" | "high",
      "saturation": "muted" | "natural" | "vivid",
      "description": string,
      "lutSuggestion": string (optional, closest well-known LUT family)
    }
  },
  "typography": {
    "present": boolean,
    "styles": [
      {
        "role": "title" | "subtitle" | "caption" | "lower-third" | "other",
        "fontFamilyGuess": string,
        "weight": string,
        "case": "upper" | "lower" | "title" | "mixed",
        "colorHex": string,
        "placement": string,
        "animationStyle": string,
        "classification": "condensed-grotesque" | "geometric-sans" | "neo-grotesque" | "serif" | "mono" | "rounded" | "script-display" (optional, omit if genuinely unclear),
        "weightClass": "light" | "regular" | "medium" | "bold" | "black" (optional, omit if genuinely unclear),
        "animationPresetGuess": string (optional, a specific well-known effect name if you recognize one, e.g. "Typewriter", "Kinetic Typography"),
        "animationClassification": "word-by-word" | "character-reveal" | "scale-pop" | "slide" | "fade" | "blur-focus" | "highlight" | "kinetic-emphasis" | "static" (optional, omit if genuinely unclear),
        "animationIntensity": "subtle" | "moderate" | "punchy" (optional, omit if genuinely unclear)
      }
    ]
  },
  "transitions": {
    "types": [ { "type": string, "countEstimate": number, "description": string } ],
    "dominantStyle": string
  },
  "motion": {
    "cameraMovement": string,
    "speedRamps": boolean,
    "notes": string
  },
  "mood": {
    "keywords": string[] (max 5),
    "description": string
  }
}`;

export function buildStyleAnalysisPrompt(shotCount: number, durationSec: number): string {
  return `You are analyzing keyframes extracted from a reference video (${shotCount} shots, ~${durationSec.toFixed(
    1
  )}s total) for a style-decomposition tool. Each image is labeled with its shot index and timestamp.

Analyze the frames as a sequence and infer the video's stylistic attributes. Do NOT guess exact color hex codes — color palette is computed programmatically elsewhere; only describe the grade qualitatively (temperature, contrast, saturation).

Respond with RAW JSON ONLY. No markdown code fences, no preamble, no trailing commentary — the response body must be valid JSON parseable as-is, matching exactly this shape:

${STYLE_ANALYSIS_JSON_SHAPE}

Rules:
- If there is no on-screen text/titles anywhere in the sequence, set typography.present to false and styles to an empty array.
- fontFamilyGuess should be your best specific guess at the actual family name (e.g. "Bebas Neue", "a condensed grotesque similar to Anton"). classification and weightClass are a separate, coarser fallback signal used only when the specific name can't be matched to an available font — omit them rather than guessing if the style genuinely doesn't fit one of the listed classifications.
- animationStyle stays a free-text description of what the text does. animationPresetGuess, animationClassification and animationIntensity are the machine-readable signals used to resolve it to a preset the editor can actually run — omit any of them rather than guessing. Keyframes are stills, so infer animation from motion blur, partial reveals, and differences between frames of the same shot; if the text looks static, use "static".
- Infer transitions by comparing consecutive frames (hard cut vs. dissolve vs. whip-pan indicators are visible as blur/composition jumps).
- mood.keywords must have at most 5 entries, lowercase, single words or short phrases.
- Every enum field must use exactly one of the listed values.`;
}

export function buildRetryPrompt(originalPrompt: string, validationError: string, rawOutput: string): string {
  return `${originalPrompt}

Your previous response failed schema validation with this error:
${validationError}

Your previous response was:
${rawOutput}

Return ONLY corrected raw JSON matching the required shape. No markdown fences, no commentary.`;
}
