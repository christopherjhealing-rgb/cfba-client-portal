import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Accepting shuttles the lodged PDFs from storage onto the Monday card;
// a full 40 MB drawing set needs more than the default window.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Staff-gated route, so the real reason is fine to show.
    console.error("decision failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function handle(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, decision, note } = await req.json().catch(() => ({}));
  const sub = await repo.getSubmission(String(id || ""));
  if (!sub) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  if (sub.status !== "pending") {
    return NextResponse.json({ error: "That submission has already been reviewed." }, { status: 409 });
  }

  if (decision === "reject") {
    await repo.setSubmission(sub.id, { status: "rejected", reviewNote: String(note || "") });
    return NextResponse.json({ ok: true });
  }

  if (decision !== "accept") {
    return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  }

  const company = await repo.companyById(sub.companyId);
  // An amendment always opens its own card — the original keeps its
  // certificate and its history, and the new card carries the link back.
  const parent = sub.amendmentOf
    ? await repo.getJob(sub.amendmentOf)
    : null;
  const itemId = await monday.createCard({
    address: sub.address,
    clientName: company?.name || "",
    email: sub.email || company?.emails?.[0] || "",
    description: sub.amendmentOf
      ? `AMENDMENT to ${sub.amendmentOf} — ${sub.description}`
      : sub.description,
    jobClass: sub.jobClass,
  });
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
  // Attach the lodged documents to the card, so the office has them where it
  // already works. The portal store keeps its copy either way.
  const failed: string[] = [];
  if (sub.files.length) {
    let updateId: string | null = null;
    try {
      updateId = await monday.postUpdate(
        itemId,
        `Documents lodged via the client portal` +
          (sub.email ? ` (job contact: ${sub.email})` : "") + `:\n\n` +
          sub.files.map((f) => `• ${f.name}${f.category ? ` — ${f.category}` : ""}`).join("\n")
      );
    } catch (e) {
      console.error("decision: could not post the documents update:", e);
    }
    if (updateId) {
      for (const f of sub.files) {
        try {
          const bytes = await repo.readFile(`submissions/${sub.id}/${f.name}`);
          await monday.addFileToUpdate(updateId, f.name, bytes, "application/pdf");
        } catch (e) {
          console.error(`decision: attaching ${f.name} failed:`, e);
          failed.push(f.name);
        }
      }
    } else {
      failed.push(...sub.files.map((f) => f.name));
    }
  }

  await repo.setSubmission(sub.id, {
    status: "accepted", mondayItemId: itemId, reviewNote: String(note || ""),
  });
  return NextResponse.json({
    ok: true,
    mondayItemId: itemId,
    warning: failed.length
      ? `Card created, but ${failed.length === 1 ? "one file" : `${failed.length} files`} couldn't be attached on Monday (${failed.join(", ")}). The portal still holds ${failed.length === 1 ? "it" : "them"} in storage under submissions/${sub.id}.`
      : undefined,
  });
}
