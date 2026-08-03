import { test } from "node:test";
import assert from "node:assert/strict";
import {
  routeAmendment, routeExplanation, AMENDMENT_OPEN, AMENDMENT_DONE,
} from "../lib/core.mjs";

// As configured on the Settings page. Names must match the board's
// "Certified By" column, which is why they're spelled in full here.
const ROUTES = [
  { name: "Chris Healing", email: "chris@cfba.test" },
  { name: "Rebecca Creighan", email: "rebecca@cfba.test" },
];
const FALLBACK = "Rebecca Creighan";

test("an amendment goes to whoever certified the original", () => {
  assert.equal(routeAmendment("Chris Healing", ROUTES, FALLBACK).email, "chris@cfba.test");
  assert.equal(routeAmendment("Rebecca Creighan", ROUTES, FALLBACK).email, "rebecca@cfba.test");
  assert.equal(routeAmendment("Chris Healing", ROUTES, FALLBACK).reason, "certified-by");
});

test("nobody in Certified By falls back rather than going nowhere", () => {
  // This is the case Chris specified: unallocated means Rebecca. An amendment
  // that silently routed to no one is the exact failure the email process
  // never had, and it would be invisible — the client sees "lodged".
  for (const empty of ["", "   ", null, undefined]) {
    const r = routeAmendment(empty, ROUTES, FALLBACK);
    assert.equal(r.email, "rebecca@cfba.test", `${JSON.stringify(empty)} should fall back`);
    assert.equal(r.reason, "unallocated");
    assert.equal(r.matched, false);
  }
});

test("a name nobody has configured falls back, and says which name", () => {
  const r = routeAmendment("Kacie Smith", ROUTES, FALLBACK);
  assert.equal(r.email, "rebecca@cfba.test");
  assert.equal(r.reason, "name-not-configured");
  assert.match(routeExplanation(r, "Kacie Smith"), /Kacie Smith/);
  assert.match(routeExplanation(r, "Kacie Smith"), /Rebecca Creighan/);
});

test("a card two people signed only needs one of them", () => {
  // Certified By is a people column and can hold several names.
  assert.equal(routeAmendment("Chris Healing, Rebecca Creighan", ROUTES, FALLBACK).email, "chris@cfba.test");
  assert.equal(routeAmendment("Rebecca Creighan, Chris Healing", ROUTES, FALLBACK).email, "rebecca@cfba.test");
  // An unknown name alongside a known one doesn't derail it.
  assert.equal(routeAmendment("Kacie Smith, Chris Healing", ROUTES, FALLBACK).email, "chris@cfba.test");
});

test("names are matched the way people type them, not the way they're stored", () => {
  for (const typed of ["chris healing", "  Chris   Healing ", "CHRIS HEALING"]) {
    assert.equal(routeAmendment(typed, ROUTES, FALLBACK).email, "chris@cfba.test", typed);
  }
});

test("a half-configured setup is reported, never guessed at", () => {
  // No routes at all — the Settings page warns about this, and so does /admin.
  const none = routeAmendment("Chris Healing", [], "");
  assert.equal(none.email, "");
  assert.equal(none.reason, "no-route-and-no-fallback");
  assert.match(routeExplanation(none, "Chris Healing"), /no one could be worked out/i);

  // A fallback naming somebody who isn't in the list is the same as no
  // fallback — better to say so than to invent an address.
  const bad = routeAmendment("", ROUTES, "Someone Else");
  assert.equal(bad.email, "");
  assert.equal(bad.reason, "unallocated-and-no-fallback");

  // Entries missing a name or an email are ignored rather than half-used.
  const partial = routeAmendment("Chris Healing", [{ name: "Chris Healing", email: "" }], "");
  assert.equal(partial.email, "");
});

test("the explanation always says enough to act on", () => {
  for (const [certified, routes, fallback] of [
    ["Chris Healing", ROUTES, FALLBACK],
    ["", ROUTES, FALLBACK],
    ["Someone New", ROUTES, FALLBACK],
    ["", [], ""],
  ]) {
    const why = routeExplanation(routeAmendment(certified, routes, fallback), certified);
    assert.ok(why.trim().length > 10, `too terse for ${JSON.stringify(certified)}: ${why}`);
    assert.match(why, /\.$/, "should read as a sentence");
  }
});

test("an amendment's states are its own, never the review queue's", () => {
  // The queue lists status "pending". If an amendment ever shared that value
  // it would appear there as a job waiting to go on the board — which is
  // exactly what it must never look like.
  assert.notEqual(AMENDMENT_OPEN, "pending");
  assert.notEqual(AMENDMENT_DONE, "pending");
  assert.notEqual(AMENDMENT_OPEN, AMENDMENT_DONE);
  for (const s of [AMENDMENT_OPEN, AMENDMENT_DONE]) {
    assert.ok(!["pending", "accepted", "rejected"].includes(s), `${s} collides with a queue state`);
  }
});
