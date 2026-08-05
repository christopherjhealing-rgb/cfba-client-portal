import test from "node:test";
import assert from "node:assert/strict";
import { fmtDate, fmtWhen, fmtStamp, fmtMB } from "../lib/when.mjs";

// 05:30 UTC is 1:30 pm in Perth (UTC+8); 18:00 UTC is next-day 2:00 am.
const MORNING = "2026-08-03T05:30:00.000Z";
const EVENING = "2026-08-03T18:00:00.000Z";

test("dates render in Perth, not the server's zone", () => {
  // The whole point: a server in UTC and a browser in Perth must agree, or
  // React throws a hydration error and dates land on the wrong day.
  assert.equal(fmtDate(MORNING), "3 Aug 2026");
  assert.equal(fmtDate(EVENING), "4 Aug 2026"); // 2am Perth on the 4th
});

test("fmtWhen is date and time, Perth", () => {
  assert.equal(fmtWhen(MORNING), "3 Aug · 1:30 pm");
  assert.equal(fmtWhen(EVENING), "4 Aug · 2:00 am");
});

test("fmtStamp is the long form, Perth", () => {
  assert.match(fmtStamp(MORNING), /3 Aug 2026, 1:30 pm/);
});

test("nothing ever renders the words Invalid Date", () => {
  for (const bad of ["", "not a date", null, undefined]) {
    assert.equal(fmtDate(bad), null, `fmtDate ${JSON.stringify(bad)}`);
    assert.equal(fmtWhen(bad), "", `fmtWhen ${JSON.stringify(bad)}`);
    assert.equal(fmtStamp(bad), "", `fmtStamp ${JSON.stringify(bad)}`);
  }
});

test("fmtMB is never NaN MB", () => {
  assert.equal(fmtMB(1_048_576), "1.0 MB");
  assert.equal(fmtMB(1_572_864), "1.5 MB");
  assert.equal(fmtMB(0), "0.0 MB");
  for (const bad of [undefined, null, NaN, -5, "banana"]) {
    assert.equal(fmtMB(bad), "", `fmtMB ${JSON.stringify(bad)}`);
  }
});
