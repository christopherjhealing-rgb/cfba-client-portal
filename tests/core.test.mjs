import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aliasKey, matchCompany, parseRef, folderMatchesRef, clientStatusLabel,
  addMonths, retention, jobBucket, groupJobs, isClientVisible,
  stageIndex, stageStates, businessDaysSince,
  clientPausedDays, nextClientPause, elapsedBusinessDays,
} from "../lib/core.mjs";

test("aliasKey collapses the messy client variants onto one key", () => {
  const k = aliasKey("GVF");
  assert.equal(aliasKey("GVF (Joe Furfaro)"), k);
  assert.equal(aliasKey("GVF Pty Ltd"), k);
  assert.equal(aliasKey("  gvf  "), k);
});

test("aliasKey ignores trade suffixes and bracketed notes", () => {
  assert.equal(
    aliasKey("Advanced Patios (formerly K and M)"),
    aliasKey("Advanced Patios"),
  );
  assert.equal(aliasKey("Perth Patios & Home Improvements"), "perth");
});

test("matchCompany prefers email, falls back to name", () => {
  const companies = [
    { id: "c1", aliasKeys: [aliasKey("Great Aussie Patios")], emails: ["jobs@gap.com.au"] },
    { id: "c2", aliasKeys: [aliasKey("GVF")], emails: ["joe@gvf.com"] },
  ];
  // email match even when the typed name is a variant
  assert.equal(matchCompany({ clientName: "GVF Pty Ltd", email: "JOE@gvf.com" }, companies), "c2");
  // name fallback when no email
  assert.equal(matchCompany({ clientName: "Great Aussie Patios", email: "" }, companies), "c1");
  // no match
  assert.equal(matchCompany({ clientName: "Someone Else", email: "x@y.z" }, companies), null);
});

test("parseRef pulls the ref from folder names and SharePoint urls", () => {
  assert.equal(parseRef("32 Elvira St, Palmyra - 56411"), "56411");
  assert.equal(parseRef(".../CFBA Client Files/One Stop Patio Shop/21 Creaton Street, EAST VIC PARK - 56576/Issued/CDC.docx"), "56576");
  assert.equal(parseRef("2 McGellin Way, Morangup - B2026-102"), "B2026-102");
  assert.equal(parseRef("YUNGNGORA Carports"), null);
});

test("folderMatchesRef matches only the trailing ref", () => {
  assert.ok(folderMatchesRef("3 Larcom Road, Lakelands (3525) - 56544", "56544"));
  assert.ok(!folderMatchesRef("3 Larcom Road - 56544", "3525"));
});

test("clientStatusLabel never leaks an internal label", () => {
  assert.equal(clientStatusLabel("FIR - ENG"), "Waiting for documentation from the engineer");
  assert.equal(clientStatusLabel("SCL"), "Waiting for documentation from the engineer");
  assert.equal(clientStatusLabel("Chris CDC"), "Assessed — certificate being written up");
  assert.equal(clientStatusLabel("To CDC"), "Assessed — certificate being written up");
  assert.equal(clientStatusLabel("New Info Received"), "Requested information received — in for re-assessment");
  assert.equal(clientStatusLabel("On Hold"), "The job is currently on hold");
  assert.equal(clientStatusLabel("Issued"), "CDC Package issued — ready to download");
  assert.equal(clientStatusLabel("Totally Unknown Label"), "In progress");
});

test("To FIR tells the client an email is coming", () => {
  assert.match(clientStatusLabel("To FIR"), /email with the details is on its way/);
});

test("isClientVisible hides Query unless downloaded", () => {
  assert.equal(isClientVisible({ mondayStatus: "Query", fileCount: 0 }), false);
  assert.equal(isClientVisible({ mondayStatus: "To CDC", fileCount: 0 }), true);
  assert.equal(isClientVisible({ mondayStatus: "Cancelled", fileCount: 0 }), true);
  // once downloaded, always visible even if later moved to a hidden status
  assert.equal(isClientVisible({ mondayStatus: "Query", fileCount: 1, firstDownloadedAt: "2026-07-01T00:00:00Z" }), true);
});

test("addMonths clamps end-of-month correctly", () => {
  assert.equal(addMonths("2026-08-31T00:00:00.000Z", 6).slice(0, 10), "2027-02-28");
  assert.equal(addMonths("2026-01-15T00:00:00.000Z", 6).slice(0, 10), "2026-07-15");
});

test("retention counts down six months from first download", () => {
  const dl = "2026-01-01T00:00:00.000Z";
  const r1 = retention(dl, new Date("2026-04-01T00:00:00.000Z"));
  assert.equal(r1.expired, false);
  assert.equal(r1.expiresAt.slice(0, 10), "2026-07-01");
  const r2 = retention(dl, new Date("2026-08-01T00:00:00.000Z"));
  assert.equal(r2.expired, true);
  assert.equal(retention(null).expired, false); // never downloaded -> not expired
});

test("jobBucket routes jobs to the right section", () => {
  const now = new Date("2026-07-25T00:00:00.000Z");
  assert.equal(jobBucket({ mondayStatus: "To CDC", fileCount: 0 }, now), "in_progress");
  assert.equal(jobBucket({ mondayStatus: "Issued", fileCount: 3 }, now), "ready");
  // Issued but files not synced yet -> still in progress to the client
  assert.equal(jobBucket({ mondayStatus: "Issued", fileCount: 0 }, now), "in_progress");
  assert.equal(jobBucket({ mondayStatus: "Issued", fileCount: 3, firstDownloadedAt: "2026-07-20T00:00:00Z" }, now), "downloaded");
  assert.equal(jobBucket({ mondayStatus: "Issued", fileCount: 3, firstDownloadedAt: "2025-01-01T00:00:00Z" }, now), "expired");
});

test("groupJobs partitions a mixed list", () => {
  const now = new Date("2026-07-25T00:00:00.000Z");
  const g = groupJobs([
    { mondayStatus: "To CDC", fileCount: 0 },
    { mondayStatus: "Issued", fileCount: 2 },
    { mondayStatus: "Issued", fileCount: 2, firstDownloadedAt: "2026-07-10T00:00:00Z" },
  ], now);
  assert.equal(g.in_progress.length, 1);
  assert.equal(g.ready.length, 1);
  assert.equal(g.downloaded.length, 1);
});

// --- progress stages -------------------------------------------------------
test("stages: an unrecognised status sits at Received rather than inventing progress", () => {
  assert.equal(stageIndex({ mondayStatus: "Something New" }), 0);
});

test("stages: assessment statuses land on Under assessment", () => {
  for (const s of ["To Assess", "New Info Received", "To Check", "Amendment"])
    assert.equal(stageIndex({ mondayStatus: s }), 1, s);
});

test("stages: FIR statuses land on Further information", () => {
  for (const s of ["To FIR", "FIR", "FIR - ENG", "SCL"])
    assert.equal(stageIndex({ mondayStatus: s }), 2, s);
});

test("stages: certificate statuses land on Certificate being prepared", () => {
  for (const s of ["To CDC", "Chris CDC", "Chris CDC 2", "To Issue", "To Lodge", "To Send"])
    assert.equal(stageIndex({ mondayStatus: s }), 3, s);
});

test("stages: issued and beyond land on Issued", () => {
  for (const s of ["Issued", "To Invoice", "Invoiced / Completed"])
    assert.equal(stageIndex({ mondayStatus: s }), 4, s);
});

test("stages: only a client-actionable FIR shows as waiting on the client", () => {
  assert.equal(stageStates({ mondayStatus: "FIR" })[2], "waiting");
  assert.equal(stageStates({ mondayStatus: "FIR - ENG" })[2], "current");
  assert.equal(stageStates({ mondayStatus: "SCL" })[2], "current");
});

test("stages: a job past FIR marks that step not-required, never complete", () => {
  const st = stageStates({ mondayStatus: "To CDC" });
  assert.deepEqual(st, ["done", "done", "skipped", "current", "pending"]);
});

test("stages: On Hold pauses rather than advancing", () => {
  assert.equal(stageStates({ mondayStatus: "On Hold" })[0], "paused");
});

// --- business days ---------------------------------------------------------
test("businessDaysSince: same day is zero", () => {
  assert.equal(businessDaysSince("2026-07-27T09:00:00Z", new Date("2026-07-27T17:00:00Z")), 0);
});

test("businessDaysSince: Monday to Thursday is three", () => {
  assert.equal(businessDaysSince("2026-07-27T09:00:00Z", new Date("2026-07-30T09:00:00Z")), 3);
});

test("businessDaysSince: a weekend does not count", () => {
  // Fri 24 Jul 2026 -> Mon 27 Jul 2026 is one business day, not three
  assert.equal(businessDaysSince("2026-07-24T09:00:00Z", new Date("2026-07-27T09:00:00Z")), 1);
});

test("businessDaysSince: a full week is five", () => {
  assert.equal(businessDaysSince("2026-07-20T09:00:00Z", new Date("2026-07-27T09:00:00Z")), 5);
});

test("businessDaysSince: rubbish in returns null rather than a wrong number", () => {
  assert.equal(businessDaysSince("not a date"), null);
});

// --- the with-the-client clock ---------------------------------------------
//
// All dates below are 2026 and were picked for their weekdays:
//   Mon 25 May · Thu 28 May · Mon 1 Jun (WA Day) · Wed 3 Jun · Wed 10 Jun
//   Mon 6 Jul · Thu 9 Jul · Mon 13 Jul · Mon 20 Jul · Wed 22 Jul
//   Mon 27 Jul · Tue 28 Jul · Fri 31 Jul

const at = (d) => new Date(`${d}T02:00:00Z`); // ~10am Perth, same UTC date
const stamp = (d) => `${d}T02:00:00.000Z`;

test("a job with no pause history counts exactly as it always did", () => {
  const from = "2026-07-13T02:00:00Z";
  for (const day of ["2026-07-15", "2026-07-22", "2026-07-31"]) {
    const now = at(day);
    assert.equal(elapsedBusinessDays(from, null, now), businessDaysSince(from, now));
    assert.equal(elapsedBusinessDays(from, undefined, now), businessDaysSince(from, now));
  }
  assert.equal(clientPausedDays(null), 0);
  assert.equal(clientPausedDays(undefined), 0);
});

test("one closed pause comes back out of the count", () => {
  const from = "2026-07-13T02:00:00Z";
  const now = at("2026-07-31");
  const total = businessDaysSince(from, now);
  assert.equal(total, 14);
  const pause = { days: 4, since: null };
  assert.equal(clientPausedDays(pause, now), 4);
  assert.equal(elapsedBusinessDays(from, pause, now), 10);
});

test("an open pause holds the counter still while the client has the job", () => {
  // Received Mon 13 Jul, went out to the client Mon 20 Jul and still there.
  const from = "2026-07-13T02:00:00Z";
  const pause = { days: 0, since: stamp("2026-07-20") };

  // Five working days with CFBA: 14, 15, 16 and 17 Jul, then the 20th.
  assert.equal(elapsedBusinessDays(from, pause, at("2026-07-22")), 5);
  // Nine days later and the counter has not moved — that is the whole point.
  assert.equal(elapsedBusinessDays(from, pause, at("2026-07-31")), 5);
  // Meanwhile the raw elapsed figure has run on, which is what used to show.
  assert.equal(businessDaysSince(from, at("2026-07-31")), 14);
});

test("several pauses accumulate across the sync's transitions", () => {
  // Each step is one sync seeing the card at a new status.
  let p = null;
  p = nextClientPause(p, true, at("2026-07-06"));   // out to the client
  assert.deepEqual(p, { days: 0, since: stamp("2026-07-06") });
  p = nextClientPause(p, false, at("2026-07-09"));  // back with us: banks 3
  assert.deepEqual(p, { days: 3, since: null });
  p = nextClientPause(p, true, at("2026-07-20"));   // out again
  assert.deepEqual(p, { days: 3, since: stamp("2026-07-20") });
  p = nextClientPause(p, false, at("2026-07-22"));  // back: banks 2 more
  assert.deepEqual(p, { days: 5, since: null });
  p = nextClientPause(p, true, at("2026-07-27"));   // and once more
  p = nextClientPause(p, false, at("2026-07-28"));  // banks 1
  assert.deepEqual(p, { days: 6, since: null });

  const from = "2026-07-13T02:00:00Z";
  const now = at("2026-07-31");
  assert.equal(businessDaysSince(from, now), 14);
  assert.equal(elapsedBusinessDays(from, p, now), 8);
});

test("a pause over a weekend and a WA public holiday banks working days only", () => {
  // Out Thu 28 May, back Wed 3 Jun. Six calendar days; four weekdays; three
  // working days, because Mon 1 Jun is WA Day.
  let p = nextClientPause(null, true, at("2026-05-28"));
  p = nextClientPause(p, false, at("2026-06-03"));
  assert.deepEqual(p, { days: 3, since: null });

  // And it lands in the counter: received Mon 25 May, now Wed 10 Jun.
  const from = "2026-05-25T02:00:00Z";
  const now = at("2026-06-10");
  assert.equal(businessDaysSince(from, now), 11); // WA Day already excluded
  assert.equal(elapsedBusinessDays(from, p, now), 8);
});

test("nextClientPause writes nothing when the card has not moved", () => {
  // Still with us, still no record — the sync must not create one.
  assert.equal(nextClientPause(null, false, at("2026-07-22")), null);
  assert.equal(nextClientPause({ days: 3, since: null }, false, at("2026-07-22")), null);
  // Still with the client — the original stamp must survive, or the client
  // silently loses every day banked so far.
  const open = { days: 3, since: stamp("2026-07-20") };
  assert.equal(nextClientPause(open, true, at("2026-07-31")), null);
  assert.equal(open.since, stamp("2026-07-20"));
});

test("the counter never goes negative, and a rubbish record is ignored", () => {
  const from = "2026-07-27T02:00:00Z";
  const now = at("2026-07-29");
  assert.equal(businessDaysSince(from, now), 2);
  assert.equal(elapsedBusinessDays(from, { days: 99, since: null }, now), 0);
  // A record written by hand, or half-written, must not poison the count.
  assert.equal(elapsedBusinessDays(from, { days: -5, since: null }, now), 2);
  assert.equal(elapsedBusinessDays(from, { days: "x", since: null }, now), 2);
  assert.equal(elapsedBusinessDays(from, { since: null }, now), 2);
  assert.equal(elapsedBusinessDays("not a date", { days: 2, since: null }, now), null);
});
