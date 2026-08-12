import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";

export const dynamic = "force-dynamic";

// The pilot's dials on one page: what clients told us (feedback + the
// portal-or-email question) above, and the weekly event counts below —
// lodgements started vs finished, refused uploads, downloads, sign-ins.
// Everything reads from the audit log; nothing new is stored.

const EVENT_ACTIONS = [
  ["lodge.start", "Lodgements started"],
  ["lodge.success", "Lodgements completed"],
  ["upload.reject", "Uploads refused"],
  ["certificate.download", "Packages downloaded"],
  ["auth.login", "Sign-ins"],
  ["feedback", "Feedback sent"],
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  confusing: "Confusing", slow: "Slow", broken: "Broken",
  idea: "Idea", praise: "Worked well", "pilot-question": "Portal or email?",
};

type Ctx = {
  body?: string; page?: string; jobRef?: string | null;
  contactOk?: boolean; ua?: string; company?: string | null;
};
const parseCtx = (detail: string | null): Ctx => {
  try { return JSON.parse(detail || "{}") as Ctx; } catch { return { body: detail || "" }; }
};

/** Monday-anchored week start (Perth dates are close enough for a tally). */
function weekStart(iso: string): string {
  const d = new Date(iso);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

export default async function FeedbackPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const entries = await repo.listAudit(500).catch(() => []);
  const feedback = entries.filter((e) => e.action === "feedback");

  // Weekly rollup, last 4 weeks present in the data, newest first.
  const weeks = [...new Set(entries.map((e) => weekStart(e.at)))].sort().reverse().slice(0, 4);
  const count = (week: string, action: string) =>
    entries.filter((e) => weekStart(e.at) === week && e.action === action).length;

  return (
    <StaffShell title="Feedback & Pilot Metrics" sub="What clients said, and what they did." active="/admin">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <div className="mb-2.5 mt-5 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          Weekly Counts
        </h2>
        <span className="h-px flex-1 bg-rule" />
      </div>
      {weeks.length === 0 ? (
        <p className="text-[13px] text-ink/60">Nothing recorded yet — counts appear from the first sign-in or lodgement.</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th className="th text-left">Week starting</th>
                {EVENT_ACTIONS.map(([, label]) => (
                  <th key={label} className="th text-right">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {weeks.map((w) => (
                <tr key={w}>
                  <td className="td font-mono text-[12px]">{w}</td>
                  {EVENT_ACTIONS.map(([action]) => (
                    <td key={action} className="td text-right font-mono">{count(w, action)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-2.5 mt-8 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          Feedback — Newest First
        </h2>
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[12px] text-ink/60">{feedback.length}</span>
      </div>
      {feedback.length === 0 ? (
        <p className="text-[13px] text-ink/60">
          Nothing yet. Clients send it from the sidebar&apos;s <em>Send feedback</em>;
          the portal-or-email question appears after a lodgement or download.
        </p>
      ) : (
        <div className="card divide-y divide-rule">
          {feedback.map((e) => {
            const c = parseCtx(e.detail);
            return (
              <div key={e.id} className="px-4 py-3.5">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className={`chip ${e.target === "praise" ? "chip-seal" : e.target === "broken" ? "chip-flag" : ""}`}>
                    {CATEGORY_LABEL[e.target || ""] || e.target}
                  </span>
                  <span className="text-[13px] font-medium text-ink">{c.company || e.actor}</span>
                  <span className="font-mono text-[11.5px] text-ink/60">{e.actor}</span>
                  <span className="ml-auto font-mono text-[11.5px] text-ink/60">
                    {new Date(e.at).toLocaleString("en-AU", { timeZone: "Australia/Perth", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                  </span>
                </div>
                {c.body && <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink/80">{c.body}</p>}
                <p className="mt-1 text-[11.5px] text-ink/60">
                  {c.page || "—"}{c.jobRef ? <> · job {c.jobRef}</> : null}{c.ua ? <> · {c.ua}</> : null}
                  {c.contactOk ? <> · <span className="font-medium text-seal-deep">okay to ring</span></> : null}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </StaffShell>
  );
}
