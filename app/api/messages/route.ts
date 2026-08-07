import { NextResponse, after } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { pageDisabled } from "@/lib/pages";
import {
  sendMail, officeReplyEmail, officeEnquiryEmail, fitAttachments,
  type MailAttachment,
} from "@/lib/mail";
import { env } from "@/lib/env";
import { notifyTeams } from "@/lib/teams";
import { isGeneralRef, GENERAL_REF } from "@/lib/core.mjs";
import { combineUploads } from "@/lib/combine-uploads";
import { combinable } from "@/lib/uploads.mjs";
import { fileNewInfo } from "@/lib/new-info";

/**
 * Turn a message's raw uploads into the files stored against it. On a job reply
 * whose files are tagged (an FIR response through the categorised box), the
 * drawings and engineering are combined into one dated PDF each — the same tidy
 * naming as a lodgement, with the day it came in on the end — so the office gets
 * "Site Plan and Elevations - <site> - 7 Aug 2026.pdf", not three loose files.
 * A plain reply, or an enquiry, keeps its files exactly as sent.
 */
async function messageFiles(
  dir: string,
  job: { address?: string | null } | undefined,
  raw: { name: string; category?: string }[]
): Promise<{ files: repo.MessageFile[]; combined: { name: string; category?: string }[] }> {
  const isFir = !!job && raw.some((e) => e.category && combinable(e.category));
  const entries = isFir
    ? await combineUploads(dir, job!.address || "", raw, { date: new Date() })
    : raw;
  const sizes = new Map((await repo.listFiles(dir)).map((f) => [f.name, f.size]));
  const files = entries.map((e) => ({
    name: e.name,
    size: sizes.get(e.name) || 0,
    storagePath: `${dir}/${e.name}`,
    contentType: "application/pdf",
  }));
  // `combined` (with categories) is handed on to the SharePoint filing; empty
  // for a plain reply or enquiry, which files nothing.
  return { files, combined: isFir ? entries : [] };
}

/**
 * Read what the client just sent back out of storage so it can ride along on
 * the office email — a notification that says "Attachments: engineering.pdf"
 * and carries nothing is a notification that costs somebody a click and a
 * login to act on.
 *
 * Best effort by design. A file that won't read back is left out of the email;
 * it is still in the portal and on the Monday card, and the notification is
 * far too important to lose over an attachment.
 */
async function loadAttachments(stored: repo.MessageFile[]): Promise<MailAttachment[]> {
  const out: MailAttachment[] = [];
  for (const f of stored) {
    try {
      const bytes = await repo.readFile(f.storagePath);
      if (bytes.length) {
        out.push({ name: f.name, contentType: f.contentType || "application/pdf", bytes });
      }
    } catch (e) {
      console.warn(`messages: couldn't attach ${f.name} to the office email:`, (e as Error).message);
    }
  }
  return out;
}

/** Email the office when a client replies. Monday doesn't notify the token
 *  owner of updates posted with its own token, so without this a client's FIR
 *  reply — the event that unblocks a job — can sit on the board unseen.
 *
 *  Teams goes out from here too rather than from the call sites, so the two
 *  can't drift apart: anything that notifies the office notifies the channel. */
async function notifyOffice(
  companyName: string, ref: string, address: string, body: string,
  stored: repo.MessageFile[]
) {
  const fileNames = stored.map((f) => f.name);

  await notifyTeams("message", {
    title: `${companyName} replied on ${ref}`,
    facts: [
      ["Job", ref],
      ["Site", address],
      ["Attached", fileNames.join(", ")],
    ],
    text: body,
    link: { label: "Open the job", url: `${env.appUrl}/admin` },
  });

  if (!env.officeEmail) return;
  try {
    const { attach } = fitAttachments(await loadAttachments(stored));
    const mail = officeReplyEmail({
      companyName, ref, address, body, fileNames,
      attachedNames: attach.map((a) => a.name),
    });
    await sendMail([env.officeEmail], mail.subject, mail.html, attach);
  } catch (e) {
    console.warn(`messages: office notify failed for ${ref}:`, (e as Error).message);
  }
}

/** The same, for an enquiry that isn't about a job. Different in one way that
 *  matters: a job reply also lands on the Monday card, so a failed email is a
 *  delay. An enquiry has no card, so a failed email is a lost enquiry — the
 *  client is told, rather than left thinking somebody has it. */
async function notifyOfficeEnquiry(
  companyName: string, subject: string, body: string, stored: repo.MessageFile[]
): Promise<boolean> {
  await notifyTeams("enquiry", {
    title: `Enquiry from ${companyName}`,
    facts: [
      ["Subject", subject],
      ["Attached", stored.map((f) => f.name).join(", ")],
    ],
    text: body,
    link: { label: "Open Enquiries", url: `${env.appUrl}/admin/enquiries` },
  });

  if (!env.officeEmail) return false;
  const { attach } = fitAttachments(await loadAttachments(stored));
  const mail = officeEnquiryEmail({
    companyName, subject, body,
    fileNames: stored.map((f) => f.name),
    attachedNames: attach.map((a) => a.name),
  });
  return sendMail([env.officeEmail], mail.subject, mail.html, attach);
}

/** A client reply on a job that was waiting on them moves the card off FIR.
 *  The update alone isn't enough: a card left at FIR stays in the board's
 *  Further Information Request group, so a job somebody has already answered
 *  still looks like it's waiting on them. That is how a job goes quiet.
 *
 *  Never throws, and never blocks the reply — the message is saved and posted
 *  before this runs. A card the office has already moved on is left alone. */
async function moveOffFir(job: { ref: string; mondayItemId: string | null } | undefined) {
  if (!job?.mondayItemId) return;
  try {
    const r = await monday.markInfoReceived(job.mondayItemId);
    if (!r.ok && r.reason === "no-such-label") {
      console.warn(
        `messages ${job.ref}: the board has no "New Info Received" label, so the ` +
        `card is still at FIR. Labels on the column: ${r.labels.join(", ")}.`
      );
      await repo.noteBoardWriteFail(job.ref, 'no "New Info Received" label on the board')
        .catch(() => {});
    } else if (!r.ok && r.reason === "moved-on") {
      console.info(`messages ${job.ref}: card is at "${r.status}", not waiting on the client — left alone.`);
    }
  } catch (e) {
    console.warn(`messages ${job.ref}: could not move the card off FIR:`, (e as Error).message);
    await repo.noteBoardWriteFail(job.ref, (e as Error).message).catch(() => {});
  }
}

/** The enquiry's "what's it about?" becomes the first line of the message, so
 *  the thread list and the office email both have something to show without a
 *  column being added to store it separately. */
const MAX_SUBJECT = 120;
function enquiryBody(subject: string, text: string) {
  return subject ? (text ? `${subject}\n\n${text}` : subject) : text;
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
  const subject = String(form.get("subject") || "").trim().slice(0, MAX_SUBJECT);
  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const categories = form.getAll("fileCategories").map(String);
  const general = isGeneralRef(jobRef);

  if (!jobRef) return NextResponse.json({ error: "Choose which job this message is for." }, { status: 400 });
  if (general && !subject) {
    return NextResponse.json(
      { error: "Give us a line on what it's about, so it reaches the right person." },
      { status: 400 }
    );
  }
  if (!text && uploads.length === 0 && !general) {
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
  // An enquiry has no job, so there is nothing to own and nothing to check.
  const jobs = general ? [] : await repo.listJobsForCompany(session.companyId);
  const job = general ? undefined : jobs.find((j) => j.ref === jobRef);
  if (!general && !job) return NextResponse.json({ error: "We can't find that job — check the reference, or ring us on 1300 029 074." }, { status: 404 });

  const msgId = "msg_" + Math.random().toString(36).slice(2, 10);
  const folder = general ? `enquiries/${session.companyId}` : jobRef;
  const dir = `messages/${folder}/${msgId}`;
  const raw: { name: string; category?: string }[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const f = uploads[i];
    const safe = f.name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120);
    const bytes = Buffer.from(await f.arrayBuffer());
    await repo.writeFile(`${dir}/${safe}`, bytes, f.type || "application/octet-stream");
    raw.push({ name: safe, category: categories[i] || undefined });
  }
  const { files: stored, combined } = await messageFiles(dir, job, raw);

  let updateId: string | null = null;
  if (job?.mondayItemId) {
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
      // Non-fatal: the message and its files are saved in the portal either way,
      // and the office can still see them. Better a message that lands without
      // its attachment than a client told the send failed.
    }
  }

  const who = session.displayName
    ? `${session.displayName}, ${session.companyName}` : session.companyName;

  await repo.addMessage({
    ref: general ? GENERAL_REF : jobRef,
    companyId: session.companyId,
    from: "client",
    body: general ? enquiryBody(subject, text) : text,
    createdAt: new Date().toISOString(),
    mondayUpdateId: updateId,
    files: stored,
  }, msgId);

  if (general) {
    await notifyEnquiry(who, subject, text, stored);
  } else {
    // The client has answered. Move the card before telling the office, so the
    // board is already right by the time somebody opens the email.
    await moveOffFir(job);
    await notifyOffice(who, jobRef, job?.address || "", text, stored);
    // File the returned drawings/engineering into the job's SharePoint folder,
    // superseding the versions they replace. After the response — locating a
    // folder and moving files is a SharePoint round trip the client shouldn't
    // wait on — and off entirely until RECORD_TO_FOLDER is switched on.
    if (combined.length) {
      after(() =>
        fileNewInfo(jobRef, job?.address || "", dir, combined).catch((e) =>
          console.warn(`new-info ${jobRef}:`, (e as Error).message)
        )
      );
    }
  }
  await repo.markThreadRead(session.companyId, general ? GENERAL_REF : jobRef);
  return NextResponse.json({ ok: true });
}

/** An enquiry is saved before this runs, and /admin/enquiries lists it whether
 *  the email goes or not — so a mail outage delays the office seeing it, it
 *  doesn't lose it. Logged loudly all the same. */
async function notifyEnquiry(
  who: string, subject: string, text: string, stored: repo.MessageFile[]
) {
  try {
    const sent = await notifyOfficeEnquiry(who, subject, text, stored);
    if (!sent) {
      console.warn(
        `enquiry from ${who} saved but not emailed — OFFICE_EMAIL or the Graph ` +
        `mail credentials aren't set. It's waiting on /admin/enquiries.`
      );
    }
  } catch (e) {
    console.warn(`enquiry from ${who}: office notify failed:`, (e as Error).message);
  }
}

/** Metadata-only message whose attachments the browser already PUT into the
 *  company's draft area. Verified against storage, moved to the message's
 *  permanent home, then mirrored onto the Monday card as before. */
async function handleDirect(session: Session, body: Record<string, unknown>) {
  const jobRef = String(body.ref || "").trim();
  const text = String(body.body || "").trim().slice(0, MAX_TEXT);
  const subject = String(body.subject || "").trim().slice(0, MAX_SUBJECT);
  // Files arrive either as bare names (a plain reply) or as {name, category}
  // objects (the categorised FIR box). Normalise to entries; names drives the
  // storage checks, categories drive the combine.
  const rawFiles: { name: string; category?: string }[] = Array.isArray(body.files)
    ? (body.files as unknown[])
        .map((x) =>
          typeof x === "string"
            ? { name: x }
            : {
                name: String((x as { name?: unknown })?.name || ""),
                category: (x as { category?: unknown })?.category
                  ? String((x as { category?: unknown }).category)
                  : undefined,
              }
        )
        .filter((f) => f.name)
    : [];
  const names = rawFiles.map((f) => f.name);
  const general = isGeneralRef(jobRef);

  if (!jobRef) return NextResponse.json({ error: "Choose which job this message is for." }, { status: 400 });
  if (general && !subject) {
    return NextResponse.json(
      { error: "Give us a line on what it's about, so it reaches the right person." },
      { status: 400 }
    );
  }
  if (!text && names.length === 0 && !general) {
    return NextResponse.json(
      { error: "Write a message or attach a file before sending." }, { status: 400 }
    );
  }

  const jobs = general ? [] : await repo.listJobsForCompany(session.companyId);
  const job = general ? undefined : jobs.find((j) => j.ref === jobRef);
  if (!general && !job) return NextResponse.json({ error: "We can't find that job — check the reference, or ring us on 1300 029 074." }, { status: 404 });

  const msgId = "msg_" + Math.random().toString(36).slice(2, 10);
  const folder = general ? `enquiries/${session.companyId}` : jobRef;
  const dir = `messages/${folder}/${msgId}`;
  let stored: repo.MessageFile[] = [];
  let combined: { name: string; category?: string }[] = [];

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
      await repo.moveFile(`${prefix}/${n}`, `${dir}/${n}`);
    }
    ({ files: stored, combined } = await messageFiles(dir, job, rawFiles));
  }

  let updateId: string | null = null;
  if (job?.mondayItemId) {
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

  const who = session.displayName
    ? `${session.displayName}, ${session.companyName}` : session.companyName;

  await repo.addMessage({
    ref: general ? GENERAL_REF : jobRef,
    companyId: session.companyId,
    from: "client",
    body: general ? enquiryBody(subject, text) : text,
    createdAt: new Date().toISOString(),
    mondayUpdateId: updateId,
    files: stored,
  }, msgId);

  if (general) {
    await notifyEnquiry(who, subject, text, stored);
  } else {
    // The client has answered. Move the card before telling the office, so the
    // board is already right by the time somebody opens the email.
    await moveOffFir(job);
    await notifyOffice(who, jobRef, job?.address || "", text, stored);
    // File the returned drawings/engineering into the job's SharePoint folder,
    // superseding the versions they replace. After the response — locating a
    // folder and moving files is a SharePoint round trip the client shouldn't
    // wait on — and off entirely until RECORD_TO_FOLDER is switched on.
    if (combined.length) {
      after(() =>
        fileNewInfo(jobRef, job?.address || "", dir, combined).catch((e) =>
          console.warn(`new-info ${jobRef}:`, (e as Error).message)
        )
      );
    }
  }
  await repo.markThreadRead(session.companyId, general ? GENERAL_REF : jobRef);
  return NextResponse.json({ ok: true });
}
