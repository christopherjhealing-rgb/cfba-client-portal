import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import { unlock } from "@/lib/throttle";
import { normUsername } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Clear a lockout so the office can put a client straight back in. */
export async function POST(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const { username } = await req.json().catch(() => ({}));
  const u = normUsername(username);
  if (!u) return NextResponse.json({ error: "Which username?" }, { status: 400 });
  await unlock(u);
  return NextResponse.json({ ok: true });
}
