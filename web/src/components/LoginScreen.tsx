import { useState } from "react";
import { login } from "../lib/api.js";

export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError(undefined);
    try {
      await login(password);
      onAuthenticated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col justify-center px-6 py-24">
      <span className="font-mono text-[13px] uppercase tracking-widest text-accent">
        Style Reference Decomposer
      </span>
      <h1 className="mt-2 text-2xl font-semibold text-text">Private demo.</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-text-dim">
        This instance runs real video analysis against a metered API key, so it sits behind a
        password. Ask Prakhar for it.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 border border-hairline bg-surface p-5">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">
            Access password
          </span>
          <input
            type="password"
            value={password}
            autoFocus
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className="border border-hairline-strong bg-transparent px-3 py-2 text-[15px] text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={!password || submitting}
          className="mt-4 w-full border border-hairline-strong px-3 py-2 font-mono text-[12px] uppercase tracking-widest text-text transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? "Checking…" : "Enter"}
        </button>

        {error && <p className="mt-3 font-mono text-[12px] text-accent">{error}</p>}
      </form>

      <p className="mt-6 font-mono text-[12px] leading-relaxed text-text-faint">
        The gate protects API spend, not your data — nothing you upload is stored beyond an hour.
      </p>
    </div>
  );
}
