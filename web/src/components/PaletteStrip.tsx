import type { StyleSpec } from "../lib/types.js";

export function PaletteStrip({ palette }: { palette: StyleSpec["color"]["palette"] }) {
  return (
    <div className="flex h-11 w-full overflow-hidden">
      {palette.map((swatch) => (
        <div
          key={swatch.hex}
          className="relative flex items-end justify-center"
          style={{ width: `${swatch.coverage * 100}%`, backgroundColor: swatch.hex }}
        >
          <span className="mb-1 rounded-none bg-black/40 px-1 font-mono text-[11px] text-white/90 shadow-sm">
            {swatch.hex}
          </span>
        </div>
      ))}
    </div>
  );
}
