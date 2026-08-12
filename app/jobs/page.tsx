import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import {
  groupJobs, clientStatusLabel, isClientVisible, needsClientInfo,
  elapsedBusinessDays, businessDaysSince, PAUSED_STATUSES, awaitingBoardRows,
  sortJobs, JOB_SORTS, DEFAULT_JOB_SORT,
} from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { DownloadButton } from "@/components/DownloadButton";
import { SortControl } from "@/components/SortControl";
import { Icon } from "@/components/Icon";
import { JobArt } from "@/components/JobArt";
import { EmptyState, fmtDate, LodgedLine } from "@/components/JobBits";
import { AmendmentsSent, amendmentsOf } from "@/components/AmendmentsSent";

export const dynamic = "force-dynamic";

// "Current" leads and is the default: the everyday question is "what's still
// with them", not "everything I've ever lodged". Finished work is still one
// click away.
const FILTERS = [
  { key: "progress", label: "Current" },
  { key: "action", label: "Needs You" },
  { key: "ready", label: "Ready" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];
const DEFAULT_FILTER: FilterKey = "progress";

export default async function MyJobs({
  searchParams,
}: { searchParams: Promise<{ show?: string; q?: string; sort?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const sp = await searchParams;
  const unread = await unreadCount(session.companyId);

  const show = (FILTERS.find((f) => f.key === sp.show)?.key ||
    DEFAULT_FILTER) as FilterKey;
  const q = (sp.q || "").trim().toLowerCase();
  const sort = JOB_SORTS.find((s) => s.key === sp.sort)?.key || DEFAULT_JOB_SORT;
  // Carry the current search AND sort into the filter-chip links so all three
  // combine — clicking a filter must not silently reset how the list is ordered.
  const carry = (href: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (sort !== DEFAULT_JOB_SORT) p.set("sort", sort);
    const qs = p.toString();
    return qs ? `${href}${href.includes("?") ? "&" : "?"}${qs}` : href;
  };
  const withQ = carry;

  const [all, subs] = await Promise.all([
    repo.listJobsForCompany(session.companyId)
      .then((j) => j.map(repo.toPortalJob).filter(isClientVisible)),
    repo.listSubmissionsForCompany(session.companyId),
  ]);
  // Lodged but not yet a job row — pending review, or accepted and waiting on
  // its reference + the next sync. Shown here as their own rows so a job never
  // vanishes between "Job Lodged" and the sync catching up: that gap is
  // exactly when the client looks.
  const received = awaitingBoardRows(subs, all);
  const g = groupJobs(all, new Date(), env.retentionMonths);

  // Amendments in flight, and the revised certificate when it comes back.
  // They used to sit at the bottom of the Amend a Job form — the one page a
  // client has no reason to revisit. They're jobs, so they live with the jobs.
  //
  // Not filtered by the chips: an amendment isn't in a bucket, and hiding it
  // behind "Current" would lose a revised certificate the moment the client
  // clicked "Past". The search box does apply — if you're looking for one
  // address, everything on the page should be about that address.
  const liveRefs = new Set(all.map((j) => j.ref as string));
  const amendments = amendmentsOf(subs).filter((a) => !q ||
    `${a.amendmentOf} ${a.address} ${a.description}`.toLowerCase().includes(q));

  const bucketOf = (ref: string) =>
    g.ready.some((j) => j.ref === ref) ? "ready"
      : g.downloaded.some((j) => j.ref === ref) ? "past"
      : g.cancelled.some((j) => j.ref === ref) ? "past"
      : "progress";

  const matchesQ = (j: typeof all[number]) => !q ||
    `${j.ref} ${j.address} ${j.description} ${j.clientRef || ""}`.toLowerCase().includes(q);

  const filtered = all.filter((j) => {
    if (!matchesQ(j)) return false;
    if (show === "all") return true;
    if (show === "action") return needsClientInfo(j);
    return bucketOf(j.ref as string) === show;
  });
  // Chosen order, with jobs waiting on the client floated to the top of the
  // mixed views — the same "act on this first" grouping the dashboard makes,
  // without a second table. In the single-bucket views (Ready, Past, Needs
  // You) there's nothing to float, so it's a plain sort.
  const rows = sortJobs(filtered, sort, {
    actionFirst: show === "progress" || show === "all",
  }) as typeof filtered;

  // The chip counts must honour the active search too — otherwise a search
  // that narrows the table to one row still reads "Current 12" above it, which
  // looks broken. When there's no search, matchesQ is always true and these
  // are the same numbers as before.
  const receivedQ = (r: (typeof received)[number]) => !q ||
    `${r.address} ${r.description}`.toLowerCase().includes(q);
  const nQ = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;

  const showReceived = show === "all" || show === "progress";
  const count = (k: FilterKey) =>
    k === "all" ? nQ(all, matchesQ) + nQ(received, receivedQ)
      : k === "progress" ? nQ(g.in_progress, matchesQ) + nQ(received, receivedQ)
      : k === "action" ? nQ(all, (j) => needsClientInfo(j) && matchesQ(j))
      : k === "ready" ? nQ(g.ready, matchesQ)
      : k === "past" ? nQ(g.downloaded, matchesQ) + nQ(g.cancelled, matchesQ)
      : nQ(all, (j) => needsClientInfo(j) && matchesQ(j));

  const hidden = await disabledPages();

  // Elapsed working days on a running job — context, never a forecast. Not
  // shown while the job is with the client, paused or cancelled. Just the day
  // count: the published turnaround belongs where it is a statement of
  // service, not hung off one job's status line.
  //
  // Days the job spent waiting on the client come back OUT of the count: only
  // the running jobs show a counter, so only they need their clock read.
  const pauses = await repo.clientPauses(g.in_progress.map((j) => j.ref as string));
  const elapsedFor = (j: (typeof all)[number]) => {
    if (needsClientInfo(j) || PAUSED_STATUSES.has(j.mondayStatus as string) ||
      j.mondayStatus === "Cancelled" || !j.receivedAt) return null;
    return elapsedBusinessDays(j.receivedAt as string, pauses[j.ref as string]);
  };

  // Deliberately NOT the same number. "Day 5" beside the status is how long
  // the job has been with US — client-waiting time removed. "Lodged 28 Jul,
  // 9 business days ago" is the plain elapsed figure, because that is what
  // the words say, and a lodgement date that quietly discounted a fortnight
  // the client held the job would be the portal misleading them in our favour.
  const sinceLodged = (j: (typeof all)[number]) =>
    j.receivedAt ? businessDaysSince(j.receivedAt as string) : null;

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        hero="/heroes/carport.jpg"
        title="My Jobs"
        sub="Every job you have with CF Building Approvals."
        action={<Link href="/submit" className="btn"><Icon name="plus" /> Lodge a Job</Link>}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex-1 min-w-[200px]" action="/jobs" method="get">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          {sort !== DEFAULT_JOB_SORT && <input type="hidden" name="sort" value={sort} />}
          <input name="q" defaultValue={sp.q || ""} className="field h-9 py-1 text-[14px]"
            placeholder="Search job no., address or description…" />
        </form>
        <SortControl options={JOB_SORTS} value={sort} defaultKey={DEFAULT_JOB_SORT} />
        <a href="/api/jobs/export" className="btn-ghost shrink-0">
          <Icon name="download" size={14} /> Export CSV
        </a>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f.key} href={withQ(f.key === DEFAULT_FILTER ? "/jobs" : `/jobs?show=${f.key}`)}
            className={`rounded-md border px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.07em] transition max-lg:inline-flex max-lg:min-h-10 max-lg:items-center ${
              show === f.key
                ? "border-seal bg-seal text-white"
                : "border-rule bg-white text-ink/65 hover:bg-wash"}`}>
            {f.label}
            <span className={`ml-1.5 font-mono ${show === f.key ? "text-white/70" : "text-ink/60"}`}>
              {count(f.key)}
            </span>
          </Link>
        ))}
      </div>

      <AmendmentsSent items={amendments} known={liveRefs} className="mb-6" />

      {rows.length === 0 && !(showReceived && received.length) ? (
        <EmptyState title="Nothing Here"
          body="No jobs match this filter. Try 'All' to see everything you have with us." />
      ) : (
        <>
        {/* Below lg the same rows render as cards — JobCards, at the foot of
            this file. The table needs 640px to hold its four columns, so on a
            390px screen it scrolled sideways, and the column that had to be
            scrolled to was the one holding the action. */}
        <div className="lg:hidden">
          <JobCards received={showReceived ? received : []} rows={rows}
            bucketOf={bucketOf} elapsedFor={elapsedFor} />
        </div>

        {/* The table, from lg up, exactly as it was — the right pattern on the
            screen this portal is mostly used on. */}
        <div className="card hidden overflow-hidden lg:block">
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead className="border-b border-rule bg-wash">
              <tr>
                <th className="th w-[110px]">Job No.</th>
                <th className="th">Address</th>
                <th className="th w-[240px]">Status</th>
                <th className="th w-[150px] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {showReceived && received.map((r) => (
                <tr key={r.id}>
                  <td className="td font-mono text-[12px] text-ink/60">—</td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <JobArt description={r.description} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{r.address}</div>
                        <div className="mt-0.5 text-[13px] text-ink/60">
                          {r.description}
                          {r.clientRef ? <span className="text-ink/60"> · your ref {r.clientRef}</span> : null}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="td">
                    <span className="chip">
                      {r.status === "accepted" ? "Lodged — on our board" : "Received — awaiting CFBA"}
                    </span>
                  </td>
                  <td className="td text-right"><span className="text-[13px] text-ink/60">—</span></td>
                </tr>
              ))}
              {rows.map((j) => {
                const b = bucketOf(j.ref as string);
                const elapsed = b === "progress" ? elapsedFor(j) : null;
                return (
                  <tr key={j.ref as string} className={needsClientInfo(j) ? "bg-[#FCF7EC]" : undefined}>
                    <td className="td font-mono text-[12px] text-ink/60">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} prefetch={false} className="hover:text-seal hover:underline">
                        {j.ref as string}
                      </Link>
                    </td>
                    <td className="td">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} prefetch={false} className="group flex items-center gap-3">
                        <JobArt description={j.description as string} size="sm"
                          tone={needsClientInfo(j) ? "amber" : "seal"} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink group-hover:text-seal">{j.address as string}</div>
                          <div className="mt-0.5 break-words text-[13px] text-ink/60">
                            {j.description as string}
                            {j.clientRef ? <span className="text-ink/60"> · your ref {String(j.clientRef)}</span> : null}
                            {j.issuedAt ? <> · issued {fmtDate(j.issuedAt as string)}</> : null}
                          </div>
                          <LodgedLine className="mt-0.5" receivedAt={j.receivedAt as string}
                            days={sinceLodged(j)} />
                        </div>
                      </Link>
                    </td>
                    <td className="td">
                      <span className={`chip ${needsClientInfo(j) ? "chip-brass" : b === "ready" ? "chip-seal" : ""}`}>
                        {clientStatusLabel(j.mondayStatus as string, j.fileCount as number)}
                      </span>
                      {elapsed !== null && (
                        <div className="mt-1 text-[11.5px] text-ink/60">
                          Day {elapsed + 1}
                        </div>
                      )}
                    </td>
                    <td className="td text-right">
                      {b === "progress" ? (
                        needsClientInfo(j) ? (
                          <Link href={`/messages?ref=${encodeURIComponent(j.ref as string)}`}
                            className="btn-ghost">Send Info</Link>
                        ) : <span className="text-[13px] text-ink/60">—</span>
                      ) : (
                        <DownloadButton href={`/api/jobs/${encodeURIComponent(j.ref as string)}/download`}
                          label={b === "past" ? "Download Again" : "Download"} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
        </>
      )}
    </AppShell>
  );
}

// ---------------------------------------------------------------------------
// The same jobs as cards, for below lg. Deliberately not a shrunken table: the
// headline is the address, because that is how a builder knows which job this
// is, with the status under it and one action. The job number moves to the
// meta line — it matters when quoting a job to us, not when finding it.
// ---------------------------------------------------------------------------
type Row = Awaited<ReturnType<typeof repo.listJobsForCompany>>[number] & Record<string, unknown>;

function JobCards({
  received, rows, bucketOf, elapsedFor,
}: {
  received: Awaited<ReturnType<typeof repo.listSubmissionsForCompany>>;
  rows: Row[];
  bucketOf: (ref: string) => string;
  elapsedFor: (j: Row) => number | null;
}) {
  return (
    <div className="space-y-2.5">
      {received.map((r) => (
        <div key={r.id} className="card p-4">
          <div className="flex items-start gap-3">
            <JobArt description={r.description} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="font-medium leading-snug text-ink">{r.address}</div>
              <div className="mt-0.5 break-words text-[13px] text-ink/60">{r.description}</div>
            </div>
          </div>
          <div className="mt-3">
            <span className="chip">
              {r.status === "accepted" ? "Lodged — on our board" : "Received — awaiting CFBA"}
            </span>
          </div>
        </div>
      ))}

      {rows.map((j) => {
        const ref = j.ref as string;
        const b = bucketOf(ref);
        const elapsed = b === "progress" ? elapsedFor(j) : null;
        const needs = needsClientInfo(j);
        return (
          <div key={ref}
            className={`card p-4 ${needs ? "border-[#E4C98A] bg-[#FCF7EC]" : ""}`}>
            <Link href={`/jobs/${encodeURIComponent(ref)}`} prefetch={false} className="flex items-start gap-3">
              <JobArt description={j.description as string} size="sm"
                tone={needs ? "amber" : "seal"} />
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug text-ink">{j.address as string}</div>
                <div className="mt-0.5 break-words text-[13px] text-ink/60">
                  {j.description as string}
                  {j.clientRef ? <span className="text-ink/60"> · your ref {String(j.clientRef)}</span> : null}
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-ink/60">
                  {ref}
                  {j.issuedAt ? <> · issued {fmtDate(j.issuedAt as string)}</> : null}
                </div>
                <LodgedLine className="mt-1" receivedAt={j.receivedAt as string}
                  days={j.receivedAt ? businessDaysSince(j.receivedAt as string) : null} />
              </div>
            </Link>

            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className={`chip ${needs ? "chip-brass" : b === "ready" ? "chip-seal" : ""}`}>
                {clientStatusLabel(j.mondayStatus as string, j.fileCount as number)}
              </span>
              {elapsed !== null && (
                <span className="text-[12px] text-ink/60">Day {elapsed + 1}</span>
              )}
            </div>

            {b === "progress" ? (
              needs && (
                <Link href={`/messages?ref=${encodeURIComponent(ref)}`}
                  className="btn-ghost mt-3 w-full">Send Info</Link>
              )
            ) : (
              <div className="mt-3">
                <DownloadButton block href={`/api/jobs/${encodeURIComponent(ref)}/download`}
                  label={b === "past" ? "Download Again" : "Download CDC Package"} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
