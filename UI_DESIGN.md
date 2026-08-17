# UI_DESIGN.md — Style Reference Decomposer

**Companion to `CLAUDE.md`. Open `ui-mockup.html` in a browser for the live results-screen mockup.**

This doc pins down the visual identity, tokens, and layout before any component is built. It exists so the UI has a point of view — not the AI-dashboard defaults (purple gradients, warm cream + terracotta, acid green on black) that instantly signal "made by a model in a hurry."

---

## 1. Design thesis

The product decomposes a *video* into a machine-readable style spec. The audience is video editors, agencies, and — for this specific demo — founders building an agent-native editor. Both audiences read visual polish faster than most product users; a generic dashboard would undersell the work.

**The thesis:** the UI dresses like a video monitor, not a SaaS dashboard. The vernacular of the subject — timecodes, shot lists, SMPTE ticks, monitor overlays — becomes the design language. Every panel wears a timecode. The pacing ribbon is the signature element. The JSON spec sits on the right of the results screen like a broadcast waveform: the always-visible source of truth.

**One risk we take:** the JSON export isn't hidden behind a "share" modal. It's a permanent right-rail panel with live syntax highlighting that updates as toggles flip. This is a design bet — the JSON *is* the product's thesis, so we show it always.

---

## 2. Design tokens

```
--bg:              #0E1013   /* monitor-black, cooled toward blue */
--surface:         #16181D   /* panels */
--surface-2:       #1B1E24   /* nested cards */
--hairline:        #24272E   /* 1px borders */
--hairline-strong: #2E323B   /* hover / active borders */

--text:            #EDEEF0   /* 14:1 on surface */
--text-dim:        #A2A8B2   /* 7.4:1 — was #8A8F98 */
--text-faint:      #7C818B   /* 4.5:1 — was #565A63, which measured 2.6:1 */

--accent:          #FF5C4D   /* electric coral — leader-countdown red, not Claude-terracotta */
--accent-dim:      #B84437
--ok:              #7BC97A   /* status only, never decorative */

--font-ui:         'Inter Tight'      /* headings, body */
--font-mono:       'JetBrains Mono'   /* timecodes, eyebrows, spec labels, JSON */
```

**Why this palette avoids the tells:**
- Not warm cream + terracotta (Claude default).
- Not near-black + acid green (the other AI default).
- Not purple/pink gradients (the flagged AI-slop tell for tech products).
- Not neon-blue-heavy (dev-tool default).
- The single accent is coral-red — earned from film-leader red and broadcast test-pattern chrominance, so it reads *of the subject*.

**Type pairing rationale:** Inter Tight + JetBrains Mono. The mono carries timecodes, labels, and JSON; the tight sans handles headings and body. This pair signals "we take both the craft and the technical seriously" — appropriate for an audience that includes both editors and infra founders. It is intentionally *not* a display serif — that would land on the broadsheet-editorial default.

---

## 3. Layout — three surfaces

The demo has three screens. Only one is designed in full (results); the others follow from it.

### 3.1 Upload / Ingest (Screen 1)

Single-column, centered, ~640px column. One dropzone, one URL input, one "analyze" button. Below the fold: a strip of 3 sample videos with different characters (cinematic b-roll, fast-cut reel, talking-head) so a founder can demo without uploading. Timecode ticker in the top-right of the topbar even here — the identity starts on frame one.

### 3.2 Progress (Screen 2)

Same topbar, but the topbar's status pill switches from `IDLE` to `ANALYZING`, and a stepper appears below. Stages are numbered (numbering is honest here — it *is* a real pipeline):

```
01 · INGEST         [done]     src probed · 47.4s · 1080×1920
02 · SCENES         [done]     18 cuts detected
03 · FRAMES         [active]   sampling 18 → showing 6, 12, 18…
04 · AUDIO          [queued]
05 · PALETTE        [queued]
06 · VISION         [queued]
07 · SPEC           [queued]
```

Frames appear in a strip *as they're extracted* — even if the vision call is still pending, the user sees real progress. This is the anti-fake-loading design: never spin without showing what's happening.

### 3.3 Results (Screen 3 — the money screen, mocked in `ui-mockup.html`)

Two-column grid. Left is the reel; right is the spec.

```
┌──────────────────────────────────────────┬───────────────────────┐
│  ↳ topbar with brand + tc + status       │                       │
├──────────────────────────────────────────┤                       │
│  REEL 01 · SOURCE                        │                       │
│  ┌──────┐ dur/res/ar/fps                  │                       │
│  │ pre  │ ▓░▓░░▓░▓▓░░░▓▓▓▓▓▓  ← pacing   │  // StyleSpec v1.0    │
│  │ view │ rhythm · avg · min · max        │                       │
│  └──────┘                                 │  {                    │
│                                           │    "version": "1.0",  │
│  REEL 02 · ATTRIBUTES                    │    "source": {...},   │
│  ┌────────────┐ ┌────────────┐           │    "color": {...},    │
│  │ COLOR ●    │ │ TYPE ●     │           │    "typography":...   │
│  │ palette    │ │ ANTON      │           │    …                  │
│  └────────────┘ └────────────┘           │  }                    │
│  ┌────────────┐ ┌────────────┐           │                       │
│  │ PACING ●   │ │ TRANS ●    │           │  [copy] [download]    │
│  └────────────┘ └────────────┘           │                       │
│  ┌────────────┐ ┌────────────┐           │  agent-executable →   │
│  │ MOTION ●   │ │ MOOD  ●    │           │                       │
│  └────────────┘ └────────────┘           │                       │
│                                           │                       │
│  REEL 03 · KEYFRAMES                     │                       │
│  ▢▢▢▢▢▢ ▢▢▢▢▢▢ ▢▢▢▢▢▢                     │                       │
│                                           │                       │
│  [Download JSON] [Apply to footage →]    │                       │
└──────────────────────────────────────────┴───────────────────────┘
```

The right column is `position: sticky`. It always shows the live spec.

### 3.4 Apply (Screen 4, stretch)

Same identity. Adds a target-upload dropzone above the reel and, once processed, replaces the reel-preview area with a **before/after** side-by-side player. This is the demo-video kill shot. Keep the JSON panel visible on the right; the spec drives the render.

---

## 4. Component specifications

### PacingRibbon (the signature)

Horizontal SVG/flex strip. Each shot is a bar; width = duration; top edge = 1.5px accent line. Bars rise into view on mount with a staggered 40ms delay each — mimicking a waveform being drawn onto a scope. Hover reveals `shot N: 2.6s`. Underneath: a time axis (`00:00 / 00:15 / 00:30 / 00:47`) and a legend row with rhythm, average, min, max. Cursor is a pointer even though bars aren't clickable yet — leaves the door open for click-to-jump-to-frame later.

### AttributeCard

- Two-column grid, six cards. Each card = one top-level key in the spec.
- **Active state:** left edge gets a 3px coral bar; whole card gets a subtle `linear-gradient(180deg, rgba(255,92,77,0.04), var(--surface-2))` wash; eyebrow color shifts to coral; toggle slides. No border-color change to the card frame — the edge bar does the work.
- **Body:** eyebrow key (`COLOR · GRADE`), toggle top-right, value line (15px semibold), detail line (12px dim), and an optional in-card widget (palette strip, type preview).

### PaletteStrip

Full-width bar, 44px tall, five swatches, widths ∝ coverage. Hex codes overlaid bottom-center, small mono, semi-transparent white with a shadow. Programmatic hex only — never trust vision-model hex values.

### TypographyPreview

Black-ish gradient box, sample word set in the *resolved local font* (loaded from Google Fonts), color set to the detected `colorHex`. Caption underneath: `DETECTED → CLOSEST AVAILABLE: **ANTON** · 92% MATCH`. This caption is the whole point of Stretch Goal 2 made visible.

### SpecPanel (the right rail)

Sticky, `top: 20px`. Header row with `// StyleSpec v1.0` title and a `Copy` button. Body is a `<pre>` with per-token syntax highlighting: keys blue-ish, strings amber, numbers coral, booleans purple, punctuation dim. Scrolls internally with a hairline scrollbar. Footer row: attribute count, then `agent-executable →` — this microcopy is the whole pitch in two words.

### Topbar (identity carrier)

Every screen has the same topbar: brand mark (a 24px square with a smaller inset square, coral) + name in mono uppercase, then a right side with a pulsing status dot, a live timecode counter, and a job ID. Corner ticks on the topbar's top-left and top-right in coral — the SMPTE-safe-area detail. This is the two-second identity signal.

---

## 5. Interaction principles

- **Toggles are instant.** No debounce, no confirmation. The spec re-renders synchronously; the user should feel the JSON respond in the same frame as the click.
- **The timecode counter is always running.** It's a passive identity signal; do not remove it to "keep things simple."
- **No emoji anywhere.** Icons are geometric or ASCII glyphs (`→`, `·`, `/`).
- **Loading states show real work.** No indefinite spinners; show extracted frames as they land.
- **Hover states use border strengthening, not background lightening.** Prevents the "hover ghosting" that reads as templated.
- **Reduced-motion respected.** Shot-rise animation and status-dot pulse both gated behind `prefers-reduced-motion: no-preference`.

---

## 6. Copy voice

Terse and technical. Labels look like broadcast overlays, not product tour copy.

- ✅ `REEL 01 · SOURCE` — not `Section 1: Your Video`
- ✅ `RHYTHM · accelerating` — not `The pacing gets faster over time`
- ✅ `Apply to footage →` — not `Get started with your project`
- ✅ `agent-executable` — not `Ready for AI!`

Empty states say what to do: `Drop a reference here — MP4 or MOV, under 3 minutes.` Errors say what happened: `File is 4:12 — over the 3-minute cap. Trim first, or use a shorter clip.`

---

## 7. Anti-patterns (what we deliberately do not do)

- ❌ Purple → pink gradients anywhere (the AI-product tell)
- ❌ Warm cream background + serif display + terracotta accent (Claude/Anthropic default)
- ❌ Rounded 12px+ cards with soft glow shadows (Linear/Vercel default — good, but too identifiable)
- ❌ Fake "AI is thinking..." loaders that don't reflect real work
- ❌ Icon-heavy sidebar (this is a single-flow tool, not an app)
- ❌ Toast notifications for every action (only for `Copied`; toggles don't toast)
- ❌ Emoji-as-status indicators
- ❌ Any font on the "you've seen this everywhere" list: Inter (plain), Geist, Söhne pairing with Söhne Mono. Inter Tight is the deliberate cousin.

---

## 8. Responsive behavior

- **≥ 1100px:** two-column results as designed.
- **700–1099px:** spec panel drops below the reel column; still sticky at the top of its section on scroll-up.
- **< 700px:** attribute grid becomes single-column; frame gallery becomes 3-wide; timecode in topbar hides the JOB ID first, then the status pill's text (keeps the dot).

The founder demo will almost certainly happen on a desktop — but the mobile version needs to at least look considered, because they *will* pull it up on their phone.

---

## 9. Accessibility floor

- All interactive elements have visible `:focus-visible` outlines in coral, 2px offset.
- Toggle state announced via `aria-pressed`.
- Live-updating spec panel has `aria-live="polite"`.
- Contrast: text on `--bg` ≥ 12:1; **every** text token on surface ≥ 4.5:1 — including `--text-faint`, which carries real content (ladder reasons, fidelity deltas, caveats), not just chrome. The first implementation shipped it at 2.6:1; that is the failure mode to watch for.
- **Minimum type size is 11px, and only for wide-tracked uppercase mono labels.** Body copy, reasons, and table cells are 13px; metadata is 12px. Sub-11px text failed on a real screen — it is not a style choice, it is unreadable.
- Never stack opacity on an already-dim token (`text-text-faint/60`). If something needs to recede further, it does not belong on screen.
- Reduced motion: shot-rise, status-dot pulse, and any hover translations disabled.

---

## 10. Handoff to Claude Code

The mockup file (`ui-mockup.html`) is the visual source of truth for the results screen. When Claude Code builds `web/`, it should:

1. Port the design tokens from `ui-mockup.html`'s `:root` block into a Tailwind config (`theme.extend.colors` and `fontFamily`) or a `tokens.css` file.
2. Rebuild each component in React/TypeScript matching the mockup's structure — same class semantics, same interaction behavior.
3. Keep the topbar identity element identical (mark, mono brand, corner ticks, live timecode).
4. The `PacingRibbon` mount-animation and the toggle → JSON re-render loop are non-negotiable — they carry most of the "this feels considered" weight.

Deviations require a note. Better to match than improve on first pass — Day 6 has explicit polish time.
