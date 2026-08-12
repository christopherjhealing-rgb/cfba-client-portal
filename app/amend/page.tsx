import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isClientVisible, ISSUED_STATUSES } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { getPastJobs } from "@/lib/history";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { AmendForm, type AmendableJob } from "@/components/AmendForm";
import { amendmentsOf } from "@/components/AmendmentsSent";

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

  // Only the count, to point at My Jobs — the list itself lives there now.
  const openCount = amendmentsOf(subs).length;

  const jobs: AmendableJob[] = all
    .map(repo.toPortalJob)
    .filter(isClientVisible)
    .map((j) => ({
      ref: j.ref as string,
      address: j.address as string,
      description: j.description as string,
      status: (j.mondayStatus as string) || "",
      issued: ISSUED_STATUSES.has(j.mondayStatus) || !!j.firstDownloadedAt,
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
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/60">
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
              We email you when it&apos;s ready, and it appears on My Jobs. Until then your
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

      {/* The list of amendments already sent has moved to My Jobs, where a
          client actually looks. This page is for sending one. */}
      {openCount > 0 && (
        <p className="mt-6 text-[13px] leading-relaxed text-ink/60">
          {openCount === 1
            ? "You have one amendment with us already — it's on "
            : `You have ${openCount} amendments with us already — they're on `}
          <Link href="/jobs" className="font-medium text-seal underline">My Jobs</Link>,
          along with the revised certificate once it&apos;s issued.
        </p>
      )}
    </AppShell>
  );
}
