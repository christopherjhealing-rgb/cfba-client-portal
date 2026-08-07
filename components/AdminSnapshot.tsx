import { businessDaysSince } from "@/lib/core.mjs";
import type { Job } from "@/lib/repo";

/**
 * A staff at-a-glance list of jobs sitting in one state — waiting on a client
 * to download, waiting on a client to answer an FIR, or (the reassurance one)
 * collected recently. The office asked for these on the Queue page so the day
 * starts with "who do I need to chase", and "who's actually got theirs",
 * without opening the board.
 *
 * Read-only: staff have no client-side job page to link to, so each row is
 * information, not a destination. The client's name leads, because the whole
 * point is knowing who to ring.
 */

function ago(iso: string | null | undefined, verb: string): string | null {
  const d = iso ? businessDaysSince(iso) : null;
  if (d === null || d < 0) return null;
  return d === 0 ? `${verb} today`
    : `${verb} ${d} business day${d === 1 ? "" : "s"} ago`;
}

const CAP = 20;

export function AdminSnapshot({
  title, blurb, tone, mode, jobs, names,
}: {
  title: string;
  blurb: string;
  /** "seal" for ready-to-collect / done, "brass" for waiting-on-the-client. */
  tone: "seal" | "brass";
  mode: "ready" | "fir" | "downloaded";
  jobs: Job[];
  names: Record<string, string>;
}) {
  const shown = jobs.slice(0, CAP);
  const chip = tone === "seal" ? "chip chip-seal" : "chip chip-brass";
  const rule = tone === "seal" ? "border-seal/25" : "border-brass/30";

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          {title}
        </h2>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[12px] text-ink/60">{jobs.length}</span>
      </div>

      {jobs.length === 0 ? (
        <p className="empty">{blurb}</p>
      ) : (
        <div className={`card divide-y divide-rule border ${rule}`}>
          {shown.map((j) => {
            const when = mode === "ready" ? ago(j.issuedAt as string, "issued")
              : mode === "downloaded" ? ago(j.firstDownloadedAt as string, "downloaded")
              : ago(j.receivedAt as string, "lodged");
            return (
              <div key={j.ref as string} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-ink/60">{j.ref as string}</span>
                    <span className="text-[14px] font-medium">{j.address as string}</span>
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-ink/60">
                    {names[j.companyId] || j.companyId}
                    {j.clientRef ? <> · their ref {String(j.clientRef)}</> : null}
                  </div>
                  {/* On an FIR job, what we actually asked for — so the chase is
                      specific, not "you've got something outstanding". */}
                  {mode === "fir" && j.firRequest ? (
                    <div className="mt-1 line-clamp-2 max-w-2xl text-[12.5px] text-ink/60">
                      {String(j.firRequest)}
                    </div>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={chip}>
                    {mode === "ready" ? "Ready — not collected"
                      : mode === "downloaded" ? "Collected"
                      : "With the client"}
                  </span>
                  {when && <span className="text-[11.5px] text-ink/60">{when}</span>}
                </div>
              </div>
            );
          })}
          {jobs.length > CAP && (
            <div className="px-4 py-2.5 text-center text-[12px] text-ink/60">
              and {jobs.length - CAP} more — {mode === "downloaded" ? "newest" : "oldest"} {CAP} shown
            </div>
          )}
        </div>
      )}
    </section>
  );
}
