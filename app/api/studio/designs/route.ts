import { NextResponse } from "next/server";
import { studioIdentity, listDesigns, createDesign, duplicateDesign } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const who = await studioIdentity();
  if (!who) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  return NextResponse.json({ designs: await listDesigns(who.owner) });
}

/** Create a design — blank, or a duplicate of one of the caller's own. */
export async function POST(req: Request) {
  const who = await studioIdentity();
  if (!who) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  let body: { name?: string; duplicateOf?: string } = {};
  try { body = await req.json(); } catch { /* blank create */ }

  const r = body.duplicateOf
    ? await duplicateDesign(who.owner, String(body.duplicateOf))
    : await createDesign(who.owner, String(body.name || "Untitled plan"));
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id });
}
