import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { buildRecord } from "@/lib/record-build";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A long thread with a dozen attachments is a lot of blobs to read back.
export const maxDuration = 300;

/**
 * The correspondence record for one job, as a zip.
 *
 *   <ref> correspondence.pdf   the transcript, for filing
 *   <ref> correspondence.txt   the same words with no reader required
 *   attachments/NN <name>      every document the client sent
 *
 * Staff only, and logged: this is the whole conversation with a client, and
 * who took a copy of it is part of the record too.
 *
 * The assembly lives in lib/record-build because the automatic copy sent when
 * a client downloads their package has to produce exactly the same bytes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  if (!(await isStaff())) return new Response("Not signed in", { status: 401 });

  const ref = decodeURIComponent((await params).ref);
  const built = await buildRecord(ref);
  if (!built) return new Response("No such job", { status: 404 });

  if (built.missing.length) {
    console.warn(`records ${ref}: ${built.missing.length} attachment(s) unreadable — ${built.missing.join(" | ")}`);
  }
  await repo.logAudit("correspondence.export", ref, "downloaded by staff", "staff")
    .catch(() => { /* a lost audit line must not cost the record */ });

  return new Response(new Uint8Array(built.zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${built.filename}"`,
      "Content-Length": String(built.zip.length),
      "Cache-Control": "no-store",
    },
  });
}
