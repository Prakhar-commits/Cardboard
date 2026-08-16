import type { ReactNode } from "react";

interface AttributeCardProps {
  eyebrow: string;
  value: string;
  detail: string;
  active: boolean;
  onToggle: () => void;
  children?: ReactNode;
}

export function AttributeCard({ eyebrow, value, detail, active, onToggle, children }: AttributeCardProps) {
  return (
    <div
      className="relative border border-hairline bg-surface-2 p-4"
      style={
        active
          ? {
              borderLeftWidth: "3px",
              borderLeftColor: "#FF5C4D",
              backgroundImage: "linear-gradient(180deg, rgba(255,92,77,0.04), #1B1E24)",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between">
        <span
          className={`font-mono text-[12px] uppercase tracking-widest ${
            active ? "text-accent" : "text-text-dim"
          }`}
        >
          {eyebrow}
        </span>
        <button
          type="button"
          role="switch"
          aria-pressed={active}
          onClick={onToggle}
          className={`relative h-5 w-9 shrink-0 border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
            active ? "border-accent bg-accent-dim/40" : "border-hairline-strong bg-surface"
          }`}
        >
          <span
            className={`absolute top-1 h-3 w-3 bg-text transition-transform ${
              active ? "translate-x-5 bg-accent" : "translate-x-1"
            }`}
          />
        </button>
      </div>

      <p className="mt-2 text-[15px] font-semibold text-text">{value}</p>
      <p className="mt-0.5 text-[13px] text-text-dim">{detail}</p>

      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
