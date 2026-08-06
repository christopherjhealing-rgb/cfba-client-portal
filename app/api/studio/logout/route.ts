import { NextResponse } from "next/server";
import { clearStudioSession } from "@/lib/studio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  await clearStudioSession();
  return NextResponse.json({ ok: true });
}
