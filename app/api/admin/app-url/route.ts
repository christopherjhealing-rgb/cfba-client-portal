import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { setAppUrl, tidyUrl } from "@/lib/appurl";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set the address every emailed link points at.
 *
 * Staff-only and logged. Getting this wrong sends clients nowhere — which is
 * precisely why it is settable here rather than only in a deployment
 * environment nobody can reach from a phone at 3pm on a Tuesday.
 */
export async function POST(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const { url } = await req.json().catch(() => ({}));
  const raw = String(url || "").trim();

  // Blank clears the override and falls back to the environment.
  if (raw === "") {
    const now = await setAppUrl("");
    await repo.logAudit("settings.app_url", now, "cleared — using the deployment's own value", "staff")
      .catch(() => {});
    return NextResponse.json({ ok: true, url: now, stored: "" });
  }

  const clean = tidyUrl(raw);
  if (!clean) {
    return NextResponse.json(
      { error: "That doesn't look like a web address. It needs to start with https:// — for example https://cfba-client-portal-theta.vercel.app" },
      { status: 400 }
    );
  }
  const now = await setAppUrl(clean);
  await repo.logAudit("settings.app_url", clean, `was ${env.appUrl}`, "staff").catch(() => {});
  return NextResponse.json({ ok: true, url: now, stored: clean });
}
