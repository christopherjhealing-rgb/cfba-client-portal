import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import { groupJobs, clientStatusLabel, isClientVisible, needsClientInfo } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { DownloadButton } from "@/components/DownloadButton";
import { Icon } from "@/components/Icon";
import { EmptyState, fmtDate } from "@/components/JobBits";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "action", label: "Needs you" },
  { key: "progress", label: "In progress" },
  { key: "ready", label: "Ready" },
  { key: "past", label: "Past" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function MyJobs({
  searchParams,
}: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const sp = await searchParams;
  const unread = await unreadCount(session.companyId);

  const show = (FILTERS.find((f) => f.key === sp.show)?.key ||
    "all") as FilterKey;
  const q = (sp.q || "").trim().toLowerCase();
  // Carry the current search into the filter-chip links so the two combine.
  const withQ = (href: string) => q ? `${href}${href.includes("?") ? "&" : "?"}q=${encodeURIComponent(q)}` : href;

  const [all, subs] = await Promise.all([
    repo.listJobsForCompany(session.companyId)
      .then((j) => j.map(repo.toPortalJob).filter(isClientVisible)),
    repo.listSubmissionsForCompany(session.companyId),
  ]);
  // Lodged but not yet accepted onto the board. Shown here as Received rather
  // than on the dashboard, so there is one place a client looks for a job.
  const received = subs.filter((x) => x.status === "pending");
  const g = groupJobs(all, new Date(), env.retentionMonths);

  const bucketOf = (ref: string) =>
    g.ready.some((j) => j.ref === ref) ? "ready"
      : g.downloaded.some((j) => j.ref === ref) ? "past"
      : "progress";

  const matchesQ = (j: typeof all[number]) => !q ||
    `${j.ref} ${j.address} ${j.description}`.toLowerCase().includes(q);

  const rows = all.filter((j) => {
    if (!matchesQ(j)) return false;
    if (show === "all") return true;
    if (show === "action") return needsClientInfo(j);
    return bucketOf(j.ref as string) === show;
  });

  const showReceived = show === "all" || show === "progress";
  const count = (k: FilterKey) =>
    k === "all" ? all.length + received.length
      : k === "progress" ? g.in_progress.length + received.length
      : k === "action" ? all.filter(needsClientInfo).length
      : k === "ready" ? g.ready.length
      : k === "past" ? g.downloaded.length
      : all.filter(needsClientInfo).length;

  const hidden = await disabledPages();

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/carport.jpg"
        title="My jobs"
        sub="Every job you have with CF Building Approvals."
        action={<Link href="/submit" className="btn"><Icon name="plus" /> Lodge a job</Link>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex-1 min-w-[200px]" action="/jobs" method="get">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          <input name="q" defaultValue={sp.q || ""} className="field h-9 py-1 text-[14px]"
            placeholder="Search job no., address or description…" />
        </form>
        <a href="/api/jobs/export" className="btn-ghost shrink-0">
          <Icon name="download" size={14} /> Export CSV
        </a>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f.key} href={withQ(f.key === "all" ? "/jobs" : `/jobs?show=${f.key}`)}
            className={`rounded-md border px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.07em] transition ${
              show === f.key
                ? "border-seal bg-seal text-white"
                : "border-rule bg-white text-ink/65 hover:bg-wash"}`}>
            {f.label}
            <span className={`ml-1.5 font-mono ${show === f.key ? "text-white/70" : "text-ink/35"}`}>
              {count(f.key)}
            </span>
          </Link>
        ))}
      </div>

      {rows.length === 0 && !(showReceived && received.length) ? (
        <EmptyState title="Nothing here"
          body="No jobs match this filter. Try 'All' to see everything you have with us." />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="border-b border-rule bg-wash">
              <tr>
                <th className="th w-[110px]">Job no.</th>
                <th className="th">Address</th>
                <th className="th w-[240px]">Status</th>
                <th className="th w-[150px] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {showReceived && received.map((r) => (
                <tr key={r.id}>
                  <td className="td font-mono text-[12px] text-ink/40">—</td>
                  <td className="td">
                    <div className="font-medium text-ink">{r.address}</div>
                    <div className="mt-0.5 text-[13px] text-ink/55">{r.description}</div>
                  </td>
                  <td className="td"><span className="chip">Received — awaiting CFBA</span></td>
                  <td className="td text-right"><span className="text-[13px] text-ink/35">—</span></td>
                </tr>
              ))}
              {rows.map((j) => {
                const b = bucketOf(j.ref as string);
                return (
                  <tr key={j.ref as string} className={needsClientInfo(j) ? "bg-[#FCF7EC]" : undefined}>
                    <td className="td font-mono text-[12px] text-ink/50">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} className="hover:text-seal hover:underline">
                        {j.ref as string}
                      </Link>
                    </td>
                    <td className="td">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} className="group">
                        <div className="font-medium text-ink group-hover:text-seal">{j.address as string}</div>
                        <div className="mt-0.5 text-[13px] text-ink/55">
                          {j.description as string}
                          {j.issuedAt ? <> · issued {fmtDate(j.issuedAt as string)}</> : null}
                        </div>
                      </Link>
                    </td>
                    <td className="td">
                      <span className={`chip ${needsClientInfo(j) ? "chip-brass" : b === "ready" ? "chip-seal" : ""}`}>
                        {clientStatusLabel(j.mondayStatus as string, j.fileCount as number)}
                      </span>
                    </td>
                    <td className="td text-right">
                      {b === "progress" ? (
                        needsClientInfo(j) ? (
                          <Link href={`/messages?ref=${encodeURIComponent(j.ref as string)}`}
                            className="btn-ghost">Send info</Link>
                        ) : <span className="text-[13px] text-ink/35">—</span>
                      ) : (
                        <DownloadButton href={`/api/jobs/${encodeURIComponent(j.ref as string)}/download`}
                          label={b === "past" ? "Download again" : "Download"} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
