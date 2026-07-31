import { NextResponse } from "next/server";
import { clearClientSession, clearStaffSession } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(req: Request) {
  await clearClientSession();
  await clearStaffSession();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
