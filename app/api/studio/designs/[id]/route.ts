import { NextResponse } from "next/server";
import {
  studioIdentity, getDesign, getDesignMeta, saveDesign, renameDesign, deleteDesign,
} from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every handler resolves the caller's own owner key first, so one account can
// never read, write or delete another's design no matter what id it guesses —
// the id only means anything inside that owner's namespace.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const who = await studioIdentity();
  if (!who) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = (await params).id;
  const meta = await getDesignMeta(who.owner, id);
  if (!meta) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json({ meta, design: await getDesign(who.owner, id) });
}

export async function PUT(req: Request, { params }: Ctx) {
  const who = await studioIdentity();
  if (!who) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = (await params).id;
  let body: { design?: unknown; address?: string; name?: string } = {};
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (typeof body.name === "string") {
    if (!(await renameDesign(who.owner, id, body.name))) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  }
  if (body.design !== undefined) {
    const r = await saveDesign(who.owner, id, body.design,
      typeof body.address === "string" ? body.address : undefined);
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const who = await studioIdentity();
  if (!who) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = (await params).id;
  if (!(await deleteDesign(who.owner, id))) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
