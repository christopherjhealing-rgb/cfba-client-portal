import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { PORTAL_FORMS } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isFormKey = (k: string) => PORTAL_FORMS.some((f) => f.key === k);

/** Upload (or remove) the current PDF for a council form. Staff-only. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const key = String(body.key || "");
    if (!isFormKey(key)) return NextResponse.json({ error: "Unknown form." }, { status: 400 });
    const dest = `forms/${key}.pdf`;

    if (body.revert === true) {
      await repo.deleteFile(dest);
      return NextResponse.json({ ok: true, removed: true });
    }

    const draftId = String(body.draftId || "");
    const name = String(body.name || "");
    if (!/^up_[0-9a-f-]{20,}$/i.test(draftId) || !/\.pdf$/i.test(name)) {
      return NextResponse.json({ error: "That upload can't be found — please try again." }, { status: 400 });
    }
    const draftPath = `uploads/staff/${draftId}/${name}`;
    const landed = await repo.listFiles(`uploads/staff/${draftId}`);
    if (!landed.some((f) => f.name === name)) {
      return NextResponse.json({ error: "The file didn't finish uploading — please try again." }, { status: 400 });
    }
    const bytes = await repo.readFile(draftPath);
    await repo.writeFile(dest, bytes, "application/pdf");
    await repo.deleteFile(draftPath);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("form update failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
