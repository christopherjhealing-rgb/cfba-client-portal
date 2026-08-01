// My documents — a client's own library of reusable engineering PDFs.
// Every handler is scoped to the signed-in company; an id in a request only
// ever resolves against that company's own index, so one client can never
// see, rename or delete another's documents.
import { NextResponse } from "next/server";
import { getClientSession, type ClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { listLibrary, saveLibrary, libraryPath } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per saved document

const PDF_ONLY = (name: string, type: string) =>
  /\.pdf$/i.test(name) || type === "application/pdf";

const SIGNED_OUT = {
  error: "Your session has ended — sign in again and you can pick up where you left off.",
};
const FAILED = {
  error: "We couldn't update your documents — nothing was changed. Please try again, and contact the office if it happens twice.",
};

/** Writes need a real client, not a staff member viewing as one. */
function writeBlock(session: ClientSession): NextResponse | null {
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — changing documents is disabled." },
      { status: 403 }
    );
  }
  return null;
}

export async function GET() {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
    return NextResponse.json({ docs: await listLibrary(session.companyId) });
  } catch (e) {
    console.error("library list failed:", e);
    return NextResponse.json(FAILED, { status: 500 });
  }
}

/** Save a new document. Multipart: file (PDF), label. */
export async function POST(req: Request) {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
    const blocked = writeBlock(session);
    if (blocked) return blocked;

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Attach the PDF you'd like to save." }, { status: 400 });
    }
    if (!PDF_ONLY(file.name, file.type)) {
      return NextResponse.json(
        { error: `We can only accept PDFs — please convert ${file.name} first.` },
        { status: 415 }
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "That file is over 25 MB — email it to admin@cfba.com.au and we'll add it to your jobs for you." },
        { status: 413 }
      );
    }

    // A blank label falls back to the filename — a saved document with no
    // name at all would be useless in the lodgement tick-list.
    const label = String(form.get("label") || "").trim().slice(0, 80)
      || file.name.replace(/\.pdf$/i, "");

    const id = "doc_" + Math.random().toString(36).slice(2, 10);
    const safe = file.name.replace(/[^A-Za-z0-9 ._-]/g, "_").slice(0, 120);
    const bytes = Buffer.from(await file.arrayBuffer());
    await repo.writeFile(libraryPath(session.companyId, { id, file: safe }), bytes, "application/pdf");

    const doc = { id, label, file: safe, size: bytes.length, uploadedAt: new Date().toISOString() };
    const docs = [...(await listLibrary(session.companyId)), doc];
    await saveLibrary(session.companyId, docs);

    await repo.logAudit("library.upload", label, session.companyName, session.username || "client");
    return NextResponse.json({ ok: true, docs });
  } catch (e) {
    console.error("library upload failed:", e);
    return NextResponse.json(FAILED, { status: 500 });
  }
}

/** Rename: { id, label }. The file itself never moves. */
export async function PATCH(req: Request) {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
    const blocked = writeBlock(session);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const label = String(body.label || "").trim().slice(0, 80);
    if (!label) return NextResponse.json({ error: "Give the document a name." }, { status: 400 });

    const docs = await listLibrary(session.companyId);
    if (!docs.some((d) => d.id === id)) {
      return NextResponse.json(
        { error: "We can't find that document — refresh the page and try again." }, { status: 404 }
      );
    }
    const next = docs.map((d) => (d.id === id ? { ...d, label } : d));
    await saveLibrary(session.companyId, next);
    return NextResponse.json({ ok: true, docs: next });
  } catch (e) {
    console.error("library rename failed:", e);
    return NextResponse.json(FAILED, { status: 500 });
  }
}

/** Remove: { id }. Deletes the stored file and the index entry. */
export async function DELETE(req: Request) {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
    const blocked = writeBlock(session);
    if (blocked) return blocked;

    const body = await req.json().catch(() => ({}));
    const id = String(body.id || "");
    const docs = await listLibrary(session.companyId);
    const doc = docs.find((d) => d.id === id);
    if (!doc) {
      return NextResponse.json(
        { error: "We can't find that document — refresh the page and try again." }, { status: 404 }
      );
    }
    // The index entry is the point; a stray blob with no entry is invisible
    // and harmless, so a failed storage delete doesn't block the removal.
    await repo.deleteFile(libraryPath(session.companyId, doc)).catch(() => {});
    const next = docs.filter((d) => d.id !== id);
    await saveLibrary(session.companyId, next);

    await repo.logAudit("library.delete", doc.label, session.companyName, session.username || "client");
    return NextResponse.json({ ok: true, docs: next });
  } catch (e) {
    console.error("library delete failed:", e);
    return NextResponse.json(FAILED, { status: 500 });
  }
}
