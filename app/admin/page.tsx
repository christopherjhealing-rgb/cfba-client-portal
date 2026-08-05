import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { SyncButton } from "@/components/SyncButton";
import { DecisionButtons } from "@/components/DecisionButtons";
import { SyncHealth } from "@/components/SyncHealth";
import { AdminSnapshot } from "@/components/AdminSnapshot";
import {
  GENERAL_REF, groupJobs, needsClientInfo, isClientVisible,
} from "@/lib/core.mjs";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  if (!(await isStaff())) redirect("/admin/login");

  const [pending, companies, lastSync, allJobsRaw] = await Promise.all([
    repo.listSubmissions("pending"),
    repo.listCompanies(),
    repo.getSetting<Record<string, unknown>>("last_sync").catch(() => null),
    repo.listAllJobs().catch(() => []),
  ]);

  // The two things the office wants to see first thing: packages sitting
  // uncollected, and jobs stuck waiting on a client's answer. Both are read
  // from the last sync's cached board, filtered to what a client can see.
  const allJobs = allJobsRaw.map(repo.toPortalJob).filter(isClientVisible);
  const g = groupJobs(allJobs, new Date(), env.retentionMonths);
  const readyJobs = [...g.ready].sort((a, b) =>
    String(a.issuedAt || "").localeCompare(String(b.issuedAt || "")));
  const firJobs = allJobs.filter(needsClientInfo).sort((a, b) =>
    String(a.receivedAt || "").localeCompare(String(b.receivedAt || "")));
  // Enquiries have no card and no sync — the notification email is the only
  // thing that tells anyone one arrived. This count is the backstop for the
  // day that email doesn't send.
  const enquiries = await repo.listMessagesByRef(GENERAL_REF).catch(() => []);
  const lastByCompany = new Map<string, string>();
  for (const m of enquiries) lastByCompany.set(m.companyId, m.from);
  const enquiriesWaiting = [...lastByCompany.values()].filter((f) => f === "client").length;

  // Why hasn't the evening report arrived? Three things decide it, and none
  // of them were visible anywhere until now.
  const lastReport = await repo.getSetting<{ at?: string; ok?: boolean; error?: string }>(
    "last_report").catch(() => null);

  const reportHealthy = !!(env.dailyReportEnabled && env.officeEmail
    && process.env.CRON_SECRET && lastReport?.ok);
  const reportNote = !env.dailyReportEnabled ? "switched off."
    : !process.env.CRON_SECRET ? "CRON_SECRET isn't set, so the 5pm run can't authorise."
    : !lastReport?.at ? "never run yet."
    : lastReport.ok
      ? `last sent ${new Date(lastReport.at).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}.`
      : `last run didn't send — ${lastReport.error}.`;

  const names: Record<string, string> = {};
  for (const c of companies) names[c.id] = c.name;

  return (
    <StaffShell title="Submission Queue" sub="Jobs lodged through the portal, waiting to be accepted onto the board." active="/admin">
        {/* Clients has its own nav item now, so it isn't repeated here.
            Reports and the activity log are occasional, so they stay as
            buttons rather than taking up a fifth and sixth nav slot. */}
        <div className="mb-6 flex flex-wrap justify-end gap-2">
          <Link href="/admin/reports" className="btn-ghost">Turnaround Reports</Link>
          <Link href="/admin/audit" className="btn-ghost">Activity Log</Link>
          <SyncButton />
        </div>

        {/* One line here, the controls on Settings. Worth keeping in sight
            because a report that has stopped sending is invisible by nature. */}
        <Link href="/admin/settings"
          className={`mb-6 block rounded-lg border px-4 py-3 text-[13px] transition ${
            reportHealthy
              ? "border-seal/30 bg-[#EDF3EE] text-seal hover:border-seal/60"
              : "border-brass/40 bg-[#FBF4E6] text-brass hover:border-brass"}`}>
          <strong>Evening report</strong> — {reportNote}{" "}
          <span className="underline">Settings →</span>
        </Link>

        {enquiriesWaiting > 0 && (
          <Link href="/admin/enquiries"
            className="mb-6 block rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13px] text-ink/80 transition hover:border-brass">
            <strong>{enquiriesWaiting}</strong>{" "}
            {enquiriesWaiting === 1 ? "enquiry is" : "enquiries are"} waiting on an
            answer — questions that aren&apos;t about a job, so they aren&apos;t on
            the board. <span className="text-seal underline">Open Enquiries →</span>
          </Link>
        )}

        <SyncHealth
          last={lastSync as never}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
        />

        {/* Ready above FIR, as asked: what a client could collect right now,
            then what a client still owes us. Both from the last sync. */}
        <AdminSnapshot
          title="Ready to Download" tone="seal" mode="ready"
          blurb="Nothing waiting to be collected — every issued package has been downloaded."
          jobs={readyJobs} names={names}
        />
        <AdminSnapshot
          title="In for FIR" tone="brass" mode="fir"
          blurb="No jobs are waiting on a client's answer."
          jobs={firJobs} names={names}
        />

        <section>
          <div className="mb-2.5 flex items-center gap-3">
            <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
              Submissions Awaiting Review
            </h2>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[12px] text-ink/45">{pending.length}</span>
          </div>

          {pending.length === 0 ? (
            <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-8 text-center text-[13px] text-ink/50">
              Nothing waiting. Jobs lodged through the portal land here for checking
              before they go on the board.
            </p>
          ) : (
            <div className="space-y-3">
              {pending.map((s) => (
                <div key={s.id} className="card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.address}</span>
                        {s.jobClass && <span className="chip">{s.jobClass}</span>}
                      </div>
                      <div className="mt-0.5 text-[13px] text-ink/60">{s.description}</div>
                      {s.notes && (
                        <div className="mt-2 rounded-sm border-l-[3px] border-seal-2 bg-wash px-3 py-1.5 text-[13px] text-ink/70">
                          <span className="font-display text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/45">Note</span>
                          <div className="mt-0.5 whitespace-pre-wrap">{s.notes}</div>
                        </div>
                      )}
                      <div className="mt-1.5 text-[12px] text-ink/50">
                        {names[s.companyId] || s.companyId}
                        {s.email && <> · {s.email}</>}
                        {" · "}
                        {new Date(s.createdAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      </div>
                      {s.files.length > 0 && (
                        <ul className="mt-2 flex flex-wrap gap-1.5">
                          {s.files.map((f) => (
                            <li key={f.name} className="chip normal-case tracking-normal">{f.name}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <DecisionButtons id={s.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </StaffShell>
  );
}

