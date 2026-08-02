import JSZip from "jszip";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const session = await getClientSession();
  if (!session) return new Response("Not signed in", { status: 401 });

  if ((await repo.disabledPages()).has("downloads")) {
    return new Response(
      "Downloads are temporarily offline while we make updates — please try again shortly.",
      { status: 503 }
    );
  }

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

  // Skipping an unreadable blob keeps a partly-good package downloadable, but
  // skipping ALL of them used to hand the client a valid, empty zip and call
  // it done — which looks exactly like "nothing happened". Count them.
  const zip = new JSZip();
  let added = 0;
  const failed: string[] = [];
  for (const f of files) {
    try {
      const bytes = await repo.readFile(f.storagePath);
      if (!bytes.length) throw new Error("stored file is empty");
      zip.file(f.filename, bytes);
      added++;
    } catch (e) {
      failed.push(`${f.filename}: ${(e as Error).message}`);
    }
  }
  if (added === 0) {
    console.error(`download ${ref}: nothing readable of ${files.length} file(s) — ${failed.join(" | ")}`);
    return new Response(
      "We can't put your CDC Package together at the moment — the files are listed " +
      "but we can't read them back. We've been told about it; ring us on " +
      "1300 029 074 and we'll email them straight over.",
      { status: 500 }
    );
  }
  if (failed.length) {
    console.warn(`download ${ref}: ${failed.length} file(s) skipped — ${failed.join(" | ")}`);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer" });

  const firstDownload = !job.firstDownloadedAt;
  const now = new Date();
  await repo.markDownloaded(ref, now.toISOString());
  await repo.logAudit("certificate.download", ref, session.companyName, session.username || "client");

  // Download receipt on the Monday card, once, so the office can see the client
  // has the CDC Package — kills the "did you get it?" call. Also starts the
  // retention clock (markDownloaded), which is why it fires on first download.
  if (firstDownload && job.mondayItemId) {
    try {
      await monday.postUpdate(
        job.mondayItemId,
        `The client downloaded the CDC Package via the portal on ` +
        `${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.`
      );
    } catch (e) {
      console.warn(`download: could not post receipt for ${ref}:`, (e as Error).message);
    }

    // …and mark the "Send?" column SENT, so the board shows the job has gone
    // out without anyone having to open the updates to find out. Usually the
    // issued email got there first and this is a no-op; it fires anyway,
    // because a job the client downloaded is a job the client has, whatever
    // happened to the email.
    //
    // Nothing here may cost the client their files. The zip is already built;
    // a board that is down, slow or shaped differently than we expect is the
    // office's problem to hear about in the log, not the client's to be told
    // about at the moment they click Download.
    const r = await monday.markSent(job.mondayItemId);
    if (!r.ok && r.reason === "failed") {
      console.warn(`download ${ref}: "Send?" not marked SENT — ${r.detail}`);
    }
  }

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
