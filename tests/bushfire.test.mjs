import test from "node:test";
import assert from "node:assert/strict";
import {
  readBushfire, bushfireKey, inWA, balVerdict, balKinds, BAL_EXEMPTION, sourceTag,
} from "../lib/bushfire.mjs";

// ---------------------------------------------------------------------------
// The verdict — the one thing a coordinate can settle
// ---------------------------------------------------------------------------
test("a feature returned means the point is in a prone area", () => {
  // The layer holds prone-area polygons only, so one containing feature is the
  // whole answer.
  assert.deepEqual(readBushfire({ features: [{ type: "Feature" }] }), { prone: true });
  assert.deepEqual(readBushfire({ results: [{ attributes: {} }] }), { prone: true });
});

test("no features means the service looked and it's outside", () => {
  assert.deepEqual(readBushfire({ features: [] }), { prone: false });
  assert.deepEqual(readBushfire({ type: "FeatureCollection", features: [] }), { prone: false });
});

test("an ArcGIS error body is 'couldn't tell', never 'not prone'", () => {
  // ArcGIS answers its own failures with a 200 and an { error }. Reading that
  // as "no features" would quietly tell a client on a bushfire-prone lot that
  // they're clear — the one wrong answer this must never give.
  assert.equal(readBushfire({ error: { code: 400, message: "Invalid layer" } }), null);
});

test("anything unreadable is null, not a guess", () => {
  for (const bad of [null, undefined, 42, "features", {}, { features: "nope" }, []]) {
    assert.equal(readBushfire(bad), null, JSON.stringify(bad));
  }
});

// ---------------------------------------------------------------------------
// The cache key — one lookup per lot, shared with the cadastre's geocode
// ---------------------------------------------------------------------------
test("the key rounds to about a metre, so the same address hits once", () => {
  assert.equal(bushfireKey(-31.95224, 115.86140), "bushfire:-31.95224,115.86140");
  // Two geocodes of the same address that differ below a metre collapse to one.
  assert.equal(bushfireKey(-31.952241, 115.861401), bushfireKey(-31.952244, 115.861404));
});

test("a source tag keeps two sources' answers apart at the same point", () => {
  // BUSHFIRE_URL can be repointed. An answer one source gave must not be
  // served for another — otherwise a lot the wrong layer called "not prone"
  // stays wrong after the switch until the cache ages out.
  assert.equal(bushfireKey(-31.95, 115.86, "abc"), "bushfire:-31.95000,115.86000:abc");
  assert.notEqual(bushfireKey(-31.95, 115.86, "a"), bushfireKey(-31.95, 115.86, "b"));
});

test("the source tag tells SLIP's two look-alike services apart", () => {
  // Learned the hard way: both services end in /MapServer/3, and only the
  // trailing number in the key meant a stale "not prone" from one masked the
  // right answer from the other. The tag hashes the WHOLE URL.
  const fs = sourceTag("https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas_FS/MapServer/3");
  const plain = sourceTag("https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas/MapServer/3");
  assert.notEqual(fs, plain);
  // Stable and short enough to live in a settings key.
  assert.equal(fs, sourceTag("https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Bush_Fire_Prone_Areas_FS/MapServer/3"));
  assert.match(fs, /^[0-9a-z]{1,8}$/);
});

test("bushfire and cadastre keep separate keys for the same point", () => {
  // Same coordinate, different questions — the answers must never collide in
  // portal_settings.
  assert.match(bushfireKey(-31.95, 115.86), /^bushfire:/);
});

// ---------------------------------------------------------------------------
// The State guard, shared with the cadastre
// ---------------------------------------------------------------------------
test("only Western Australian coordinates are in bounds", () => {
  assert.ok(inWA(-31.95, 115.86));   // Perth
  assert.ok(!inWA(-33.87, 151.21));  // Sydney
  assert.ok(!inWA(NaN, NaN));
});

// ---------------------------------------------------------------------------
// Which structures trigger the questions — read off the job's own rows
// ---------------------------------------------------------------------------
test("the form's own rows say what's being built — patios and sheds trigger", () => {
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Steel Patio", text: "", qty: 1 }]),
    { patio: true, shed: false });
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Steel Carport", text: "" }]),
    { patio: true, shed: false });
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Steel Shed", text: "" }]),
    { patio: false, shed: true });
  assert.deepEqual(balKinds([
    { classKey: "10a", type: "Steel Patio", text: "" },
    { classKey: "10a", type: "Steel Shed", text: "" },
  ]), { patio: true, shed: true });
});

test("10b never triggers — a retaining wall isn't a bushfire question", () => {
  assert.deepEqual(balKinds([
    { classKey: "10b", type: "Retaining Wall", text: "" },
    { classKey: "10b", type: "Swimming Pool", text: "" },
  ]), { patio: false, shed: false });
});

test("CBC and commercial rows never trigger, even when the words match", () => {
  // The exemption rule turns on the dwelling the structure serves; these
  // lodgements aren't a structure beside a house.
  assert.deepEqual(balKinds([{ classKey: "cbc", type: "Other", text: "existing patio" }]),
    { patio: false, shed: false });
  assert.deepEqual(balKinds([{ classKey: "commercial", type: "Other", text: "shed" }]),
    { patio: false, shed: false });
});

test("a 10a free-text row is matched by word; an unmatched one stays quiet", () => {
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Other", text: "Gable pergola" }]),
    { patio: true, shed: false });
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Other", text: "Garage extension" }]),
    { patio: false, shed: true });
  // A flagpole is 10a and none of our business here.
  assert.deepEqual(balKinds([{ classKey: "10a", type: "Other", text: "Flagpole" }]),
    { patio: false, shed: false });
});

test("garbage rows don't throw and trigger nothing", () => {
  assert.deepEqual(balKinds(null), { patio: false, shed: false });
  assert.deepEqual(balKinds([null, 42, {}, { classKey: "10a" }]), { patio: false, shed: false });
});

// ---------------------------------------------------------------------------
// The BAL verdict — CFBA's rule, encoded
// ---------------------------------------------------------------------------
test("distance decides first: 6 m or more needs nothing", () => {
  // Type and age don't matter once it's far enough away.
  const v = balVerdict({ distance: "far", kind: null, age: null });
  assert.equal(v.tone, "clear");
  assert.match(v.summary, /not required/);
  assert.equal(v.mondayBal, null); // nothing stamped on the board
});

test("a shed within 6 m needs its own report, whatever the house's age", () => {
  const v = balVerdict({ distance: "near", kind: "shed", age: "pre2016" });
  assert.equal(v.tone, "action");
  assert.match(v.headline, /own new BAL report/);
  assert.equal(v.mondayBal, null); // the office sets it off the new report
});

test("a patio on a pre-2016 house is exempt, stamped with the exemption code", () => {
  const v = balVerdict({ distance: "near", kind: "patio", age: "pre2016" });
  assert.equal(v.tone, "clear");
  assert.match(v.summary, /exempt/);
  assert.equal(v.mondayBal, BAL_EXEMPTION); // R31BA(1) Item1 (c)
});

test("a patio on a 2016-or-later house needs the house's BAL evidence", () => {
  const v = balVerdict({ distance: "near", kind: "patio", age: "post2016" });
  assert.equal(v.tone, "action");
  assert.match(v.detail, /Certificate of Design Compliance/);
  // CFBA never offers to prepare the report.
  assert.match(v.detail, /don't prepare BAL reports/);
  assert.equal(v.mondayBal, null); // no rating picked yet → nothing to stamp
});

test("a picked rating is carried to the board and named in the summary", () => {
  const v = balVerdict({ distance: "near", kind: "patio", age: "post2016", rating: "19" });
  assert.equal(v.mondayBal, "19");
  assert.match(v.summary, /rating 19/);
});

test("a bogus rating is ignored, never stamped", () => {
  // The dropdown can only offer real labels, but the field must not trust input.
  const v = balVerdict({ distance: "near", kind: "patio", age: "post2016", rating: "hacked" });
  assert.equal(v.mondayBal, null);
});

test("a patio with the house age unknown defers to assessment", () => {
  const v = balVerdict({ distance: "near", kind: "patio", age: "unsure" });
  assert.equal(v.tone, "info");
});

test("no verdict until enough is answered", () => {
  assert.equal(balVerdict({ distance: null, kind: null, age: null }), null);
  assert.equal(balVerdict({ distance: "near", kind: null, age: null }), null);
  assert.equal(balVerdict({ distance: "near", kind: "patio", age: null }), null);
  assert.equal(balVerdict({}), null);
});
