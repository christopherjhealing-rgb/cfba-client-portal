import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import {
  isClientVisible, needsClientInfo, clientStatusLabel, jobBucket,
  businessDaysSince, PAUSED_STATUSES,
} from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { JobTimeline } from "@/components/JobTimeline";
import { DownloadButton } from "@/components/DownloadButton";
import { ReplyBox } from "@/components/ReplyBox";
import { Icon } from "@/components/Icon";
import { fmtDate } from "@/components/JobBits";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

export default async function JobDetail({
  params,
}: { params: Promise<{ ref: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const ref = decodeURIComponent((await params).ref);

  const raw = await repo.getJob(ref);
  // Same 404 whether the job is missing or not this company's — no leakage.
  if (!raw || raw.companyId !== session.companyId) notFound();
  const job = repo.toPortalJob(raw);
  if (!isClientVisible(job)) notFound();

  const [unread, hidden, allMsgs, files, allSubs] = await Promise.all([
    unreadCount(session.companyId),
    disabledPages(),
    repo.listMessagesForCompany(session.companyId),
    repo.jobFiles(ref),
    repo.listSubmissionsForCompany(session.companyId),
  ]);
  await repo.markThreadRead(session.companyId, ref);

  const thread = allMsgs.filter((m) => m.ref === ref);
  // The lodgements behind this job: the original (matched via the Monday card
  // it created) and any amendments lodged against this ref.
  const lodgements = allSubs
    .filter((s) => s.status === "accepted" &&
      ((raw.mondayItemId && s.mondayItemId === raw.mondayItemId) || s.amendmentOf === ref))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const bucket = jobBucket(job, new Date(), env.retentionMonths);
  const downloadable = bucket === "ready" || bucket === "downloaded";
  const messagesOff = hidden.has("messages");

  // Elapsed working days since we received the job — context, never a
  // forecast. Only while the job is genuinely running with us: not while it's
  // with the client, paused or cancelled.
  const paused = PAUSED_STATUSES.has(job.mondayStatus as string) ||
    job.mondayStatus === "Cancelled";
  const elapsed = bucket === "in_progress" && !needsClientInfo(job) && !paused &&
    job.receivedAt ? businessDaysSince(job.receivedAt as string) : null;
  const typicalDays = String(env.turnaroundDays).replace("-", "–");

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead
        title={job.address as string || `Job ${ref}`}
        sub={`Job ${ref}${job.clientRef ? ` · your ref ${job.clientRef}` : ""}${job.description ? ` · ${job.description}` : ""}`}
        action={<Link href="/jobs" className="btn-ghost">← All jobs</Link>}
      />

      {needsClientInfo(job) && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13.5px] text-brass-deep">
          <p className="min-w-0">
            <strong>We need something from you</strong> before this can continue —
            see the messages below and reply with what&apos;s asked.
          </p>
          {!messagesOff && (
            <a href="#reply"
              className="shrink-0 font-medium underline underline-offset-2 hover:text-ink">
              Reply now →
            </a>
          )}
        </div>
      )}

      <div className="card mb-6 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className={`chip ${needsClientInfo(job) ? "chip-brass" : bucket === "ready" ? "chip-seal" : ""}`}>
              {clientStatusLabel(job.mondayStatus as string, job.fileCount as number)}
            </span>
            {elapsed !== null && (
              <span className="text-[12px] text-ink/55">
                Day {elapsed + 1} · most jobs {typicalDays} business days
              </span>
            )}
          </div>
          {downloadable && (
            <DownloadButton
              href={`/api/jobs/${encodeURIComponent(ref)}/download`}
              label={bucket === "downloaded" ? "Download again" : "Download certificate"}
            />
          )}
        </div>
        <JobTimeline job={job} />
        <p className="mt-4 text-[12.5px] text-ink/50">
          Your surveyor:{" "}
          <span className="font-medium text-ink/70">{job.surveyor || "being allocated"}</span>
          {job.issuedAt ? <> · Issued {fmtDate(job.issuedAt as string)}.</> : null}
        </p>
      </div>

      {lodgements.length > 0 && (
        <div className="card mb-6 p-4">
          <h2 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            What you&apos;ve sent us
          </h2>
          <div className="divide-y divide-rule">
            {lodgements.map((s) => (
              <div key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                <p className="mb-1 text-[12.5px] text-ink/55">
                  <span className="font-medium text-ink/75">
                    {s.amendmentOf ? "Amendment" : "Original lodgement"}
                  </span>
                  {" "}· {fmtDate(s.createdAt)}
                  {s.files.length > 0 &&
                    ` · ${s.files.length} file${s.files.length === 1 ? "" : "s"}`}
                </p>
                {s.files.length > 0 && (
                  <ul className="text-[13.5px] text-ink/70">
                    {s.files.map((f, i) => (
                      <li key={i} className="flex items-center gap-2 py-0.5">
                        <span className="text-seal"><Icon name="folder" size={13} /></span>
                        <span className="truncate">{f.name}</span>
                        {f.category && (
                          <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-ink/50">
                            {f.category}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-ink/55">
            Files sent with messages appear in the thread below.
          </p>
        </div>
      )}

      {files.length > 0 && downloadable && (
        <div className="card mb-6 p-4">
          <h2 className="mb-2 font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">
            Documents ({files.length})
          </h2>
          <ul className="text-[13.5px] text-ink/70">
            {files.map((f) => (
              <li key={f.storagePath} className="flex items-center gap-2 py-0.5">
                <span className="text-seal"><Icon name="folder" size={13} /></span>
                <span className="truncate">{f.filename}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-ink/55">Download the package above to save all of these.</p>
        </div>
      )}

      {/* Messages for this job */}
      <div className="card overflow-hidden">
        <div className="border-b border-rule px-4 py-3">
          <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.15em] text-ink/70">Messages</h2>
        </div>
        <div className="divide-y divide-rule">
          {thread.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-ink/45">
              No messages on this job yet.
            </p>
          ) : thread.map((m) => (
            <div key={m.id} className="px-4 py-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                  m.from === "cfba" ? "bg-seal text-white" : "bg-wash text-ink/60"}`}>
                  {m.from === "cfba" ? "CF" : "You"[0]}
                </span>
                <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                  {m.from === "cfba" ? "CF Building Approvals" : session.companyName}
                </span>
                <span className="text-[11px] text-ink/50">{when(m.createdAt)}</span>
              </div>
              {m.body && (
                <p className="whitespace-pre-line pl-8 text-[14px] leading-relaxed text-ink/80">{m.body}</p>
              )}
              {m.files && m.files.length > 0 && (
                <ul className="ml-8 mt-2.5 space-y-1">
                  {m.files.map((f, i) => (
                    <li key={f.storagePath}>
                      <a href={`/api/messages/${m.id}/${i}`}
                        className="inline-flex max-w-full items-center gap-2 rounded-md border border-rule bg-white px-3 py-1.5 text-[13px] text-ink/75 transition hover:border-seal/40 hover:bg-wash">
                        <span className="shrink-0 text-seal"><Icon name="download" size={13} /></span>
                        <span className="min-w-0 truncate">{f.name}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              {/* The Monday update id is set the moment a reply posts to the
                  card — its presence IS the delivery receipt. No polling. */}
              {m.from === "client" && m.mondayUpdateId && (
                <p className="mt-2 flex items-center gap-1.5 pl-8 text-[12px] text-ink/45">
                  <Icon name="check" size={12} /> Delivered to your surveyor
                </p>
              )}
            </div>
          ))}
        </div>
        {!messagesOff && (
          <div id="reply" className="scroll-mt-6">
            <ReplyBox refNo={ref} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
