# Style Reference Decomposer

Ingests a reference video, decomposes it into a machine-actionable **StyleSpec** JSON, reproduces the selected attributes on new footage, and then measures whether the reproduction actually matched.

The pitch in one line: *extract a style, apply it, and verify it landed — with an honest fallback path when the reference uses something the editor doesn't have.*

## What it does

| Stage | What happens |
|---|---|
| **Extract** | ffmpeg scene detection, keyframe sampling, programmatic palette, audio stats, and one batched Claude vision call → a zod-validated `StyleSpec v1`. |
| **Resolve** | Detected fonts and text animations are resolved against the editor's capability inventory through a four-rung ladder (`exact → sourced → matched → fallback`), each rung recording *why*. |
| **Export** | Filtered spec as JSON, plus a real 33³ `.cube` LUT that drops into Premiere, Resolve, or FCP. |
| **Apply** | Grades target footage with that LUT and burns a title in the resolved font. |
| **Verify** | Re-runs the extractor on our own render and diffs it against the intended spec, scoring only what apply actually touched. |

## Requirements

- Node 20+
- pnpm
- **ffmpeg and ffprobe on `PATH`** (`ffmpeg -version` to check)
- An Anthropic API key

## Running locally

```bash
pnpm install
```

Create a `.env` in the repo root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Then, in two terminals:

```bash
pnpm dev:server   # http://localhost:8787
pnpm dev:web      # http://localhost:5173
```

Open **http://localhost:5173** — not 8787. Vite proxies `/api` and `/media` to the backend, so the frontend has to be the origin you load.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Required. Vision analysis. |
| `PORT` | `8787` | Server port. |
| `NODE_ENV` | — | `production` makes `DEMO_PASSWORD` mandatory. |
| `DEMO_PASSWORD` | — | Enables the login gate. Unset locally = no gate. **Required in production.** |
| `SESSION_SECRET` | falls back to `DEMO_PASSWORD` | HMAC key for session cookies. Set it if you want to rotate the password without invalidating sessions. |
| `MAX_RUNS_PER_DAY` | `50` | Rolling 24h cap on billable runs. |

### The demo gate

Auth is a designed login screen backed by an HMAC-signed session cookie, and it is deliberately stateless — the cookie carries its own expiry and signature, so the server verifies it by recomputing the HMAC rather than looking anything up. There is no session store, and a restart does not sign anyone out. Cookies are also what let `<video>` and `<img>` requests against `/media` authenticate without proxying every asset through `fetch()`.

In production the server **refuses to boot** without `DEMO_PASSWORD`, because deploying without it is exactly the mistake that would expose the key.

`GET /api/health` is intentionally left unauthenticated so platform health checks don't restart-loop the container.

## Deployment

Ships as a single Docker container: Express serves the API, the media files, **and** the built frontend, so everything is same-origin and there is no proxy to configure.

```bash
docker build -t style-decomposer .
docker run -p 8787:8787 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e DEMO_PASSWORD=<something> \
  style-decomposer
```

### What the platform needs to give you

- **One instance.** The job store is an in-memory `Map`; a second replica would receive polls for jobs it has never heard of. Do not enable autoscaling.
- **2GB RAM.** A 200MB upload plus ffmpeg plus sharp will OOM a 512MB box, and OOM shows up as a mysteriously failed job rather than a clear error.
- **No volume.** Job state dies with the process, so anything on disk after a restart is already orphaned. Ephemeral disk is correct here.
- **Health check → `/api/health`**, which is deliberately unauthenticated.

### Railway / Render

Both detect the `Dockerfile` and need no further build config. Set `ANTHROPIC_API_KEY` and `DEMO_PASSWORD` in the dashboard; `PORT` is injected by the platform and the server already reads it. Leave `NODE_ENV=production` (the image sets it), which is what makes the demo gate mandatory.

Before sharing the URL, set a **spend limit on the Anthropic key**. `MAX_RUNS_PER_DAY` resets on restart, so it is a courtesy limit, not a billing control.

## Operational notes

- **One job at a time.** Every stage shells out to ffmpeg; running jobs in parallel on a small instance means both crawl. Queued jobs report their position.
- **Files are swept hourly.** Uploads, frames, renders, and LUTs are deleted by age. The font cache is exempt — it's a real cache.
- **State is in memory.** Restarting drops all jobs and resets the daily cap. That is fine for a demo, and the real spend backstop is a limit on the Anthropic key itself.
- **Cost** is roughly $0.03–0.10 per extraction; a verified apply is about double, since verification re-runs the extractor once on the render.

## Layout

```
server/src/pipeline/   ingest, scenes, frames, audio, palette, vision, aggregate,
                       fonts + presets (the ladders), lut, apply, verify
server/src/schema/     styleSpec.ts (zod, the contract) and fidelity.ts
web/src/components/    upload → progress → results → apply → fidelity
```

`CLAUDE.md` carries the design decisions and build order. `UI_DESIGN.md` carries the visual language.
