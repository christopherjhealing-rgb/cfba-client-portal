import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { isStaff } from "@/lib/session";
import { GRAPH_READY, env } from "@/lib/env";
import * as repo from "@/lib/repo";
import * as graph from "@/lib/graph";
import { clientStatusLabel, jobBucket, COLLECT_STATUS_SET } from "@/lib/core.mjs";
import { StaffShell } from "@/components/StaffShell";

export const dynamic = "force-dynamic";

function kb(n: number) {
  return n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}

export default async function ClientCheckPage({ params }: { params: { id: string } }) {
  if (!(await isStaff())) redirect("/admin/login");

  const company = await repo.companyById(params.id);
  if (!company) notFound();

  const jobs = await repo.listJobsForCompany(company.id);
  const rows = await Promise.all(
    jobs.map(async (j) => {
      const files = await repo.jobFiles(j.ref);
      // For issued jobs, ask SharePoint what it actually holds right now, so a
      // mismatch between the portal copy and the live folder is visible.
      let live: { name: string; size: number }[] | null = null;
      let liveError: string | null = null;
      if (GRAPH_READY && COLLECT_STATUS_SET.has(j.mondayStatus)) {
        try {
          live = (await graph.findIssuedFiles(j.ref)).map((f) => ({ name: f.name, size: f.size }));
        } catch (e) {
          liveError = (e as Error).message;
        }
      }
      return { job: j, files, live, liveError, bucket: jobBucket({ ...j }, new Date(), env.retentionMonths) };
    })
  );

  return (
    <StaffShell title="Client" sub="Logins, aliases and matched jobs." active="/admin/clients">
        <Link href="/admin/clients" className="text-[13px] text-seal underline">← All clients</Link>
        <div className="mb-6 mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Folder Check</p>
            <h1 className="mt-1 font-display text-[26px] font-semibold">{company.name}</h1>
            <p className="mt-1 text-[13px] text-ink/55">
              {jobs.length} job{jobs.length === 1 ? "" : "s"} matched to this client
              {!GRAPH_READY && " · SharePoint not connected, showing the portal's copy only"}
            </p>
          </div>
          <form action="/api/admin/impersonate" method="post">
            <input type="hidden" name="companyId" value={company.id} />
            <button className="btn">View as Client</button>
          </form>
        </div>

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-rule bg-wash px-4 py-10 text-center text-[13px] text-ink/50">
            No jobs are matched to this client yet. Run a sync from the admin page,
            or check the Client column on the Monday card matches this company.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map(({ job, files, live, liveError, bucket }) => {
              const liveNames = new Set((live || []).map((f) => f.name));
              const portalNames = new Set(files.map((f) => f.filename));
              const missingInPortal = (live || []).filter((f) => !portalNames.has(f.name));
              const extraInPortal = files.filter((f) => !liveNames.has(f.filename));
              const mismatch = live !== null && (missingInPortal.length > 0 || extraInPortal.length > 0);

              return (
                <div key={job.ref} className="card p-4">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-mono text-[12px] text-ink/45">{job.ref}</span>
                    <span className="font-medium">{job.address}</span>
                    <span className="chip">{job.mondayStatus || "no status"}</span>
                    <span className="text-[12px] text-ink/45">
                      client sees: “{clientStatusLabel(job.mondayStatus, job.fileCount)}” · {bucket.replace("_", " ")}
                    </span>
                  </div>

                  {job.sourceFolder && (
                    <div className="mt-2 break-all font-mono text-[11px] text-ink/45">
                      {env.clientFilesRoot}/{job.sourceFolder}
                    </div>
                  )}

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <div className="eyebrow mb-1.5">In the Portal ({files.length})</div>
                      {files.length === 0 ? (
                        <p className="text-[13px] text-ink/45">No files synced.</p>
                      ) : (
                        <ul className="space-y-1 text-[13px]">
                          {files.map((f) => (
                            <li key={f.filename} className="flex justify-between gap-3">
                              <span className="truncate">{f.filename}</span>
                              <span className="shrink-0 font-mono text-[11px] text-ink/45">{kb(f.size)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <div>
                      <div className="eyebrow mb-1.5">
                        In SharePoint {live ? `(${live.length})` : ""}
                      </div>
                      {liveError ? (
                        <p className="text-[13px] text-flag">Lookup failed: {liveError}</p>
                      ) : live === null ? (
                        <p className="text-[13px] text-ink/45">
                          {GRAPH_READY ? "Only checked for issued jobs." : "SharePoint not connected."}
                        </p>
                      ) : live.length === 0 ? (
                        <p className="text-[13px] text-brass">
                          No Issued folder found for ref {job.ref}. Check the folder name ends
                          in “- {job.ref}”.
                        </p>
                      ) : (
                        <ul className="space-y-1 text-[13px]">
                          {live.map((f) => (
                            <li key={f.name} className="flex justify-between gap-3">
                              <span className="truncate">{f.name}</span>
                              <span className="shrink-0 font-mono text-[11px] text-ink/45">{kb(f.size)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                  {mismatch && (
                    <div className="mt-3 rounded-sm border-l-[3px] border-brass bg-[#FBF6EA] px-3 py-2 text-[13px]">
                      {missingInPortal.length > 0 && (
                        <div>
                          Not yet in the portal: {missingInPortal.map((f) => f.name).join(", ")} — run a sync.
                        </div>
                      )}
                      {extraInPortal.length > 0 && (
                        <div>
                          In the portal but no longer in SharePoint:{" "}
                          {extraInPortal.map((f) => f.filename).join(", ")}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </StaffShell>
  );
}
