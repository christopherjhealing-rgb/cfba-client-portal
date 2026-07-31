import Link from "next/link";
import { redirect } from "next/navigation";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isClientVisible, needsClientInfo } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";
import { AppShell, PageHead } from "@/components/AppShell";
import { disabledPages, hiddenHrefs } from "@/lib/pages";
import { PageOffline } from "@/components/PageOffline";
import { ReplyBox } from "@/components/ReplyBox";
import { Icon } from "@/components/Icon";
import { EmptyState } from "@/components/JobBits";

export const dynamic = "force-dynamic";

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" }) +
    " · " + d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
}

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

  const refs = Array.from(new Set(msgs.map((m) => m.ref)));
  const open = sp.ref && refs.includes(sp.ref)
    ? sp.ref
    : refs[0];

  // Opening a thread marks it read. Thread links set prefetch={false}: Next
  // prefetches links on hover, and a prefetch would run this render and
  // silently clear the badge on a thread the client never opened.
  if (open) await repo.markThreadRead(session.companyId, open);
  const unread = await unreadCount(session.companyId);

  const jobFor = (ref: string) => jobs.find((j) => j.ref === ref);
  const thread = msgs.filter((m) => m.ref === open);
  const job = open ? jobFor(open) : undefined;

  const isUnread = (ref: string) => {
    const latest = msgs.filter((m) => m.ref === ref && m.from === "cfba")
      .map((m) => m.createdAt).sort().pop();
    return !!latest && (!reads[ref] || reads[ref] < latest);
  };

  const hidden = await disabledPages();

  if (hidden.has("messages")) {
    return (
      <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
        <PageOffline section="Messages" />
      </AppShell>
    );
  }

  return (
    <AppShell company={session.companyName} impersonated={session.impersonated} unread={unread} hidden={hiddenHrefs(hidden)}>
      <PageHead title="Messages" sub="Everything we've sent you about a job, and your replies." />

      {refs.length === 0 ? (
        <EmptyState
          title="No messages"
          body="When we need something on a job, or have an update worth sending, it appears here."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr] lg:items-start">
          {/* Threads */}
          <div className="card overflow-hidden">
            {refs.map((ref) => {
              const j = jobFor(ref);
              const last = msgs.filter((m) => m.ref === ref).slice(-1)[0];
              const active = ref === open;
              return (
                <Link key={ref} href={`/messages?ref=${encodeURIComponent(ref)}`} prefetch={false}
                  className={`block border-b border-rule px-4 py-3.5 transition last:border-b-0 ${
                    active ? "bg-wash" : "hover:bg-wash/60"}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] text-ink/45">{ref}</span>
                    {isUnread(ref) && !active && (
                      <span className="h-1.5 w-1.5 rounded-full bg-brass" aria-label="Unread" />
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[14px] font-medium text-ink">
                    {j?.address as string || "Job " + ref}
                  </div>
                  <div className="mt-0.5 truncate text-[12px] text-ink/50">
                    {last?.body.split("\n")[0]}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Thread */}
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3.5">
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[12px] text-ink/45">{open}</span>
                  <span className="truncate font-medium">{job?.address as string}</span>
                </div>
                {job && (
                  <div className="mt-0.5 text-[13px] text-ink/55">{job.description as string}</div>
                )}
              </div>
              {job && needsClientInfo(job) && (
                <span className="chip chip-brass shrink-0">Waiting on you</span>
              )}
            </div>

            <div className="divide-y divide-rule">
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
                    <span className="text-[11px] text-ink/40">{when(m.createdAt)}</span>
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
                              {(f.size / 1_048_576).toFixed(1)} MB
                            </span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>

            {open && <ReplyBox refNo={open} />}
          </div>
        </div>
      )}

      <p className="mt-5 flex items-center gap-2 text-[12px] text-ink/45">
        <Icon name="inbox" size={13} />
        Replies and attachments go straight onto your job — there&apos;s no need to
        email as well.
      </p>
    </AppShell>
  );
}
