import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seenKey, sanitiseSeen, sanitiseSnapshot, newsSince,
  READY_TOASTS, READY_MEMORY,
} from "../lib/notify.mjs";

const snap = (unread, ready = []) => ({ unread, ready });
const job = (ref, address = `${ref} somewhere`) => ({ ref, address });

// --- the record's key ------------------------------------------------------
test("each company gets its own record, whatever its name looks like", () => {
  assert.equal(seenKey("Perth Patios & Home Improvements"), "cfba-seen:perth-patios-home-improvements");
  assert.equal(seenKey("Advanced Patios (formerly K and M)"), "cfba-seen:advanced-patios-formerly-k-and-m");
  assert.notEqual(seenKey("One Stop Patio Shop"), seenKey("CFBA Test Client"));
});

test("a nameless company still lands somewhere sensible", () => {
  assert.equal(seenKey(""), "cfba-seen:client");
  assert.equal(seenKey(null), "cfba-seen:client");
  assert.equal(seenKey("!!!"), "cfba-seen:client");
});

// --- reading the record and the payload back -------------------------------
test("rubbish under the key reads as no record, not as an empty one", () => {
  assert.equal(sanitiseSeen(null), null);
  assert.equal(sanitiseSeen("collapsed"), null);
  assert.equal(sanitiseSeen({}), null);
  assert.equal(sanitiseSeen({ unread: "lots" }), null);
  assert.equal(sanitiseSeen({ unread: -1 }), null);
});

test("a record with a missing job list is still a record", () => {
  assert.deepEqual(sanitiseSeen({ unread: 2 }), { unread: 2, ready: [] });
  assert.deepEqual(sanitiseSeen({ unread: 2.7, ready: ["T-1001", "", null] }),
    { unread: 2, ready: ["T-1001"] });
});

test("a record never grows past the memory cap", () => {
  const many = Array.from({ length: READY_MEMORY + 20 }, (_, i) => `T-${i}`);
  assert.equal(sanitiseSeen({ unread: 0, ready: many }).ready.length, READY_MEMORY);
});

test("a payload that isn't the shape we asked for is no answer at all", () => {
  assert.equal(sanitiseSnapshot(null), null);
  assert.equal(sanitiseSnapshot("<!doctype html>"), null);
  assert.equal(sanitiseSnapshot({ ready: [] }), null);
  assert.equal(sanitiseSnapshot({ unread: "lots" }), null);
  assert.equal(sanitiseSnapshot({ unread: {} }), null);
  assert.equal(sanitiseSnapshot({ unread: -2 }), null);
  // A count that arrives as a numeric string is still a count.
  assert.deepEqual(sanitiseSnapshot({ unread: "3" }), { unread: 3, ready: [] });
});

test("a payload is taken at face value but never trusted blindly", () => {
  const clean = sanitiseSnapshot({
    unread: 1,
    ready: [{ ref: "T-1001", address: "1 Test Street" }, { address: "no ref" }, null],
    secret: "should be ignored",
  });
  assert.deepEqual(clean, { unread: 1, ready: [{ ref: "T-1001", address: "1 Test Street" }] });
  assert.equal("secret" in clean, false);
});

// --- what's new ------------------------------------------------------------
test("the first look writes everything down and says nothing", () => {
  const { events, seen } = newsSince(null, snap(3, [job("T-1001"), job("T-1005")]));
  assert.deepEqual(events, []);
  assert.deepEqual(seen, { unread: 3, ready: ["T-1001", "T-1005"] });
});

test("a job going ready is announced once, by name", () => {
  const before = { unread: 0, ready: [] };
  const { events, seen } = newsSince(before, snap(0, [job("T-1001", "1 Test Street, Greenwood")]));
  assert.deepEqual(events, [
    { kind: "ready", ref: "T-1001", address: "1 Test Street, Greenwood" },
  ]);
  // ...and never again, however many times we poll.
  const again = newsSince(seen, snap(0, [job("T-1001", "1 Test Street, Greenwood")]));
  assert.deepEqual(again.events, []);
  assert.deepEqual(again.seen, seen);
});

test("a job that's been downloaded drops out of the record", () => {
  const before = { unread: 0, ready: ["T-1001", "T-1005"] };
  const { events, seen } = newsSince(before, snap(0, [job("T-1005")]));
  assert.deepEqual(events, []);
  assert.deepEqual(seen.ready, ["T-1005"]);
});

test("several jobs at once: three cards, all of them remembered", () => {
  const refs = ["T-1", "T-2", "T-3", "T-4", "T-5"];
  const { events, seen } = newsSince({ unread: 0, ready: [] }, snap(0, refs.map((r) => job(r))));
  assert.equal(events.length, READY_TOASTS);
  assert.deepEqual(events.map((e) => e.ref), ["T-1", "T-2", "T-3"]);
  assert.deepEqual(seen.ready, refs, "the ones we didn't show must not resurface as news");
  assert.deepEqual(newsSince(seen, snap(0, refs.map((r) => job(r)))).events, []);
});

test("more unread than last time is news, and carries the count", () => {
  const { events, seen } = newsSince({ unread: 1, ready: [] }, snap(3));
  assert.deepEqual(events, [{ kind: "message", unread: 3 }]);
  assert.equal(seen.unread, 3);
});

test("the same unread count is not news again", () => {
  assert.deepEqual(newsSince({ unread: 2, ready: [] }, snap(2)).events, []);
});

test("reading a thread steps the record down quietly", () => {
  const { events, seen } = newsSince({ unread: 3, ready: [] }, snap(1));
  assert.deepEqual(events, []);
  assert.equal(seen.unread, 1, "the next new message must count as new again");
  assert.deepEqual(newsSince(seen, snap(2)).events, [{ kind: "message", unread: 2 }]);
});

test("a message and a certificate in the same poll are both announced", () => {
  const { events } = newsSince(
    { unread: 0, ready: [] },
    snap(1, [job("T-1001", "1 Test Street, Greenwood")])
  );
  assert.deepEqual(events, [
    { kind: "ready", ref: "T-1001", address: "1 Test Street, Greenwood" },
    { kind: "message", unread: 1 },
  ]);
});

test("a quiet portal stays quiet", () => {
  const seen = { unread: 0, ready: [] };
  assert.deepEqual(newsSince(seen, snap(0)).events, []);
  assert.deepEqual(newsSince(seen, snap(0)).seen, seen);
});
