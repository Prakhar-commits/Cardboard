import ffmpeg from "fluent-ffmpeg";

const MAX_DURATION_SEC = 180;

export class IngestError extends Error {}

export interface ProbeResult {
  durationSec: number;
  resolution: string; // "1920x1080"
  aspectRatio: string; // "16:9"
  fps: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function ratioLabel(width: number, height: number): string {
  const g = gcd(width, height) || 1;
  const w = width / g;
  const h = height / g;
  // Common video ratios are usually clean after gcd reduction; snap close matches.
  const knownRatios: Array<[number, number, string]> = [
    [16, 9, "16:9"],
    [9, 16, "9:16"],
    [1, 1, "1:1"],
    [4, 3, "4:3"],
    [4, 5, "4:5"],
    [21, 9, "21:9"],
  ];
  const ratio = width / height;
  for (const [rw, rh, label] of knownRatios) {
    if (Math.abs(ratio - rw / rh) < 0.02) return label;
  }
  return `${w}:${h}`;
}

export function probeVideo(filePath: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(new IngestError(`ffprobe failed: ${err.message}`));

      const videoStream = data.streams.find((s) => s.codec_type === "video");
      if (!videoStream) {
        return reject(new IngestError("No video stream found in file."));
      }

      const durationSec = Number(data.format.duration ?? videoStream.duration ?? 0);
      if (!durationSec || Number.isNaN(durationSec)) {
        return reject(new IngestError("Could not determine video duration."));
      }
      if (durationSec > MAX_DURATION_SEC) {
        const mm = Math.floor(durationSec / 60);
        const ss = Math.round(durationSec % 60);
        return reject(
          new IngestError(
            `File is ${mm}:${ss.toString().padStart(2, "0")} — over the 3-minute cap. Trim first, or use a shorter clip.`
          )
        );
      }

      const width = videoStream.width ?? 0;
      const height = videoStream.height ?? 0;
      if (!width || !height) {
        return reject(new IngestError("Could not determine video resolution."));
      }

      let fps = 30;
      if (videoStream.avg_frame_rate) {
        const [num, den] = videoStream.avg_frame_rate.split("/").map(Number);
        if (den) fps = num / den;
      }

      resolve({
        durationSec,
        resolution: `${width}x${height}`,
        aspectRatio: ratioLabel(width, height),
        fps: Math.round(fps * 100) / 100,
      });
    });
  });
}
