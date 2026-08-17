import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import { createJob, getJob, updateJob } from "./jobs.js";
import { runPipeline } from "./pipeline/run.js";
import { generateCubeLut } from "./pipeline/lut.js";
import { createApplyJob, getApplyJob, updateApplyJob } from "./applyJobs.js";
import { runApplyPipeline } from "./pipeline/apply.js";
import { StyleSpecSchema } from "./schema/styleSpec.js";
import { basicAuth, readAuthConfig } from "./auth.js";
import { enqueue, queueDepth } from "./queue.js";
import { startCleanupLoop } from "./cleanup.js";
import { checkCap, recordRun } from "./usage.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(ROOT, "..", ".env") });
const UPLOADS_DIR = path.join(ROOT, "uploads");
const FRAMES_DIR = path.join(ROOT, "frames");
const OUTPUTS_DIR = path.join(ROOT, "outputs");
const APPLY_WORK_DIR = path.join(ROOT, "apply-work");
const FONTS_CACHE_DIR = path.join(ROOT, "assets", "fonts-cache");
// In production the server also serves the built frontend, so /api and /media
// are same-origin. In dev this directory doesn't exist and Vite proxies instead.
const WEB_DIST_DIR = process.env.WEB_DIST_DIR ?? path.resolve(ROOT, "..", "web", "dist");

for (const dir of [UPLOADS_DIR, FRAMES_DIR, OUTPUTS_DIR, APPLY_WORK_DIR, FONTS_CACHE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const PORT = Number(process.env.PORT ?? 8787);
const MEDIA_BASE_URL = "/media/frames";
const OUTPUTS_MEDIA_URL = "/media/outputs";
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_RUNS_PER_DAY = Number(process.env.MAX_RUNS_PER_DAY ?? 50);

const app = express();

// Health check first and unauthenticated — the platform's probe has no
// credentials, and a 401 there would make it restart-loop the container.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, queueDepth: queueDepth() });
});

const authConfig = readAuthConfig(IS_PRODUCTION);
if (authConfig) {
  app.use(basicAuth(authConfig));
  console.log(`demo gate enabled for user "${authConfig.user}"`);
} else {
  console.log("demo gate disabled (no DEMO_PASSWORD set — local development only)");
}

app.use(cors());
app.use(MEDIA_BASE_URL, express.static(FRAMES_DIR));
app.use(OUTPUTS_MEDIA_URL, express.static(OUTPUTS_DIR));

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".mp4";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
});

app.post("/api/jobs", upload.single("video"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No video file uploaded (field name must be 'video')." });
    return;
  }

  const cap = checkCap(MAX_RUNS_PER_DAY);
  if (!cap.allowed) {
    res.status(429).json({
      error: `Demo limit reached — ${cap.used} of ${cap.limit} runs used in the last 24 hours. Try again later.`,
    });
    return;
  }
  recordRun();

  const job = createJob(req.file.originalname);
  job.videoPath = req.file.path;

  enqueue(
    () => runPipeline(job, FRAMES_DIR, MEDIA_BASE_URL),
    (position) => updateJob(job.id, { queuePosition: position })
  );

  res.status(202).json({ jobId: job.id });
});

app.get("/api/jobs/:id", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  res.json(job);
});

app.post("/api/apply", upload.single("video"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No target video uploaded (field name must be 'video')." });
    return;
  }

  let spec;
  try {
    spec = StyleSpecSchema.parse(JSON.parse(req.body.spec));
  } catch {
    res.status(400).json({ error: "Invalid or missing 'spec' field (must be JSON matching StyleSpec)." });
    return;
  }

  const titleText = typeof req.body.title === "string" && req.body.title.trim() ? req.body.title : undefined;

  const cap = checkCap(MAX_RUNS_PER_DAY);
  if (!cap.allowed) {
    res.status(429).json({
      error: `Demo limit reached — ${cap.used} of ${cap.limit} runs used in the last 24 hours. Try again later.`,
    });
    return;
  }
  recordRun();

  const job = createApplyJob(req.file.originalname, spec, titleText);
  job.targetVideoPath = req.file.path;

  enqueue(
    () =>
      runApplyPipeline(job, {
        workDir: APPLY_WORK_DIR,
        outputsDir: OUTPUTS_DIR,
        fontCacheDir: FONTS_CACHE_DIR,
        framesDir: FRAMES_DIR,
        outputsBaseUrl: OUTPUTS_MEDIA_URL,
        framesBaseUrl: MEDIA_BASE_URL,
      }),
    (position) => updateApplyJob(job.id, { queuePosition: position })
  );

  res.status(202).json({ jobId: job.id });
});

app.get("/api/apply/:id", (req, res) => {
  const job = getApplyJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Apply job not found." });
    return;
  }
  // Server-side absolute paths are internal — the client gets the served URLs.
  const { targetVideoPath, outputPath, ...clientView } = job;
  res.json(clientView);
});

app.get("/api/jobs/:id/lut.cube", (req, res) => {
  const job = getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: "Job not found." });
    return;
  }
  if (!job.spec) {
    res.status(409).json({ error: "Job has no completed style spec yet." });
    return;
  }

  const cube = generateCubeLut(job.spec);
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Content-Disposition", `attachment; filename="style-decomposer-${job.id}.cube"`);
  res.send(cube);
});

// Static frontend, registered last so it can never shadow an API or media
// route. Absent in dev — Vite serves the app and proxies through to here.
if (fs.existsSync(path.join(WEB_DIST_DIR, "index.html"))) {
  app.use(express.static(WEB_DIST_DIR));
  app.get("*", (req, res) => {
    // An unmatched /api or /media path is a real 404, not a client route —
    // serving index.html there would hand callers HTML with a 200.
    if (req.path.startsWith("/api") || req.path.startsWith("/media")) {
      res.status(404).json({ error: "Not found." });
      return;
    }
    res.sendFile(path.join(WEB_DIST_DIR, "index.html"));
  });
  console.log(`serving frontend from ${WEB_DIST_DIR}`);
} else {
  console.log("no frontend build found — API only (run the Vite dev server separately)");
}

// Font cache is deliberately excluded — it is a real cache, and re-fetching
// every TTL would waste time and bandwidth for no benefit.
startCleanupLoop({ directories: [UPLOADS_DIR, FRAMES_DIR, OUTPUTS_DIR, APPLY_WORK_DIR] });

app.listen(PORT, () => {
  console.log(`style-decomposer server listening on http://localhost:${PORT}`);
  console.log(`demo cap: ${MAX_RUNS_PER_DAY} runs / 24h`);
});
