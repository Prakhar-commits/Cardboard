import { useMemo, useState } from "react";
import type { AttributeKey, StyleSpec } from "../lib/types.js";
import { ATTRIBUTE_KEYS } from "../lib/types.js";
import { highlightJson } from "../lib/highlightJson.js";

interface SpecPanelProps {
  spec: StyleSpec;
  active: Record<AttributeKey, boolean>;
}

function buildFilteredSpec(spec: StyleSpec, active: Record<AttributeKey, boolean>) {
  const filtered: Record<string, unknown> = {
    version: spec.version,
    source: spec.source,
  };

  for (const key of ATTRIBUTE_KEYS) {
    if (active[key]) filtered[key] = spec[key];
  }
  filtered.audio = spec.audio;

  filtered.suggestedActions = spec.suggestedActions.filter((a) => {
    const root = a.attribute.split(".")[0] as AttributeKey | "audio";
    if (root === "audio") return true;
    return active[root as AttributeKey];
  });

  return filtered;
}

export function SpecPanel({ spec, active }: SpecPanelProps) {
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => buildFilteredSpec(spec, active), [spec, active]);
  const json = useMemo(() => JSON.stringify(filtered, null, 2), [filtered]);
  const highlighted = useMemo(() => highlightJson(json), [json]);
  const attributeCount = ATTRIBUTE_KEYS.filter((k) => active[k]).length;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "style-spec.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="sticky top-5 flex h-[calc(100vh-40px)] flex-col border border-hairline bg-surface">
      <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <span className="font-mono text-[13px] text-text-dim">// StyleSpec v1.0</span>
        <div className="flex items-center gap-3">
          {copied && <span className="font-mono text-[12px] text-ok">Copied</span>}
          <button
            onClick={handleCopy}
            className="font-mono text-[12px] uppercase tracking-widest text-text-dim hover:text-text transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

      <pre
        aria-live="polite"
        className="flex-1 overflow-auto px-4 py-3 font-mono text-[13px] leading-relaxed text-text-dim"
        dangerouslySetInnerHTML={{ __html: highlighted }}
      />

      <div className="flex items-center justify-between border-t border-hairline px-4 py-3">
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            className="border border-hairline-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-widest text-text hover:border-accent transition-colors"
          >
            Download
          </button>
        </div>
        <span className="font-mono text-[12px] text-text-faint">
          {attributeCount}/6 attrs · <span className="text-accent">agent-executable →</span>
        </span>
      </div>
    </div>
  );
}
