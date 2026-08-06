import test from "node:test";
import assert from "node:assert/strict";
import { dayActivity, perthDay } from "../lib/report.mjs";

// The evening report runs at 5 pm Perth. "now" is pinned so the tests aren't
// hostage to the wall clock — 6 August 2026, mid-afternoon Perth (07:00 UTC).
const NOW = "2026-08-06T07:00:00.000Z";

const COMPANIES = [
  { id: "co_a", name: "Perth Patios" },
  { id: "co_b", name: "One Stop Patio Shop" },
];

// A day's worth, back-dated relative to NOW. `ago` is whole days.
const at = (ago) => new Date(Date.parse(NOW) - ago * 86_400_000).toISOString();

const build = (over = {}) =>
  dayActivity({ companies: COMPANIES, now: NOW, unopenedAfterDays: 3, ...over });

// ---------------------------------------------------------------------------
// Perth day
// ---------------------------------------------------------------------------
test("the day is Perth's, not UTC's", () => {
  // 4 pm UTC on the 6th is already midnight-plus in Perth — the 7th. A naive
  // UTC day would file a late-afternoon issue under the wrong date.
  assert.equal(perthDay("2026-08-06T16:30:00.000Z"), "2026-08-07");
  assert.equal(perthDay("2026-08-06T02:00:00.000Z"), "2026-08-06");
});

test("a broken date is empty, not 1970", () => {
  assert.equal(perthDay("not a date"), "");
});

// ---------------------------------------------------------------------------
// What happened today
// ---------------------------------------------------------------------------
test("a job lodged today is listed; one lodged yesterday isn't", () => {
  const jobs = [
    { ref: "1", companyId: "co_a", address: "1 St", description: "Patio", mondayStatus: "To Assess", receivedAt: at(0) },
    { ref: "2", companyId: "co_a", address: "2 St", description: "Carport", mondayStatus: "To Assess", receivedAt: at(1) },
  ];
  const r = build({ jobs });
  assert.deepEqual(r.lodged.map((x) => x.ref), ["1"]);
  assert.equal(r.lodged[0].company, "Perth Patios");
  assert.equal(r.lodged[0].detail, "Patio");
});

test("issued-today only counts a job actually at an issued status", () => {
  // A job can carry an issuedAt from an earlier pass; it's the status that says
  // it's really out the door today.
  const jobs = [
    { ref: "1", companyId: "co_a", mondayStatus: "Issued", fileCount: 2, issuedAt: at(0) },
    { ref: "2", companyId: "co_a", mondayStatus: "To Check", fileCount: 0, issuedAt: at(0) },
  ];
  const r = build({ jobs });
  assert.deepEqual(r.issued.map((x) => x.ref), ["1"]);
});

test("downloaded-today lists the client who collected it", () => {
  const jobs = [
    { ref: "1", companyId: "co_b", address: "9 St", mondayStatus: "Issued", fileCount: 1, issuedAt: at(2), firstDownloadedAt: at(0) },
    { ref: "2", companyId: "co_b", mondayStatus: "Issued", fileCount: 1, issuedAt: at(2), firstDownloadedAt: at(1) },
  ];
  const r = build({ jobs });
  assert.deepEqual(r.downloaded.map((x) => x.ref), ["1"]);
  assert.equal(r.downloaded[0].company, "One Stop Patio Shop");
});

test("amendments lodged today are listed against the parent job", () => {
  const submissions = [
    { companyId: "co_a", address: "1 St", amendmentOf: "T-100", createdAt: at(0) },
    { companyId: "co_a", address: "2 St", amendmentOf: "T-200", createdAt: at(4) },
    { companyId: "co_a", address: "3 St", amendmentOf: null, createdAt: at(0) }, // a plain lodgement, not an amendment
  ];
  const r = build({ submissions });
  assert.deepEqual(r.amended.map((x) => x.ref), ["T-100"]);
  assert.equal(r.amended[0].detail, "amendment lodged");
});

// ---------------------------------------------------------------------------
// What's still waiting
// ---------------------------------------------------------------------------
test("ready-and-waiting is the fresh backlog, oldest of it first", () => {
  const jobs = [
    { ref: "new", companyId: "co_a", mondayStatus: "Issued", fileCount: 1, issuedAt: at(0) },
    { ref: "twoback", companyId: "co_a", mondayStatus: "Issued", fileCount: 1, issuedAt: at(2) },
  ];
  const r = build({ jobs });
  // Oldest first, so the one closest to becoming a worry is at the top.
  assert.deepEqual(r.awaiting.map((x) => x.ref), ["twoback", "new"]);
  assert.equal(r.awaiting[0].days, 2);
});

test("a package ready too long is a problem, not part of the day's backlog", () => {
  // unopenedAfterDays is 3, so a 5-day-old ready job belongs to the chase
  // section, not to "waiting to be downloaded" — it must not read twice.
  const jobs = [
    { ref: "stale", companyId: "co_a", mondayStatus: "Issued", fileCount: 1, issuedAt: at(5) },
  ];
  assert.equal(build({ jobs }).awaiting.length, 0);
});

test("a downloaded package has left the waiting list", () => {
  const jobs = [
    { ref: "done", companyId: "co_a", mondayStatus: "Issued", fileCount: 1, issuedAt: at(1), firstDownloadedAt: at(0) },
  ];
  assert.equal(build({ jobs }).awaiting.length, 0);
});

test("with-the-client lists jobs at FIR, oldest first, and not ones already collected", () => {
  const jobs = [
    { ref: "waiting", companyId: "co_a", mondayStatus: "FIR", receivedAt: at(6) },
    { ref: "newer", companyId: "co_a", mondayStatus: "FIR", receivedAt: at(2) },
    { ref: "eng", companyId: "co_a", mondayStatus: "FIR - ENG", receivedAt: at(3) }, // in-house wait, not the client's move
    { ref: "answered", companyId: "co_a", mondayStatus: "FIR", receivedAt: at(1), firstDownloadedAt: at(0) },
  ];
  const r = build({ jobs });
  assert.deepEqual(r.atFir.map((x) => x.ref), ["waiting", "newer"]);
  assert.equal(r.atFir[0].days, 6);
});

// ---------------------------------------------------------------------------
// Robustness
// ---------------------------------------------------------------------------
test("an empty day produces empty lists, not a throw", () => {
  const r = build();
  for (const k of ["lodged", "amended", "issued", "downloaded", "awaiting", "atFir"]) {
    assert.deepEqual(r[k], [], k);
  }
  assert.equal(r.today, "2026-08-06");
});

test("a company with no name still resolves to a blank, not undefined", () => {
  const jobs = [{ ref: "1", companyId: "unknown", mondayStatus: "To Assess", receivedAt: at(0) }];
  assert.equal(build({ jobs }).lodged[0].company, "");
});

test("`now` must be given — reporting against the wall clock isn't allowed", () => {
  assert.throws(() => dayActivity({ jobs: [], now: "nonsense" }));
});
