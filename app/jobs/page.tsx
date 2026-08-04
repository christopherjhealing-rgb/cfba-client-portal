import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import {
  groupJobs, clientStatusLabel, isClientVisible, needsClientInfo,
  elapsedBusinessDays, businessDaysSince, PAUSED_STATUSES,
} from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { DownloadButton } from "@/components/DownloadButton";
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
}: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const sp = await searchParams;
  const unread = await unreadCount(session.companyId);

  const show = (FILTERS.find((f) => f.key === sp.show)?.key ||
    DEFAULT_FILTER) as FilterKey;
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
      : "progress";

  const matchesQ = (j: typeof all[number]) => !q ||
    `${j.ref} ${j.address} ${j.description} ${j.clientRef || ""}`.toLowerCase().includes(q);

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
          <input name="q" defaultValue={sp.q || ""} className="field h-9 py-1 text-[14px]"
            placeholder="Search job no., address or description…" />
        </form>
        <a href="/api/jobs/export" className="btn-ghost shrink-0">
          <Icon name="download" size={14} /> Export CSV
        </a>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f.key} href={withQ(f.key === DEFAULT_FILTER ? "/jobs" : `/jobs?show=${f.key}`)}
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
                  <td className="td font-mono text-[12px] text-ink/40">—</td>
                  <td className="td">
                    <div className="flex items-center gap-3">
                      <JobArt description={r.description} size="sm" />
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{r.address}</div>
                        <div className="mt-0.5 text-[13px] text-ink/55">{r.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="td"><span className="chip">Received — awaiting CFBA</span></td>
                  <td className="td text-right"><span className="text-[13px] text-ink/35">—</span></td>
                </tr>
              ))}
              {rows.map((j) => {
                const b = bucketOf(j.ref as string);
                const elapsed = b === "progress" ? elapsedFor(j) : null;
                return (
                  <tr key={j.ref as string} className={needsClientInfo(j) ? "bg-[#FCF7EC]" : undefined}>
                    <td className="td font-mono text-[12px] text-ink/50">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} className="hover:text-seal hover:underline">
                        {j.ref as string}
                      </Link>
                    </td>
                    <td className="td">
                      <Link href={`/jobs/${encodeURIComponent(j.ref as string)}`} className="group flex items-center gap-3">
                        <JobArt description={j.description as string} size="sm"
                          tone={needsClientInfo(j) ? "amber" : "seal"} />
                        <div className="min-w-0">
                          <div className="font-medium text-ink group-hover:text-seal">{j.address as string}</div>
                          <div className="mt-0.5 break-words text-[13px] text-ink/55">
                            {j.description as string}
                            {j.clientRef ? <span className="text-ink/50"> · your ref {String(j.clientRef)}</span> : null}
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
                        <div className="mt-1 text-[11.5px] text-ink/55">
                          Day {elapsed + 1}
                        </div>
                      )}
                    </td>
                    <td className="td text-right">
                      {b === "progress" ? (
                        needsClientInfo(j) ? (
                          <Link href={`/messages?ref=${encodeURIComponent(j.ref as string)}`}
                            className="btn-ghost">Send Info</Link>
                        ) : <span className="text-[13px] text-ink/35">—</span>
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
              <div className="mt-0.5 break-words text-[13px] text-ink/55">{r.description}</div>
            </div>
          </div>
          <div className="mt-3">
            <span className="chip">Received — awaiting CFBA</span>
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
            <Link href={`/jobs/${encodeURIComponent(ref)}`} className="flex items-start gap-3">
              <JobArt description={j.description as string} size="sm"
                tone={needs ? "amber" : "seal"} />
              <div className="min-w-0 flex-1">
                <div className="font-medium leading-snug text-ink">{j.address as string}</div>
                <div className="mt-0.5 break-words text-[13px] text-ink/55">
                  {j.description as string}
                  {j.clientRef ? <span className="text-ink/50"> · your ref {String(j.clientRef)}</span> : null}
                </div>
                <div className="mt-1 font-mono text-[11.5px] text-ink/45">
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
                <span className="text-[12px] text-ink/55">Day {elapsed + 1}</span>
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
