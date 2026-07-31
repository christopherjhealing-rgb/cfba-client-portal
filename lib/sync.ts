// The bridge. Run on a schedule (Vercel Cron) or on demand from the admin page.
//
//   1. Every card at "Issued" -> pull its Issued folder from SharePoint via
//      Graph, copy each file into Supabase Storage, and cache the job so the
//      client can download it. Runs AFTER "Issued" is clicked, so it captures
//      the final reviewed files, not the auto-generated draft.
//   2. Active cards -> refresh their status so the in-progress view is current.
//
// Idempotent and additive: a job already downloaded is never dropped, even once
// Monday later moves it to Invoiced / Completed.
import { DEMO_MODE, MONDAY_READY, GRAPH_READY, env } from "./env";
import { matchCompany, READY_STATUS, CLIENT_ACTION_STATUSES, retention } from "./core.mjs";
import * as monday from "./monday";
import { sendMail, updateEmail } from "./mail";
import * as graph from "./graph";
import * as repo from "./repo";

export interface SyncResult {
  ok: boolean;
  demo: boolean;
  issuedSeen: number;
  filesCopied: number;
  jobsUpserted: number;
  messagesPulled: number;
  filesPurged: number;
  unmatched: { ref: string; client: string }[];
  note?: string;
}

// A message reaches the client only when the update starts with one of these
// prefixes (case-insensitive). Everything else on the card stays internal,
// which is what makes the Updates section safe to keep using normally.
// NOTE: this means an internal note that happens to open with "FIR:" WILL be
// delivered and emailed to the client — the prefix is the whole switch.
export const CLIENT_PREFIXES = ["FIR:", "CLIENT:"];

// Every active card's conversation is scanned, so a prefixed update reaches
// the client whatever the card's status. listUpdates batches 25 cards per
// query, so a few hundred active cards costs a dozen queries per sync.

export async function runSync(): Promise<SyncResult> {
  const res: SyncResult = {
    ok: true, demo: DEMO_MODE, issuedSeen: 0, filesCopied: 0,
    jobsUpserted: 0, messagesPulled: 0, filesPurged: 0, unmatched: [],
  };

  if (!MONDAY_READY) {
    res.note = "MONDAY_TOKEN not set — nothing to pull. Demo data is already loaded.";
    return res;
  }

  const companies = await repo.companiesForMatch();
  const now = new Date().toISOString();

  // 1. Issued -> copy files
  const issued = await monday.listByStatus(READY_STATUS);
  res.issuedSeen = issued.length;
  for (const card of issued) {
    const companyId = matchCompany({ clientName: card.clientName, email: card.email }, companies);
    if (!companyId) { res.unmatched.push({ ref: card.ref, client: card.clientName }); continue; }

    const existing = await repo.getJob(card.ref);
    const job: repo.Job = {
      ref: card.ref, companyId, mondayItemId: card.itemId,
      address: card.address, description: card.description,
      mondayStatus: card.status, fileCount: existing?.fileCount || 0,
      issuedAt: existing?.issuedAt || now, firstDownloadedAt: existing?.firstDownloadedAt || null,
      lastSyncedAt: now, storagePrefix: `issued/${card.ref}`,
      sourceFolder: existing?.sourceFolder || null,
    };

    let files: repo.JobFile[] = await repo.jobFiles(card.ref);
    // Pull from SharePoint only if we don't already have the files cached.
    if (files.length === 0 && GRAPH_READY) {
      const remote = await graph.findIssuedFiles(card.ref);
      if (remote.length > 0 && remote[0].folderPath) job.sourceFolder = remote[0].folderPath;
      files = [];
      for (const rf of remote) {
        const bytes = await graph.downloadFile(rf);
        const storagePath = `${job.storagePrefix}/${rf.name}`;
        await repo.writeFile(storagePath, bytes, rf.contentType);
        files.push({ filename: rf.name, size: rf.size || bytes.length, storagePath, contentType: rf.contentType });
        res.filesCopied++;
      }
    }
    await repo.upsertJob(job, files);
    res.jobsUpserted++;
  }

  // 2. Active cards -> refresh status (cheap; keeps the in-progress view live)
  const active = await monday.listActive();
  for (const card of active) {
    const companyId = matchCompany({ clientName: card.clientName, email: card.email }, companies);
    if (!companyId) continue;
    const existing = await repo.getJob(card.ref);
    if (card.status === READY_STATUS) continue; // handled above
    await repo.upsertJob({
      ref: card.ref, companyId, mondayItemId: card.itemId,
      address: card.address, description: card.description, mondayStatus: card.status,
      fileCount: existing?.fileCount || 0, issuedAt: existing?.issuedAt || null,
      firstDownloadedAt: existing?.firstDownloadedAt || null,
      lastSyncedAt: now, storagePrefix: existing?.storagePrefix || `issued/${card.ref}`,
      sourceFolder: existing?.sourceFolder || null,
    }, await repo.jobFiles(card.ref));
    res.jobsUpserted++;
  }

  // 3. Client-visible updates -> messages
  res.messagesPulled = await pullMessages(active, companies);

  // 4. Retention. We tell clients six months from first download; that has to
  //    be true, not just hidden from the UI.
  res.filesPurged = await purgeExpired();

  return res;
}

/** Delete stored files for jobs past their retention window. */
async function purgeExpired(): Promise<number> {
  const now = new Date();
  let purged = 0;
  for (const job of await repo.listAllJobs()) {
    if (!job.firstDownloadedAt || job.fileCount === 0) continue;
    const r = retention(job.firstDownloadedAt, now, env.retentionMonths);
    if (!r.expired) continue;
    try {
      await repo.purgeJobFiles(job.ref);
      purged++;
    } catch (e) {
      console.warn(`sync: could not purge ${job.ref}:`, (e as Error).message);
    }
  }
  return purged;
}

/** Mirror every "CLIENT:" update into the portal's message threads. */
async function pullMessages(
  active: monday.MondayCard[],
  companies: { id: string; aliasKeys?: string[]; emails?: string[] }[]
): Promise<number> {
  const byItem = new Map<string, { ref: string; companyId: string }>();
  for (const card of active) {
    const companyId = matchCompany(
      { clientName: card.clientName, email: card.email }, companies);
    if (!companyId) continue;
    byItem.set(card.itemId, { ref: card.ref, companyId });
  }
  if (byItem.size === 0) return 0;

  const seen = await repo.knownMondayUpdateIds();
  const updates = await monday.listUpdates([...byItem.keys()]);
  let n = 0;
  for (const u of updates) {
    if (seen.has(u.id)) continue;
    const text = u.text.trim();
    const prefix = CLIENT_PREFIXES.find((p) => text.toUpperCase().startsWith(p));
    if (!prefix) continue;
    const target = byItem.get(u.itemId);
    if (!target) continue;
    const body = text.slice(prefix.length).trim();
    await repo.addMessage({
      ref: target.ref, companyId: target.companyId, from: "cfba",
      body, createdAt: u.createdAt, mondayUpdateId: u.id, files: [],
    });
    n++;

    // Tell the client. A portal nobody is told about is a portal nobody reads,
    // so the message itself goes in the email body - they should not have to
    // log in to find out what we have asked for.
    try {
      const company = await repo.companyById(target.companyId);
      const job = await repo.getJob(target.ref);
      if (company?.emails?.length) {
        const mail = updateEmail({
          companyName: company.name,
          ref: target.ref,
          address: job?.address || "",
          body,
          needsAction: CLIENT_ACTION_STATUSES.has(job?.mondayStatus || ""),
        });
        await sendMail(company.emails, mail.subject, mail.html);
      }
    } catch (e) {
      console.warn(`sync: could not email ${target.ref}:`, (e as Error).message);
    }
  }
  return n;
}
