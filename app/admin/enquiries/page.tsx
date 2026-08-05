import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { EnquiryReply } from "@/components/EnquiryReply";
import { GENERAL_REF } from "@/lib/core.mjs";

export const dynamic = "force-dynamic";

import { fmtWhen as when } from "@/lib/when.mjs";

/** General enquiries — questions that aren't about a job, so they never reach
 *  the board. This page is the safety net: an enquiry appears here whether or
 *  not the notification email got through, and the ones still waiting on an
 *  answer are at the top. */
export default async function EnquiriesPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [msgs, companies] = await Promise.all([
    repo.listMessagesByRef(GENERAL_REF).catch(() => []),
    repo.listCompanies().catch(() => []),
  ]);
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));

  // One conversation per company, newest activity first, unanswered first.
  const byCompany = new Map<string, typeof msgs>();
  for (const m of msgs) {
    const list = byCompany.get(m.companyId) || [];
    list.push(m);
    byCompany.set(m.companyId, list);
  }
  const threads = [...byCompany.entries()]
    .map(([companyId, list]) => {
      const last = list[list.length - 1];
      return { companyId, list, last, waiting: last.from === "client" };
    })
    .sort((a, b) =>
      Number(b.waiting) - Number(a.waiting) ||
      b.last.createdAt.localeCompare(a.last.createdAt));

  const waiting = threads.filter((t) => t.waiting).length;

  return (
    <StaffShell title="Enquiries" sub="Questions that aren't about a job." active="/admin/enquiries">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <p className="mb-6 mt-4 max-w-2xl text-[14px] leading-relaxed text-ink/65">
        A client with a question and no job to hang it on used to have nowhere
        to go but the phone. These arrive here and by email. Replying puts your
        answer in their portal and emails it to them — nothing goes on the
        board, because there is no card to put it on. If an enquiry turns out
        to be real work, tell them to lodge it and it becomes a job like any
        other.
      </p>

      {waiting > 0 && (
        <p className="mb-5 rounded-lg border border-brass/40 bg-[#FBF4E6] px-4 py-3 text-[13px] text-ink/80">
          <strong>{waiting}</strong> {waiting === 1 ? "enquiry is" : "enquiries are"} waiting
          on an answer.
        </p>
      )}

      {threads.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-8 text-center text-[13px] text-ink/50">
          No enquiries yet.
        </p>
      ) : (
        <div className="space-y-5">
          {threads.map((t) => (
            <div key={t.companyId} className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-4 py-3.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {nameOf.get(t.companyId) || t.companyId}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink/50">
                    Last message {when(t.last.createdAt)}
                  </div>
                </div>
                {t.waiting && <span className="chip chip-brass shrink-0">Waiting</span>}
              </div>

              <div className="divide-y divide-rule">
                {t.list.map((m) => (
                  <div key={m.id} className="px-4 py-4">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className={`grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold ${
                        m.from === "cfba" ? "bg-seal text-white" : "bg-wash text-ink/60"}`}>
                        {m.from === "cfba" ? "CF" : "C"}
                      </span>
                      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                        {m.from === "cfba" ? "CF Building Approvals" : nameOf.get(m.companyId) || "Client"}
                      </span>
                      <span className="text-[11px] text-ink/50">{when(m.createdAt)}</span>
                    </div>
                    {m.body && (
                      <p className="whitespace-pre-line pl-8 text-[14px] leading-relaxed text-ink/80">
                        {m.body}
                      </p>
                    )}
                    {m.files && m.files.length > 0 && (
                      <p className="mt-2 pl-8 text-[12px] text-ink/50">
                        Attached: {m.files.map((f) => f.name).join(", ")} — open the
                        client&apos;s portal view to download.
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <EnquiryReply companyId={t.companyId} />
            </div>
          ))}
        </div>
      )}
    </StaffShell>
  );
}
