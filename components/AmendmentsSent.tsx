import Link from "next/link";
import type { Submission } from "@/lib/repo";
import { AMENDMENT_OPEN, AMENDMENT_DONE, REVISED } from "@/lib/core.mjs";
import { fmtDate } from "@/components/JobBits";

/**
 * Amendments the client has sent, and the revised certificate when it comes
 * back.
 *
 * This used to live at the bottom of the Amend a Job form, which is the one
 * page a client has no reason to revisit — they go there to send a change,
 * not to check on one. It belongs with the jobs.
 *
 * An amendment to a historical job matters most: that job was never synced,
 * so it has no job page, and this list is the only place the revised
 * certificate can be collected from.
 */
export function amendmentsOf(subs: Submission[]): Submission[] {
  return subs
    .filter((s) => s.amendmentOf &&
      (s.status === AMENDMENT_OPEN || s.status === AMENDMENT_DONE))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function AmendmentsSent({
  items, className = "", known,
}: {
  items: Submission[];
  className?: string;
  /** Refs that have a job page. An amendment to a historical job doesn't —
   *  that job was never synced — so its number is text, not a dead link. */
  known?: Set<string>;
}) {
  if (items.length === 0) return null;
  return (
    <section className={className}>
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
          Amendments You&apos;ve Sent
        </h2>
        <span className="h-px flex-1 bg-rule" />
      </div>
      <div className="card divide-y divide-rule">
        {items.map((a) => {
          const ref = a.amendmentOf as string;
          const revised = a.files.filter((f) => f.category === REVISED);
          return (
            <div key={a.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                {known?.has(ref) ? (
                  <Link href={`/jobs/${encodeURIComponent(ref)}`}
                    className="font-mono text-[12px] text-seal hover:underline">{ref}</Link>
                ) : (
                  <span className="font-mono text-[12px] text-seal">{ref}</span>
                )}
                <span className="text-[14px] font-medium">{a.address}</span>
                {a.status === AMENDMENT_DONE
                  ? <span className="chip chip-seal">Ready</span>
                  : <span className="chip chip-brass">With your surveyor</span>}
              </div>
              <div className="mt-0.5 text-[12.5px] text-ink/55">{a.description}</div>
              {/* When it was sent — the same question the lodged date answers
                  on a job, and the one a client asks when it feels slow. */}
              <div className="mt-0.5 text-[12px] text-ink/50">Sent {fmtDate(a.createdAt)}</div>
              {a.status === AMENDMENT_DONE && revised.length > 0 && (
                <ul className="mt-1.5 flex flex-wrap gap-3">
                  {revised.map((f) => (
                    <li key={f.name}>
                      <a href={`/api/amendments/${a.id}/${encodeURIComponent(f.name)}`}
                        target="_blank" rel="noopener noreferrer"
                        className="text-[13px] font-medium text-seal underline">
                        {f.name}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
