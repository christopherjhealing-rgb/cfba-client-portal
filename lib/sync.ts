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
import { sendMail, updateEmail, issuedEmail } from "./mail";
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
  /** Cards set to Issued whose SharePoint folder had no files yet — the
      certificate isn't downloadable and no email has gone. Flip visible in
      /admin so "I set it to Issued, did it work?" answers itself. */
  issuedNoFiles: string[];
  /** Issued cards whose folder changed in the last few minutes — OneDrive
      still syncing; pulled automatically once the folder goes quiet. */
  stillSyncing: string[];
  emailsSent: number;
  emailFails: string[];
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
    issuedNoFiles: [], stillSyncing: [], emailsSent: 0, emailFails: [],
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
      // issuedAt is stamped below, only once files exist — flipping the card
      // to Issued before the folder is filled must not burn the one-shot
      // email trigger.
      issuedAt: existing?.issuedAt || null,
      receivedAt: existing?.receivedAt || card.createdAt || null,
      firstDownloadedAt: existing?.firstDownloadedAt || null,
      lastSyncedAt: now, storagePrefix: `issued/${card.ref}`,
      sourceFolder: existing?.sourceFolder || null,
    };

    let files: repo.JobFile[] = await repo.jobFiles(card.ref);
    let settling = false;
    // Pull from SharePoint only if we don't already have the files cached.
    if (files.length === 0 && GRAPH_READY) {
      const remote = await graph.findIssuedFiles(card.ref);
      // OneDrive uploads a folder file-by-file, so a listing taken mid-sync
      // can be incomplete. If anything in the folder changed within the last
      // few minutes, wait a cycle rather than deliver (and email) half a
      // certificate package. Old, untouched folders pull immediately.
      const SETTLE_MS = 5 * 60 * 1000;
      settling = remote.some((rf) =>
        rf.lastModified && Date.now() - new Date(rf.lastModified).getTime() < SETTLE_MS);
      if (settling) {
        res.stillSyncing.push(card.ref);
      } else {
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
    }
    if (files.length === 0 && !settling) res.issuedNoFiles.push(card.ref);
    if (files.length > 0 && !job.issuedAt) job.issuedAt = now;
    await repo.upsertJob(job, files);
    res.jobsUpserted++;

    // Certificate-ready email — the one the Help page promises. Fires only on
    // the transition INTO issued: `existing && !existing.issuedAt` means we've
    // seen this job before but never recorded it as issued. A job first seen
    // already-issued (the pre-existing backlog) has existing === null, so the
    // first sync after go-live never blasts old jobs. issuedAt is set on this
    // upsert and preserved thereafter, so it never re-sends.
    const isNewIssue = existing && !existing.issuedAt && files.length > 0;
    if (isNewIssue) {
      try {
        const company = await repo.companyById(companyId);
        if (company?.emails?.length) {
          const mail = issuedEmail({ ref: card.ref, address: card.address });
          await sendMail(company.emails, mail.subject, mail.html);
          res.emailsSent++;
        } else {
          res.emailFails.push(`${card.ref} — no email recorded on the client`);
        }
      } catch (e) {
        res.emailFails.push(`${card.ref} — ${(e as Error).message}`);
        console.warn(`sync: could not send issued email for ${card.ref}:`, (e as Error).message);
      }
    }
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
      receivedAt: existing?.receivedAt || card.createdAt || null,
      firstDownloadedAt: existing?.firstDownloadedAt || null,
      lastSyncedAt: now, storagePrefix: existing?.storagePrefix || `issued/${card.ref}`,
      sourceFolder: existing?.sourceFolder || null,
    }, await repo.jobFiles(card.ref));
    res.jobsUpserted++;
  }

  // 3. Client-visible updates -> messages
  res.messagesPulled = await pullMessages(active, companies);

  // 4. Retention. We tell clients the download stays available for a set
  //    window; that has to be true, not just hidden from the UI.
  res.filesPurged = await purgeExpired();

  // Persist a health record so /admin can show sync freshness and the list of
  // Monday cards that matched no client (otherwise invisible: their jobs never
  // appear and their messages never deliver).
  try {
    await repo.setSetting("last_sync", {
      at: now, ok: true,
      issuedSeen: res.issuedSeen, filesCopied: res.filesCopied,
      jobsUpserted: res.jobsUpserted, messagesPulled: res.messagesPulled,
      filesPurged: res.filesPurged, unmatched: res.unmatched,
      issuedNoFiles: res.issuedNoFiles, stillSyncing: res.stillSyncing,
      emailsSent: res.emailsSent, emailFails: res.emailFails,
    });
  } catch (e) {
    console.warn("sync: could not persist health record:", (e as Error).message);
  }

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
      await repo.purgeJobFiles(job.ref, job.storagePrefix || `issued/${job.ref}`);
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
