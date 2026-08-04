import { env } from "./env";
import { sendMail, recordEmail, fitAttachments, type MailAttachment } from "./mail";
import { buildRecord } from "./record-build";
import * as repo from "./repo";

/**
 * The automatic copy for the file.
 *
 * A building surveyor keeps the correspondence on a job for seven years, and
 * the moment a client collects their package is when a job is done in every
 * sense that matters — so that is when the record goes to the office, without
 * anybody having to remember.
 *
 * Three judgements are baked in here, and all three are visible to the reader
 * of the email rather than hidden:
 *
 *   A job with no portal correspondence sends nothing. There is no record to
 *   keep of a conversation that never happened, and one empty PDF per job
 *   would bury the ones that matter.
 *
 *   It is a SNAPSHOT. A client can message after downloading. The email says
 *   so and points at Records, which always holds the current version.
 *
 *   Graph caps one email at 4 MB, so a zip full of the client's drawings will
 *   not fit. Rather than fail, it falls back to the transcript alone and says
 *   the attachments are in Records. Nothing is dropped silently.
 */
export async function mailJobRecord(ref: string): Promise<
  "sent" | "no-messages" | "off" | "no-mailbox" | "failed"
> {
  if (!env.recordEmailEnabled) return "off";
  if (!env.officeEmail) return "no-mailbox";

  const built = await buildRecord(ref);
  if (!built) return "failed";
  // Nothing was ever said on this job. Nothing to file.
  if (built.transcript.count === 0) return "no-messages";

  const job = await repo.getJob(ref);
  const company = job?.companyId
    ? await repo.companyById(job.companyId).catch(() => null)
    : null;

  // The whole zip if it fits; the transcript alone if it doesn't. fitAttachments
  // owns the budget, so ask it rather than reading the env var again here.
  const asZip: MailAttachment = {
    name: built.filename, contentType: "application/zip", bytes: built.zip,
  };
  const asPdf: MailAttachment = {
    name: built.pdfName, contentType: "application/pdf", bytes: built.pdf,
  };
  let attachments = fitAttachments([asZip]).attach;
  const isWhole = attachments.length > 0;
  if (!isWhole) attachments = fitAttachments([asPdf]).attach;

  const { subject, html } = recordEmail({
    companyName: company?.name || "The client",
    ref,
    address: job?.address || "",
    messages: built.transcript.count,
    // If even the transcript wouldn't fit, say the email carries nothing
    // rather than naming a file that isn't there.
    attached: attachments[0]?.name || "nothing — see Records",
    whole: isWhole,
    missing: built.missing.length,
  });

  const ok = await sendMail([env.officeEmail], subject, html, attachments);
  if (ok) {
    await repo.logAudit("correspondence.emailed", ref,
      `${built.transcript.count} message(s) to ${env.officeEmail}`, "portal")
      .catch(() => {});
  }
  return ok ? "sent" : "failed";
}
