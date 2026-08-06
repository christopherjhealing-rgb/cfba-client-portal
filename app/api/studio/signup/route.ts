import { NextResponse } from "next/server";
import { createStudioUser, setStudioSession, emailKey } from "@/lib/studio";
import { checkLock, recordFailure } from "@/lib/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Open signup — the free door. Throttled per email so the form can't be used
 *  to hose the settings store, and the response never says which field was
 *  wrong beyond what the person needs to fix. */
export async function POST(req: Request) {
  let body: { email?: string; name?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* fall through to validation */ }
  const email = String(body.email || "").trim();
  const password = String(body.password || "");

  const wait = await checkLock(`studio:${emailKey(email)}`);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${wait} minute${wait === 1 ? "" : "s"}.` },
      { status: 429 });
  }

  const r = await createStudioUser(email, String(body.name || ""), password);
  if (!r.ok) {
    await recordFailure(`studio:${emailKey(email)}`);
    return NextResponse.json({ error: r.error }, { status: 400 });
  }
  await setStudioSession(email, String(body.name || "").trim() || email);
  return NextResponse.json({ ok: true });
}
