import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isPageKey } from "@/lib/pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const { key, disabled } = await req.json().catch(() => ({}));
    if (!isPageKey(String(key || ""))) {
      return NextResponse.json({ error: "Unknown page." }, { status: 400 });
    }
    await repo.setPageDisabled(String(key), !!disabled);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("settings failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
