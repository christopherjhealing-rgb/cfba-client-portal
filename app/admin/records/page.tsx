import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import { StaffShell } from "@/components/StaffShell";
import * as repo from "@/lib/repo";
import { ISSUED_STATUSES, CANCELLED_STATUS } from "@/lib/core.mjs";
import { dateOnly } from "@/lib/records.mjs";
import { RecordTestSend } from "@/components/RecordTestSend";

export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "finished", label: "Finished" },
  { key: "running", label: "Still running" },
  { key: "all", label: "All" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/**
 * Correspondence records.
 *
 * A building surveyor keeps a copy of the correspondence on a job for seven
 * years. The portal has held it all along — every message both ways, with
 * whatever the client attached — but a record that only exists inside a web
 * app isn't a record anybody can produce in five years. This is the way out:
 * one job, one zip, filed wherever the office files things.
 *
 * It leads with finished jobs because that's when a record gets filed, but it
 * doesn't hide the running ones — a job that goes quiet for a year and is
 * never marked complete still has correspondence somebody may need.
 */
export default async function Records({
  searchParams,
}: { searchParams: Promise<{ show?: string; q?: string }> }) {
  if (!(await isStaff())) redirect("/admin/login");
  const sp = await searchParams;
  const show = (FILTERS.find((f) => f.key === sp.show)?.key || "finished") as FilterKey;
  const q = (sp.q || "").trim().toLowerCase();

  const [jobs, companies] = await Promise.all([
    repo.listAllJobs(),
    repo.listCompanies().catch(() => []),
  ]);
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));

  // One read of the message store, counted by ref. Asking per job would be
  // hundreds of round trips to render one page.
  const counts = new Map<string, { n: number; last: string }>();
  for (const c of companies) {
    for (const m of await repo.listMessagesForCompany(c.id).catch(() => [])) {
      const cur = counts.get(m.ref);
      if (!cur) counts.set(m.ref, { n: 1, last: m.createdAt });
      else { cur.n++; if (m.createdAt > cur.last) cur.last = m.createdAt; }
    }
  }

  const finished = (j: repo.Job) =>
    ISSUED_STATUSES.has(j.mondayStatus as string) ||
    j.mondayStatus === CANCELLED_STATUS || !!j.firstDownloadedAt;

  const rows = jobs
    .filter((j) => (counts.get(j.ref)?.n || 0) > 0)
    .filter((j) => show === "all" || (show === "finished" ? finished(j) : !finished(j)))
    .filter((j) => !q ||
      `${j.ref} ${j.address || ""} ${nameOf.get(j.companyId) || ""}`.toLowerCase().includes(q))
    .sort((a, b) => (counts.get(b.ref)?.last || "").localeCompare(counts.get(a.ref)?.last || ""));

  const withMsgs = jobs.filter((j) => (counts.get(j.ref)?.n || 0) > 0);
  const count = (k: FilterKey) => k === "all" ? withMsgs.length
    : k === "finished" ? withMsgs.filter(finished).length
    : withMsgs.filter((j) => !finished(j)).length;

  return (
    <StaffShell
      title="Correspondence Records"
      sub="Every message on a job, as one zip you can file."
      active="/admin/records"
    >
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>

      <div className="card mt-4 mb-5 p-4">
        <p className="text-[13px] leading-relaxed text-ink/70">
          Each export is a zip holding a dated{" "}
          <strong>transcript of the whole thread</strong>{" "}
          as a PDF, the same words as a plain text file, and every
          document the client attached. The transcript says on its face what it
          contains and what it doesn&apos;t — it can only carry what came through
          the portal, so anything settled by email or over the phone has to be
          filed from wherever it lives.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <form className="flex-1 min-w-[200px]" action="/admin/records" method="get">
          {show !== "finished" && <input type="hidden" name="show" value={show} />}
          <input name="q" defaultValue={sp.q || ""} className="field h-9 py-1 text-[14px]"
            placeholder="Search job no., address or client…" />
        </form>
      </div>

      <div className="mb-5 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link key={f.key}
            href={f.key === "finished" ? "/admin/records" : `/admin/records?show=${f.key}`}
            className={`rounded-md border px-3 py-1.5 font-display text-[11px] font-semibold uppercase tracking-[0.07em] transition ${
              show === f.key ? "border-seal bg-seal text-white"
                : "border-rule bg-white text-ink/65 hover:bg-wash"}`}>
            {f.label}
            <span className={`ml-1.5 font-mono ${show === f.key ? "text-white/70" : "text-ink/60"}`}>
              {count(f.key)}
            </span>
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="font-display text-[15px] font-semibold">Nothing to file</p>
          <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink/60">
            No job in this filter has had a message through the portal. A job only
            appears here once something has been sent or received on it.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse">
              <thead className="border-b border-rule bg-wash">
                <tr>
                  <th className="th w-[110px]">Job No.</th>
                  <th className="th">Site</th>
                  <th className="th w-[190px]">Client</th>
                  <th className="th w-[150px]">Status</th>
                  <th className="th w-[90px] text-right">Messages</th>
                  <th className="th w-[250px] text-right">Export</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {rows.map((j) => {
                  const c = counts.get(j.ref)!;
                  return (
                    <tr key={j.ref}>
                      <td className="td font-mono text-[12px] text-ink/60">{j.ref}</td>
                      <td className="td">
                        <div className="font-medium text-ink">{j.address || "—"}</div>
                        <div className="mt-0.5 text-[12.5px] text-ink/60">
                          Last message {dateOnly(c.last)}
                        </div>
                      </td>
                      <td className="td text-[13px] text-ink/70">
                        {nameOf.get(j.companyId) || "—"}
                      </td>
                      <td className="td">
                        <span className={`chip ${finished(j) ? "chip-seal" : ""}`}>
                          {j.mondayStatus || "—"}
                        </span>
                      </td>
                      <td className="td text-right font-mono text-[13px] text-ink/70">{c.n}</td>
                      <td className="td">
                        <div className="flex flex-col items-end gap-1.5">
                          <div className="flex justify-end gap-2">
                            <a className="btn-ghost whitespace-nowrap"
                              href={`/api/admin/records/${encodeURIComponent(j.ref)}`}>
                              Download
                            </a>
                            <RecordTestSend refNo={j.ref} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </StaffShell>
  );
}
