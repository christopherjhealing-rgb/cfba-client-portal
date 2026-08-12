import { NextResponse } from "next/server";
import { getClientSession, isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The pilot's listening post. Rides the audit log (append-only, no schema),
// surfaced at /admin/feedback. Everything captured is shown to the sender in
// the widget before they hit Send — nothing rides along silently.
const CATEGORIES = new Set([
  "confusing", "slow", "broken", "idea", "praise", "pilot-question",
]);
const MAX_BODY = 2000;

export async function POST(req: Request) {
  const [session, staff] = await Promise.all([getClientSession(), isStaff()]);
  if (!session && !staff) {
    return NextResponse.json(
      { error: "Your session has ended — sign in again and you can pick up where you left off." },
      { status: 401 }
    );
  }
  // A staff member viewing a client's portal must not file feedback as them.
  if (session?.impersonated && !staff) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — feedback is disabled." },
      { status: 403 }
    );
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const category = String(b.category || "");
  if (!CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Pick what this is about first." }, { status: 400 });
  }
  const body = String(b.body || "").trim().slice(0, MAX_BODY);
  if (!body && category !== "pilot-question") {
    return NextResponse.json({ error: "Tell us a line — even a short one helps." }, { status: 400 });
  }

  const context = {
    body,
    page: String(b.page || "").slice(0, 200),
    jobRef: b.jobRef ? String(b.jobRef).slice(0, 40) : null,
    contactOk: !!b.contactOk,
    ua: String(b.ua || "").slice(0, 40),
    company: session?.companyName || null,
    impersonated: !!session?.impersonated,
  };
  const actor = session && !session.impersonated
    ? (session.username || "client")
    : "staff";

  await repo.logAudit("feedback", category, JSON.stringify(context), actor);
  return NextResponse.json({ ok: true });
}
