import { useEffect, useState } from "react";

function formatTimecode(ms: number): string {
  const totalFrames = Math.floor(ms / (1000 / 30));
  const frames = totalFrames % 30;
  const totalSeconds = Math.floor(totalFrames / 30);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
}

/** Live-running SMPTE-style timecode since mount — the topbar's passive identity signal. */
export function useTimecode(): string {
  const [tc, setTc] = useState(() => formatTimecode(0));

  useEffect(() => {
    const start = performance.now();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const interval = setInterval(() => {
      setTc(formatTimecode(performance.now() - start));
    }, 1000 / 15);
    return () => clearInterval(interval);
  }, []);

  return tc;
}
