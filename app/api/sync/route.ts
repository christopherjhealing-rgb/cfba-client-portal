import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function cronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

async function handle(req: Request) {
  if (!(await isStaff()) && !cronAuthorised(req)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }
  try {
    return NextResponse.json(await runSync());
  } catch (e) {
    const error = (e as Error).message;
    // Record the failure so the admin health banner can show it — a silently
    // failing cron is exactly how this portal goes stale unnoticed.
    await repo.setSetting("last_sync", { at: new Date().toISOString(), ok: false, error })
      .catch(() => {});
    return NextResponse.json({ error }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // Vercel Cron issues GET
