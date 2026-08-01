import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { pageDisabled } from "@/lib/pages";
import { sendMail, officeReplyEmail } from "@/lib/mail";
import { env } from "@/lib/env";

/** Email the office when a client replies. Monday doesn't notify the token
 *  owner of updates posted with its own token, so without this a client's FIR
 *  reply — the event that unblocks a job — can sit on the board unseen. */
async function notifyOffice(
  companyName: string, ref: string, address: string, body: string, fileNames: string[]
) {
  if (!env.officeEmail) return;
  try {
    const mail = officeReplyEmail({ companyName, ref, address, body, fileNames });
    await sendMail([env.officeEmail], mail.subject, mail.html);
  } catch (e) {
    console.warn(`messages: office notify failed for ${ref}:`, (e as Error).message);
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Attachments shuttle from storage onto the Monday card; a full 25 MB message
// needs more than the default window.
export const maxDuration = 300;

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

type Session = NonNullable<Awaited<ReturnType<typeof getClientSession>>>;

async function handle(req: Request) {
  const session = await getClientSession();
  if (!session) return NextResponse.json({ error: "Your session has ended — sign in again and you can pick up where you left off." }, { status: 401 });
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — replying is disabled." },
      { status: 403 }
    );
  }

  if (await pageDisabled("messages")) {
    return NextResponse.json(
      { error: "Messaging is temporarily offline while we make updates — please try again shortly." },
      { status: 503 }
    );
  }

  // Direct-upload path — attachments already sit in the company's draft area
  // of storage; this request is metadata only. See /api/uploads/sign.
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    return handleDirect(session, await req.json().catch(() => ({})));
  }

  const form = await req.formData();
  const jobRef = String(form.get("ref") || "").trim();
  const text = String(form.get("body") || "").trim().slice(0, MAX_TEXT);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  if (!jobRef) return NextResponse.json({ error: "Choose which job this message is for." }, { status: 400 });
  if (!text && uploads.length === 0) {
    return NextResponse.json(
      { error: "Write a message or attach a file before sending." }, { status: 400 }
    );
  }

  const rejected = uploads.filter((f) => !PDF_ONLY(f.name, f.type)).map((f) => f.name);
  if (rejected.length) {
    return NextResponse.json(
      { error: `We can only accept PDFs — please convert or remove: ${rejected.slice(0, 4).join(", ")}` },
      { status: 415 }
    );
  }

  const total = uploads.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Those files come to more than 25 MB all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you." },
      { status: 413 }
    );
  }

  // The job must belong to the signed-in company — never trust the ref alone.
  const jobs = await repo.listJobsForCompany(session.companyId);
  const job = jobs.find((j) => j.ref === jobRef);
  if (!job) return NextResponse.json({ error: "We can't find that job — check the reference, or ring us on 1300 029 074." }, { status: 404 });

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
        `Message from ${session.displayName ? `${session.displayName}, ` : ""}${session.companyName} (via the client portal):\n\n` +
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

  await notifyOffice(
    session.displayName ? `${session.displayName}, ${session.companyName}` : session.companyName,
    jobRef, job?.address || "", text, stored.map((f) => f.name));
  await repo.markThreadRead(session.companyId, jobRef);
  return NextResponse.json({ ok: true });
}

/** Metadata-only message whose attachments the browser already PUT into the
 *  company's draft area. Verified against storage, moved to the message's
 *  permanent home, then mirrored onto the Monday card as before. */
async function handleDirect(session: Session, body: Record<string, unknown>) {
  const jobRef = String(body.ref || "").trim();
  const text = String(body.body || "").trim().slice(0, MAX_TEXT);
  const names: string[] = Array.isArray(body.files)
    ? (body.files as unknown[]).map((n) => String(n || "")).filter(Boolean)
    : [];

  if (!jobRef) return NextResponse.json({ error: "Choose which job this message is for." }, { status: 400 });
  if (!text && names.length === 0) {
    return NextResponse.json(
      { error: "Write a message or attach a file before sending." }, { status: 400 }
    );
  }

  const jobs = await repo.listJobsForCompany(session.companyId);
  const job = jobs.find((j) => j.ref === jobRef);
  if (!job) return NextResponse.json({ error: "We can't find that job — check the reference, or ring us on 1300 029 074." }, { status: 404 });

  const msgId = "msg_" + Math.random().toString(36).slice(2, 10);
  const stored: repo.MessageFile[] = [];

  if (names.length) {
    const draftId = String(body.draftId || "");
    if (!/^up_[0-9a-f-]{20,}$/i.test(draftId)) {
      return NextResponse.json(
        { error: "Those uploads can't be found — please try again." }, { status: 400 }
      );
    }
    const rejected = names.filter((n) => !PDF_ONLY(n, "application/pdf"));
    if (rejected.length) {
      return NextResponse.json(
        { error: `We can only accept PDFs — please convert or remove: ${rejected.slice(0, 4).join(", ")}` },
        { status: 415 }
      );
    }

    const prefix = `uploads/${session.companyId}/${draftId}`;
    const landed = new Map((await repo.listFiles(prefix)).map((f) => [f.name, f.size]));
    if (names.some((n) => !landed.has(n))) {
      return NextResponse.json(
        { error: "Some files didn't finish uploading — please try again." }, { status: 400 }
      );
    }
    const total = names.reduce((n, x) => n + (landed.get(x) || 0), 0);
    if (total > MAX_TOTAL) {
      return NextResponse.json(
        { error: "Those files come to more than 25 MB all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you." },
        { status: 413 }
      );
    }

    for (const n of names) {
      const storagePath = `messages/${jobRef}/${msgId}/${n}`;
      await repo.moveFile(`${prefix}/${n}`, storagePath);
      stored.push({
        name: n, size: landed.get(n) || 0, storagePath, contentType: "application/pdf",
      });
    }
  }

  let updateId: string | null = null;
  if (job.mondayItemId) {
    try {
      const listed = stored.length
        ? `\n\nAttached: ${stored.map((f) => f.name).join(", ")}`
        : "";
      updateId = await monday.postUpdate(
        job.mondayItemId,
        `Message from ${session.displayName ? `${session.displayName}, ` : ""}${session.companyName} (via the client portal):\n\n` +
          (text || "(no message — files only)") + listed
      );
      if (updateId) {
        for (const f of stored) {
          const bytes = await repo.readFile(f.storagePath);
          await monday.addFileToUpdate(updateId, f.name, bytes, f.contentType);
        }
      }
    } catch {
      // Non-fatal: the message and its files are saved in the portal either way.
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

  await notifyOffice(
    session.displayName ? `${session.displayName}, ${session.companyName}` : session.companyName,
    jobRef, job?.address || "", text, stored.map((f) => f.name));
  await repo.markThreadRead(session.companyId, jobRef);
  return NextResponse.json({ ok: true });
}
