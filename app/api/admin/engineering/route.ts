import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Enable/disable client access to the engineering checker, and set its URL.
 *  Off by default — the checker ships dormant until staff turn it on. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    await repo.setSetting("engineering", {
      enabled: !!body.enabled,
      url: String(body.url || "").trim(),
    });
    await repo.logAudit("engineering.settings", body.enabled ? "enabled" : "disabled");
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("engineering settings failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
