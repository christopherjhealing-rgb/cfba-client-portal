import { NextResponse, after } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { tidyAddress, matchCompany } from "@/lib/core.mjs";
import { describeJob } from "@/lib/jobdesc.mjs";
import { acceptSubmission } from "@/lib/accept";
import { env } from "@/lib/env";
import { pageDisabled } from "@/lib/pages";
import { listLibrary, libraryPath, type LibraryDoc } from "@/lib/library";
import { notifyTeams } from "@/lib/teams";
import { lodgeAmendment, AMENDMENT_OPEN } from "@/lib/amendments";
import { BAL_LABELS } from "@/lib/bushfire.mjs";
import { combineUploads } from "@/lib/combine-uploads";
import { uniqueName } from "@/lib/uploads.mjs";

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

/**
 * What happens to a lodgement once it's saved.
 *
 * An amendment takes a different road entirely: no Monday card, an email to
 * whoever certified the original, and one note on that original card. An
 * amendment on the board looks like a fresh assessment and sits there for
 * days, when the real work is a watermark and a re-issue. See lib/amendments.
 *
 * Both lodgement paths come through here so neither can be handled one way and
 * quietly the other.
 */
async function finishLodgement(
  id: string, companyName: string, isAmendment: boolean
): Promise<boolean> {
  if (isAmendment) {
    await lodgeAmendment(id);
    // Never "accepted" — there's no card to accept it onto, and telling the
    // client otherwise would be a lie about where their job is.
    return false;
  }
  return acceptAndAnnounce(id, companyName);
}

/**
 * Accept, then say so in Teams.
 *
 * Whether it reached the board is on the card, because those are two different
 * things for whoever reads it: one is news, the other is a task.
 */
async function acceptAndAnnounce(id: string, companyName: string): Promise<boolean> {
  const accepted = await maybeAutoAccept(id);
  const sub = await repo.getSubmission(id).catch(() => null);
  await notifyTeams("lodged", {
    title: `${companyName} lodged a job`,
    facts: [
      ["Site", sub?.address || ""],
      ["Class", sub?.jobClass || ""],
      ["Files", String(sub?.files.length ?? 0)],
      ["On the board", accepted ? "Yes" : "No — waiting in the review queue"],
    ],
    text: sub?.description || "",
    link: { label: "Open the queue", url: `${env.appUrl}/admin` },
  });
  return accepted;
}

/**
 * Can this client amend this job?
 *
 * Their portal jobs first — that's the common case and costs nothing. But the
 * sync only ever pulls issued and non-closed cards, so a job invoiced before
 * the portal existed isn't in the portal at all, and on a board of 3,827 items
 * that is most of them. An amendment six months after issue is the ordinary
 * case, not the exception, so a reference the portal doesn't know is looked up
 * on the board instead of being refused.
 *
 * Finding the card is not permission to amend it. The card has to match the
 * signed-in company by the same rule the sync matches everything else, or a
 * client could amend a stranger's job by typing their reference — and
 * references are sequential, so guessing one is trivial.
 */
async function amendableRef(
  companyId: string, ref: string
): Promise<{ ok: true; historic: boolean } | { ok: false }> {
  const own = await repo.listJobsForCompany(companyId);
  if (own.some((j) => j.ref === ref)) return { ok: true, historic: false };

  const cards = await monday.findByRef(ref).catch(() => []);
  if (!cards.length) return { ok: false };

  const companies = await repo.companiesForMatch();
  const mine = companies.filter((c) => c.id === companyId);
  const isMine = cards.some(
    (c) => matchCompany({ clientName: c.clientName, email: c.email }, mine) === companyId
  );
  return isMine ? { ok: true, historic: true } : { ok: false };
}

const NOT_YOURS = {
  error: "We can't find that job on your account — check the reference on your certificate, or message us and we'll track it down.",
};

const PDF_ONLY = (name: string, type: string) =>
  /\.pdf$/i.test(name) || type === "application/pdf";


const MAX_TOTAL = 40 * 1024 * 1024; // 40 MB per submission

/** The multipart path carries the rows as JSON in one field. Unparseable is
 *  an empty list, which describeJob turns into a 400 — never a 500. */
function parseItems(s: string): unknown {
  try { return JSON.parse(s); } catch { return []; }
}

/**
 * The class and the description, from the rows the client filled in.
 *
 * Both are derived here rather than taken as strings: the browser's preview is
 * a courtesy, and a request that hand-wrote its own description could put
 * anything on the board's Description column and mint any label it liked in
 * the Class column, which is a status column with create_labels_if_missing on.
 *
 * The old shape is still accepted. A form left open in a tab across a deploy
 * still posts jobClass and description, and refusing it would lose a
 * lodgement someone had already spent ten minutes on. An amendment posts them
 * too — its description is the change being asked for, not a structure list.
 */
function classAndDescription(
  raw: unknown, legacyClass: string, legacyDescription: string
): { jobClass: string; description: string; items?: unknown } | { error: string } {
  if (raw === undefined || raw === null) {
    return { jobClass: legacyClass, description: legacyDescription };
  }
  const said = describeJob(raw);
  // items travel back too so lodgement can stash them for "lodge similar" —
  // the normalised rows, not the raw request, so a duplicate restores exactly
  // what was recorded.
  return said.ok
    ? { jobClass: said.jobClass, description: said.description, items: said.items }
    : { error: said.error };
}

/** Stash the structured rows against the submission so a later "lodge similar"
 *  can restore them exactly. Portal_settings k/v, migration-free, and never
 *  fatal — a duplicate that can't find them falls back to the description. */
async function stashItems(id: string, items: unknown): Promise<void> {
  if (!Array.isArray(items) || !items.length) return;
  try { await repo.setSetting(`subitems:${id}`, { items }); }
  catch { /* a lost convenience must never fail a lodgement */ }
}

/** The BAL column label to stamp on the card, from the client's assessment —
 *  whitelisted to the board's real options so a request can never mint an
 *  arbitrary label (create_labels_if_missing is on for card creation). Stashed
 *  migration-free; acceptSubmission reads it when it builds the card. */
function validBal(x: unknown): string | null {
  const s = String(x ?? "").trim();
  return BAL_LABELS.includes(s) ? s : null;
}
async function stashBal(id: string, bal: string | null): Promise<void> {
  if (!bal) return;
  try { await repo.setSetting(`bal:${id}`, { bal }); }
  catch { /* a lost nicety must never fail a lodgement */ }
}

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
  const rawItems = form.get("items");
  const said = classAndDescription(
    rawItems === null ? null : parseItems(String(rawItems)),
    tidyAddress(String(form.get("jobClass") || "")),
    tidyAddress(String(form.get("description") || ""))
  );
  if ("error" in said) return NextResponse.json(said, { status: 400 });
  const { jobClass, description } = said;
  const notes = String(form.get("notes") || "").trim().slice(0, 4000);
  const clientRef = String(form.get("clientRef") || "").trim().slice(0, 60);
  const contact = String(form.get("contact") || "").trim().slice(0, 80);
  const bal = validBal(form.get("bal"));
  const amendmentOf = tidyAddress(String(form.get("amendmentOf") || "")) || null;
  if (await pageDisabled(amendmentOf ? "amend" : "submit")) {
    return NextResponse.json(OFFLINE, { status: 503 });
  }

  if (!address || !description || !jobClass) {
    return NextResponse.json({ error: "We just need a site address, class and a short description to lodge this." }, { status: 400 });
  }

  // An amendment must point at a job this company actually has — in the portal
  // or on the board. See amendableRef.
  if (amendmentOf && !(await amendableRef(session.companyId, amendmentOf)).ok) {
    return NextResponse.json(NOT_YOURS, { status: 404 });
  }

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const categories = form.getAll("fileCategories").map(String);
  const libraryIds = form.getAll("libraryIds").map(String).filter(Boolean);

  // PDFs only. The client-side filter can be bypassed, and the person who
  // opens these is a member of staff, not a browser.
  const rejected = uploads.filter((f) => !PDF_ONLY(f.name, f.type)).map((f) => f.name);
  if (rejected.length) {
    await repo.logAudit("upload.reject", "not-pdf", rejected.slice(0, 4).join(", "), session.username || "client").catch(() => {});
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
    await repo.logAudit("upload.reject", "over-40mb", `${Math.round(total / 1048576)} MB`, session.username || "client").catch(() => {});
    return NextResponse.json(
      { error: "Those files come to more than 40 MB all up — email the biggest ones to admin@cfba.com.au and we'll add them to the job for you." },
      { status: 413 }
    );
  }

  const id = "sub_" + Math.random().toString(36).slice(2, 10);
  const stored: { name: string; category?: string }[] = [];
  // Collision guard: the same file name in two buckets must never overwrite —
  // the second write used to win silently and the combine then merged the
  // wrong bytes (drawings carrying the engineering file). Suffix instead,
  // exactly as the signing route always has.
  const usedNames = new Set<string>();
  for (let i = 0; i < uploads.length; i++) {
    const f = uploads[i];
    const safe = uniqueName(f.name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120), usedNames);
    const bytes = Buffer.from(await f.arrayBuffer());
    await repo.writeFile(`submissions/${id}/${safe}`, bytes, f.type || "application/octet-stream");
    stored.push({ name: safe, category: categories[i] || undefined });
  }
  await storeLibraryDocs(id, libDocs, stored);

  // Combine and rename the drawings and engineering into one tidy, site-named
  // PDF each (see lib/combine-uploads), so that's what lands on the card. An
  // amendment keeps the client's own file names — the point of one is which
  // drawing changed, not a fresh set.
  const filed = amendmentOf ? stored : await combineUploads(`submissions/${id}`, address, stored);

  await repo.addSubmission({
    clientRef: clientRef || null,
    companyId: session.companyId,
    email: contact,
    address,
    jobClass,
    description,
    notes,
    files: filed,
    createdAt: new Date().toISOString(),
    amendmentOf,
  }, id, amendmentOf ? AMENDMENT_OPEN : "pending");
  if (!amendmentOf) { await stashItems(id, said.items); await stashBal(id, bal); }

  // Place it on the board after the response is sent. The lodgement is already
  // saved and shows in My Jobs straight away (a "received" row until the sync
  // catches up), so the client isn't held at the button while a Monday card is
  // created and its files are shuttled across. A failure here leaves it in the
  // review queue — exactly what a failed inline accept always did.
  await repo.logAudit("lodge.success", session.companyName, id, session.username || "client").catch(() => {});
  after(() => finishLodgement(id, session.companyName, !!amendmentOf));
  return NextResponse.json({ ok: true, id, amendment: !!amendmentOf });
}

/** Metadata-only lodgement referencing files the browser already PUT into the
 *  company's own draft area. Everything is re-verified against what actually
 *  landed in storage — names, PDF rule, and sizes the server can see — before
 *  the files move to their permanent home. */
async function handleDirect(session: Session, body: Record<string, unknown>) {
  const address = tidyAddress(String(body.address || ""));
  const said = classAndDescription(
    body.items,
    tidyAddress(String(body.jobClass || "")),
    tidyAddress(String(body.description || ""))
  );
  if ("error" in said) return NextResponse.json(said, { status: 400 });
  const { jobClass, description } = said;
  const notes = String(body.notes || "").trim().slice(0, 4000);
  const clientRef = String(body.clientRef || "").trim().slice(0, 60);
  const contact = String(body.contact || "").trim().slice(0, 80);
  const bal = validBal(body.bal);
  const amendmentOf = tidyAddress(String(body.amendmentOf || "")) || null;
  if (await pageDisabled(amendmentOf ? "amend" : "submit")) {
    return NextResponse.json(OFFLINE, { status: 503 });
  }

  if (!address || !description || !jobClass) {
    return NextResponse.json({ error: "We just need a site address, class and a short description to lodge this." }, { status: 400 });
  }

  if (amendmentOf && !(await amendableRef(session.companyId, amendmentOf)).ok) {
    return NextResponse.json(NOT_YOURS, { status: 404 });
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

  // Combine and rename the drawings and engineering into one tidy, site-named
  // PDF each (see lib/combine-uploads) — same as the multipart path above.
  // Lodgements only; an amendment keeps the client's own file names.
  const filed = amendmentOf ? claimed : await combineUploads(`submissions/${id}`, address, claimed);

  await repo.addSubmission({
    clientRef: clientRef || null,
    companyId: session.companyId,
    email: contact,
    address,
    jobClass,
    description,
    notes,
    files: filed,
    createdAt: new Date().toISOString(),
    amendmentOf,
  }, id, amendmentOf ? AMENDMENT_OPEN : "pending");
  if (!amendmentOf) { await stashItems(id, said.items); await stashBal(id, bal); }

  // Place it on the board after the response is sent. The lodgement is already
  // saved and shows in My Jobs straight away (a "received" row until the sync
  // catches up), so the client isn't held at the button while a Monday card is
  // created and its files are shuttled across. A failure here leaves it in the
  // review queue — exactly what a failed inline accept always did.
  await repo.logAudit("lodge.success", session.companyName, id, session.username || "client").catch(() => {});
  after(() => finishLodgement(id, session.companyName, !!amendmentOf));
  return NextResponse.json({ ok: true, id, amendment: !!amendmentOf });
}
