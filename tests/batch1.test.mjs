// Batch 1 helpers: collision-proof names, and the FIR answered-flip guard.
import test from "node:test";
import assert from "node:assert/strict";
import { uniqueName } from "../lib/uploads.mjs";
import { firAnswered } from "../lib/core.mjs";
import { balVerdict } from "../lib/bushfire.mjs";

test("uniqueName: first use passes through and is recorded", () => {
  const used = new Set();
  assert.equal(uniqueName("plan.pdf", used), "plan.pdf");
  assert.ok(used.has("plan.pdf"));
});

test("uniqueName: collisions suffix -2, -3 … and never overwrite", () => {
  const used = new Set();
  assert.equal(uniqueName("plan.pdf", used), "plan.pdf");
  assert.equal(uniqueName("plan.pdf", used), "plan-2.pdf");
  assert.equal(uniqueName("plan.pdf", used), "plan-3.pdf");
  assert.equal(used.size, 3);
});

test("uniqueName: suffix lands before the extension, any extension", () => {
  const used = new Set(["site plan.PDF"]);
  assert.equal(uniqueName("site plan.PDF", used), "site plan-2.PDF");
});

test("firAnswered: no marker means not answered", () => {
  assert.equal(firAnswered(null, "send the engineering"), false);
  assert.equal(firAnswered(undefined, null), false);
});

test("firAnswered: marker answers the same ask", () => {
  const m = { at: "2026-08-12T00:00:00Z", ask: "send the engineering" };
  assert.equal(firAnswered(m, "send the engineering"), true);
});

test("firAnswered: a NEW ask re-arms the amber state", () => {
  const m = { at: "2026-08-12T00:00:00Z", ask: "send the engineering" };
  assert.equal(firAnswered(m, "now the footing details too"), false);
});

test("firAnswered: no current ask text — any recorded answer counts", () => {
  const m = { at: "2026-08-12T00:00:00Z", ask: null };
  assert.equal(firAnswered(m, null), true);
});

// The owner's compulsory-upload rule keys off verdict tones — pin them.
// Pre-2016 exempts BOTH kinds; only a 2016-or-later house obliges an upload.
test("BAL gate triggers: post-2016 shed = own report; post-2016 patio = evidence; exempt/far/unsure = nothing", () => {
  assert.equal(balVerdict({ distance: "near", kind: "shed", age: "post2016" }).tone, "action");
  assert.equal(balVerdict({ distance: "near", kind: "shed", age: "pre2016" }).tone, "clear");
  assert.equal(balVerdict({ distance: "near", kind: "shed" }), null);
  assert.equal(balVerdict({ distance: "near", kind: "patio", age: "post2016", rating: null }).tone, "action");
  assert.equal(balVerdict({ distance: "near", kind: "patio", age: "pre2016" }).tone, "clear");
  assert.equal(balVerdict({ distance: "far" }).tone, "clear");
  assert.equal(balVerdict({ distance: "near", kind: "patio", age: "unsure" }).tone, "info");
  assert.equal(balVerdict({ distance: "near", kind: "shed", age: "unsure" }).tone, "info");
});
