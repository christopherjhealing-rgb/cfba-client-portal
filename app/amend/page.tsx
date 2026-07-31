import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isClientVisible, READY_STATUS } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
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

  const [all, unread] = await Promise.all([
    repo.listJobsForCompany(session.companyId),
    unreadCount(session.companyId),
  ]);

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
        title="Amend a job"
        sub="Tell us what's changed on a job you already have with us."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_290px] lg:items-start">
        <AmendForm jobs={jobs} preselect={sp.ref} />

        <div className="card p-5">
          <p className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/50">
            How this works
          </p>
          <ol className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink/70">
            <li>
              <span className="font-medium text-ink">1. You send the change.</span> Pick the
              job, say what&apos;s different and attach the revised drawings.
            </li>
            <li>
              <span className="font-medium text-ink">2. We open it as a new job.</span> An
              amendment gets its own reference and its own assessment, linked back to the
              original so the history stays together.
            </li>
            <li>
              <span className="font-medium text-ink">3. The original stays put.</span> Its
              certificate is unchanged and still covers the plans it was issued against.
            </li>
          </ol>
          <p className="mt-4 border-t border-rule pt-4 text-[13px] leading-relaxed text-ink/60">
            If the work has already been built differently to the approved plans, tell us
            in the notes — that changes what we need to do.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
