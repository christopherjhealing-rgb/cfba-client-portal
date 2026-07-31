import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
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
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export const POST = handle;
export const GET = handle; // Vercel Cron issues GET
