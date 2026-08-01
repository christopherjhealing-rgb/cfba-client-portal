// Accepting a submission: create the Monday card, post the context updates,
// and shuttle the lodged PDFs into the card's Files column. Used by the admin
// decision route and — while auto-accept is on — by lodgement itself.
import * as repo from "./repo";
import * as monday from "./monday";

export interface AcceptResult {
  mondayItemId: string;
  failedFiles: string[];
}

export async function acceptSubmission(
  sub: repo.Submission,
  reviewNote = ""
): Promise<AcceptResult> {
  const company = await repo.companyById(sub.companyId);
  // An amendment always opens its own card — the original keeps its
  // certificate and its history, and the new card carries the link back.
  const parent = sub.amendmentOf ? await repo.getJob(sub.amendmentOf) : null;

  const itemId = await monday.createCard({
    address: sub.address,
    clientName: company?.name || "",
    email: sub.email || company?.emails?.[0] || "",
    description: sub.amendmentOf
      ? `AMENDMENT to ${sub.amendmentOf} — ${sub.description}`
      : sub.description,
    jobClass: sub.jobClass,
  });

  // Stash the client's own reference against the card id — the sync copies it
  // onto the job row on first sight. Portal-only; never written to Monday.
  if (sub.clientRef) {
    try { await repo.setSetting(`clientref:${itemId}`, { ref: sub.clientRef }); }
    catch { /* a lost nicety must never block an accept */ }
  }

  if (sub.amendmentOf) {
    try {
      await monday.postUpdate(
        itemId,
        `Amendment lodged via the client portal.\n\n` +
        `Original job: ${sub.amendmentOf}` +
        (parent?.address ? ` — ${parent.address}` : "") + `\n` +
        `Change requested: ${sub.description}`
      );
      if (parent?.mondayItemId) {
        await monday.postUpdate(
          parent.mondayItemId,
          `The client has lodged an amendment to this job. It is being assessed ` +
          `separately on a new card. This certificate is unchanged.`
        );
      }
    } catch {
      // Non-fatal — the amendment card exists either way.
    }
  }

  // Post the client's note into the card's conversation, not onto a column.
  if (sub.notes && sub.notes.trim()) {
    try {
      await monday.postUpdate(
        itemId,
        `Note from client (lodged via portal):\n\n${sub.notes.trim()}`
      );
    } catch {
      // Non-fatal — the card still gets created even if the note fails to post.
    }
  }

  // The lodged documents go to the card's Files column — where the office
  // files everything else — plus a text record in the conversation listing
  // what arrived. The portal store keeps its copy either way.
  const failed: string[] = [];
  if (sub.files.length) {
    try {
      await monday.postUpdate(
        itemId,
        `Documents lodged via the client portal` +
          (sub.email ? ` (job contact: ${sub.email})` : "") + `:\n\n` +
          sub.files.map((f) => `• ${f.name}${f.category ? ` — ${f.category}` : ""}`).join("\n") +
          `\n\nThe files are in this card's Files column.`
      );
    } catch (e) {
      console.error("accept: could not post the documents update:", e);
    }
    for (const f of sub.files) {
      try {
        const bytes = await repo.readFile(`submissions/${sub.id}/${f.name}`);
        await monday.addFileToColumn(itemId, f.name, bytes, "application/pdf");
      } catch (e) {
        console.error(`accept: attaching ${f.name} failed:`, e);
        failed.push(f.name);
      }
    }
  }

  await repo.setSubmission(sub.id, {
    status: "accepted", mondayItemId: itemId, reviewNote,
  });

  return { mondayItemId: itemId, failedFiles: failed };
}
