import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Staff removal of a single job from the portal. Portal-side only — Monday is
 * the record and is untouched. For a job whose card has been deleted or
 * cancelled on the board, or a test job. If the card still exists, the next
 * sync brings the job back, so this is for jobs the board no longer has.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const ref = decodeURIComponent((await params).ref);
  const removed = await repo.deleteJob(ref);
  if (!removed) {
    return NextResponse.json({ error: "No such job in the portal." }, { status: 404 });
  }
  await repo.logAudit("job.removed", ref, "removed from the portal (Monday untouched)", "staff")
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
