import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { isPublishedSheet, sheetStoragePath, GUIDE_PATH } from "@/lib/info-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Replace a guidance note with a staff-uploaded PDF (already PUT into the
 *  staff draft area via a signed URL), or revert one to the shipped original. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    // The welcome guide rides the same route: identical shape — one PDF, an
    // override slot, revert to the shipped copy — and a second endpoint doing
    // the same thing is a second endpoint to keep in step.
    const guide = key === "__guide";
    if (!guide && !isPublishedSheet(key)) {
      return NextResponse.json({ error: "Unknown info sheet." }, { status: 400 });
    }
    const dest = guide ? GUIDE_PATH : sheetStoragePath(key);

    if (body.revert === true) {
      await repo.deleteFile(dest);
      return NextResponse.json({ ok: true, reverted: true });
    }

    const draftId = String(body.draftId || "");
    const name = String(body.name || "");
    if (!/^up_[0-9a-f-]{20,}$/i.test(draftId) || !name || !/\.pdf$/i.test(name)) {
      return NextResponse.json(
        { error: "That upload can't be found — please try again." }, { status: 400 }
      );
    }

    const draftPath = `uploads/staff/${draftId}/${name}`;
    const landed = await repo.listFiles(`uploads/staff/${draftId}`);
    if (!landed.some((f) => f.name === name)) {
      return NextResponse.json(
        { error: "The file didn't finish uploading — please try again." }, { status: 400 }
      );
    }

    // Overwrite the override slot, then clear the draft.
    const bytes = await repo.readFile(draftPath);
    await repo.writeFile(dest, bytes, "application/pdf");
    await repo.deleteFile(draftPath);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("info-sheet update failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
