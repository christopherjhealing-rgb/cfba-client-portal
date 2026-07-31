import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { tidyAddress } from "@/lib/core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PDF_ONLY = (name: string, type: string) =>
  /\.pdf$/i.test(name) || type === "application/pdf";


const MAX_TOTAL = 40 * 1024 * 1024; // 40 MB per submission

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

async function handle(req: Request) {
  const session = await getClientSession();
  if (!session) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — lodging is disabled." }, { status: 403 }
    );
  }

  const form = await req.formData();
  const address = tidyAddress(String(form.get("address") || ""));
  const jobClass = tidyAddress(String(form.get("jobClass") || ""));
  const description = tidyAddress(String(form.get("description") || ""));
  const notes = String(form.get("notes") || "").trim().slice(0, 4000);
  const contact = String(form.get("contact") || "").trim().toLowerCase();
  const amendmentOf = tidyAddress(String(form.get("amendmentOf") || "")) || null;

  if (!address || !description || !jobClass) {
    return NextResponse.json({ error: "Site address, class and description are required." }, { status: 400 });
  }

  // An amendment must point at a job this company actually has.
  if (amendmentOf) {
    const own = await repo.listJobsForCompany(session.companyId);
    if (!own.some((j) => j.ref === amendmentOf)) {
      return NextResponse.json({ error: "That job isn't on your account." }, { status: 404 });
    }
  }

  const uploads = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const categories = form.getAll("fileCategories").map(String);

  // PDFs only. The client-side filter can be bypassed, and the person who
  // opens these is a member of staff, not a browser.
  const rejected = uploads.filter((f) => !PDF_ONLY(f.name, f.type)).map((f) => f.name);
  if (rejected.length) {
    return NextResponse.json(
      { error: `PDFs only. Convert or remove: ${rejected.slice(0, 4).join(", ")}` },
      { status: 415 }
    );
  }

  // The client-side check can be bypassed, so the rule lives here too. An
  // amendment is exempt: the revised drawings are the point, and the
  // engineering may not have changed.
  if (!amendmentOf) {
    const have = new Set(categories);
    const missing = ["drawings", "engineering"].filter((c) => !have.has(c));
    if (missing.length) {
      return NextResponse.json(
        { error: `Attach ${missing.join(" and ")} before lodging — an assessment can't start without them.` },
        { status: 400 }
      );
    }
  }
  const total = uploads.reduce((n, f) => n + f.size, 0);
  if (total > MAX_TOTAL) {
    return NextResponse.json(
      { error: "Those files come to more than 40 MB. Send the largest ones to the office by email." },
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

  await repo.addSubmission({
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

  return NextResponse.json({ ok: true, id });
}
