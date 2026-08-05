import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = {
  "submission.accept": "Accepted Job",
  "submission.reject": "Rejected Job",
  "login.create": "Issued Login",
  "login.reset": "Reset Login",
  "client.alias": "Added Client Alias",
  "client.create": "Created Client",
  "certificate.download": "Downloaded Certificate",
  "engineering.settings": "Engineering Checker",
  "enquiry.reply": "Answered Enquiry",
  "client.delete": "Deleted Client",
};

import { fmtStamp as when } from "@/lib/when.mjs";

export default async function AuditPage() {
  if (!(await isStaff())) redirect("/admin/login");
  const entries = await repo.listAudit(300).catch(() => []);

  return (
    <StaffShell title="Activity Log" sub="Who did what, when." active="/admin">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>
      <h1 className="mb-1 mt-4 font-display text-[26px] font-semibold">Activity Log</h1>
      <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink/65">
        An append-only record of accepts, rejects, credential changes, client
        matches and certificate downloads — the trail a complaint or audit asks
        for. Staff actions show as &ldquo;staff&rdquo; until per-person sign-in is added.
      </p>

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-8 text-center text-[13px] text-ink/50">
          Nothing logged yet.
        </p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full border-collapse">
            <thead className="border-b border-rule bg-wash">
              <tr>
                <th className="th w-[180px]">When</th>
                <th className="th w-[150px]">Action</th>
                <th className="th">Detail</th>
                <th className="th w-[110px]">By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="td text-[12.5px] text-ink/55">{when(e.at)}</td>
                  <td className="td text-[13px] font-medium">{LABELS[e.action] || e.action}</td>
                  <td className="td text-[13px] text-ink/70">
                    {e.target}{e.detail ? <span className="text-ink/45"> · {e.detail}</span> : null}
                  </td>
                  <td className="td text-[12.5px] text-ink/55">{e.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StaffShell>
  );
}
