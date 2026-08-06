import test from "node:test";
import assert from "node:assert/strict";
import { readBushfire, bushfireKey, inWA } from "../lib/bushfire.mjs";

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

test("a layer tag keeps two layers' answers apart at the same point", () => {
  // The layer can be repointed (BUSHFIRE_URL). An answer layer 0 gave must not
  // be served for layer 3 — otherwise a lot layer 0 called "not prone" stays
  // wrong after the switch until the cache ages out.
  assert.equal(bushfireKey(-31.95, 115.86, "3"), "bushfire:-31.95000,115.86000:3");
  assert.notEqual(bushfireKey(-31.95, 115.86, "0"), bushfireKey(-31.95, 115.86, "3"));
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
