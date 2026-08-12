import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { env } from "@/lib/env";
import { businessDaysSince, isClientVisible, jobBucket } from "@/lib/core.mjs";
import { StaffShell } from "@/components/StaffShell";

export const dynamic = "force-dynamic";

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <div className="font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-ink/60">{label}</div>
      <div className="mt-1 font-display text-[28px] font-semibold">{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-ink/60">{sub}</div>}
    </div>
  );
}

export default async function Reports() {
  if (!(await isStaff())) redirect("/admin/login");

  const [jobs, companies] = await Promise.all([repo.listAllJobs(), repo.listCompanies()]);
  const names: Record<string, string> = {};
  for (const c of companies) names[c.id] = c.name;

  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);

  // Turnaround needs BOTH ends of the clock; the plain issued counts need
  // only issuedAt — requiring receivedAt there undercounted any job whose
  // received date never synced (and zeroed the demo seed).
  const issuedOnly = jobs.filter((j) => j.issuedAt);
  const issued = jobs.filter((j) => j.issuedAt && j.receivedAt);
  const recentIssued = issued.filter((j) => new Date(j.issuedAt as string) >= daysAgo(90));
  const turnarounds = recentIssued
    .map((j) => businessDaysSince(j.receivedAt as string, new Date(j.issuedAt as string)))
    .filter((n): n is number => n !== null && n >= 0);
  const med = median(turnarounds);
  const avg = turnarounds.length
    ? Math.round((turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) * 10) / 10
    : null;

  const issuedIn = (n: number) => issuedOnly.filter((j) => new Date(j.issuedAt as string) >= daysAgo(n)).length;

  // Active jobs by client.
  const visible = jobs.map(repo.toPortalJob).filter(isClientVisible);
  const activeByCompany: Record<string, number> = {};
  for (const j of visible) {
    if (jobBucket(j, now, env.retentionMonths) === "downloaded") continue;
    if ((j.mondayStatus as string) === "Issued") continue;
    const id = (j as { companyId: string }).companyId;
    activeByCompany[id] = (activeByCompany[id] || 0) + 1;
  }
  const topClients = Object.entries(activeByCompany)
    .sort((a, b) => b[1] - a[1]).slice(0, 12);

  const published = String(env.turnaroundDays);

  return (
    <StaffShell title="Reports" sub="Throughput and turnaround." active="/admin">
      <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>
      <p className="mb-6 mt-4 max-w-2xl text-[14px] leading-relaxed text-ink/65">
        From the jobs mirrored off the board. Turnaround is business days from the
        card being created to the certificate being issued.
      </p>

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Issued (30 Days)" value={String(issuedIn(30))} />
        <Stat label="Issued (90 Days)" value={String(issuedIn(90))} />
        <Stat label="Median Turnaround" value={med !== null ? `${med} days` : "—"}
          sub={`over ${turnarounds.length} jobs, last 90 days`} />
        <Stat label="You Publish" value={`${published} days`}
          sub={avg !== null ? `actual average ${avg}` : "no data yet"} />
      </div>

      {med !== null && published && (
        <div className={`mb-8 rounded-lg border px-4 py-3 text-[13px] ${
          med <= Number(String(published).split("-").pop())
            ? "border-seal/30 bg-[#EDF3EE] text-seal"
            : "border-brass/40 bg-[#FBF4E6] text-brass"}`}>
          {med <= Number(String(published).split("-").pop())
            ? `On track — median turnaround (${med} days) is within the ${published} days you publish.`
            : `Heads up — median turnaround (${med} days) is above the ${published} days you publish. Consider revising the published figure or the process.`}
        </div>
      )}

      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="font-display text-[12px] font-semibold uppercase tracking-[0.14em] text-ink/65">
          Busiest Clients (Active Jobs)
        </h2>
        <span className="h-px flex-1 bg-rule" />
      </div>
      {topClients.length === 0 ? (
        <p className="text-[13px] text-ink/60">No active jobs.</p>
      ) : (
        <div className="card divide-y divide-rule">
          {topClients.map(([id, n]) => (
            <div key={id} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
              <span className="font-medium">{names[id] || id}</span>
              <span className="font-mono text-ink/60">{n}</span>
            </div>
          ))}
        </div>
      )}
    </StaffShell>
  );
}
