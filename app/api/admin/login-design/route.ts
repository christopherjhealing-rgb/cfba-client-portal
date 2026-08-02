import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Choose which sign-in layout clients see: "new" (premium photo treatment)
 *  or "classic" (the original split panel). The sign-in page reads the
 *  setting server-side on every request, so this takes effect on the next
 *  page load — an instant switchback with no deploy. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const design =
      body.design === "classic" ? "classic" : body.design === "new" ? "new" : null;
    if (!design) {
      return NextResponse.json({ error: "Unknown design." }, { status: 400 });
    }
    await repo.setSetting("login_design", { design });
    await repo.logAudit("login_design.set", design);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("login-design settings failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
