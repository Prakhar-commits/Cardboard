import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import multer from "multer";
import { createJob, getJob } from "./jobs.js";
import { runPipeline } from "./pipeline/run.js";
import { generateCubeLut } from "./pipeline/lut.js";
import { createApplyJob, getApplyJob } from "./applyJobs.js";
import { runApplyPipeline } from "./pipeline/apply.js";
import { StyleSpecSchema } from "./schema/styleSpec.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
dotenv.config({ path: path.resolve(ROOT, "..", ".env") });
const UPLOADS_DIR = path.join(ROOT, "uploads");
const FRAMES_DIR = path.join(ROOT, "frames");
const OUTPUTS_DIR = path.join(ROOT, "outputs");
const APPLY_WORK_DIR = path.join(ROOT, "apply-work");
const FONTS_CACHE_DIR = path.join(ROOT, "assets", "fonts-cache");

for (const dir of [UPLOADS_DIR, FRAMES_DIR, OUTPUTS_DIR, APPLY_WORK_DIR, FONTS_CACHE_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const PORT = Number(process.env.PORT ?? 8787);
const MEDIA_BASE_URL = "/media/frames";
const OUTPUTS_MEDIA_URL = "/media/outputs";

const app = express();
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

  const job = createJob(req.file.originalname);
  job.videoPath = req.file.path;

  void runPipeline(job, FRAMES_DIR, MEDIA_BASE_URL);

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

  const job = createApplyJob(req.file.originalname, spec, titleText);
  job.targetVideoPath = req.file.path;

  void runApplyPipeline(job, {
    workDir: APPLY_WORK_DIR,
    outputsDir: OUTPUTS_DIR,
    fontCacheDir: FONTS_CACHE_DIR,
    framesDir: FRAMES_DIR,
    outputsBaseUrl: OUTPUTS_MEDIA_URL,
    framesBaseUrl: MEDIA_BASE_URL,
  });

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

app.listen(PORT, () => {
  console.log(`style-decomposer server listening on http://localhost:${PORT}`);
});
