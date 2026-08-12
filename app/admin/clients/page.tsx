import Link from "next/link";
import { redirect } from "next/navigation";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { StaffShell } from "@/components/StaffShell";
import { LoginManager } from "@/components/LoginManager";
import { DeleteClient } from "@/components/DeleteClient";
import { AddClient } from "@/components/AddClient";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  if (!(await isStaff())) redirect("/admin/login");

  const [companies, logins, lastSync] = await Promise.all([
    repo.listCompanies(),
    repo.listLogins(),
    repo.getSetting<{ unmatched?: { client: string }[] }>("last_sync").catch(() => null),
  ]);
  const unmatchedCount = new Set((lastSync?.unmatched || []).map((u) => u.client)).size;
  const byCompany: Record<string, repo.Login[]> = {};
  for (const l of logins) (byCompany[l.companyId] ||= []).push(l);

  const jobCounts: Record<string, number> = {};
  for (const c of companies) {
    jobCounts[c.id] = (await repo.listJobsForCompany(c.id)).length;
  }

  return (
    <StaffShell title="Clients" sub="Every company with a portal login." active="/admin/clients">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href="/admin" className="text-[13px] text-seal underline">← Back to Admin</Link>
          <Link
            href="/admin/unmatched"
            className={`text-[13px] underline ${unmatchedCount > 0 ? "font-semibold text-flag" : "text-seal"}`}
          >
            Unmatched Monday clients{unmatchedCount > 0 ? ` (${unmatchedCount})` : ""} →
          </Link>
        </div>
        <p className="eyebrow mt-4">Clients</p>
        <h1 className="mb-1 mt-1 font-display text-[26px] font-semibold">Clients &amp; Logins</h1>
        <p className="mb-6 max-w-2xl text-[14px] leading-relaxed text-ink/65">
          Issue a username to each major client, then give them the one-time setup
          code — they choose their own password. Open a client to check the jobs
          and files their portal is showing.
        </p>

        <AddClient />

        {companies.length === 0 && (
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink/65">
            No clients yet. Sync only attaches Monday jobs to clients listed
            here — add your first client above, then run a sync.
          </p>
        )}

        <div className="space-y-3">
          {companies.map((c) => {
            const ls = byCompany[c.id] || [];
            return (
              <div key={c.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{c.name}</span>
                      {c.isTest && <span className="chip">Test</span>}
                    </div>
                    <div className="mt-1 text-[12px] text-ink/60">
                      {jobCounts[c.id]} job{jobCounts[c.id] === 1 ? "" : "s"}
                      {c.emails.length > 0 && <> · {c.emails.join(", ")}</>}
                    </div>
                    {ls.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {ls.map((l) => (
                          <li key={l.username} className="text-[13px]">
                            <span className="font-mono font-semibold">{l.username}</span>
                            {l.disabled ? (
                              <span className="ml-2 text-flag">disabled</span>
                            ) : l.mustSetPassword ? (
                              <span className="ml-2 text-brass">awaiting first sign-in</span>
                            ) : (
                              <span className="ml-2 text-ink/60">
                                active{l.lastLoginAt
                                  ? ` · last in ${new Date(l.lastLoginAt).toLocaleDateString("en-AU")}`
                                  : ""}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Link href={`/admin/clients/${c.id}`} className="btn-ghost">Check Folders</Link>
                    <form action="/api/admin/impersonate" method="post">
                      <input type="hidden" name="companyId" value={c.id} />
                      <button className="btn-ghost">View as Client</button>
                    </form>
                  </div>
                </div>
                <LoginManager companyId={c.id} companyName={c.name} existing={ls.map((l) => l.username)}
                  defaultEmail={c.emails[0] || ""} />
                <DeleteClient companyId={c.id} companyName={c.name} />
              </div>
            );
          })}
        </div>
      </StaffShell>
  );
}
