import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { listEngSets, saveEngSets, setStoragePath, slugify } from "@/lib/engineering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Checker apps are small self-contained pages; 2 MB is generous headroom and
// stays well inside the platform's request-body limit.
const MAX_BYTES = 2 * 1024 * 1024;

/** Upload or replace an engineering checker set (staff only). Multipart:
 *  file (.html), name, clients (comma-separated company names, optional —
 *  blank means every client can open it). */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const form = await req.formData();
    const file = form.get("file");
    const name = String(form.get("name") || "").trim();
    const clientsRaw = String(form.get("clients") || "");

    if (!name) return NextResponse.json({ error: "Give the set a name." }, { status: 400 });
    if (!(file instanceof File) || !/\.html?$/i.test(file.name)) {
      return NextResponse.json({ error: "Attach the checker as a .html file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "That file is over 2 MB — checker pages are small; is this the right file?" }, { status: 400 });
    }

    const clients = clientsRaw
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

    const sets = await listEngSets();
    const key = sets.find((s) => s.name.toLowerCase() === name.toLowerCase())?.key
      || slugify(name);

    const bytes = Buffer.from(await file.arrayBuffer());
    await repo.writeFile(setStoragePath(key), bytes, "text/html");

    const entry = { key, name, clients, uploadedAt: new Date().toISOString() };
    const next = [...sets.filter((s) => s.key !== key), entry];
    await saveEngSets(next);

    await repo.logAudit("engineering.set-upload", key,
      clients.length ? `restricted to: ${clients.join(", ")}` : "visible to all clients");
    return NextResponse.json({ ok: true, sets: next });
  } catch (e) {
    console.error("engineering set upload failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/** Remove a set: registry entry and stored file. */
export async function DELETE(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    const sets = await listEngSets();
    if (!sets.some((s) => s.key === key)) {
      return NextResponse.json({ error: "Unknown set." }, { status: 400 });
    }
    await repo.deleteFile(setStoragePath(key)).catch(() => {});
    const next = sets.filter((s) => s.key !== key);
    await saveEngSets(next);
    await repo.logAudit("engineering.set-delete", key);
    return NextResponse.json({ ok: true, sets: next });
  } catch (e) {
    console.error("engineering set delete failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
