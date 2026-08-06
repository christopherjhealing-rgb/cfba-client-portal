import { NextResponse } from "next/server";
import { verifyStudioLogin, setStudioSession, emailKey } from "@/lib/studio";
import { checkLock, recordFailure, clearFailures } from "@/lib/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { email?: string; password?: string } = {};
  try { body = await req.json(); } catch { /* fall through */ }
  const email = String(body.email || "").trim();
  const key = `studio:${emailKey(email)}`;

  const wait = await checkLock(key);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Too many attempts — try again in ${wait} minute${wait === 1 ? "" : "s"}.` },
      { status: 429 });
  }

  const user = await verifyStudioLogin(email, String(body.password || ""));
  if (!user) {
    await recordFailure(key);
    // One message for a wrong password and an unknown email — the sign-in
    // form must not be an account-enumeration oracle.
    return NextResponse.json(
      { error: "That email and password don't match an account here." },
      { status: 401 });
  }
  await clearFailures(key);
  await setStudioSession(user.email, user.name || user.email);
  return NextResponse.json({ ok: true });
}
