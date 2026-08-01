import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import { groupJobs, retention, isClientVisible } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { DownloadButton } from "@/components/DownloadButton";
import { SectionHead, ReadyRow, EmptyState, fmtDate } from "@/components/JobBits";

export const dynamic = "force-dynamic";

export default async function Downloads() {
  const session = await getClientSession();
  if (!session) redirect("/");
  const unread = await unreadCount(session.companyId);

  const all = (await repo.listJobsForCompany(session.companyId))
    .map(repo.toPortalJob).filter(isClientVisible);
  const g = groupJobs(all, new Date(), env.retentionMonths);

  const hidden = await disabledPages();

  if (hidden.has("downloads")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Downloads" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/pool.jpg"
        title="Downloads"
        sub={`Issued jobs stay available for ${env.retentionMonths} months from the day you first download them.`}
      />

      {g.ready.length + g.downloaded.length === 0 ? (
        <EmptyState title="Nothing to download yet"
          body="As soon as a job is issued, its certificate and stamped plans appear here as a single file." />
      ) : (
        <>
          <section className="mb-8">
            <SectionHead title="Ready to download" count={g.ready.length} />
            {g.ready.length === 0 ? (
              <p className="empty">Nothing new right now. Issued jobs appear here automatically.</p>
            ) : (
              <div className="card divide-y divide-rule overflow-hidden">
                {g.ready.map((j) => (
                  <ReadyRow key={j.ref} refNo={j.ref} address={j.address}
                    meta={[j.description, j.issuedAt && `issued ${fmtDate(j.issuedAt)}`]
                      .filter(Boolean).join(" · ")}
                    action={<DownloadButton href={`/api/jobs/${encodeURIComponent(j.ref)}/download`} />} />
                ))}
              </div>
            )}
          </section>

          {g.downloaded.length > 0 && (
            <section>
              <SectionHead title="Already downloaded" count={g.downloaded.length} />
              <div className="card divide-y divide-rule overflow-hidden">
                {g.downloaded.map((j) => {
                  const r = retention(j.firstDownloadedAt as string, new Date(), env.retentionMonths);
                  const soon = (r.daysLeft ?? 999) <= 30;
                  return (
                    <div key={j.ref} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-mono text-[12px] text-ink/45">{j.ref}</span>
                          <span className="truncate font-medium text-ink/80">{j.address}</span>
                        </div>
                        <div className="mt-0.5 text-[13px] text-ink/55">
                          {j.description}
                          {j.issuedAt ? <> · issued {fmtDate(j.issuedAt)}</> : null}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <DownloadButton href={`/api/jobs/${encodeURIComponent(j.ref)}/download`}
                          label="Download again" />
                        <span className={`text-[11px] ${soon ? "font-medium text-brass" : "text-ink/45"}`}>
                          available {r.daysLeft} more day{r.daysLeft === 1 ? "" : "s"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
