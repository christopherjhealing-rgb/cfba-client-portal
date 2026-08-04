import test from "node:test";
import assert from "node:assert/strict";
import {
  PROVENANCE, stamp, dateOnly, senderName, safeName, attachmentPath,
  transcript, asText, zipName,
} from "../lib/records.mjs";

const JOB = {
  ref: "T-1002", address: "2 Test Street, Greenwood",
  description: "Steel Patios x 2 and Steel Shed", clientRef: "PO 8112",
  mondayStatus: "Invoiced / Completed",
  receivedAt: "2026-07-31T02:00:00.000Z", issuedAt: "2026-08-03T05:30:00.000Z",
};
const MSGS = [
  { from: "cfba", body: "Dear client, we need a soil classification report.",
    createdAt: "2026-08-01T01:00:00.000Z", files: [] },
  { from: "client", body: "Report attached.",
    createdAt: "2026-08-02T03:00:00.000Z",
    files: [{ name: "soil.pdf", size: 100, storagePath: "messages/x/1/soil.pdf" }] },
];
const build = (m = MSGS, job = JOB) => transcript({
  job, messages: m, companyName: "CFBA Test Client",
  exportedAt: "2026-08-04T06:00:00.000Z",
});

// ---------------------------------------------------------------------------
// Dates — an archive is read by people, years later
// ---------------------------------------------------------------------------
test("dates are spelled, not numbered", () => {
  // 03/08 is a different day in half the world. Never ambiguous in a record.
  assert.match(stamp("2026-08-03T05:30:00.000Z"), /3 August 2026/);
  assert.match(dateOnly("2026-08-03T05:30:00.000Z"), /^3 August 2026$/);
});

test("times are Perth, not UTC", () => {
  // 05:30 UTC is 1:30 pm in Perth. A record that quietly used UTC would put
  // messages on the wrong day for anything sent after 4 pm.
  assert.match(stamp("2026-08-03T05:30:00.000Z"), /1:30 pm/);
  assert.match(stamp("2026-08-03T16:30:00.000Z", "Australia/Perth"), /4 August 2026/);
});

test("a missing or broken date says so rather than showing 1970", () => {
  assert.equal(stamp(""), "(date not recorded)");
  assert.equal(stamp("not a date"), "(date not recorded)");
  assert.equal(dateOnly(undefined), "(date not recorded)");
});

// ---------------------------------------------------------------------------
// Naming
// ---------------------------------------------------------------------------
test("senders are named the way a file should name them", () => {
  assert.equal(senderName({ from: "cfba" }, "Acme"), "CF Building Approvals");
  assert.equal(senderName({ from: "client" }, "Acme"), "Acme (client)");
  assert.equal(senderName({ from: "client" }, ""), "The client (client)");
});

test("filenames survive Windows", () => {
  assert.equal(safeName('a/b\\c:d*e?f"g<h>i|j'), "a-b-c-d-e-f-g-h-i-j");
  assert.equal(safeName("  spaced   out  "), "spaced out");
  assert.equal(safeName(""), "record");
  assert.equal(safeName(null), "record");
  assert.equal(safeName("z".repeat(200)).length, 80);
});

test("attachments are numbered, so two plan.pdf can't collide", () => {
  assert.equal(attachmentPath(1, "plan.pdf"), "attachments/01 plan.pdf");
  assert.equal(attachmentPath(12, "plan.pdf"), "attachments/12 plan.pdf");
  assert.notEqual(attachmentPath(1, "plan.pdf"), attachmentPath(2, "plan.pdf"));
});

test("the zip is named the way the office looks a job up", () => {
  assert.equal(zipName(JOB), "CFBA T-1002 - 2 Test Street, Greenwood correspondence.zip");
  assert.equal(zipName({ ref: "T-9" }), "CFBA T-9 correspondence.zip");
  assert.ok(!/[\\/:*?"<>|]/.test(zipName({ ref: "A/B", address: "C:D" })));
});

// ---------------------------------------------------------------------------
// The transcript
// ---------------------------------------------------------------------------
test("messages come out in date order whatever order they went in", () => {
  const t = build([MSGS[1], MSGS[0]]);
  const froms = t.blocks.filter((b) => b.type === "from").map((b) => b.text);
  assert.match(froms[0], /CF Building Approvals/);
  assert.match(froms[1], /client/);
});

test("the header carries what identifies the job", () => {
  const fields = build().blocks.filter((b) => b.type === "field").map((b) => b.text);
  for (const want of ["T-1002", "2 Test Street", "PO 8112", "Invoiced / Completed"]) {
    assert.ok(fields.some((f) => f.includes(want)), want);
  }
  assert.ok(fields.some((f) => /^Messages in this record: 2$/.test(f)));
});

test("what the record does NOT contain is stated on it", () => {
  const t = build();
  const notes = t.blocks.filter((b) => b.type === "note").map((b) => b.text);
  assert.equal(PROVENANCE.length, 3);
  for (const p of PROVENANCE) assert.ok(notes.includes(p));
  // The gaps, specifically. A transcript that looks complete when it isn't is
  // worse than none at all.
  assert.ok(notes.some((n) => /email or telephone outside the portal/.test(n)));
  assert.ok(notes.some((n) => /internal notes/.test(n)));
});

test("attachments are listed against their message and indexed at the end", () => {
  const t = build();
  assert.equal(t.files.length, 1);
  assert.equal(t.files[0].path, "attachments/01 soil.pdf");
  assert.equal(t.files[0].messageIndex, 2);
  const notes = t.blocks.filter((b) => b.type === "note").map((b) => b.text);
  assert.ok(notes.some((n) => n === "attachments/01 soil.pdf — sent with message 2"));
});

test("a message with no text still appears", () => {
  const t = build([{ from: "client", body: "   ", createdAt: "2026-08-02T03:00:00.000Z" }]);
  const bodies = t.blocks.filter((b) => b.type === "body").map((b) => b.text);
  assert.deepEqual(bodies, ["(no message text)"]);
});

test("an empty thread says so instead of rendering nothing", () => {
  const t = build([]);
  assert.equal(t.count, 0);
  const notes = t.blocks.filter((b) => b.type === "note").map((b) => b.text);
  assert.ok(notes.includes("No messages were sent through the portal on this job."));
  assert.ok(notes.includes("No documents were attached to any message on this job."));
});

test("a job with nothing but a ref still produces a record", () => {
  const t = transcript({ job: { ref: "X-1" }, messages: [], exportedAt: "2026-08-04T06:00:00.000Z" });
  assert.equal(t.blocks[0].text, "Correspondence record — X-1");
  assert.ok(t.blocks.some((b) => b.type === "field" && b.text === "Job number: X-1"));
});

test("missing files arrays don't throw", () => {
  const t = build([{ from: "cfba", body: "hi", createdAt: "2026-08-01T01:00:00.000Z" }]);
  assert.equal(t.files.length, 0);
});

// ---------------------------------------------------------------------------
// The plain-text copy
// ---------------------------------------------------------------------------
test("the text copy carries the whole thread", () => {
  const s = asText(build());
  assert.match(s, /Correspondence record — T-1002/);
  assert.match(s, /soil classification report/);
  assert.match(s, /Report attached\./);
  assert.match(s, /Attached: soil\.pdf/);
  assert.match(s, /CF Building Approvals — 1 August 2026/);
});

test("the text copy underlines its headings and never triple-spaces", () => {
  const s = asText(build());
  assert.match(s, /Correspondence record — T-1002\n={10,}/);
  assert.ok(!/\n{3}/.test(s), "found a triple blank line");
  assert.ok(s.endsWith("\n"));
});
