import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { tidyAddress } from "@/lib/core.mjs";
import { acceptSubmission } from "@/lib/accept";
import { env } from "@/lib/env";
import { pageDisabled } from "@/lib/pages";
import { listLibrary, libraryPath, type LibraryDoc } from "@/lib/library";

const OFFLINE = {
  error: "This section is temporarily offline while we make updates — please try again shortly.",
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Auto-accept shuttles the PDFs onto the Monday card during this request.
export const maxDuration = 300;

/** Straight onto the board when auto-accept is on. Failure is never the
 *  client's problem: the submission simply stays in the review queue. */
async function maybeAutoAccept(id: string): Promise<boolean> {
  if (!env.autoAcceptLodgements) return false;
  try {
    const sub = await repo.getSubmission(id);
    if (!sub) return false;
    await acceptSubmission(sub, "auto-accepted at lodgement");
    return true;
  } catch (e) {
    console.error(`auto-accept failed for ${id} — left in the review queue:`, e);
    return false;
  }
}

const PDF_ONLY = (name: string, type: string) =>
  /\.pdf$/i.test(name) || type === "application/pdf";


const MAX_TOTAL = 40 * 1024 * 1024; // 40 MB per submission

/** Ticked "My documents" entries, resolved against the caller's OWN library —
 *  an id that isn't in their index simply doesn't exist here, whatever the
 *  request claims. Bytes come back in memory so the documents lodge exactly
 *  like fresh uploads: same storage home, same acceptance path, same Monday
 *  files column, same 40 MB total. */
async function loadLibraryDocs(
  companyId: string, ids: string[]
): Promise<{ doc: LibraryDoc; bytes: Buffer }[] | { error: string }> {
  if (!ids.length) return [];
  const index = await listLibrary(companyId);
  const out: { doc: LibraryDoc; bytes: Buffer }[] = [];
  for (const id of [...new Set(ids)]) {
    const doc = index.find((d) => d.id === id);
    const stream = doc ? await repo.readFileStream(libraryPath(companyId, doc)) : null;
    if (!doc || !stream) {
      return { error: "One of your saved documents couldn't be found — untick it and try again, or re-save it from My details." };
    }
    out.push({ doc, bytes: Buffer.from(await new Response(stream).arrayBuffer()) });
  }
  return out;
}

/** Write the library copies into the submission's own folder and add them to
 *  its files list under "engineering", deduping against the fresh uploads so
 *  nothing silently overwrites. */
async function storeLibraryDocs(
  id: string,
  docs: { doc: LibraryDoc; bytes: Buffer }[],
  files: { name: string; category?: string }[]
) {
  for (const { doc, bytes } of docs) {
    let name = doc.file;
    let n = 2;
    while (files.some((f) => f.name === name)) name = name.replace(/(\.pdf)$/i, `-${n++}$1`);
    await repo.writeFile(`submissions/${id}/${name}`, bytes, "application/pdf");
    files.push({ name, category: "engineering" });
  }
}

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Full detail to the server log; a safe message to the client. Internals
    // (schema, storage paths) stay out of client-visible responses.
    console.error("submit failed:", e);
    return NextResponse.json(
      { error: "We couldn't save that lodgement — nothing was recorded. Please try again, and contact the office if it happens twice." },
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
      { error: "You're viewing this portal as staff — lodging is disabled." }, { status: 403 }
    );
  }

  // Direct-upload path: the files are already in storage (PUT by the browser
  // via signed URLs — Vercel caps multipart bodies at ~4.5 MB, far below a
  // real drawing set) and this request carries only metadata.
  if ((req.headers.get("content-type") || "").includes("application/json")) {
    return handleDirect(session, await req.json().catch(() => ({})));
  }

  const form = await req.formData();
  const address = tidyAddress(String(form.get("address") || ""));
  const jobClass = tidyAddress(String(form.get("jobClass") || ""));
  const description = tidyAddress(String(form.get("description") || ""));
  const notes = String(form.get("notes") || "").trim().slice(0, 4000);
  const clientRef = String(form.get("clientRef") || "").trim().slice(0, 60);
  const contact = String(form.get("contact") || "").trim().toLowerCase();
  const amendmentOf = tidyAddress(String(form.get("amendmentOf") || "")) || null;
  if (await pageDisabled(amendmentOf ? "amend" : "submit")) {
    return NextResponse.json(OFFLINE, { status: 503 });
  }

  if (!address || !description || !jobClass) {
    return NextResponse.json({ error: "We just need a site address, class and a short description to lodge this." }, { status: 400 });
  }

  // An amendment must point at a job this company actually has.
  if (amendmentOf) {
    const own = await repo.listJobsForCompany(session.companyId);
    if (!own.some((j) => j.ref === amendmentOf)) {
      return NextResponse.json({ error: "We can't find that job on your account — check the reference, or message us and we'll track it down." }, { status: 404 });
    }
  }

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const categories = form.getAll("fileCategories").map(String);
  const libraryIds = form.getAll("libraryIds").map(String).filter(Boolean);

  // PDFs only. The client-side filter can be bypassed, and the person who
  // opens these is a member of staff, not a browser.
  const rejected = uploads.filter((f) => !PDF_ONLY(f.name, f.type)).map((f) => f.name);
  if (rejected.length) {
    return NextResponse.json(
      { error: `We can only accept PDFs — please convert or remove: ${rejected.slice(0, 4).join(", ")}` },
      { status: 415 }
    );
  }

  const libDocs = await loadLibraryDocs(session.companyId, libraryIds);
  if ("error" in libDocs) return NextResponse.json(libDocs, { status: 400 });

  // The client-side check can be bypassed, so the rule lives here too. An
  // amendment is exempt: the revised drawings are the point, and the
  // engineering may not have changed. A ticked saved document IS engineering.
  if (!amendmentOf) {
    const have = new Set(categories);
    if (libDocs.length) have.add("engineering");
    const missing = ["drawings", "engineering"].filter((c) => !have.has(c));
    if (missing.length) {
      return NextResponse.json(
        { error: `We'll need ${missing.join(" and ")} to start the assessment — attach those and it's ready to lodge.` },
        { status: 400 }
      );
    }
  }
  const total = uploads.reduce((n, f) => n + f.size, 0)
    + libDocs.reduce((n, d) => n + d.bytes.length, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Those files come to more than 40 MB all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you." },
      { status: 413 }
    );
  }

  const id = "sub_" + Math.random().toString(36).slice(2, 10);
  const stored: { name: string; category?: string }[] = [];
  for (let i = 0; i < uploads.length; i++) {
    const f = uploads[i];
    const safe = f.name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120);
    const bytes = Buffer.from(await f.arrayBuffer());
    await repo.writeFile(`submissions/${id}/${safe}`, bytes, f.type || "application/octet-stream");
    stored.push({ name: safe, category: categories[i] || undefined });
  }
  await storeLibraryDocs(id, libDocs, stored);

  await repo.addSubmission({
    clientRef: clientRef || null,
    companyId: session.companyId,
    email: contact,
    address,
    jobClass,
    description,
    notes,
    files: stored,
    createdAt: new Date().toISOString(),
    amendmentOf,
  }, id);

  const accepted = await maybeAutoAccept(id);
  return NextResponse.json({ ok: true, id, accepted });
}

/** Metadata-only lodgement referencing files the browser already PUT into the
 *  company's own draft area. Everything is re-verified against what actually
 *  landed in storage — names, PDF rule, and sizes the server can see — before
 *  the files move to their permanent home. */
async function handleDirect(session: Session, body: Record<string, unknown>) {
  const address = tidyAddress(String(body.address || ""));
  const jobClass = tidyAddress(String(body.jobClass || ""));
  const description = tidyAddress(String(body.description || ""));
  const notes = String(body.notes || "").trim().slice(0, 4000);
  const clientRef = String(body.clientRef || "").trim().slice(0, 60);
  const contact = String(body.contact || "").trim().toLowerCase();
  const amendmentOf = tidyAddress(String(body.amendmentOf || "")) || null;
  if (await pageDisabled(amendmentOf ? "amend" : "submit")) {
    return NextResponse.json(OFFLINE, { status: 503 });
  }

  if (!address || !description || !jobClass) {
    return NextResponse.json({ error: "We just need a site address, class and a short description to lodge this." }, { status: 400 });
  }

  if (amendmentOf) {
    const own = await repo.listJobsForCompany(session.companyId);
    if (!own.some((j) => j.ref === amendmentOf)) {
      return NextResponse.json({ error: "We can't find that job on your account — check the reference, or message us and we'll track it down." }, { status: 404 });
    }
  }

  const claimed: { name: string; category?: string }[] = Array.isArray(body.files)
    ? (body.files as { name?: unknown; category?: unknown }[])
        .map((f) => ({
          name: String(f?.name || ""),
          category: f?.category ? String(f.category) : undefined,
        }))
        .filter((f) => f.name)
    : [];
  const libraryIds = Array.isArray(body.libraryIds)
    ? (body.libraryIds as unknown[]).map((x) => String(x || "")).filter(Boolean)
    : [];

  const libDocs = await loadLibraryDocs(session.companyId, libraryIds);
  if ("error" in libDocs) return NextResponse.json(libDocs, { status: 400 });

  if (!amendmentOf) {
    const have = new Set(claimed.map((f) => f.category));
    if (libDocs.length) have.add("engineering");
    const missing = ["drawings", "engineering"].filter((c) => !have.has(c));
    if (missing.length) {
      return NextResponse.json(
        { error: `We'll need ${missing.join(" and ")} to start the assessment — attach those and it's ready to lodge.` },
        { status: 400 }
      );
    }
  }

  const draftId = String(body.draftId || "");
  if (!/^up_[0-9a-f-]{20,}$/i.test(draftId) || !claimed.length) {
    return NextResponse.json(
      { error: "Those uploads can't be found — please try lodging again." }, { status: 400 }
    );
  }

  const rejected = claimed.filter((f) => !PDF_ONLY(f.name, "application/pdf")).map((f) => f.name);
  if (rejected.length) {
    return NextResponse.json(
      { error: `We can only accept PDFs — please convert or remove: ${rejected.slice(0, 4).join(", ")}` },
      { status: 415 }
    );
  }

  // The prefix is rebuilt from the session's own company id — a client can
  // only ever reference their own draft area, whatever the request claims.
  const prefix = `uploads/${session.companyId}/${draftId}`;
  const landed = new Map((await repo.listFiles(prefix)).map((f) => [f.name, f.size]));

  if (claimed.some((f) => !landed.has(f.name))) {
    return NextResponse.json(
      { error: "Some files didn't finish uploading — please try lodging again." }, { status: 400 }
    );
  }

  // Sizes from storage, not from the browser's claims.
  const total = claimed.reduce((n, f) => n + (landed.get(f.name) || 0), 0)
    + libDocs.reduce((n, d) => n + d.bytes.length, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Those files come to more than 40 MB all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you." },
      { status: 413 }
    );
  }

  const id = "sub_" + Math.random().toString(36).slice(2, 10);
  for (const f of claimed) {
    await repo.moveFile(`${prefix}/${f.name}`, `submissions/${id}/${f.name}`);
  }
  await storeLibraryDocs(id, libDocs, claimed);

  await repo.addSubmission({
    clientRef: clientRef || null,
    companyId: session.companyId,
    email: contact,
    address,
    jobClass,
    description,
    notes,
    files: claimed,
    createdAt: new Date().toISOString(),
    amendmentOf,
  }, id);

  const accepted = await maybeAutoAccept(id);
  return NextResponse.json({ ok: true, id, accepted });
}
