import JSZip from "jszip";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const session = await getClientSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  const ref = decodeURIComponent((await params).ref);
  const job = await repo.getJob(ref);
  // Never leak another company's job — same 404 whether missing or not theirs.
  if (!job || job.companyId !== session.companyId) {
    return new Response("Not found", { status: 404 });
  }

  const files = await repo.jobFiles(ref);
  if (files.length === 0) {
    return new Response("This job has no files to download yet.", { status: 409 });
  }

  const zip = new JSZip();
  for (const f of files) {
    try {
      const bytes = await repo.readFile(f.storagePath);
      zip.file(f.filename, bytes);
    } catch {
      // Skip a missing blob rather than failing the whole download.
    }
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  await repo.markDownloaded(ref, new Date().toISOString());

  const safe = (job.address || ref).replace(/[^A-Za-z0-9 .-]/g, "").slice(0, 60).trim();
  const filename = `CFBA ${ref} - ${safe}.zip`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buf.length),
      "Cache-Control": "no-store",
    },
  });
}
