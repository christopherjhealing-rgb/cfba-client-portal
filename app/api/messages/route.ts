import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 4000;
const MAX_TOTAL = 25 * 1024 * 1024; // 25 MB per message

const PDF_ONLY = (name: string, type: string) =>
  /\.pdf$/i.test(name) || type === "application/pdf";


/** A client reply. Written to the portal store and posted onto the job's Monday
 *  card, with any attachments uploaded to that same update — so the engineering
 *  lands where the office already works, not in a second inbox. */
export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("message post failed:", e);
    return NextResponse.json(
      { error: "We couldn't send that message — it wasn't saved. Please try again, and contact the office if it happens twice." },
      { status: 500 }
    );
  }
}

async function handle(req: Request) {
  const session = await getClientSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — replying is disabled." },
      { status: 403 }
    );
  }

  const form = await req.formData();
  const jobRef = String(form.get("ref") || "").trim();
  const text = String(form.get("body") || "").trim().slice(0, MAX_TEXT);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!jobRef) return NextResponse.json({ error: "Missing job reference." }, { status: 400 });
  if (!text && uploads.length === 0) {
    return NextResponse.json(
      { error: "Write a message or attach a file before sending." }, { status: 400 }
    );
  }

  const rejected = uploads.filter((f) => !PDF_ONLY(f.name, f.type)).map((f) => f.name);
  if (rejected.length) {
    return NextResponse.json(
      { error: `PDFs only. Convert or remove: ${rejected.slice(0, 4).join(", ")}` },
      { status: 415 }
    );
  }

  const total = uploads.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Those files come to more than 25 MB. Send the largest ones to the office by email." },
      { status: 413 }
    );
  }

  // The job must belong to the signed-in company — never trust the ref alone.
  const jobs = await repo.listJobsForCompany(session.companyId);
  const job = jobs.find((j) => j.ref === jobRef);
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  const msgId = "msg_" + Math.random().toString(36).slice(2, 10);
  const stored: repo.MessageFile[] = [];
  const bytesByName = new Map<string, { bytes: Buffer; type: string }>();
  for (const f of uploads) {
    const safe = f.name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120);
    const bytes = Buffer.from(await f.arrayBuffer());
    const storagePath = `messages/${jobRef}/${msgId}/${safe}`;
    const contentType = f.type || "application/octet-stream";
    await repo.writeFile(storagePath, bytes, contentType);
    stored.push({ name: safe, size: bytes.length, storagePath, contentType });
    bytesByName.set(safe, { bytes, type: contentType });
  }

  let updateId: string | null = null;
  if (job.mondayItemId) {
    try {
      const listed = stored.length
        ? `\n\nAttached: ${stored.map((f) => f.name).join(", ")}`
        : "";
      updateId = await monday.postUpdate(
        job.mondayItemId,
        `Message from ${session.companyName} (via the client portal):\n\n` +
          (text || "(no message — files only)") + listed
      );
      if (updateId) {
        for (const f of stored) {
          const b = bytesByName.get(f.name);
          if (b) await monday.addFileToUpdate(updateId, f.name, b.bytes, b.type);
        }
      }
    } catch {
      // Non-fatal: the message and its files are saved in the portal either way,
      // and the office can still see them. Better a message that lands without
      // its attachment than a client told the send failed.
    }
  }

  await repo.addMessage({
    ref: jobRef,
    companyId: session.companyId,
    from: "client",
    body: text,
    createdAt: new Date().toISOString(),
    mondayUpdateId: updateId,
    files: stored,
  }, msgId);

  await repo.markThreadRead(session.companyId, jobRef);
  return NextResponse.json({ ok: true });
}
