// Amendments.
//
// A client changing their mind, or a council asking them to change something.
// The work is small — check it's acceptable, watermark the new drawings,
// re-issue the certificate — and it used to happen entirely by email.
//
// The portal now takes the lodgement, so the client has one place to send
// things and one place to get them back. Everything else stays as it was:
//
//   1. Client lodges the amendment with their reason and the new documents.
//   2. It does NOT open a Monday card. One line goes on the ORIGINAL card so
//      the job's history stays complete, and that's all the board sees.
//   3. An email goes to whoever certified the original, with the office copied.
//   4. They reply "yes" to the office. No system, no button — same as today.
//   5. The office uploads the revised certificate back through /admin, and the
//      client is emailed and can download it.
//
// The one thing added on top of the old email process is that the portal keeps
// a record. That costs nobody anything — lodging creates it — and it means the
// evening report can notice an amendment nobody has answered, which an inbox
// cannot.

import * as repo from "./repo";
import * as monday from "./monday";
import { env } from "./env";
import {
  sendMail, amendmentEmail, amendmentReadyEmail, fitAttachments,
  type MailAttachment,
} from "./mail";
import {
  routeAmendment, routeExplanation, AMENDMENT_OPEN, AMENDMENT_DONE, REVISED,
} from "./core.mjs";

export { AMENDMENT_OPEN, AMENDMENT_DONE, REVISED };

const SETTING = "amendments";

export interface AmendmentRoute { name: string; email: string }

export interface AmendmentConfig {
  /** Who amendments can be routed to, matched against Certified By. */
  routes: AmendmentRoute[];
  /** Where an unallocated job's amendment goes. */
  fallbackName: string;
}

export const EMPTY_AMENDMENTS: AmendmentConfig = { routes: [], fallbackName: "" };

function normalise(raw: unknown): AmendmentConfig {
  const r = (raw || {}) as Partial<AmendmentConfig>;
  const routes = (Array.isArray(r.routes) ? r.routes : [])
    .map((x) => ({ name: String(x?.name || "").trim(), email: String(x?.email || "").trim() }))
    .filter((x) => x.name && x.email);
  return { routes, fallbackName: String(r.fallbackName || "").trim() };
}

export async function getAmendmentConfig(): Promise<AmendmentConfig> {
  try {
    return normalise(await repo.getSetting<AmendmentConfig>(SETTING));
  } catch {
    return { ...EMPTY_AMENDMENTS, routes: [] };
  }
}

export async function setAmendmentConfig(next: AmendmentConfig): Promise<void> {
  await repo.setSetting(SETTING, normalise(next));
}

/** Read a submission's files back out of storage so they ride on the email.
 *  Best effort: a file that won't read is named but not attached, and the
 *  email still goes — it's far too important to lose over an attachment. */
async function loadFiles(id: string, files: { name: string }[]): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const f of files) {
    try {
      const bytes = await repo.readFile(`submissions/${id}/${f.name}`);
      if (bytes.length) out.push({ name: f.name, contentType: "application/pdf", bytes });
    } catch (e) {
      console.warn(`amendment ${id}: couldn't attach ${f.name}:`, (e as Error).message);
    }
  }
  return out;
}

export interface LodgeResult {
  /** Who it was sent to, and why they were chosen. */
  to: string;
  why: string;
  emailed: boolean;
  /** True when the original card carries the note. */
  noted: boolean;
}

/**
 * Everything that happens after an amendment is lodged.
 *
 * Never throws. The submission is already saved before this runs, so a failure
 * here costs a notification, not the client's lodgement — and the record it
 * leaves behind is exactly what the evening report reads to notice that the
 * notification didn't happen.
 */
export async function lodgeAmendment(id: string): Promise<LodgeResult> {
  const blank: LodgeResult = { to: "", why: "", emailed: false, noted: false };
  try {
    const sub = await repo.getSubmission(id);
    if (!sub || !sub.amendmentOf) return blank;

    const [company, parent, cfg] = await Promise.all([
      repo.companyById(sub.companyId).catch(() => null),
      repo.getJob(sub.amendmentOf).catch(() => null),
      getAmendmentConfig(),
    ]);

    // The card, which is NOT the same as the portal job. A job invoiced before
    // the portal existed was never synced, so there's no job row to read the
    // item id from — and that's the ordinary case for an amendment, not the
    // exception. Fall back to finding it on the board by reference, or routing
    // and the card note would both silently do nothing.
    let itemId = parent?.mondayItemId || null;
    let cardAddress = parent?.address || "";
    if (!itemId) {
      const [card] = await monday.findByRef(sub.amendmentOf).catch(() => []);
      if (card) { itemId = card.itemId; cardAddress = cardAddress || card.address; }
    }

    // Straight off the board, so it's who signed it as at today.
    const certified = itemId ? await monday.certifiedBy(itemId) : "";
    const route = routeAmendment(certified, cfg.routes, cfg.fallbackName);
    const why = routeExplanation(route, certified);

    // --- one line on the ORIGINAL card ------------------------------------
    // No new card: an amendment on the board looks like an assessment and sits
    // there for days. But the original's history should still say this
    // happened, or a differently dated certificate is unexplainable later.
    let noted = false;
    if (itemId) {
      try {
        await monday.postUpdate(
          itemId,
          `AMENDMENT lodged via the client portal — handled by email, not on the board.\n\n` +
          `Client: ${company?.name || sub.companyId}\n` +
          `Reason: ${sub.description || "(none given)"}\n` +
          (sub.files.filter((f) => f.category !== REVISED).length
            ? `New documents: ${sub.files.filter((f) => f.category !== REVISED).map((f) => f.name).join(", ")}\n` : "") +
          `Sent to: ${route.email || "nobody — see the portal"}\n` +
          `This certificate is unchanged until a revised one is issued.`
        );
        noted = true;
      } catch (e) {
        console.warn(`amendment ${id}: couldn't note the original card:`, (e as Error).message);
      }
    }

    // --- the email that actually does the work -----------------------------
    let emailed = false;
    if (route.email) {
      try {
        const lodged = sub.files.filter((f) => f.category !== REVISED);
        const { attach, tooBig } = fitAttachments(await loadFiles(id, lodged));
        const mail = amendmentEmail({
          companyName: company?.name || sub.companyId,
          parentRef: sub.amendmentOf,
          address: cardAddress || sub.address,
          reason: sub.description,
          notes: sub.notes,
          fileNames: lodged.map((f) => f.name),
          attachedNames: attach.map((a) => a.name),
          tooBigNames: tooBig,
          routedWhy: why,
          url: `${env.appUrl}/admin/amendments`,
        });
        const cc = env.officeEmail && env.officeEmail !== route.email ? [env.officeEmail] : [];
        emailed = await sendMail([route.email, ...cc], mail.subject, mail.html, attach);
      } catch (e) {
        console.warn(`amendment ${id}: the email didn't send:`, (e as Error).message);
      }
    }

    // What happened is recorded on the submission, so /admin and the evening
    // report can both see it without re-deriving anything.
    await repo.setSubmission(id, {
      reviewNote: `${why}${emailed ? "" : " The email did NOT send."}`,
    }).catch(() => {});

    return { to: route.email, why, emailed, noted };
  } catch (e) {
    console.error(`amendment ${id}: post-lodgement handling failed:`, e);
    return blank;
  }
}

/**
 * The revised certificate going back to the client.
 *
 * The files are uploaded through /admin rather than collected from SharePoint,
 * because with no Monday card there's nothing for the sync to find. That's the
 * one genuinely new action this process asks of anybody.
 */
export async function issueAmendment(
  id: string, files: { name: string }[]
): Promise<{ ok: boolean; emailed: boolean; why?: string }> {
  const sub = await repo.getSubmission(id);
  if (!sub || !sub.amendmentOf) return { ok: false, emailed: false, why: "No such amendment." };
  if (!files.length) return { ok: false, emailed: false, why: "Nothing to send." };

  const [company, parent] = await Promise.all([
    repo.companyById(sub.companyId).catch(() => null),
    repo.getJob(sub.amendmentOf).catch(() => null),
  ]);

  // Keep what the client sent. Replacing files wholesale destroyed the record
  // of what was actually asked for — and left the resend reading the revised
  // certificate out of the lodgement folder, where it isn't.
  const kept = sub.files.filter((f) => f.category !== REVISED);
  await repo.setSubmission(id, {
    status: AMENDMENT_DONE,
    files: [...kept, ...files.map((f) => ({ name: f.name, category: REVISED }))],
  });

  let emailed = false;
  const to = (company?.emails || []).filter(Boolean);
  if (to.length) {
    try {
      const mail = amendmentReadyEmail({
        companyName: company?.name || "",
        parentRef: sub.amendmentOf,
        address: parent?.address || sub.address,
        fileNames: files.map((f) => f.name),
        url: parent
          ? `${env.appUrl}/jobs/${encodeURIComponent(sub.amendmentOf)}`
          : `${env.appUrl}/amend`,
      });
      emailed = await sendMail(to, mail.subject, mail.html);
    } catch (e) {
      console.warn(`amendment ${id}: the client email didn't send:`, (e as Error).message);
    }
  }

  // And the original card learns that a revised certificate exists — the same
  // reason the lodgement note is there. Resolved by reference when the job
  // predates the portal, which is most of them.
  let itemId = parent?.mondayItemId || null;
  if (!itemId) {
    const [card] = await monday.findByRef(sub.amendmentOf).catch(() => []);
    itemId = card?.itemId || null;
  }
  if (itemId) {
    try {
      await monday.postUpdate(
        itemId,
        `A revised certificate has been issued for the amendment and sent to the ` +
        `client through the portal: ${files.map((f) => f.name).join(", ")}.`
      );
    } catch { /* the client has it either way */ }
  }

  return { ok: true, emailed };
}

/** Amendments still waiting on somebody. */
export async function listOpenAmendments(): Promise<repo.Submission[]> {
  return repo.listSubmissions(AMENDMENT_OPEN).catch(() => []);
}
