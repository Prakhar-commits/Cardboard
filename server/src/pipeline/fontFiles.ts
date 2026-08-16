import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export class FontFileError extends Error {}

// Google's CSS endpoint serves woff2 to modern user agents and plain
// truetype to very old ones (freetype/ffmpeg drawtext needs a raw ttf/otf,
// not a woff wrapper) — this UA is the well-known way to request the ttf.
const LEGACY_UA = "Mozilla/5.0 (Windows NT 5.1) AppleWebKit/537.36 (KHTML, like Gecko)";
const TTF_URL_RE = /url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/;

function cacheFilename(family: string): string {
  return `${family.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")}.ttf`;
}

/**
 * Resolves an actual, renderable font file for `family`, caching it in
 * `cacheDir` so repeated applies don't re-fetch. All families this pipeline
 * ever resolves to (bundled or "sourced") are real Google Fonts, so a single
 * on-demand fetch covers both cases without pre-shipping ~15 binaries.
 */
export async function resolveFontFile(family: string, cacheDir: string): Promise<string> {
  await mkdir(cacheDir, { recursive: true });
  const cachedPath = path.join(cacheDir, cacheFilename(family));

  try {
    await stat(cachedPath);
    return cachedPath;
  } catch {
    // not cached yet — fetch below
  }

  let cssRes: Response;
  try {
    cssRes = await fetch(`https://fonts.googleapis.com/css?family=${encodeURIComponent(family)}`, {
      headers: { "User-Agent": LEGACY_UA },
    });
  } catch (err) {
    throw new FontFileError(`Could not reach Google Fonts for "${family}": ${(err as Error).message}`);
  }
  if (!cssRes.ok) {
    throw new FontFileError(`Google Fonts has no family "${family}" (${cssRes.status}).`);
  }

  const css = await cssRes.text();
  const match = TTF_URL_RE.exec(css);
  if (!match) {
    throw new FontFileError(`No truetype source found for "${family}".`);
  }

  const fontRes = await fetch(match[1]);
  if (!fontRes.ok) {
    throw new FontFileError(`Could not download font file for "${family}" (${fontRes.status}).`);
  }
  const buffer = Buffer.from(await fontRes.arrayBuffer());
  await writeFile(cachedPath, buffer);
  return cachedPath;
}
