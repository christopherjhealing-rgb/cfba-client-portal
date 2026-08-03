import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import {
  isClientVisible, READY_STATUS, AMENDMENT_OPEN, AMENDMENT_DONE, REVISED,
} from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { getPastJobs } from "@/lib/history";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { AmendForm, type AmendableJob } from "@/components/AmendForm";

export const dynamic = "force-dynamic";

export default async function Amend({
  searchParams,
}: { searchParams: Promise<{ ref?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const sp = await searchParams;

  const [all, unread, subs, past] = await Promise.all([
    repo.listJobsForCompany(session.companyId),
    unreadCount(session.companyId),
    repo.listSubmissionsForCompany(session.companyId).catch(() => []),
    getPastJobs(session.companyId).catch(() => []),
  ]);

  // A historical job was never synced, so it has no job page — this list is
  // the only place its amendment can appear, and the only way the client gets
  // the revised certificate back.
  const mine = subs
    .filter((s) => s.amendmentOf &&
      (s.status === AMENDMENT_OPEN || s.status === AMENDMENT_DONE))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const jobs: AmendableJob[] = all
    .map(repo.toPortalJob)
    .filter(isClientVisible)
    .map((j) => ({
      ref: j.ref as string,
      address: j.address as string,
      description: j.description as string,
      status: (j.mondayStatus as string) || "",
      issued: j.mondayStatus === READY_STATUS || !!j.firstDownloadedAt,
    }));

  // Jobs we've finished, from the past-jobs index rather than the jobs table —
  // see lib/history. Anything already in the portal wins, so a job that's both
  // current and in the index isn't offered twice.
  // What the board calls finished. Anything else from the index is live work,
  // and says so rather than claiming to be complete.
  const CLOSED_ISH = new Set(["Invoiced / Completed", "To Invoice", "Issued"]);
  const live = new Set(jobs.map((j) => j.ref));
  const older: AmendableJob[] = past
    .filter((p) => p.ref && !live.has(p.ref))
    .map((p) => ({
      ref: p.ref,
      address: p.address,
      description: "",
      status: p.status,
      // Only genuinely finished work gets the tick. An in-progress job can
      // reach this list too — one the sync couldn't match to a client — and
      // labelling that "Issued" would tell them a certificate exists.
      issued: CLOSED_ISH.has(p.status),
      past: true,
    }));

  const hidden = await disabledPages();

  if (hidden.has("amend")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Amending a job" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/shed.jpg"
        title="Amend a Job"
        sub="Tell us what's changed on a job you already have with us."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_290px] lg:items-start">
        <AmendForm jobs={[...jobs, ...older]} preselect={sp.ref} />

        <div className="card p-5">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            How This Works
          </p>
          <ol className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink/70">
            <li>
              <span className="font-medium text-ink">1. You send the change.</span>{" "}
              Pick the job, say what&apos;s different and attach the revised drawings.
            </li>
            <li>
              <span className="font-medium text-ink">2. It goes to your surveyor.</span>{" "}
              Straight to the person who certified the original — not into a queue.
              They confirm the change is acceptable and we re-issue.
            </li>
            <li>
              <span className="font-medium text-ink">3. You get the new certificate.</span>{" "}
              We email you when it&apos;s ready and it appears below. Until then your
              original certificate stands and still covers the plans it was issued
              against.
            </li>
          </ol>
          <p className="mt-4 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink/60">
            If the work has already been built differently to the approved plans, tell us
            in the notes — that changes what we need to do.
          </p>
        </div>
      </div>

      {mine.length > 0 && (
        <section className="mt-8">
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
              Amendments You&apos;ve Sent
            </h2>
            <span className="h-px flex-1 bg-rule" />
          </div>
          <div className="card divide-y divide-rule">
            {mine.map((a) => (
              <div key={a.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-seal">{a.amendmentOf}</span>
                  <span className="text-[14px] font-medium">{a.address}</span>
                  {a.status === AMENDMENT_DONE
                    ? <span className="chip chip-seal">Ready</span>
                    : <span className="chip chip-brass">With your surveyor</span>}
                </div>
                <div className="mt-0.5 text-[12.5px] text-ink/55">{a.description}</div>
                {a.status === AMENDMENT_DONE && a.files.some((f) => f.category === REVISED) && (
                  <ul className="mt-1.5 flex flex-wrap gap-3">
                    {a.files.filter((f) => f.category === REVISED).map((f) => (
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
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
