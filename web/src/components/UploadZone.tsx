import { useCallback, useRef, useState } from "react";

interface UploadZoneProps {
  onSelect: (file: File) => void;
  error?: string;
}

export function UploadZone({ onSelect, error }: UploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) onSelect(file);
    },
    [onSelect]
  );

  return (
    <div className="mx-auto w-full max-w-[640px] px-6 py-16">
      <div className="mb-8">
        <span className="font-mono text-[13px] uppercase tracking-widest text-accent">Style Reference Decomposer</span>
        <h1 className="mt-2 text-2xl font-semibold text-text">Decompose a reference into a style spec.</h1>
        <p className="mt-2 text-[15px] text-text-dim">
          Drop a reference here — MP4 or MOV, under 3 minutes. Each attribute in the output maps to a
          timeline action your agent could execute.
        </p>
      </div>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`cursor-pointer border transition-colors ${
          dragActive ? "border-accent" : "border-hairline hover:border-hairline-strong"
        } bg-surface px-8 py-16 text-center`}
      >
        <p className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
          {dragActive ? "release to analyze" : "drop reference · or click to browse"}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {error && <p className="mt-4 font-mono text-[13px] text-accent">{error}</p>}
    </div>
  );
}
