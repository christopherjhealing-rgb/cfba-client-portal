import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import {
  PORTAL_FORMS, FORM_MIME, formExtOf, formFileNames,
} from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isFormKey = (k: string) => PORTAL_FORMS.some((f) => f.key === k);

/** Upload (or remove) the current file for a council form. PDF or Word —
 *  councils publish both, and the Word original is the more useful one because
 *  the client can fill it in rather than print, write and scan. Staff-only. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    if (!isFormKey(key)) return NextResponse.json({ error: "Unknown form." }, { status: 400 });

    // Remove every format, not just the one we happen to be writing. One form
    // hosted twice is one client downloading last year's version.
    const clearOthers = async (except?: string) => {
      for (const f of formFileNames(key)) {
        if (f !== except) await repo.deleteFile(`forms/${f}`).catch(() => {});
      }
    };

    if (body.revert === true) {
      await clearOthers();
      return NextResponse.json({ ok: true, removed: true });
    }

    const draftId = String(body.draftId || "");
    const name = String(body.name || "");
    const ext = formExtOf(name);
    if (!/^up_[0-9a-f-]{20,}$/i.test(draftId) || !ext) {
      return NextResponse.json({ error: "That upload can't be found — please try again." }, { status: 400 });
    }
    const draftPath = `uploads/staff/${draftId}/${name}`;
    const landed = await repo.listFiles(`uploads/staff/${draftId}`);
    if (!landed.some((f) => f.name === name)) {
      return NextResponse.json({ error: "The file didn't finish uploading — please try again." }, { status: 400 });
    }
    const file = `${key}.${ext}`;
    const bytes = await repo.readFile(draftPath);
    await repo.writeFile(`forms/${file}`, bytes, FORM_MIME[ext]);
    await clearOthers(file);
    await repo.deleteFile(draftPath);
    return NextResponse.json({ ok: true, file, ext });
  } catch (e) {
    console.error("form update failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
