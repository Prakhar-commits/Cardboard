import type { FidelityReport as Report, Verdict } from "../lib/types.js";

const VERDICT_CLASS: Record<Verdict, string> = {
  matched: "border-ok/50 text-ok",
  drifted: "border-warn/50 text-warn",
  missed: "border-accent/50 text-accent",
};

function Summary({ report }: { report: Report }) {
  if (report.scored === 0) {
    return (
      <span className="font-mono text-[12px] uppercase tracking-widest text-text-faint">
        nothing applied — nothing scored
      </span>
    );
  }
  return (
    <span className="font-mono text-[12px] uppercase tracking-widest text-text-dim">
      {report.matched}/{report.scored} matched · {report.framesAnalyzed} frames re-analyzed
    </span>
  );
}

export function FidelityReport({
  report,
  status,
  error,
}: {
  report?: Report;
  status?: "not_started" | "running" | "done" | "failed";
  error?: string;
}) {
  // Running and failed states are carried by the banner above the players,
  // so this section only renders once there is a report to show.
  if (status !== "done" || !report) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-mono text-[13px] uppercase tracking-widest text-text-dim">
          Reel 05 · Fidelity
        </span>
        <Summary report={report} />
      </div>

      <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-text-dim">
        The extractor was re-run on the rendered output and diffed against the spec that was
        requested. This measures whether the render matches the spec — not whether the video is
        good. Only attributes the apply step actually touched are scored.
      </p>

      <div className="mt-3 border border-hairline bg-surface">
        <>
          {report.rows.length > 0 && (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-hairline font-mono text-[12px] uppercase tracking-widest text-text-faint">
                    <th className="px-4 py-2 font-normal">Attribute</th>
                    <th className="px-4 py-2 font-normal">Intended</th>
                    <th className="px-4 py-2 font-normal">Achieved</th>
                    <th className="px-4 py-2 font-normal">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.attribute} className="border-b border-hairline/60 align-top last:border-b-0">
                      <td className="px-4 py-2 font-mono text-[13px] text-text-dim">{row.attribute}</td>
                      <td className="px-4 py-2 font-mono text-[13px] text-text">{row.intended}</td>
                      <td className="px-4 py-2 font-mono text-[13px] text-text">
                        {row.achieved}
                        {row.delta && (
                          <span className="block text-[12px] text-text-faint">{row.delta}</span>
                        )}
                        {row.caveat && (
                          <span className="mt-1 block max-w-md text-[12px] leading-relaxed text-text-faint">
                            ⚠ {row.caveat}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block border px-1.5 py-0.5 font-mono text-[12px] uppercase tracking-widest ${
                            VERDICT_CLASS[row.verdict]
                          }`}
                        >
                          {row.verdict}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {report.notScored.length > 0 && (
              <div className="border-t border-hairline px-4 py-3">
                <span className="font-mono text-[12px] uppercase tracking-widest text-text-faint">
                  Not scored
                </span>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {report.notScored.map((item) => (
                    <li key={item.attribute} className="font-mono text-[12px] text-text-faint">
                      <span className="text-text-dim">{item.attribute}</span> — {item.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
        </>
      </div>
    </section>
  );
}
