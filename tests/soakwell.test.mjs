import test from "node:test";
import assert from "node:assert/strict";
import {
  RATE_M3_PER_M2, RATE_MM_RETAINED, SOAKWELLS, MAX_WELLS,
  requiredVolume, options, bestOption, totalCapacity,
  sizeNew, sizeExisting, sizeKey, sizeLabel, findSize,
} from "../lib/soakwell.mjs";

// ---------------------------------------------------------------------------
// The transcription. Every capacity on the sheet is π r² h, so every capacity
// can be re-derived — which is the only way to prove eighteen hand-typed rows
// went in correctly.
//
// The sheet does not round to nearest throughout: 1070 × 1200 is 1.079 printed
// up as 1.09, and 1500 × 1200 is 2.121 printed down as 2.10. Both are pinned
// below rather than smoothed away, because the council's printed figure is the
// one a client gets held to and "correcting" it would put us out of step with
// the document we cite.
// ---------------------------------------------------------------------------

test("every printed capacity is the volume of that cylinder", () => {
  for (const s of SOAKWELLS) {
    const r = s.dia / 2000;              // mm diameter -> m radius
    const h = s.depth / 1000;
    const derived = Math.PI * r * r * h;
    assert.ok(
      Math.abs(derived - s.capacity) <= 0.03,
      `${sizeLabel(s)}: sheet says ${s.capacity}, geometry says ${derived.toFixed(3)}`
    );
  }
});

test("the two rows the sheet doesn't round to nearest stay as printed", () => {
  assert.equal(findSize("1070x1200").capacity, 1.09, "geometry 1.079, printed up");
  assert.equal(findSize("1500x1200").capacity, 2.10, "geometry 2.121, printed down");
});

test("all but those two are the nearest two decimals", () => {
  const odd = new Set(["1070x1200", "1500x1200"]);
  for (const s of SOAKWELLS) {
    if (odd.has(sizeKey(s))) continue;
    const derived = Math.PI * (s.dia / 2000) ** 2 * (s.depth / 1000);
    assert.equal(s.capacity, Math.round(derived * 100) / 100, sizeLabel(s));
  }
});

test("the table is the eighteen rows on the sheet, in order, no duplicates", () => {
  assert.equal(SOAKWELLS.length, 18);
  assert.deepEqual(
    SOAKWELLS.map(sizeKey).slice(0, 5),
    ["600x600", "900x600", "900x900", "900x1200", "1070x600"]
  );
  assert.equal(SOAKWELLS.at(-1).capacity, 4.58);
  assert.equal(new Set(SOAKWELLS.map(sizeKey)).size, 18);
});

test("capacity rises with depth for a given diameter", () => {
  const byDia = new Map();
  for (const s of SOAKWELLS) {
    const seen = byDia.get(s.dia);
    if (seen) {
      assert.ok(s.depth > seen.depth, `${sizeKey(s)} out of order`);
      assert.ok(s.capacity > seen.capacity, `${sizeKey(s)} holds no more than ${sizeKey(seen)}`);
    }
    byDia.set(s.dia, s);
  }
});

// ---------------------------------------------------------------------------
// The formula, and the sheet's own worked example
// ---------------------------------------------------------------------------

test("the rate is 0.0125 m3/m2, which is 12.5 mm retained", () => {
  assert.equal(RATE_M3_PER_M2, 0.0125);
  assert.equal(RATE_MM_RETAINED, 12.5);
  assert.equal(RATE_M3_PER_M2 * 1000, RATE_MM_RETAINED);
});

test("the sheet's worked example: 60 m2 paved gives 0.75 m3 and a 900 x 1200", () => {
  const v = requiredVolume(60);
  assert.equal(v, 0.75);
  const best = bestOption(v);
  assert.equal(best.count, 1);
  assert.equal(sizeKey(best.size), "900x1200");
  assert.equal(best.total, 0.76);
});

test("no area, no answer", () => {
  assert.equal(requiredVolume(0), 0);
  assert.equal(requiredVolume(-40), 0);
  assert.equal(requiredVolume("nonsense"), 0);
  assert.equal(sizeNew({ roofM2: 0 }).ok, false);
  assert.equal(sizeNew().reason, "incomplete");
});

// ---------------------------------------------------------------------------
// "Always round up to the nearest volume" — the one rule that must never break
// ---------------------------------------------------------------------------

test("every option offered holds at least what's required", () => {
  for (let area = 10; area <= 900; area += 10) {
    const need = requiredVolume(area);
    for (const o of options(need)) {
      assert.ok(o.total >= need,
        `${area} m2 needs ${need} m3 but ${o.label} holds only ${o.total}`);
      assert.equal(o.total, Math.round(o.count * o.size.capacity * 100) / 100);
      assert.ok(o.count >= 1 && o.count <= MAX_WELLS);
    }
  }
});

test("a volume that lands exactly on a capacity doesn't buy a spare well", () => {
  // 1.36 m³ is a 1200 × 1200 exactly — one well, not two.
  const exact = options(1.36).find((o) => sizeKey(o.size) === "1200x1200");
  assert.equal(exact.count, 1);
  assert.equal(exact.excess, 0);

  // And a multiple of one: 2.72 is two of them, not three.
  const twice = options(2.72).find((o) => sizeKey(o.size) === "1200x1200");
  assert.equal(twice.count, 2);
  assert.equal(twice.excess, 0);
});

test("a hair over a capacity does buy the next well", () => {
  const o = options(1.37).find((s) => sizeKey(s.size) === "1200x1200");
  assert.equal(o.count, 2);
});

test("options lead with the fewest wells, then the least waste", () => {
  const list = options(requiredVolume(200));   // 2.5 m³
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    assert.ok(a.count < b.count || (a.count === b.count && a.excess <= b.excess),
      `${a.label} should not come before ${b.label}`);
  }
  assert.equal(list[0].count, 1);
  assert.equal(sizeKey(list[0].size), "1500x1500");   // 2.65, the tightest single
});

test("sizes needing more than MAX_WELLS are dropped, not shown and ignored", () => {
  const big = options(requiredVolume(1000));   // 12.5 m³
  assert.ok(big.every((o) => o.count <= MAX_WELLS));
  assert.ok(big.every((o) => sizeKey(o.size) !== "600x600"),
    "74 × 600 × 600 is not an answer anybody wants");
  assert.ok(big.length > 0, "a big roof still gets options");
});

test("an area past every combination returns nothing rather than a wrong answer", () => {
  // 10 × the largest well is 45.8 m³ — about 3,660 m² of roof.
  assert.deepEqual(options(requiredVolume(9000)), []);
  const r = sizeNew({ roofM2: 9000 });
  assert.equal(r.ok, true);
  assert.equal(r.best, null);
  assert.deepEqual(r.options, []);
});

// ---------------------------------------------------------------------------
// Calculator 1 — a new structure, nothing existing
// ---------------------------------------------------------------------------

test("new work: roof and paved are summed, then sized as one catchment", () => {
  const r = sizeNew({ roofM2: 120, pavedM2: 40 });
  assert.equal(r.area, 160);
  assert.equal(r.required, 2);
  assert.equal(r.best.total >= 2, true);
  // Sizing them separately would under-buy: 120 -> 1.5 and 40 -> 0.5 can be met
  // by two wells holding 1.7 + 0.54, which is 2.24. Together it's still 2.
  assert.equal(requiredVolume(120) + requiredVolume(40), r.required);
});

test("new work: a typical patio", () => {
  const r = sizeNew({ roofM2: 36 });
  assert.equal(r.required, 0.45);
  assert.equal(r.best.count, 1);
  assert.equal(sizeKey(r.best.size), "1070x600");   // 0.54, the tightest single
});

// ---------------------------------------------------------------------------
// Calculator 2 — existing wells on the lot
// ---------------------------------------------------------------------------

test("existing: the whole catchment is sized, not just the new part", () => {
  const r = sizeExisting({
    existingRoofM2: 180, proposedRoofM2: 40, existingWells: [],
  });
  assert.equal(r.area, 220);
  assert.equal(r.required, 2.75);
  // Sizing the 40 m² on its own would have said 0.5 m³ — the trap this
  // calculator exists to close.
  assert.notEqual(r.required, requiredVolume(40));
});

test("existing: capacity already in the ground counts towards the total", () => {
  const wells = [{ key: "1200x1200", count: 2 }];   // 2.72
  assert.equal(totalCapacity(wells), 2.72);

  const r = sizeExisting({
    existingRoofM2: 180, proposedRoofM2: 40, existingWells: wells,
  });
  assert.equal(r.have, 2.72);
  assert.equal(r.required, 2.75);
  assert.equal(r.covered, false);
  assert.equal(r.shortfall, 0.03);
  assert.equal(r.best.count, 1);
  assert.equal(sizeKey(r.best.size), "600x600");    // the smallest that closes it
});

test("existing: enough capacity says so, and says how much is spare", () => {
  const r = sizeExisting({
    existingRoofM2: 180, proposedRoofM2: 40,
    existingWells: [{ key: "1800x1200", count: 1 }],   // 3.05
  });
  assert.equal(r.covered, true);
  assert.equal(r.shortfall, 0);
  assert.equal(r.spare, 0.3);
  assert.deepEqual(r.options, []);
  assert.equal(r.best, null);
});

test("existing: exactly enough is covered, with nothing spare", () => {
  const r = sizeExisting({
    existingRoofM2: 100, proposedRoofM2: 20,       // 120 m² -> 1.50
    existingWells: [{ key: "1200x1500", count: 1 }],  // 1.70
  });
  assert.equal(r.required, 1.5);
  assert.equal(r.covered, true);
  assert.equal(r.spare, 0.2);
});

test("existing: no wells at all is the same answer as calculator 1", () => {
  const a = sizeExisting({ existingRoofM2: 0, proposedRoofM2: 150 });
  const b = sizeNew({ roofM2: 150 });
  assert.equal(a.required, b.required);
  assert.equal(a.shortfall, b.required);
  assert.equal(a.best.label, b.best.label);
});

test("existing: paving joins the proposed side of the sum", () => {
  const r = sizeExisting({ existingRoofM2: 100, proposedRoofM2: 30, pavedM2: 20 });
  assert.equal(r.existingArea, 100);
  assert.equal(r.proposedArea, 50);
  assert.equal(r.area, 150);
});

test("existing: junk in the well list is ignored, not counted as zero-sized", () => {
  assert.equal(totalCapacity([{ key: "not-a-size", count: 4 }]), 0);
  assert.equal(totalCapacity([{ key: "1200x1200", count: -2 }]), 0);
  assert.equal(totalCapacity([{ key: "1200x1200", count: 1.7 }]), 1.36);
  assert.equal(totalCapacity(), 0);
});

test("existing: no area at all is unanswered, not 'you're covered'", () => {
  const r = sizeExisting({ existingWells: [{ key: "1800x1800", count: 3 }] });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "incomplete");
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test("sizes round-trip through their key", () => {
  for (const s of SOAKWELLS) assert.equal(findSize(sizeKey(s)), s);
  assert.equal(findSize("1200x1300"), null);
  assert.equal(findSize(""), null);
});

test("labels read the way a supplier says them", () => {
  assert.equal(sizeLabel({ dia: 1200, depth: 900 }), "1200 × 900");
  assert.equal(bestOption(0.3).label, "900 × 600");
  // 4 m³ is past the 1800 × 1500 (3.82), so it takes the 1800 × 1800.
  assert.equal(bestOption(4).label, "1800 × 1800");
  assert.equal(bestOption(9).label, "2 × 1800 × 1800");
});
