/**
 * The correspondence record for a job.
 *
 * A building surveyor has to keep a copy of the correspondence on a job for
 * seven years. The portal already holds it — every message both ways, with
 * whatever the client attached — but holding it and being able to file it are
 * different things, and a record that only exists inside a web app isn't a
 * record anyone can produce in five years.
 *
 * So this turns a thread into a document: a dated transcript that reads in
 * order, names both sides, and says plainly where it came from and what it
 * doesn't include. The honesty about the gaps matters as much as the content —
 * a transcript that looks complete when it isn't is worse than no transcript.
 *
 * Pure. Formatting and assembly only, no I/O — see tests/records.test.mjs.
 */

/** What the portal's message store can and can't stand behind. Printed on
 *  every transcript, because a file in an archive has no one to ask. */
export const PROVENANCE = [
  "Taken from the CF Building Approvals client portal on the date shown above.",
  "It contains every message sent through the portal on this job, in both " +
    "directions; lists the documents lodged with the job at the start; and " +
    "lists every further document the client attached, with the date it came in.",
  "It does NOT contain: correspondence by email or telephone outside the " +
    "portal; internal notes on the monday.com card that were never sent to " +
    "the client; or the document files themselves (the lodged drawings and the " +
    "issued CDC Package are filed separately).",
];

const AU = { day: "numeric", month: "long", year: "numeric" };
const AU_TIME = { hour: "numeric", minute: "2-digit", hour12: true };

/** "3 August 2026, 2:15 pm". Australian order, spelled month — an archive is
 *  read by people, and 03/08 is a different day in half the world. */
export function stamp(iso, tz = "Australia/Perth") {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "(date not recorded)";
  const date = d.toLocaleDateString("en-AU", { ...AU, timeZone: tz });
  const time = d.toLocaleTimeString("en-AU", { ...AU_TIME, timeZone: tz })
    .replace(/\s?([ap])m$/i, (_, x) => " " + x.toLowerCase() + "m");
  return `${date}, ${time}`;
}

export const dateOnly = (iso, tz = "Australia/Perth") => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "(date not recorded)"
    : d.toLocaleDateString("en-AU", { ...AU, timeZone: tz });
};

/** Who a message is from, in the words an archive should use — not "cfba". */
export const senderName = (m, companyName) =>
  m.from === "client"
    ? `${companyName || "The client"} (client)`
    : "CF Building Approvals";

/** A filename that will still open in ten years on a system nobody has
 *  chosen yet. No colons, no slashes, nothing Windows argues with. */
export function safeName(s, max = 80) {
  return String(s || "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max) || "record";
}

/** Attachment names collide — two clients both send "plan.pdf". Inside the
 *  zip each one is prefixed with its position in the thread, so the transcript
 *  can name the exact file and the name is unique by construction. */
export const attachmentPath = (index, name) =>
  `attachments/${String(index).padStart(2, "0")} ${safeName(name, 70)}`;

/**
 * The transcript, as an ordered list of blocks a renderer can lay out.
 *
 * Returning blocks rather than a string is what lets the same transcript go to
 * a PDF and to a plain-text copy without the two drifting apart — and what
 * makes the ordering and the labelling testable without a PDF library.
 */
export function transcript({ job, messages, companyName, exportedAt, tz, lodgedDocuments }) {
  const ordered = [...(messages || [])].sort((a, b) =>
    String(a.createdAt).localeCompare(String(b.createdAt)));
  const lodged = lodgedDocuments || [];

  const blocks = [];
  const add = (type, text, meta) => blocks.push({ type, text, meta });

  add("title", `Correspondence record — ${job.ref}`);
  add("field", `Job number: ${job.ref}`);
  if (job.address) add("field", `Site: ${job.address}`);
  if (job.description) add("field", `Work: ${job.description}`);
  if (companyName) add("field", `Client: ${companyName}`);
  if (job.clientRef) add("field", `Client's reference: ${job.clientRef}`);
  if (job.mondayStatus) add("field", `Status when exported: ${job.mondayStatus}`);
  if (job.receivedAt) add("field", `Lodged: ${dateOnly(job.receivedAt, tz)}`);
  if (job.issuedAt) add("field", `Issued: ${dateOnly(job.issuedAt, tz)}`);
  add("field", `Exported: ${stamp(exportedAt, tz)}`);
  add("field", `Messages in this record: ${ordered.length}`);

  add("heading", "About this record");
  for (const p of PROVENANCE) add("note", p);

  // What came in at lodgement — the starting documents, by name. The files
  // themselves live on the monday.com card and in the CDC Package; this is the
  // list, so the record says what was supplied and when.
  add("heading", "Documents lodged at the start");
  if (lodged.length === 0) {
    add("note",
      "The documents lodged with this job aren't recorded in the portal — it " +
      "may have been lodged by email, or before the portal recorded lodgements.");
  } else {
    add("note", `Lodged ${job.receivedAt ? dateOnly(job.receivedAt, tz) : "at the start of the job"}:`);
    for (const d of lodged) {
      const cat = d.category ? ` — ${d.category}` : "";
      add("note", `• ${d.name}${cat}`);
    }
  }

  add("heading", "The correspondence");
  if (ordered.length === 0) {
    add("note", "No messages were sent through the portal on this job.");
  }

  let att = 0;
  const files = [];
  ordered.forEach((m, i) => {
    add("from", `${senderName(m, companyName)} — ${stamp(m.createdAt, tz)}`,
      { n: i + 1, from: m.from });
    add("body", String(m.body || "").trim() || "(no message text)");
    for (const f of m.files || []) {
      att += 1;
      const path = attachmentPath(att, f.name);
      add("attachment", `Attached: ${f.name}`, { path });
      files.push({ ...f, path, messageIndex: i + 1, sentAt: m.createdAt });
    }
  });

  // Everything that arrived AFTER lodgement, dated — the answer to "when did
  // the new documents come in".
  add("heading", "Documents submitted since, with each message");
  if (files.length === 0) {
    add("note", "No further documents were submitted through the portal after lodgement.");
  } else {
    for (const f of files) {
      add("note",
        `• ${f.name} — submitted ${dateOnly(f.sentAt, tz)} with message ${f.messageIndex} ` +
        `(filed in this record as ${f.path})`);
    }
  }

  return { blocks, files, count: ordered.length };
}

/** The same transcript as plain text, filed beside the PDF. A PDF needs a
 *  reader; a .txt needs nothing, and in seven years that may matter. */
export function asText(t) {
  const out = [];
  for (const b of t.blocks) {
    if (b.type === "title") out.push(b.text, "=".repeat(b.text.length), "");
    else if (b.type === "heading") out.push("", b.text, "-".repeat(b.text.length), "");
    else if (b.type === "from") out.push(b.text);
    else if (b.type === "body") out.push(b.text, "");
    else if (b.type === "attachment") out.push(`    ${b.text}`, "");
    else out.push(b.text);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n") + "\n";
}

/**
 * What one email can carry of a record, given a byte budget.
 *
 * Graph caps a whole sendMail at 4 MB and base64 costs a third on top, so a
 * zip carrying a client's drawings usually will not fit. The order matters:
 * the complete record if it fits, the transcript alone if it doesn't, and
 * nothing at all rather than a truncated file — a half-record in an archive is
 * worse than a pointer to the whole one.
 */
export function chooseAttachment({ zipBytes, pdfBytes, budget }) {
  if (zipBytes <= budget) return { pick: "zip", whole: true };
  if (pdfBytes <= budget) return { pick: "pdf", whole: false };
  return { pick: "none", whole: false };
}

/** The zip's name. The address is in it because that is how the office looks a
 *  job up — but only when there is one. safeName falls back to "record" for an
 *  empty string, which would otherwise file a job as "T-9 - record". */
export function zipName(job) {
  const site = (job.address || "").trim() ? safeName(job.address, 50) : "";
  return `CFBA ${safeName(job.ref, 20)}${site ? " - " + site : ""} correspondence.zip`;
}
