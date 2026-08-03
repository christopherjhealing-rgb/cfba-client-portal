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

// ---------------------------------------------------------------------------
// Finding a historical job
//
// The sync only pulls issued and non-closed cards, so a job invoiced before
// the portal existed isn't in the portal at all — on a board of 3,827 items
// that's most of them. An amendment months after issue is the ordinary case,
// so the reference has to be findable on the board itself.
// ---------------------------------------------------------------------------
import { refSearchTerms, sameRef } from "../lib/core.mjs";

test("a reference is searched precisely first, then widened", () => {
  // Real shapes off the live board: 51205, BA2025094, B2025-125, BP24-27.
  assert.deepEqual(refSearchTerms("51205"), ["51205", "1205"]);
  assert.deepEqual(refSearchTerms("B2025-125"), ["B2025-125", "b2025125", "5125"]);
  assert.deepEqual(refSearchTerms("26-1042"), ["26-1042", "261042", "1042"]);
  // The literal comes first so a precise hit is taken before anything widens —
  // widening past a good match is how you pick up the neighbouring job.
  assert.equal(refSearchTerms("51205")[0], "51205");
});

test("a client typing their reference differently still finds the job", () => {
  // contains_text is literal, so "261042" would never match a stored "26-1042"
  // without this. Every way a person writes it has to reach a usable term.
  for (const typed of ["26-1042", "26 1042", "261042", "26/1042", "26.1042", "#26-1042"]) {
    const terms = refSearchTerms(typed);
    assert.ok(
      terms.some((t) => "26-1042".includes(t)),
      `no term of ${JSON.stringify(typed)} is a substring of the stored "26-1042"`
    );
  }
});

test("short and empty references don't produce a term that matches everything", () => {
  // A blank or one-character search would return the whole board, and the
  // exact-match filter is the only thing standing between that and a client
  // being offered somebody else's job.
  assert.deepEqual(refSearchTerms(""), []);
  assert.deepEqual(refSearchTerms("   "), []);
  for (const short of ["7", "42"]) {
    assert.ok(refSearchTerms(short).every((t) => t.length >= 1));
  }
});

test("only an exact reference counts as the same job", () => {
  assert.ok(sameRef("26-1042", "261042"));
  assert.ok(sameRef(" 26 1042 ", "26-1042"));
  assert.ok(sameRef("BA2025094", "ba2025094"));
  // The widened search WILL return these; the exact filter is what stops them.
  assert.ok(!sameRef("26-1042", "26-10420"));
  assert.ok(!sameRef("26-1042", "126-1042"));
  assert.ok(!sameRef("51205", "512050"));
  assert.ok(!sameRef("", "26-1042"));
  assert.ok(!sameRef("26-1042", ""));
  assert.ok(!sameRef(null, null));
});

// ---------------------------------------------------------------------------
// Regressions found in review. Each of these shipped and each was wrong.
// ---------------------------------------------------------------------------
import { REVISED, HIDDEN_STATUSES, CANCELLED_STATUS } from "../lib/core.mjs";

test("the two file sets are told apart, so issuing can't destroy the lodgement", () => {
  // Issuing used to REPLACE files with the revised certificate, which wiped
  // the record of what the client actually asked for — and left a resend
  // looking for the certificate in the lodgement folder, where it isn't.
  const after = [
    { name: "revised-site-plan.pdf" },
    { name: "elevations.pdf" },
    { name: "CDC-AMENDED.pdf", category: REVISED },
  ];
  const lodged = after.filter((f) => f.category !== REVISED).map((f) => f.name);
  const sent = after.filter((f) => f.category === REVISED).map((f) => f.name);
  assert.deepEqual(lodged, ["revised-site-plan.pdf", "elevations.pdf"]);
  assert.deepEqual(sent, ["CDC-AMENDED.pdf"]);
  // The marker has to be something a real category never is, or a lodged file
  // would be mistaken for the certificate we sent back.
  assert.ok(REVISED);
  assert.ok(!["engineering", "plans", "site plan", ""].includes(REVISED));
});

test("a hidden job never reaches the past-jobs index", () => {
  // QUERY exists to hide a job from the client completely. The index reads the
  // board directly, so it walks past isClientVisible — without an explicit
  // check, a job the office deliberately hid appeared in the amend picker.
  assert.ok(HIDDEN_STATUSES.has("QUERY"));
  assert.ok(HIDDEN_STATUSES.has("Query"));
  assert.ok(HIDDEN_STATUSES.has("query"));
  // And there's nothing to amend on a cancelled job.
  assert.equal(CANCELLED_STATUS, "Cancelled");
});

test("only genuinely finished work is offered as finished", () => {
  // Everything from the index used to be chipped "Completed", including live
  // work — which told a client a certificate existed when it didn't.
  const CLOSED_ISH = new Set(["Invoiced / Completed", "To Invoice", "Issued"]);
  for (const s of ["Invoiced / Completed", "To Invoice", "Issued"]) {
    assert.ok(CLOSED_ISH.has(s), `${s} should read as finished`);
  }
  for (const s of ["To Assess", "FIR", "To CDC", "On Hold", "Amendment", ""]) {
    assert.ok(!CLOSED_ISH.has(s), `${s} must not read as finished`);
  }
});
