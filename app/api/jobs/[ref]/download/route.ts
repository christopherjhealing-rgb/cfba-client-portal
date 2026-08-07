import JSZip from "jszip";
import { after } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { notifyTeams } from "@/lib/teams";
import { mailJobRecord } from "@/lib/record-mail";
import { fileJobRecord } from "@/lib/record-file";
import { buildRecord } from "@/lib/record-build";
import { env } from "@/lib/env";

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

  // Hand the client their zip the moment it's built. Everything the office
  // needs from a download runs AFTER the response is sent — Vercel keeps the
  // function alive for after(), so nothing is lost, and a download is only ever
  // as slow as zipping the files, not the mailbox and the board behind them.
  //
  //   • The correspondence record — emailed to the office and (when
  //     RECORD_TO_FOLDER is on) filed to the Issued folder — kept ONCE per job.
  //     Once the office has it, a re-download doesn't send it again (Chris's
  //     call). The gate is the record actually having been kept, not merely a
  //     previous download: if the first attempt never reached the office (a
  //     mailbox down), a later download still retries, so the seven-year record
  //     can't go missing because one collection happened to fail.
  //   • The one-time state events, first download only: the board receipt
  //     (posting it every time would spam the card), the PORTAL move to
  //     DOWNLOADED, and the Teams ping.
  after(async () => {
    const recordKey = `record:${ref}`;
    const wantRecord =
      (env.recordEmailEnabled || env.recordToFolderEnabled) &&
      !(await repo.getSetting(recordKey).catch(() => null));
    if (wantRecord) {
      try {
        const built = await buildRecord(ref);
        const r = await mailJobRecord(ref, { prebuilt: built });
        if (r === "failed") console.warn(`download ${ref}: correspondence record not emailed`);
        const f = await fileJobRecord(ref, { prebuilt: built });
        if (f === "failed") console.warn(`download ${ref}: correspondence record not filed to SharePoint`);
        // Marked kept once a copy is safely away — the email the office keeps,
        // or the folder copy when that's the only channel switched on. A later
        // re-download then leaves it alone; a failed attempt is left un-marked
        // so the next download tries again.
        if (r === "sent" || f === "filed") {
          await repo.setSetting(recordKey, { at: now.toISOString() }).catch(() => {});
        }
      } catch (e) {
        console.warn(`download ${ref}: correspondence record not kept —`, (e as Error).message);
      }
    }

    if (!firstDownload) return;

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

    // Off by default: the one notification here that asks nothing of anybody.
    await notifyTeams("downloaded", {
      title: `${session.companyName} downloaded ${ref}`,
      facts: [["Job", ref], ["Site", job.address || ""]],
      text: "Their certificate is in their hands — nothing to do.",
    });
  });

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
