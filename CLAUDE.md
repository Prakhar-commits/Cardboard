# CLAUDE.md — Style Reference Decomposer

## What this project is

A web app that ingests a reference video and decomposes it into discrete, **machine-actionable** style attributes: color palette, color grade, typography, pacing, transition types, text animation styles, aspect ratio, and mood. The user toggles which attributes to "borrow," and the app exports a structured JSON **Style Spec** that a video-editing agent could consume and execute — then **reproduces** the selected attributes on new footage and **measures whether the reproduction actually matched**.

This is a portfolio prototype targeted at Cardboard (a browser-based, agent-native video editor startup). The pitch framing: *"Extract a style, apply it, and verify it landed — with an honest fallback path when the reference uses something the editor doesn't have."*

**The single most important design decision:** the final output is not a dashboard — it is a versioned JSON schema (`StyleSpec v1`) that an agent could act on. Every UI decision serves that.

**The second:** extraction alone is a weekend project. The differentiators are the fallback ladder (Phase 1) and the verification loop (Phase 4). When trading scope, protect those over breadth of extracted attributes.

---

## Tech stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS
- **Backend:** Node.js (Express or Fastify) + TypeScript
- **Video processing:** `fluent-ffmpeg` wrapping a local ffmpeg binary (scene detection, keyframe extraction, audio analysis)
- **AI:** Anthropic Messages API (`claude-sonnet-4-6`) with vision — batched keyframe analysis
- **Storage:** Local filesystem for uploads/frames (no DB needed; in-memory job store with a Map keyed by jobId)
- **No auth, no deployment complexity.** This is a demo. Run locally, deploy to a single VM or Railway/Render at the end if time permits.

Do NOT add: databases, queues, Redis, Docker, or auth. Keep it boring and shippable.

---

## Repository structure

Workspace root is this directory (pnpm workspaces, not npm). Files marked ⬜ are not built yet.

```
Cardboard/
├── CLAUDE.md                  # this file
├── UI_DESIGN.md               # visual language reference for the frontend
├── pnpm-workspace.yaml        # packages: server, web
├── server/
│   ├── src/
│   │   ├── index.ts           # Express app, routes
│   │   ├── jobs.ts            # in-memory job store + status machine
│   │   ├── pipeline/
│   │   │   ├── run.ts         # stage orchestrator
│   │   │   ├── ingest.ts      # accept upload, ffprobe
│   │   │   ├── scenes.ts      # ffmpeg scene detection → cut list
│   │   │   ├── frames.ts      # keyframe extraction per scene
│   │   │   ├── audio.ts       # loudness curve, beat estimate, speech presence
│   │   │   ├── palette.ts     # programmatic color extraction
│   │   │   ├── vision.ts      # Claude vision calls per frame batch
│   │   │   ├── aggregate.ts   # merge everything → StyleSpec JSON
│   │   │   ├── fonts.ts       # the fallback ladder (Phase 1)
│   │   │   ├── fontCatalog.ts # bundled families + Google Fonts catalog + taxonomy lookup
│   │   │   ├── fontFiles.ts   # fetches/caches the actual TTF for a resolved family
│   │   │   ├── presets.ts     # the same ladder, over animation presets
│   │   │   ├── presetCatalog.ts # editor preset library + external effects + taxonomy
│   │   │   ├── lut.ts         # StyleSpec.color → .cube LUT (Phase 2)
│   │   │   ├── apply.ts       # grade + title a target video (Phase 3)
│   │   │   ├── verify.ts      # re-extract from render, diff vs intent (Phase 4)
│   │   │   └── colorMath.ts   # hex → CIELAB + ΔE, used by the verifier
│   │   ├── prompts/
│   │   │   └── styleAnalysis.ts
│   │   ├── assets/fonts-cache/ # TTFs fetched on demand, not committed
│   │   └── schema/
│   │       ├── styleSpec.ts   # zod schema, single source of truth
│   │       └── fidelity.ts    # FidelityReport shape (Phase 4)
│   └── tsconfig.json
├── web/
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── UploadZone.tsx        # drag-drop + URL paste
│   │   │   ├── ProgressStepper.tsx   # ingest → scenes → frames → analysis → spec
│   │   │   ├── ResultsScreen.tsx     # card grid + spec panel layout
│   │   │   ├── AttributeCard.tsx     # one card per attribute, toggleable
│   │   │   ├── PaletteStrip.tsx      # color swatches with hex
│   │   │   ├── PacingRibbon.tsx      # shot-length timeline (cuts/min visual)
│   │   │   ├── FrameGallery.tsx      # keyframes grouped by scene
│   │   │   ├── TypographyPreview.tsx # detected type rendered in resolved font
│   │   │   ├── SpecPanel.tsx         # live JSON preview + copy/download
│   │   │   ├── FallbackLadder.tsx    # resolution path + confidence (Phase 1)
│   │   │   ├── ApplyPanel.tsx        # target upload → before/after (Phase 3)
│   │   │   └── FidelityReport.tsx    # intended vs achieved diff (Phase 4)
│   │   └── lib/
│   │       ├── api.ts
│   │       ├── types.ts
│   │       ├── highlightJson.ts
│   │       └── useTimecode.ts
│   └── tsconfig.json
└── samples/                   # short test videos (15-60s), gitignored
```

---

## The StyleSpec schema (build this FIRST)

Define in `server/src/schema/styleSpec.ts` with zod. This is the contract everything else serves.

```typescript
export const StyleSpec = z.object({
  version: z.literal("1.0"),
  source: z.object({
    filename: z.string(),
    durationSec: z.number(),
    resolution: z.string(),        // "1920x1080"
    aspectRatio: z.string(),       // "16:9" | "9:16" | "1:1" | ...
    fps: z.number(),
  }),
  pacing: z.object({
    totalCuts: z.number(),
    cutsPerMinute: z.number(),
    avgShotLengthSec: z.number(),
    shotLengths: z.array(z.number()),      // per-shot durations, ordered
    rhythm: z.enum(["steady", "accelerating", "decelerating", "erratic", "beat-synced"]),
    notes: z.string(),
  }),
  color: z.object({
    palette: z.array(z.object({ hex: z.string(), role: z.enum(["dominant","secondary","accent"]), coverage: z.number() })),
    grade: z.object({
      temperature: z.enum(["warm","neutral","cool"]),
      contrast: z.enum(["low","medium","high"]),
      saturation: z.enum(["muted","natural","vivid"]),
      description: z.string(),               // e.g. "teal-orange blockbuster grade, lifted blacks"
      lutSuggestion: z.string().optional(),   // closest well-known LUT family
    }),
  }),
  typography: z.object({
    present: z.boolean(),
    styles: z.array(z.object({
      role: z.enum(["title","subtitle","caption","lower-third","other"]),
      fontFamilyGuess: z.string(),           // "condensed grotesque sans, similar to Bebas Neue"
      weight: z.string(),
      case: z.enum(["upper","lower","title","mixed"]),
      colorHex: z.string(),
      placement: z.string(),                 // "center", "lower-third left", ...
      animationStyle: z.string(),            // "word-by-word pop-in with slight overshoot"
      resolvedFont: z.object({ /* ... */ }).optional(),  // populated by Phase 1 — see the fallback ladder section for the full shape
    })),
  }),
  transitions: z.object({
    types: z.array(z.object({ type: z.string(), countEstimate: z.number(), description: z.string() })),
    dominantStyle: z.string(),               // "hard cuts with occasional whip-pans"
  }),
  motion: z.object({
    cameraMovement: z.string(),              // "handheld with punch-in zooms on emphasis"
    speedRamps: z.boolean(),
    notes: z.string(),
  }),
  audio: z.object({
    hasMusic: z.boolean(),
    hasSpeech: z.boolean(),
    energyProfile: z.enum(["low","building","high","dynamic"]),
    estimatedBpm: z.number().nullable(),
  }),
  mood: z.object({
    keywords: z.array(z.string()).max(5),
    description: z.string(),
  }),
  // The agent-native part: each attribute mapped to hypothetical timeline actions
  suggestedActions: z.array(z.object({
    attribute: z.string(),                   // "color.grade"
    action: z.string(),                      // "apply_lut"
    params: z.record(z.any()),
  })),
});
```

The `suggestedActions` array is the demo's kicker — it shows the spec is executable, not decorative. Generate it in `aggregate.ts` with simple deterministic mapping (grade → apply_lut, typography → add_text_preset, pacing → set_target_shot_length, etc.).

---

## Pipeline stages (server)

Job status machine: `queued → ingesting → detecting_scenes → extracting_frames → analyzing → aggregating → done | failed`. Frontend polls `GET /api/jobs/:id` every 1.5s.

### 1. Ingest (`ingest.ts`)
- Accept multipart upload (limit 200MB) OR a direct video URL (fetch and save). Skip yt-dlp for v1 unless time remains — direct upload is the reliable demo path.
- Probe with `ffprobe`: duration, resolution, fps, aspect ratio. Reject > 3 min videos with a friendly error (keeps analysis fast and cheap).

### 2. Scene detection (`scenes.ts`)
- `ffmpeg -i in.mp4 -filter:v "select='gt(scene,0.3)',showinfo" -f null -` and parse `pts_time` from stderr.
- Output: ordered cut timestamps → shot list with durations. This alone gives you the entire `pacing` block programmatically — no AI needed.
- Compute rhythm label heuristically: variance and trend of shot lengths.

### 3. Keyframe extraction (`frames.ts`)
- One frame from the midpoint of each shot. Cap at 20 frames total (evenly sample shots if more). Resize to max 768px wide JPEG q80 — keeps vision token cost low.

### 4. Audio analysis (`audio.ts`)
- `ffmpeg` volumedetect + astats for loudness curve. Silence detection for speech-vs-music heuristic. BPM: optional — use `music-tempo` npm package on decoded PCM if easy, otherwise set null. Do not sink time here.

### 5. Palette extraction (`palette.ts`)
- Programmatic, per keyframe: k-means (or `node-vibrant`) → merge across frames weighted by shot duration → top 5-6 colors with coverage %. Programmatic beats asking the vision model for hex codes (models hallucinate hex values).

### 6. Vision analysis (`vision.ts`)
- Batch keyframes into 1-2 Claude calls (up to 20 images per call is fine). Send frames labeled with shot index + timestamp.
- The prompt (in `prompts/styleAnalysis.ts`) must demand **JSON only** matching the relevant sub-schemas: typography, grade description (temperature/contrast/saturation — palette hexes come from step 5), transitions guess (from consecutive-frame comparison), camera movement, mood.
- Prompt rules: respond with raw JSON, no markdown fences, no preamble. Include the exact JSON shape in the prompt. Parse defensively: strip fences if present, try/catch, retry once on parse failure.

### 7. Aggregate (`aggregate.ts`)
- Merge programmatic data (pacing, palette, audio, source) + vision data (typography, grade, transitions, motion, mood) → validate against zod StyleSpec → store on job.
- Generate `suggestedActions` deterministically from the merged spec.

---

## Frontend requirements

- **Single-page flow:** upload → live progress stepper (show real stage names, show extracted keyframes appearing as they're ready) → results.
- **Results layout:** attribute cards in a grid. Each card has a toggle ("borrow this"). Toggles filter the live JSON preview in a right-side panel (`SpecPanel.tsx`). Copy and Download buttons for the filtered spec.
- **PacingRibbon:** horizontal bar strip where each bar's width = shot duration. Instantly communicates rhythm. This is the most visually impressive component — polish it.
- **PaletteStrip:** swatches with hex labels, coverage-proportional widths.
- **FrameGallery:** keyframes with timestamps, grouped by scene.
- Design: dark UI, restrained, editorial. No purple-gradient AI-slop aesthetic. This is going to design-literate founders — typography and spacing matter. One accent color max.

---

## Build order

### Done

**The extraction core** — schema, ingest, scene detection, keyframes, palette, audio, vision, aggregation, job store, API routes, upload flow, progress stepper, results UI with toggles and live JSON export.

**Phases 1–4** — fallback ladder, `.cube` export, apply, verify. All four run end to end.

Treat this as the stable base — from here, changes to it should be bug fixes and prompt tuning, not new surface.

**The animation-preset ladder** — the fallback ladder generalized to a second capability inventory.

Still open: Phase 0 (range selection / long sources / URL ingest), Phase 5 (polish, more samples, demo recording), deployment, and `git init`.

### The reframe: extraction is not the product

Extraction is a well-prompted vision call. Anyone can build it in a weekend, and a demo that stops there is a dashboard. The hard problems the target audience actually named are **reliable reproduction**, **graceful fallback when the editor lacks the asset**, and **knowing whether the result is any good**. Everything below serves those three, in that order of leverage.

Phases are ordered so that stopping after any one of them still leaves a coherent demo. Do not start a phase before the previous one works end-to-end.

### Phase 1 — The fallback ladder (highest leverage per hour)

Not "closest local font." The full decision path, with the reasoning visible in the UI. See the dedicated section below.

### Phase 2 — Interchange artifacts (.cube LUT)

Emit a real `.cube` LUT from `color.grade` + palette. Small, deterministic, and it makes the spec executable in Premiere / Resolve / FCP with no plugin, no extension API, no host approval. This is the cross-NLE claim, earned cheaply.

### Phase 3 — Apply the spec

Grade + title a target video with ffmpeg. Before/after players. The LUT from Phase 2 is the grading half, so this phase is mostly typography and rendering.

### Phase 4 — Verify the spec (the kicker)

Re-run the extractor on your own rendered output and diff it against the spec you intended. Per-attribute fidelity scores. This is the only version of the demo that can say *how it knows the apply worked*.

### Phase 5 — Polish and demo

Test on diverse videos (talking-head, fast-cut reel, cinematic b-roll, no-text cinematic). Record 60–90s: extract → select → apply → **verify**. Optional deploy.

**Cut order if time runs short:** Phase 5 polish is never cut. Cut from the bottom — 4, then 3, then 2. Phase 1 is not cuttable; it is the part that answers a question they explicitly asked.

---

## Explicitly not building: a Premiere Pro (or any NLE) plugin

Cardboard is a browser NLE. Their public position is that the browser is a deliberate bet — accessible by default, agent-native in a way a native app can't be, collaboration infra from day one. A CEP/UXP extension is the architecture that thesis rejects, and it adds a platform axis where this project needs a depth axis.

If cross-NLE reach is wanted, it comes from **Phase 2 artifacts** (`.cube` now, `.mogrt` only if everything else is done — it's a zip + JSON manifest + an After Effects-authored source, meaningfully fiddlier than a LUT for less demo value).

---

## Phase 1 — The fallback ladder

Answers the question their doc asks directly: *what happens when the reference uses a font the editor doesn't have?* The answer is not one substitution. It is a ranked path, and the value is in **showing the reasoning**, not in getting a perfect match.

**The ladder is the general mechanism, not a font feature.** Every style attribute resolves against the editor's actual capability inventory through the same four rungs. It runs twice today — once over the font library (`fonts.ts` + `fontCatalog.ts`), once over the animation-preset library (`presets.ts` + `presetCatalog.ts`) — and a third inventory would be the same shape again. That generality is the claim worth making; a font-specific trick is not.

### `pipeline/fonts.ts` — resolve in rungs, stop at the first hit

1. **`exact`** — the detected family name matches a bundled font. Confidence: high.
2. **`sourced`** — the family exists in the Google Fonts catalog (API lookup by name, or a committed catalog JSON to avoid a network dependency in the demo). Record the family and that it *would* be fetched. Confidence: high.
3. **`matched`** — no name match, so fall back to the taxonomy: the vision model classifies the style into `{ classification, weightClass }` and a lookup table maps classification → best bundled family, ranked secondarily by weight. Confidence: approximate.
4. **`fallback`** — classification itself is low-confidence or absent. Pick the neutral default for the role (Inter for UI-ish, Anton for display) and say so plainly. Confidence: approximate.

Every rung records **why** it was chosen in a `reason` string. That string is the point — it is what makes this honest instead of magic.

### The library (`fontCatalog.ts`, ~15 families)

Condensed grotesque (Archivo Black, Anton, Oswald), geometric sans (Poppins, Montserrat), neo-grotesque (Inter, Roboto), serif (Playfair Display, Lora), mono (JetBrains Mono), rounded (Nunito), display/script (Bangers, Pacifico, Caveat).

The "bundled" set is a catalog entry, not a committed binary: `fontFiles.ts` fetches the actual TTF from Google's CSS endpoint on first use and caches it under `server/assets/fonts-cache/`. That keeps the repo free of ~15 font binaries and makes the `sourced` rung fetch something real rather than only claiming it would.

No image-similarity ML. The taxonomy lookup is explainable and it works; a fuzzy embedding match that can't justify itself is worse for this demo even if it's marginally more accurate.

### Schema addition

```typescript
resolvedFont: z.object({
  family: z.string(),
  rung: z.enum(["exact", "sourced", "matched", "fallback"]),
  source: z.enum(["local-library", "google-fonts", "default"]),
  confidence: z.enum(["high", "approximate"]),
  reason: z.string(),          // "no name match; classified condensed-grotesque/heavy"
  classification: z.string().optional(),
  weightClass: z.string().optional(),
}).optional()
```

### The animation-preset ladder (`presets.ts` + `presetCatalog.ts`)

`typography.animationStyle` is prose ("word-by-word pop-in with slight overshoot") — nothing can execute it. The same four rungs resolve it to a **named preset from the editor's inventory**:

1. **`exact`** — the detected name is a preset the editor ships (checked against the declared guess and against names quoted inside the free-text description). Confidence: high.
2. **`sourced`** — a real, nameable effect the editor does not ship (`Kinetic Typography`, `Glitch In`, …). It would have to be sourced or authored. Confidence: high — **and this rung also names the closest shipped preset** in `alternativePreset`, because "we don't have it" that stops there obstructs the edit.
3. **`matched`** — no name, so the taxonomy: `animationClassification` (`word-by-word`, `character-reveal`, `scale-pop`, `slide`, `fade`, `blur-focus`, `highlight`, `kinetic-emphasis`, `static`) → closest shipped preset, ranked secondarily by `animationIntensity`. Confidence: approximate.
4. **`fallback`** — nothing usable. `Hold` if the text reads static, otherwise `Fade In`. Confidence: approximate.

The library in `presetCatalog.ts` is modelled on the kind of named caption presets a browser NLE ships. Swap the names for a host editor's real catalog and the ladder works unchanged — that is the point of resolving against an inventory rather than hardcoding one substitution.

`suggestedActions[].add_text_preset` carries `animationPreset`, `animationPresetConfidence`, `animationPresetAvailable`, and `animationPresetAlternative`, so an agent can tell "run this now" from "fetch this first" from "this is our best approximation".

### Frontend: `FallbackLadder.tsx`

In the typography AttributeCard, render **both** ladders — font and animation — with the rungs that were tried, which one hit, and the reason. The resolved font family is set *in that family* (loaded via Google Fonts CSS). A `sourced` animation is badged "not in library" with the usable-now alternative beside it. Something like: *Detected "condensed grotesque, heavy" → not in library → not in catalog → **Anton** (approximate)*.

---

## Phase 2 — Interchange artifacts

### `pipeline/lut.ts` — StyleSpec → `.cube`

Generate a standard 33×33×33 `.cube` LUT deterministically from `color.grade` and the palette. Plain text format, no dependencies, a few dozen lines to write.

- `temperature` → channel gain shift (warm: lift R, cut B; cool: inverse; neutral: identity)
- `contrast` → S-curve strength around mid-grey
- `saturation` → distance-from-luma scaling
- Dominant palette hue → a *gentle* push toward that hue in the midtones

Keep it subtle. A LUT that visibly wrecks skin tones reads as a bug, not a style.

- Endpoint: `GET /api/jobs/:id/lut.cube` → download, `Content-Type: text/plain`.
- Surface as a download button on the color AttributeCard: "Download .cube — drops into Premiere, Resolve, or FCP."

That button is the entire cross-NLE story, and it cost a text file.

---

## Phase 3 — Apply the spec

Turns the pitch from "I built an analyzer" into "I built a system that extracts a style and reproduces it." Scope ruthlessly — apply only TWO attributes: color grade and title typography.

### `pipeline/apply.ts`

- `POST /api/apply` — takes a StyleSpec JSON (the filtered export) + a target video upload. Same job-store pattern, statuses: `queued → grading → titling → rendering → done`.
- **Color grade:** apply the Phase 2 LUT via ffmpeg `lut3d=file=...`. One filter, and it guarantees the rendered result and the downloadable `.cube` are the same grade — which Phase 4 then measures.
- **Typography:** burn a title with ffmpeg `drawtext` using the first `typography.styles` entry — the Phase 1 resolved font file, `colorHex`, case transformation, and placement mapped to x/y expressions (center → `(w-text_w)/2`, lower-third → `y=h*0.78`). Title text is a user input on the apply screen. Skip animation; note in the UI that animation mapping is where the real editor takes over.
- If `typography.present` is false, skip titling entirely rather than inventing a title. Same for a neutral grade — no-op is a valid, correct outcome and the UI should say so.
- Output: rendered mp4 saved to the job, served via a static route.

### Frontend: `ApplyPanel.tsx`

Appears on the results screen once a spec exists: "Apply this style to your footage" → target upload + title input → progress → **side-by-side before/after players**. Polish this; it's the center of the demo video.

---

## Phase 4 — Verify the spec

There is no linter for video. This builds a narrow one: **run the extractor on your own output and diff it against what you asked for.**

### `pipeline/verify.ts`

1. Take the rendered mp4 from Phase 3.
2. Re-run the existing extraction pipeline on it (frames → palette → vision) — no new machinery, the extractor already exists.
3. Diff the re-extracted spec against the intended spec, per attribute.

Score only what apply actually touched. **Do not report fidelity on attributes you never applied** — pacing and audio pass through untouched, and scoring them inflates the number dishonestly.

- `color.grade.temperature` / `contrast` / `saturation` — enum distance (exact / off-by-one / opposite)
- `color.palette` — mean ΔE between intended dominant hues and achieved
- `typography.styles[].colorHex` — ΔE; `case` and `placement` — exact match
- `typography.resolvedFont.family` — did the burned font survive re-detection, or did the model read it as something else? (Expect approximate. Report it honestly — a disagreement here is a real finding about substitution quality, not a failure of the harness.)

Output a `FidelityReport`: per-attribute `{ attribute, intended, achieved, verdict: "matched" | "drifted" | "missed", delta }`.

### Frontend: `FidelityReport.tsx`

A compact table under the before/after: intended → achieved → verdict, one row per applied attribute. Green/amber/red on the verdict column only; keep the rest restrained.

**Be honest in the UI about what this is.** It measures whether the render matches the spec — not whether the video is *good*. Say that in a line of copy. Overclaiming here is the fastest way to lose a design-literate audience.

---

## Optional — Two-reference diff (only if everything else is done)

The `verify.ts` diffing machinery is ~80% of this; repoint it from intended-vs-achieved to reference-A-vs-reference-B.

- `GET /api/diff?a=:jobA&b=:jobB` → per-attribute agreement (same rhythm? overlapping palette? matching grade temperature?).
- UI: side-by-side spec columns, matches highlighted. One screen, read-only.
- Pitch value: gestures at the "memory / brand signature" problem — two videos from the same creator should diff nearly clean.

---

## Testing checklist

- [ ] 15s vertical reel with heavy text animations → typography block populated correctly
- [ ] 60s cinematic clip with no text → `typography.present: false`, grade description accurate
- [ ] Fast-cut montage → cutsPerMinute high, rhythm ≠ "steady"
- [ ] Malformed/audio-only file → clean failure state in UI
- [ ] Toggling cards updates exported JSON correctly
- [ ] Full pipeline on a 1-min video completes in < 60s

### Phase 1 — fallback ladder
- [ ] Reference using a bundled font (e.g. Montserrat) → resolves at rung `exact`, confidence high
- [ ] Reference using a real font *not* bundled (e.g. Futura) → resolves at `sourced` or `matched`, never silently at `exact`
- [ ] Vision returns no usable classification → lands at `fallback` with an honest reason string, does not crash
- [ ] Every resolved font renders in the UI *in that family*
- [x] Animation preset resolves at all four rungs (unit-checked); a named effect outside the library lands at `sourced` and names a usable-now alternative
- [ ] Reference whose captions match a shipped preset by name → resolves at `exact`, not `matched`

### Phase 2 — LUT
- [ ] Neutral/natural/medium grade → LUT is near-identity (diffing input vs output shows no visible change)
- [ ] Generated `.cube` parses in at least one real NLE or ffmpeg `lut3d` without error
- [ ] Strong warm + vivid grade → visible shift, no clipped highlights, skin tones survive

### Phase 3 — apply
- [ ] Applied grade is visible but subtle in before/after — no blown highlights or cartoon saturation
- [ ] drawtext title renders in the resolved fallback font with correct color, case, and placement
- [ ] `typography.present: false` → titling skipped gracefully, UI states that it was skipped
- [ ] Neutral grade → grading skipped rather than forcing a change

### Phase 4 — verify
- [x] Apply a spec to the *reference video itself* → the three grade enums come back exact. Note the palette row is *expected* to read `missed` here: the target already sits at the reference's colour centre, so any grade on top moves it away. That is the double-grading signal, not a failed apply — the row says so in its caveat. Typography rows are confounded on this sample because the reference already contains white lower-centre captions of its own; use text-free target footage to test titling cleanly.
- [ ] Apply a strong spec to unrelated footage → some attributes legitimately `drifted`; report says so instead of rounding up
- [ ] Untouched attributes (pacing, audio) are absent from the report, not scored as passes
- [ ] Verify stage failing does not fail the apply job — the render is still delivered

## Guardrails

- Never let a vision-model hex code into the palette — palette is programmatic only.
- All model output validated through zod before touching the UI. Failed validation → retry once with the validation error appended to the prompt → then fail the job gracefully.
- Keep per-video cost under ~$0.10: cap frames at 20, resize before sending, 1-2 API calls max. Phase 4 re-runs the extractor, so a verified apply costs roughly double — still under budget, but don't add a third pass.
- **Never claim a confidence the pipeline didn't earn.** A `matched` font rung is `approximate`, not `high`. A skipped attribute is "skipped," not "matched." An unmeasured attribute is absent from the fidelity report, not a pass. The audience for this demo will find an inflated number faster than they'll find a missing feature.
- The verifier measures **spec fidelity**, not video quality. Don't let UI copy imply otherwise.
- No NLE plugins. Cross-tool reach comes from exported artifacts (Phase 2) — see the section above for why.
- Commit after every working stage. Small commits, descriptive messages.
