import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { clientStatusLabel, isClientVisible } from "@/lib/core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the signed-in company's jobs — whitelisted fields only, so builders'
 *  admins can reconcile in a spreadsheet. */
export async function GET() {
  const session = await getClientSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  const jobs = (await repo.listJobsForCompany(session.companyId))
    .map(repo.toPortalJob)
    .filter(isClientVisible);

  const header = ["Job no.", "Address", "Description", "Status", "Issued"];
  const rows = jobs.map((j) => [
    j.ref, j.address, j.description,
    clientStatusLabel(j.mondayStatus as string),
    j.issuedAt ? new Date(j.issuedAt as string).toLocaleDateString("en-AU") : "",
  ]);
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");

  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="CFBA jobs - ${session.companyName}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
