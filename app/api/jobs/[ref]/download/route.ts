import JSZip from "jszip";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { notifyTeams } from "@/lib/teams";
import { mailJobRecord } from "@/lib/record-mail";
import { fileJobRecord } from "@/lib/record-file";
import { buildRecord } from "@/lib/record-build";

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

  // Everything below fires once, on first download — and none of it may cost
  // the client their files. The zip is already built; a board or mailbox
  // that's down is the office's problem to read in the log and the evening
  // report, never the client's to meet at the Download button.
  if (firstDownload) {
    // The board-side receipt and PORTAL move need the card; the record copy
    // below deliberately doesn't — a job without its item id must still be
    // filed. (Found live: the record email sat inside this card check, so any
    // job that skipped it also skipped the seven-year copy.)
    if (job.mondayItemId) {
      // Download receipt on the card, so the office can see the client has
      // the CDC Package — kills the "did you get it?" call.
      try {
        await monday.postUpdate(
          job.mondayItemId,
          `The client downloaded the CDC Package via the portal on ` +
          `${now.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}.`
        );
      } catch (e) {
        console.warn(`download: could not post receipt for ${ref}:`, (e as Error).message);
      }

      // …and move PORTAL to DOWNLOADED — the last rung, and the only one
      // nobody but the portal can see. The board now reads the whole journey
      // without anyone opening the updates: ISSUED when the portal picks the
      // card up, READY when it has the files and the client's been told,
      // DOWNLOADED here.
      const r = await monday.markDownloaded(job.mondayItemId);
      if (!r.ok && r.reason === "failed") {
        console.warn(`download ${ref}: PORTAL not moved to DOWNLOADED — ${r.detail}`);
        await repo.noteBoardWriteFail(ref, r.detail || "unknown").catch(() => {});
      }
    } else {
      console.warn(`download ${ref}: job has no Monday item id — no receipt, PORTAL not moved`);
    }

    // The file copy. A client collecting their package is the moment a job is
    // finished in every sense that matters, so the seven-year record of the
    // correspondence goes to the office now rather than waiting for somebody
    // to remember — emailed to the office, and (when RECORD_TO_FOLDER is on)
    // filed back into the job's own Issued folder beside the certified
    // documents. Built once, handed to both. A job with nothing said on it
    // sends and files nothing.
    //
    // Wrapped, like everything else below: the zip is already built and the
    // client is mid-download. A mailbox or library that's down is the office's
    // problem to read in the log, never the client's to meet at the Download
    // button.
    try {
      const built = await buildRecord(ref);
      const r = await mailJobRecord(ref, { prebuilt: built });
      if (r === "failed") console.warn(`download ${ref}: correspondence record not emailed`);
      const f = await fileJobRecord(ref, { prebuilt: built });
      if (f === "failed") console.warn(`download ${ref}: correspondence record not filed to SharePoint`);
    } catch (e) {
      console.warn(`download ${ref}: correspondence record not kept —`, (e as Error).message);
    }

    // First download only. Off by default: it's the one notification here that
    // asks nothing of anybody, and one per job is a lot of nothing.
    await notifyTeams("downloaded", {
      title: `${session.companyName} downloaded ${ref}`,
      facts: [["Job", ref], ["Site", job.address || ""]],
      text: "Their certificate is in their hands — nothing to do.",
    });
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
