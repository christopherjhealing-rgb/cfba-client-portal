import { NextResponse } from "next/server";
import crypto from "crypto";
import { env, DEMO_MODE } from "@/lib/env";
import { setStaffSession } from "@/lib/session";
import { checkLock, recordFailure, clearFailures } from "@/lib/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0].trim();
  return first || req.headers.get("x-real-ip") || "unknown";
}

export async function POST(req: Request) {
  // Fail closed: a live deployment must not run on the default staff passcode.
  if (!DEMO_MODE && env.staffPasscode === "demo") {
    console.error("admin login refused: STAFF_PASSCODE is the default 'demo' in a live environment");
    return NextResponse.json(
      { error: "Staff access isn't configured. Set STAFF_PASSCODE." },
      { status: 503 }
    );
  }

  // Throttle by IP. The client login is throttled per-username; the staff
  // passcode has no username, so an unthrottled endpoint is a shared secret
  // open to unlimited online guessing. Keyed on IP so one attacker can't lock
  // out staff signing in from elsewhere.
  const key = `staff:${clientIp(req)}`;
  const locked = await checkLock(key);
  if (locked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }

  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  const given = Buffer.from(String(passcode || ""));
  const want = Buffer.from(env.staffPasscode);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) {
    await recordFailure(key);
    console.warn(`admin login: failed passcode attempt from ${clientIp(req)}`);
    return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  }

  await clearFailures(key);
  await setStaffSession();
  return NextResponse.json({ ok: true });
}
