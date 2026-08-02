import { test } from "node:test";
import assert from "node:assert/strict";
import { WA_BOUNDS, stripCountry, suggestionRequest } from "../lib/address.mjs";

test("stripCountry takes the trailing country off, and only that", () => {
  assert.equal(
    stripCountry("32 Elvira Street, Palmyra WA 6157, Australia"),
    "32 Elvira Street, Palmyra WA 6157",
  );
  // Case and stray whitespace don't save the country from the chop.
  assert.equal(
    stripCountry("  10 Forrest Rd, Australind WA,  australia  "),
    "10 Forrest Rd, Australind WA",
  );
  // "Australia" mid-address stays — only the final segment is country noise.
  assert.equal(
    stripCountry("5 Australia II Drive, Karrinyup WA 6018, Australia"),
    "5 Australia II Drive, Karrinyup WA 6018",
  );
  // No trailing country, nothing to do — new-lot free text passes untouched.
  assert.equal(
    stripCountry("Lot 214 Bushmead Rd, Hazelmere WA"),
    "Lot 214 Bushmead Rd, Hazelmere WA",
  );
  assert.equal(stripCountry(""), "");
  assert.equal(stripCountry(null), "");
  assert.equal(stripCountry(undefined), "");
});

test("WA bounds hold Perth and the towns we serve, not the east coast", () => {
  const inside = (lat, lng) =>
    lat >= WA_BOUNDS.south && lat <= WA_BOUNDS.north &&
    lng >= WA_BOUNDS.west && lng <= WA_BOUNDS.east;
  assert.ok(inside(-31.95, 115.86), "Perth");
  assert.ok(inside(-28.77, 114.61), "Geraldton");
  assert.ok(inside(-35.02, 117.88), "Albany");
  assert.ok(inside(-30.75, 121.47), "Kalgoorlie");
  // Bias must not drag suggestions across the country.
  assert.ok(!inside(-33.87, 151.21), "Sydney is out");
  assert.ok(!inside(-37.81, 144.96), "Melbourne is out");
});

test("suggestionRequest is AU-restricted, WA-biased, and carries the token", () => {
  const token = {};
  const r = suggestionRequest("32 elvira", token);
  assert.equal(r.input, "32 elvira");
  assert.equal(r.sessionToken, token);
  assert.deepEqual(r.includedRegionCodes, ["au"]);
  assert.deepEqual(r.locationBias, WA_BOUNDS);
});
