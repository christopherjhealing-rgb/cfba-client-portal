import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { AMENDMENT_DONE } from "@/lib/core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A revised certificate, back to the client who asked for the amendment.
 *
 * Amendments never get a Monday card, so their files never travel through the
 * sync and never join a job's issued package. They're served from here
 * instead — same ownership rule as everything else: the file belongs to the
 * submission, the submission belongs to a company, and that company has to be
 * the one asking. A wrong id and a someone-else's id give the same 404, so
 * this can't be used to find out what exists.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; file: string }> }
) {
  const session = await getClientSession();
  if (!session) return new Response("Not found", { status: 404 });

  const { id, file: raw } = await params;
  const file = decodeURIComponent(raw);

  const sub = await repo.getSubmission(id).catch(() => null);
  if (!sub || sub.companyId !== session.companyId) {
    return new Response("Not found", { status: 404 });
  }
  // Only once it's actually been sent back, and only a name the submission
  // itself lists — so the path can never be steered anywhere else.
  if (sub.status !== AMENDMENT_DONE || !sub.files.some((f) => f.name === file)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = await repo.readFileStream(`amendments/${id}/${file}`);
  if (!stream) return new Response("Not found", { status: 404 });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
