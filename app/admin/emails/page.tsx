// The send log: every email the portal has tried to send, newest first.
//
// The reason this page exists is the failures. A bounced "your job is ready"
// email is invisible by nature — the client doesn't know they weren't told,
// and nothing else says the telling failed. The log is written at the one
// choke point all portal email passes through (lib/mail sendMail), so if it
// isn't here, the portal never tried to send it.

import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";

export const dynamic = "force-dynamic";

const when = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? "—"
    : t.toLocaleString("en-AU", {
        timeZone: "Australia/Perth",
        day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
      });
};

export default async function EmailLog() {
  if (!(await isStaff())) redirect("/admin/login");
  const log = await repo.listSendLog();
  const failed = log.filter((e) => !e.ok).length;

  return (
    <StaffShell
      title="Email Send Log"
      sub="Every email the portal has tried to send — the last 200, newest first."
      active="/admin"
    >
      {failed > 0 && (
        <p className="mb-5 rounded-lg border border-flag/40 bg-[#FBECEC] px-4 py-3 text-[13px] text-ink/80">
          <strong>{failed}</strong> of the last {log.length} didn&apos;t send. A failed
          &ldquo;ready to download&rdquo; email means ringing the client — nothing retries
          automatically.
        </p>
      )}

      {log.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-8 text-center text-[13px] text-ink/50">
          Nothing logged yet. Entries appear here from the next email the portal sends.
        </p>
      ) : (
        <div className="card divide-y divide-rule overflow-hidden">
          {log.map((e, i) => (
            <div key={`${e.at}-${i}`} className={`px-4 py-2.5 ${e.ok ? "" : "bg-[#FBECEC]"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={`font-display text-[10px] font-semibold uppercase tracking-[0.1em] ${e.ok ? "text-seal" : "text-flag"}`}>
                  {e.ok ? "Sent" : "Failed"}
                </span>
                <span className="font-mono text-[12px] text-ink/50">{when(e.at)}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{e.subject}</span>
              </div>
              <div className="mt-0.5 text-[12px] text-ink/55">To: {e.to}</div>
              {!e.ok && e.error && (
                <div className="mt-1 font-mono text-[11.5px] leading-snug text-flag/90">{e.error}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </StaffShell>
  );
}
