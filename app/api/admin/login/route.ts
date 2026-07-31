import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";
import { setStaffSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  const given = Buffer.from(String(passcode || ""));
  const want = Buffer.from(env.staffPasscode);
  const ok = given.length === want.length && crypto.timingSafeEqual(given, want);
  if (!ok) return NextResponse.json({ error: "That passcode isn't right." }, { status: 401 });
  await setStaffSession();
  return NextResponse.json({ ok: true });
}
