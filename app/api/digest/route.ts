import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { env } from "@/lib/env";
import { sendMail, digestEmail } from "@/lib/mail";
import {
  isClientVisible, needsClientInfo, clientStatusLabel, jobBucket,
} from "@/lib/core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("authorization") || "") === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!(await isStaff()) && !cronAuthorised(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  if (!env.digestEnabled) {
    return NextResponse.json({ skipped: "DIGEST_ENABLED is not set." });
  }

  const [companies, allJobs] = await Promise.all([
    repo.listCompanies(),
    repo.listAllJobs(),
  ]);
  const byCompany = new Map<string, ReturnType<typeof repo.toPortalJob>[]>();
  for (const j of allJobs) {
    const p = repo.toPortalJob(j);
    if (!isClientVisible(p)) continue;
    if (jobBucket(p, new Date(), env.retentionMonths) === "downloaded") continue; // finished
    let arr = byCompany.get(j.companyId);
    if (!arr) { arr = []; byCompany.set(j.companyId, arr); }
    arr.push(p);
  }

  let sent = 0;
  for (const c of companies) {
    if (!c.emails?.length) continue;
    const jobs = byCompany.get(c.id) || [];
    if (!jobs.length) continue;
    const line = (p: ReturnType<typeof repo.toPortalJob>) => ({
      ref: String(p.ref), address: String(p.address || ""),
      status: clientStatusLabel(p.mondayStatus as string, p.fileCount as number),
    });
    const waiting = jobs.filter((p) => needsClientInfo(p)).map(line);
    const active = jobs.filter((p) => !needsClientInfo(p)).map(line);
    try {
      const mail = digestEmail({ companyName: c.name, waiting, active });
      if (await sendMail(c.emails, mail.subject, mail.html)) sent++;
    } catch (e) {
      console.warn(`digest: failed for ${c.name}:`, (e as Error).message);
    }
  }

  return NextResponse.json({ ok: true, companies: companies.length, sent });
}

export const POST = handle;
export const GET = handle; // Vercel Cron issues GET
