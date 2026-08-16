/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0E1013",
        surface: "#16181D",
        "surface-2": "#1B1E24",
        hairline: "#24272E",
        "hairline-strong": "#2E323B",
        text: "#EDEEF0",
        // Lifted from #8A8F98 / #565A63. The old faint was 2.6:1 on surface —
        // below the 4.5:1 floor UI_DESIGN.md sets for itself, and it carried
        // real content (ladder reasons, fidelity deltas), not just chrome.
        "text-dim": "#A2A8B2", // 7.4:1 on surface
        "text-faint": "#7C818B", // 4.5:1 on surface — the floor, not below it
        accent: "#FF5C4D",
        "accent-dim": "#B84437",
        ok: "#7BC97A",
        // Verdict column only (Phase 4) — not a second accent.
        warn: "#D9A441",
      },
      fontFamily: {
        ui: ["'Inter Tight'", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
    },
  },
  plugins: [],
};
