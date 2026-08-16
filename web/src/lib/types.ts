export interface StyleSpec {
  version: "1.0";
  source: {
    filename: string;
    durationSec: number;
    resolution: string;
    aspectRatio: string;
    fps: number;
  };
  pacing: {
    totalCuts: number;
    cutsPerMinute: number;
    avgShotLengthSec: number;
    shotLengths: number[];
    rhythm: "steady" | "accelerating" | "decelerating" | "erratic" | "beat-synced";
    notes: string;
  };
  color: {
    palette: Array<{ hex: string; role: "dominant" | "secondary" | "accent"; coverage: number }>;
    grade: {
      temperature: "warm" | "neutral" | "cool";
      contrast: "low" | "medium" | "high";
      saturation: "muted" | "natural" | "vivid";
      description: string;
      lutSuggestion?: string;
    };
  };
  typography: {
    present: boolean;
    styles: Array<{
      role: "title" | "subtitle" | "caption" | "lower-third" | "other";
      fontFamilyGuess: string;
      weight: string;
      case: "upper" | "lower" | "title" | "mixed";
      colorHex: string;
      placement: string;
      animationStyle: string;
      classification?: string;
      weightClass?: "light" | "regular" | "medium" | "bold" | "black";
      animationPresetGuess?: string;
      animationClassification?: string;
      animationIntensity?: "subtle" | "moderate" | "punchy";
      resolvedFont?: {
        family: string;
        rung: "exact" | "sourced" | "matched" | "fallback";
        source: "local-library" | "google-fonts" | "default";
        confidence: "high" | "approximate";
        reason: string;
        classification?: string;
        weightClass?: string;
      };
      resolvedAnimation?: {
        preset: string;
        rung: "exact" | "sourced" | "matched" | "fallback";
        source: "editor-library" | "external-catalog" | "default";
        confidence: "high" | "approximate";
        reason: string;
        classification?: string;
        intensity?: string;
        alternativePreset?: string;
      };
    }>;
  };
  transitions: {
    types: Array<{ type: string; countEstimate: number; description: string }>;
    dominantStyle: string;
  };
  motion: {
    cameraMovement: string;
    speedRamps: boolean;
    notes: string;
  };
  audio: {
    hasMusic: boolean;
    hasSpeech: boolean;
    energyProfile: "low" | "building" | "high" | "dynamic";
    estimatedBpm: number | null;
  };
  mood: {
    keywords: string[];
    description: string;
  };
  suggestedActions: Array<{ attribute: string; action: string; params: Record<string, unknown> }>;
}

export type JobStatus =
  | "queued"
  | "ingesting"
  | "detecting_scenes"
  | "extracting_frames"
  | "analyzing_audio"
  | "extracting_palette"
  | "analyzing_vision"
  | "aggregating"
  | "done"
  | "failed";

export interface Shot {
  index: number;
  startSec: number;
  endSec: number;
  durationSec: number;
}

export interface Keyframe {
  shotIndex: number;
  timestampSec: number;
  url: string;
  filePath: string;
}

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
  originalFilename: string;
  source?: StyleSpec["source"];
  shots?: Shot[];
  pacing?: StyleSpec["pacing"];
  keyframes: Keyframe[];
  audio?: StyleSpec["audio"];
  palette?: StyleSpec["color"]["palette"];
  spec?: StyleSpec;
}

export const ATTRIBUTE_KEYS = ["color", "typography", "pacing", "transitions", "motion", "mood"] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

export type ApplyJobStatus = "queued" | "grading" | "titling" | "rendering" | "done" | "failed";

export type Verdict = "matched" | "drifted" | "missed";

export interface FidelityRow {
  attribute: string;
  intended: string;
  achieved: string;
  verdict: Verdict;
  delta?: string;
  caveat?: string;
}

export interface FidelityReport {
  rows: FidelityRow[];
  scored: number;
  matched: number;
  notScored: Array<{ attribute: string; reason: string }>;
  framesAnalyzed: number;
}

export type VerifyStatus = "not_started" | "running" | "done" | "failed";

export interface ApplyJob {
  id: string;
  status: ApplyJobStatus;
  error?: string;
  targetOriginalFilename: string;
  titleText?: string;
  gradeApplied?: boolean;
  gradeSkipReason?: string;
  titleApplied?: boolean;
  titleSkipReason?: string;
  resolvedFontFamily?: string;
  outputUrl?: string;
  verifyStatus?: VerifyStatus;
  verifyError?: string;
  fidelity?: FidelityReport;
}
