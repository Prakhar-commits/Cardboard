import { useEffect } from "react";

const loaded = new Set<string>();

// Injects a Google Fonts CSS link for `family` the first time it's needed,
// so resolved fallback fonts (all drawn from the Google Fonts catalog) can
// render in their actual family without bundling every possible font upfront.
export function useGoogleFont(family: string | undefined) {
  useEffect(() => {
    if (!family || loaded.has(family)) return;
    loaded.add(family);

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(
      family.replace(/ /g, "+")
    )}:wght@400;700&display=swap`;
    document.head.appendChild(link);
  }, [family]);
}
