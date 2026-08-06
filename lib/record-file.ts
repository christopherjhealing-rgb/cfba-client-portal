import { env } from "./env";
import { uploadFile } from "./graph";
import { buildRecord, type BuiltRecord } from "./record-build";
import * as repo from "./repo";

/**
 * The copy that goes back where the job lives.
 *
 * The emailed record (record-mail) reaches the office inbox; this files the
 * same zip into the job's own SharePoint Issued folder, beside the certified
 * documents it belongs to — so the seven-year record is with the job, not
 * only in a mailbox.
 *
 * Same judgements as the email, for the same reasons: a job with no portal
 * correspondence files nothing, and what's filed is a snapshot (a same-name
 * re-run replaces it with the fresher one — the folder never collects copies).
 * Unlike the email there is no size fallback: a folder has no 4 MB cap, so
 * the whole zip goes every time.
 */
export async function fileJobRecord(
  ref: string,
  opts: { force?: boolean; prebuilt?: BuiltRecord | null } = {}
): Promise<"filed" | "no-messages" | "off" | "no-folder" | "failed"> {
  // Unlike the email's test-send, force does NOT bypass the switch: this
  // writes into the document library, and a test that writes somewhere the
  // office hasn't opted into isn't a test, it's a surprise.
  if (!env.recordToFolderEnabled) return "off";

  const job = await repo.getJob(ref);
  // sourceFolder is the Issued folder's path under the client-files root,
  // recorded by the sync when it collected the files. Without it there is
  // nowhere to file to — old jobs synced before it was recorded look like
  // this until their next sync.
  if (!job?.sourceFolder) return "no-folder";

  const built = opts.prebuilt ?? (await buildRecord(ref));
  if (!built) return "failed";
  if (built.transcript.count === 0) return "no-messages";

  try {
    await uploadFile(job.sourceFolder, built.filename, built.zip);
  } catch (e) {
    console.warn(`record-file ${ref}: not filed —`, (e as Error).message);
    return "failed";
  }

  await repo.logAudit("correspondence.filed", ref,
    `${built.transcript.count} message(s) to ${job.sourceFolder}/${built.filename}`,
    "portal").catch(() => {});
  return "filed";
}
