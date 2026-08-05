import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isClientVisible, needsClientInfo, GENERAL_REF, isGeneralRef } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { ReplyBox } from "@/components/ReplyBox";
import { Icon } from "@/components/Icon";

export const dynamic = "force-dynamic";

import { fmtWhen, fmtMB } from "@/lib/when.mjs";

export default async function Messages({
  searchParams,
}: { searchParams: Promise<{ ref?: string }> }) {
  const session = await getClientSession();
  if (!session) redirect("/");
  const sp = await searchParams;

  const [jobs, msgs, reads] = await Promise.all([
    repo.listJobsForCompany(session.companyId).then((j) => j.map(repo.toPortalJob).filter(isClientVisible)),
    repo.listMessagesForCompany(session.companyId),
    repo.getReadMarks(session.companyId),
  ]);

  // Two clocks per thread: when anything last happened on it, which decides
  // the order, and when WE last said something, which decides whether it's
  // unread. Built in one pass rather than re-scanning the messages per ref.
  const lastAt = new Map<string, string>();
  const lastFromUs = new Map<string, string>();
  for (const m of msgs) {
    if (!lastAt.has(m.ref) || m.createdAt > lastAt.get(m.ref)!) lastAt.set(m.ref, m.createdAt);
    if (m.from === "cfba" &&
        (!lastFromUs.has(m.ref) || m.createdAt > lastFromUs.get(m.ref)!)) {
      lastFromUs.set(m.ref, m.createdAt);
    }
  }
  const isUnread = (ref: string) => {
    const latest = lastFromUs.get(ref);
    return !!latest && (!reads[ref] || reads[ref] < latest);
  };

  // Newest conversation first. These used to arrive in the order the threads
  // were STARTED, so a job somebody messaged about months ago sat at the top
  // and this morning's FIR was three down the list.
  const refs = Array.from(new Set(msgs.map((m) => m.ref)))
    .filter((r) => !isGeneralRef(r))
    .sort((a, b) => (lastAt.get(b) || "").localeCompare(lastAt.get(a) || ""));

  // Honour ?ref= for ANY job this company owns — not only ones that already
  // have a thread. Previously an unknown ref silently fell back to refs[0],
  // so a link to a not-yet-messaged job opened a DIFFERENT job's thread and a
  // reply could post to the wrong Monday card.
  const ownsRef = (r?: string) => !!r && jobs.some((j) => j.ref === r);
  // Arriving with nothing chosen — which is what the sidebar badge does —
  // opens whatever put the badge there. Clicking a "1" and landing on a
  // conversation from last month is how an FIR sits unread for a week.
  const needsReading = [...refs, GENERAL_REF].find(isUnread);
  const open = isGeneralRef(sp.ref) ? GENERAL_REF
    : ownsRef(sp.ref) ? sp.ref
    : needsReading || refs[0] || GENERAL_REF;
  // Show the opened job in the thread list even if it has no messages yet, so
  // a deep-linked new conversation has somewhere to live. The enquiry thread
  // sits at the bottom and is always there: a client with a question and no
  // job to hang it on used to have nowhere to go but the phone.
  const jobRefs = open && !isGeneralRef(open) && !refs.includes(open) ? [open, ...refs] : refs;
  const listRefs = [...jobRefs, GENERAL_REF];

  // Checked BEFORE anything is marked read. Opening a thread clears its badge,
  // and a client who lands here while messaging is switched off sees the
  // offline card — clearing the badge on a message they were never shown would
  // lose it for good.
  const hidden = await disabledPages();
  if (hidden.has("messages")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated}
        unread={await unreadCount(session.companyId)} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Messages" />
      </AppShell>
    );
  }

  // Opening a thread marks it read. Thread links set prefetch={false}: Next
  // prefetches links on hover, and a prefetch would run this render and
  // silently clear the badge on a thread the client never opened.
  if (open) await repo.markThreadRead(session.companyId, open);
  const unread = await unreadCount(session.companyId);

  const jobFor = (ref: string) => jobs.find((j) => j.ref === ref);
  const thread = msgs.filter((m) => m.ref === open);
  const job = open ? jobFor(open) : undefined;


  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead hero="/heroes/table.jpg" title="My Messages" sub="Everything we've sent you about a job, your replies — and anything else you want to ask." />

      <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-start">
          {/* Threads */}
          <div className="card overflow-hidden">
            {jobRefs.length === 0 && (
              <p className="border-b border-rule px-4 py-3.5 text-[13px] leading-relaxed text-ink/55">
                No job messages yet. When we need something on a job, or have an
                update worth sending, it appears here.
              </p>
            )}
            {listRefs.map((ref) => {
              const isGeneral = isGeneralRef(ref);
              const j = jobFor(ref);
              const last = msgs.filter((m) => m.ref === ref).slice(-1)[0];
              const active = ref === open;
              return (
                <Link key={ref} href={`/messages?ref=${encodeURIComponent(ref)}`} prefetch={false}
                  className={`block border-b border-rule px-4 py-3.5 transition last:border-b-0 ${
                    active ? "bg-wash" : "hover:bg-wash/60"} ${
                    isGeneral ? "border-t-2 border-t-rule" : ""}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] text-ink/55">
                      {isGeneral ? "Enquiry" : ref}
                    </span>
                    {isUnread(ref) && !active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-label="Unread" />
                    )}
                    {/* The list runs newest first; without a date on it that
                        order looks arbitrary. */}
                    {lastAt.get(ref) && (
                      <span className="ml-auto shrink-0 text-[11px] text-ink/40">
                        {fmtWhen(lastAt.get(ref)!).split(" · ")[0]}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[14px] font-medium text-ink">
                    {isGeneral ? "General Enquiry" : (j?.address as string || "Job " + ref)}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink/50">
                    {last?.body.split("\n")[0] ||
                      (isGeneral ? "Ask us something else" : "")}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Thread */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3.5">
              <div className="min-w-0">
                {isGeneralRef(open) ? (
                  <>
                    <div className="font-medium">General Enquiry</div>
                    <div className="mt-0.5 text-[13px] text-ink/55">
                      Anything that isn&apos;t about a job you&apos;ve lodged — a quote,
                      a fee, or whether you need a CDC at all.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-[12px] text-ink/55">{open}</span>
                      <span className="truncate font-medium">{job?.address as string}</span>
                    </div>
                    {job && (
                      <div className="mt-0.5 text-[13px] text-ink/55">{job.description as string}</div>
                    )}
                  </>
                )}
              </div>
              {job && needsClientInfo(job) && (
                <span className="chip chip-brass shrink-0">With You</span>
              )}
            </div>

            <div className="divide-y divide-rule">
              {thread.length === 0 && isGeneralRef(open) && (
                <p className="px-4 py-5 text-[14px] leading-relaxed text-ink/60">
                  Nothing here yet. Ask us anything — we answer in business
                  hours, and the reply lands here and in your email. If
                  it&apos;s urgent, ring 1300 029 074.
                </p>
              )}
              {thread.map((m) => (
                <div key={m.id} className="px-4 py-4">
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                      m.from === "cfba" ? "bg-seal text-white" : "bg-wash text-ink/60"}`}>
                      {m.from === "cfba" ? "CF" : "You"[0]}
                    </span>
                    <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                      {m.from === "cfba" ? "CF Building Approvals" : session.companyName}
                    </span>
                    <span className="text-[11px] text-ink/50">{fmtWhen(m.createdAt)}</span>
                  </div>
                  {m.body && (
                    <p className="whitespace-pre-line pl-8 text-[14px] leading-relaxed text-ink/80">
                      {m.body}
                    </p>
                  )}
                  {m.files && m.files.length > 0 && (
                    <ul className="ml-8 mt-2.5 space-y-1">
                      {m.files.map((f, i) => (
                        <li key={f.storagePath}>
                          <a href={`/api/messages/${m.id}/${i}`}
                            className="inline-flex max-w-full items-center gap-2 rounded-md border border-rule bg-white px-3 py-1.5 text-[13px] text-ink/75 transition hover:border-seal/40 hover:bg-wash">
                            <span className="shrink-0 text-seal"><Icon name="download" size={13} /></span>
                            <span className="min-w-0 truncate">{f.name}</span>
                            <span className="shrink-0 font-mono text-[11px] text-ink/40">
                              {fmtMB(f.size)}
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* The Monday update id is set the moment a reply posts to
                      the card — its presence IS the delivery receipt. */}
                  {m.from === "client" && m.mondayUpdateId && (
                    <p className="mt-2 flex items-center gap-1.5 pl-8 text-[12px] text-ink/45">
                      <Icon name="check" size={12} /> Delivered to your surveyor
                    </p>
                  )}
                </div>
              ))}
            </div>

            {open && <ReplyBox refNo={open} general={isGeneralRef(open)} />}
          </div>
      </div>

      <p className="mt-5 flex items-center gap-2 text-[12px] text-ink/55">
        <Icon name="inbox" size={13} />
        {isGeneralRef(open)
          ? "Enquiries come straight to the office — there's no need to email as well."
          : "Replies and attachments go straight onto your job — there's no need to email as well."}
      </p>
    </AppShell>
  );
}
