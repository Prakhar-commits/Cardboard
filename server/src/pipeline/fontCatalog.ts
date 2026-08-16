// The bundled local library (~15 Google Font families) and the taxonomy
// lookup used by the fallback ladder in fonts.ts. See CLAUDE.md "Phase 1 —
// The fallback ladder" for the rung definitions this catalog serves.

export type FontClassification =
  | "condensed-grotesque"
  | "geometric-sans"
  | "neo-grotesque"
  | "serif"
  | "mono"
  | "rounded"
  | "script-display";

export type WeightClass = "light" | "regular" | "medium" | "bold" | "black";

export interface LocalFont {
  family: string;
  classification: FontClassification;
  weightClass: WeightClass;
}

// Ordered heaviest-to-lightest within each classification so the taxonomy
// lookup can pick the closest weight when the vision model supplies one.
export const LOCAL_FONT_LIBRARY: LocalFont[] = [
  { family: "Archivo Black", classification: "condensed-grotesque", weightClass: "black" },
  { family: "Anton", classification: "condensed-grotesque", weightClass: "black" },
  { family: "Bebas Neue", classification: "condensed-grotesque", weightClass: "bold" },
  { family: "Oswald", classification: "condensed-grotesque", weightClass: "regular" },
  { family: "Poppins", classification: "geometric-sans", weightClass: "bold" },
  { family: "Montserrat", classification: "geometric-sans", weightClass: "regular" },
  { family: "Inter", classification: "neo-grotesque", weightClass: "regular" },
  { family: "Roboto", classification: "neo-grotesque", weightClass: "regular" },
  { family: "Playfair Display", classification: "serif", weightClass: "bold" },
  { family: "Lora", classification: "serif", weightClass: "regular" },
  { family: "JetBrains Mono", classification: "mono", weightClass: "regular" },
  { family: "Nunito", classification: "rounded", weightClass: "regular" },
  { family: "Bangers", classification: "script-display", weightClass: "black" },
  { family: "Pacifico", classification: "script-display", weightClass: "regular" },
  { family: "Caveat", classification: "script-display", weightClass: "regular" },
];

const LOCAL_FONT_BY_NAME = new Map(
  LOCAL_FONT_LIBRARY.map((f) => [normalizeFontName(f.family), f])
);

export function normalizeFontName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export function findLocalFont(name: string): LocalFont | undefined {
  return LOCAL_FONT_BY_NAME.get(normalizeFontName(name));
}

// A curated slice of the real Google Fonts catalog — committed here so the
// "sourced" rung doesn't need a network dependency during the demo. Families
// that are NOT bundled locally (rung 2 only fires when there's no rung-1 hit).
export const GOOGLE_FONTS_CATALOG: string[] = [
  "Bebas Neue",
  "Raleway",
  "Lato",
  "Merriweather",
  "Barlow",
  "Barlow Condensed",
  "Work Sans",
  "DM Sans",
  "Space Grotesk",
  "Cormorant",
  "Cormorant Garamond",
  "Libre Baskerville",
  "Fjalla One",
  "Josefin Sans",
  "Quicksand",
  "Rubik",
  "Karla",
  "Manrope",
  "Sora",
  "Outfit",
  "Bricolage Grotesque",
  "IBM Plex Sans",
  "IBM Plex Mono",
  "IBM Plex Serif",
  "Crimson Text",
  "EB Garamond",
  "Cinzel",
  "Abril Fatface",
  "Righteous",
  "Permanent Marker",
  "Great Vibes",
  "Dancing Script",
  "Shrikhand",
  "Alfa Slab One",
];

const GOOGLE_FONTS_SET = new Set(GOOGLE_FONTS_CATALOG.map(normalizeFontName));

export function isInGoogleFontsCatalog(name: string): boolean {
  return GOOGLE_FONTS_SET.has(normalizeFontName(name));
}

// classification → bundled families, heaviest weight first.
export const CLASSIFICATION_LOOKUP: Record<FontClassification, LocalFont[]> = groupByClassification();

function groupByClassification(): Record<FontClassification, LocalFont[]> {
  const groups = {} as Record<FontClassification, LocalFont[]>;
  for (const font of LOCAL_FONT_LIBRARY) {
    (groups[font.classification] ??= []).push(font);
  }
  return groups;
}

export function normalizeClassification(raw: string): FontClassification | undefined {
  const key = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (Object.keys(CLASSIFICATION_LOOKUP) as FontClassification[]).includes(key as FontClassification)
    ? (key as FontClassification)
    : undefined;
}
