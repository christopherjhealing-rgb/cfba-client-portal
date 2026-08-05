import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { unreadCount } from "@/lib/unread";
import * as repo from "@/lib/repo";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { TurnaroundLine } from "@/components/Turnaround";
import { SubmitForm } from "@/components/SubmitForm";
import { normaliseItems, OTHER, type JobItem } from "@/lib/jobdesc.mjs";

export const dynamic = "force-dynamic";

/**
 * "Lodge similar" carries the work of an existing job into a fresh lodgement,
 * so a builder doing the same patio at a new address doesn't retype it. The
 * address is never carried — a duplicate must not be able to lodge at the old
 * site by accident.
 *
 * Structured rows are restored when the original was lodged through the portal
 * (stashed at lodge — see the submit route). For an older or board-only job
 * there are no rows to restore, so the description seeds a single editable row
 * instead. Always scoped to the caller's own company.
 */
async function seedFrom(ref: string, companyId: string): Promise<JobItem[] | undefined> {
  const job = await repo.getJob(ref).catch(() => null);
  if (!job || job.companyId !== companyId) return undefined;

  if (job.mondayItemId) {
    const subs = await repo.listSubmissionsForCompany(companyId).catch(() => []);
    const sub = subs.find((s) => s.mondayItemId && s.mondayItemId === job.mondayItemId);
    if (sub) {
      const stash = await repo.getSetting<{ items?: unknown }>(`subitems:${sub.id}`).catch(() => null);
      const rows = normaliseItems(stash?.items);
      if (rows.length) return rows;
    }
  }
  // Fallback: the description as one editable row. Class can't be known from a
  // board job, so it defaults to 10a (the common case) for the client to fix.
  const text = String(job.description || "").trim();
  return text ? normaliseItems([{ classKey: "10a", type: OTHER, text }]) : undefined;
}

export default async function SubmitPage({
  searchParams,
}: { searchParams: Promise<{ from?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const [unread, sp] = await Promise.all([
    unreadCount(session.companyId),
    searchParams,
  ]);
  const seedItems = sp.from
    ? await seedFrom(decodeURIComponent(sp.from), session.companyId)
    : undefined;

  const hidden = await disabledPages();

  if (hidden.has("submit")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Lodging a job" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/deck.jpg"
        title="Lodge a Job"
        sub="Send us the site address and your plans — the job lands straight on our board and appears in your job list."
      />
      <div className="max-w-2xl">
        {seedItems && (
          <div className="mb-5 rounded-lg border border-seal/25 bg-[#EDF3EE] px-4 py-3 text-[13px] leading-relaxed text-ink/75">
            We&apos;ve carried the work across from your other job to save you
            re-typing it — <strong>check it, add the new site address, and attach
            this site&apos;s drawings.</strong> Nothing has been lodged yet.
          </div>
        )}
        <div className="mb-5"><TurnaroundLine /></div>
        <SubmitForm seedItems={seedItems} />
      </div>
    </AppShell>
  );
}
