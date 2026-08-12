import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import { env } from "@/lib/env";
import * as repo from "@/lib/repo";
import {
  groupJobs, clientStatusLabel, retention, isClientVisible, splitInProgress, firAnswered,
  businessDaysSince, awaitingBoardRows, sortJobs,
} from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { DownloadButton } from "@/components/DownloadButton";
import { JobArt } from "@/components/JobArt";
import { Icon, type IconName } from "@/components/Icon";
import { SectionHead, EmptyState, fmtDate, LodgedLine, JobDesc } from "@/components/JobBits";

export const dynamic = "force-dynamic";

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Perth", hour: "numeric", hour12: false,
  }).format(new Date()));
  if (hour < 12) return "Good morning,";
  if (hour < 17) return "Good afternoon,";
  return "Good evening,";
}

const QUICK: { href: string; icon: IconName; title: string; sub: string }[] = [
  // Trimmed to the two genuinely action-shaped entries (DESIGN.md §4.5) —
  // the rest duplicated the sidebar and only added page length.
  { href: "/messages", icon: "mail", title: "Message Your Surveyor",
    sub: "Send documents or ask a question" },
  { href: "/amend", icon: "edit", title: "Amend a Job",
    sub: "Tell us what's changed" },
];

export default async function Dashboard() {
  const session = await getClientSession();
  if (!session) redirect("/");

  const [allJobs, subs, unread, msgs] = await Promise.all([
    repo.listJobsForCompany(session.companyId),
    repo.listSubmissionsForCompany(session.companyId),
    unreadCount(session.companyId),
    repo.listMessagesForCompany(session.companyId),
  ]);

  // When we last asked for something on a job. Used for a "waiting on you"
  // day count — an elapsed figure, never a forecast.
  const askedAt = (ref: string) =>
    msgs.filter((m) => m.ref === ref && m.from === "cfba")
      .map((m) => m.createdAt).sort().pop();
  const jobs = allJobs.map(repo.toPortalJob).filter(isClientVisible);
  const g = groupJobs(jobs, new Date(), env.retentionMonths);
  const split = splitInProgress(g.in_progress);
  // Ball-in-court: an FIR job the client has already answered leaves Action
  // Required (nothing is needed from them) and runs with the others under an
  // "Answer sent — with us" chip until the board catches up or asks again.
  const answeredRefs = new Set<string>();
  await Promise.all(split.awaiting.map(async (j) => {
    const m = await repo
      .getSetting<{ at: string; ask: string | null }>(`firanswered:${j.ref}`)
      .catch(() => null);
    if (firAnswered(m, (j.firRequest as string | null) ?? null)) answeredRefs.add(String(j.ref));
  }));
  // Action Required leads with the job that's been waiting longest — the one
  // most at risk of being forgotten. In Progress and Ready run newest first,
  // so the job the client most likely lodged last is at the top.
  const awaiting = sortJobs(split.awaiting.filter((j) => !answeredRefs.has(String(j.ref))), "oldest");
  const running = sortJobs(
    [...split.running, ...split.awaiting.filter((j) => answeredRefs.has(String(j.ref)))],
    "recent"
  );
  const ready = sortJobs(g.ready, "recent");

  // Lodgements we couldn't take, still recent enough to matter: the client
  // must never be left believing a dead job is live. Quiet row + the reason.
  const returned = subs.filter((s) =>
    s.status === "rejected" && !s.amendmentOf &&
    Date.parse(s.reviewedAt || s.createdAt) > Date.now() - 30 * 86400000
  );

  // Plain business days since we received it — not the paused-adjusted "day N"
  // counter that My Jobs shows beside the status. Two different questions:
  // this one is "when did I lodge this", and discounting a fortnight the
  // client held the job would be the portal flattering us.
  const lodgedDays = (j: { receivedAt: unknown }) =>
    j.receivedAt ? businessDaysSince(j.receivedAt as string) : null;
  // Freshly lodged jobs count too — pending review, or accepted but not yet
  // synced into a job row — so the "no jobs" empty state can never greet a
  // client seconds after they lodged one.
  const pending = awaitingBoardRows(subs, jobs);

  const nothing =
    g.ready.length + g.in_progress.length + g.downloaded.length + g.cancelled.length + pending.length === 0;

  const hidden = await disabledPages();

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      {/* Header. The photograph bleeds off the right and sits under a scrim so
          the greeting stays readable whatever image is dropped in. Phones get
          a shorter band and the 900px crop so jobs sit higher. */}
      <div className="relative -mx-5 -mt-7 mb-7 overflow-hidden px-5 pb-6 pt-6 md:pb-8 md:pt-9 lg:-mx-9 lg:-mt-9 lg:px-9 lg:pt-11">
        <div aria-hidden="true" className="hero-photo absolute inset-0 -z-20 saturate-[0.75]"
          style={{ "--hero": "url(/heroes/street.jpg)", "--hero-m": "url(/heroes/street-m.jpg)" } as React.CSSProperties} />
        <div aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0D211A] via-[#0D211A]/65 to-[#0D211A]/10" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[15px] text-white/75">{greeting()}</p>
            <h1 className="mt-0.5 font-display text-[30px] font-semibold leading-tight text-white">
              {session.companyName}
            </h1>
            <p className="mt-1.5 text-[14px] text-white/75">
              Here&apos;s what&apos;s happening with your jobs today.
            </p>
            <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-white/65">
              Most jobs are certified within about{" "}
              <span className="font-medium text-white">{String(env.turnaroundDays).replace("-", "\u2013")} business days</span>{" "}
              of everything being received.{" "}
              <Link href="/help" className="text-white underline underline-offset-2">
                How Long a Job Takes
              </Link>
            </p>
          </div>
          <Link href="/submit" className="btn shrink-0"><Icon name="plus" /> Lodge a Job</Link>
        </div>
      </div>

      {nothing ? (
        <EmptyState
          title="No Jobs Yet"
          body="When you lodge a job it will appear here, and you can follow it right through to download."
          action={<Link href="/submit" className="btn">Lodge Your First Job</Link>}
        />
      ) : (
        <>
          {/* Dynamic order (DESIGN.md §4): attention states lead when
              non-zero — a "0 Ready" must never hold the lead slot while
              something needs the client. 2-up on phones so Action Required
              is never two screens down. */}
          <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {(() => {
              const cards = [
                { key: "action", el: <Stat key="action" href="/jobs?show=action" icon="mail" n={awaiting.length + returned.length}
                    label="Action Required" note="Information requested from you."
                    cta="View Jobs" tone="amber" />, n: awaiting.length + returned.length, attention: true },
                { key: "ready", el: <Stat key="ready" href="/downloads" icon="download" n={g.ready.length}
                    label="Ready to Download" note="Issued documents ready for you."
                    cta="View Jobs" />, n: g.ready.length, attention: true },
                { key: "progress", el: <Stat key="progress" href="/jobs?show=progress" icon="clock" n={running.length}
                    label="In Progress" note="Jobs currently being assessed."
                    cta="View Jobs" />, n: running.length, attention: false },
                { key: "past", el: <Stat key="past" href="/jobs?show=past" icon="folder" n={g.downloaded.length + g.cancelled.length}
                    label="Past Jobs" note="Previously issued and completed."
                    cta="View All" />, n: g.downloaded.length + g.cancelled.length, attention: false },
              ];
              const lead = cards.filter((c) => c.attention && c.n > 0);
              const rest = cards.filter((c) => !(c.attention && c.n > 0));
              return [...lead, ...rest].map((c) => c.el);
            })()}
          </div>

          {(awaiting.length > 0 || returned.length > 0) && (
            <section className="mb-8">
              <SectionHead title="Action Required" count={awaiting.length + returned.length} tone="amber" />
              <div className="panel-amber overflow-hidden">
                {returned.map((s) => (
                  // A lodgement we couldn't take. The email says so too, but
                  // the portal must never let a dead job read as live.
                  <div key={s.id} className="border-b border-[#E9D7AC] px-4 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-start gap-4">
                      <JobArt description={s.description} tone="amber" />
                      <div className="min-w-[170px] max-w-full flex-1">
                        <p className="font-display text-[15.5px] font-semibold text-ink">
                          {s.address}
                        </p>
                        <JobDesc description={s.description} clientRef={s.clientRef as string} />
                        <p className="mt-1.5 text-[13px] font-medium text-brass-deep">
                          We couldn&apos;t take this lodgement — it&apos;s back with you.
                        </p>
                        {s.reviewNote && (
                          <div className="mt-3 rounded-lg border border-[#E9D7AC] bg-white px-4 py-3 text-[13px] leading-relaxed text-ink/75">
                            <p className="whitespace-pre-line">{s.reviewNote}</p>
                          </div>
                        )}
                      </div>
                      <Link href="/submit" className="btn shrink-0">
                        Lodge It Again
                      </Link>
                    </div>
                  </div>
                ))}
                {awaiting.map((j) => (
                  <div key={j.ref} className="border-b border-[#E9D7AC] px-4 py-4 last:border-b-0">
                    <div className="flex flex-wrap items-start gap-4">
                      <JobArt description={j.description as string} tone="amber" />
                      <div className="min-w-[170px] max-w-full flex-1">
                        <JobLink refNo={j.ref as string} address={j.address as string} tone="amber" />
                        <JobDesc description={j.description as string} clientRef={j.clientRef as string} />
                        <LodgedLine className="mt-1" receivedAt={j.receivedAt as string}
                          days={lodgedDays(j)} />
                        {(() => {
                          const at = askedAt(j.ref as string);
                          const d = at ? businessDaysSince(at) : null;
                          if (!at) return null;
                          return (
                            <p className="mt-1.5 text-[13px] font-medium text-brass-deep">
                              With you since {fmtDate(at)}
                              {d !== null && d > 0 &&
                                ` · ${d} business day${d === 1 ? "" : "s"}`}
                            </p>
                          );
                        })()}
                        {j.firRequest && (
                          <div className="mt-3 rounded-lg border border-[#E9D7AC] bg-white px-4 py-3 text-[13px] leading-relaxed text-ink/75">
                            <p className="whitespace-pre-line">{j.firRequest}</p>
                          </div>
                        )}
                      </div>
                      <Link href={`/messages?ref=${encodeURIComponent(j.ref)}`} className="btn shrink-0">
                        Send Information
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {g.ready.length > 0 && (
            <section className="mb-8">
              <SectionHead title="Ready to Download" count={g.ready.length} />
              <div className="card divide-y divide-rule overflow-hidden">
                {ready.map((j) => (
                  <div key={j.ref} className="flex flex-wrap items-center gap-4 px-4 py-4">
                    <JobArt description={j.description as string} />
                    {/* min-w keeps the text column readable on phones — the
                        button wraps below instead of crushing the words. */}
                    <div className="min-w-[170px] max-w-full flex-1">
                      <JobLink refNo={j.ref as string} address={j.address as string} />
                      <JobDesc description={j.description as string} clientRef={j.clientRef as string} />
                      <div className="mt-1.5 flex items-center gap-1.5 text-[13px] text-seal">
                        <Icon name="check" size={13} />
                        <span className="font-medium">CDC Package Issued</span>
                        <span className="text-ink/60">{fmtDate(j.issuedAt)}</span>
                      </div>
                    </div>
                    <DownloadButton href={`/api/jobs/${encodeURIComponent(j.ref)}/download`} />
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-8">
            <SectionHead title="Jobs in Progress"
              action={{ href: "/jobs?show=progress", label: "View All in Progress" }} />
            {running.length === 0 ? (
              <p className="empty">Nothing in progress right now.</p>
            ) : (
              <div className="card divide-y divide-rule overflow-hidden">
                {running.map((j) => (
                  <div key={j.ref} className="px-4 py-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <JobArt description={j.description as string} />
                      <div className="min-w-0 flex-1">
                        <JobLink refNo={j.ref as string} address={j.address as string} />
                        <JobDesc description={j.description as string} clientRef={j.clientRef as string} />
                        <LodgedLine className="mt-1" receivedAt={j.receivedAt as string}
                          days={lodgedDays(j)} />
                        <span className={`chip mt-1.5 inline-block ${answeredRefs.has(String(j.ref)) ? "chip-seal" : ""}`}>
                          {answeredRefs.has(String(j.ref))
                            ? "Answer sent — with us"
                            : clientStatusLabel(j.mondayStatus as string, j.fileCount as number)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {(g.downloaded.length > 0 || g.cancelled.length > 0) && (
            <section className="mb-8">
              <SectionHead title="Past Jobs"
                action={{ href: "/jobs?show=past", label: "View All Past Jobs" }} />
              <div className="card divide-y divide-rule overflow-hidden">
                {[...g.downloaded, ...g.cancelled].slice(0, 4).map((j) => {
                  const cancelled = !j.firstDownloadedAt;
                  const r = cancelled ? null
                    : retention(j.firstDownloadedAt as string, new Date(), env.retentionMonths);
                  return (
                    <div key={j.ref} className="flex flex-wrap items-center gap-4 px-4 py-3.5">
                      <JobArt description={j.description as string} />
                      <div className="min-w-[170px] max-w-full flex-1">
                        <JobLink refNo={j.ref as string} address={j.address as string} muted />
                        <JobDesc description={j.description as string} clientRef={j.clientRef as string}>
                          {r ? <>{" "}· available {r.daysLeft} more day{r.daysLeft === 1 ? "" : "s"}</> : null}
                        </JobDesc>
                      </div>
                      <span className={`chip shrink-0 ${cancelled ? "" : "chip-seal"}`}>
                        {cancelled ? "Cancelled" : "Issued"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <SectionHead title="Quick Actions" />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {QUICK.map((q) => (
                <Link key={q.href} href={q.href}
                  className="card flex items-center gap-3.5 px-4 py-3.5 transition hover:border-seal/40 hover:bg-wash/40">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-wash text-seal">
                    <Icon name={q.icon} size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium text-ink">{q.title}</span>
                    <span className="block truncate text-[12px] text-ink/60">{q.sub}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </AppShell>
  );
}

/** Ref + address as a link into the job's own page, styled to sit exactly
 *  where the plain text used to. */
function JobLink({ refNo, address, tone = "plain", muted = false }: {
  refNo: string; address: string; tone?: "plain" | "amber"; muted?: boolean;
}) {
  return (
    // prefetch off: opening the job page runs markThreadRead as a render side
    // effect, so a hover-prefetch would silently clear a thread's unread badge
    // the client never opened. The same guard is on /messages and /help.
    <Link href={`/jobs/${encodeURIComponent(refNo)}`} prefetch={false}
      className="group flex min-w-0 flex-wrap items-baseline gap-2">
      <span className={`font-mono text-[12px] ${tone === "amber" ? "text-brass-deep" : "text-ink/55"}`}>
        {refNo}
      </span>
      <span className={`truncate underline-offset-2 group-hover:text-seal group-hover:underline ${
        muted ? "text-ink/80" : "font-medium text-ink"}`}>
        {address}
      </span>
    </Link>
  );
}

function Stat({ href, icon, n, label, note, cta, tone = "plain" }: {
  href: string; icon: IconName; n: number; label: string; note: string;
  cta: string; tone?: "plain" | "amber";
}) {
  return (
    <Link href={href}
      className={`stat group flex-col transition hover:border-seal/40 ${
        tone === "amber" && n > 0 ? "border-[#E4C98A] bg-[#FCF7EC]" : ""}`}>
      <span className={`grid h-10 w-10 place-items-center rounded-lg ${
        tone === "amber" && n > 0 ? "bg-white text-brass" : "bg-wash text-seal"}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="mt-3 block">
        <span className="stat-num block">{n}</span>
        <span className="mt-1 block text-[14px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-ink/60">{note}</span>
      </span>
      <span className={`mt-3 flex items-center gap-1.5 text-[13px] font-medium ${
        tone === "amber" && n > 0 ? "text-brass-deep" : "text-seal"}`}>
        {cta} <Icon name="arrowRight" size={13}
          className="transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
