import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planAreaMm, fitScale, mToMmOnPaper, mmOnPaperToM, scaleBarMetres,
  snap, clampToLot, setbacks, defaultPlacement, parseMetres, fmtM, fmtM2,
  STRUCTURE_PRESETS,
} from "../lib/site-plan.mjs";

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test("plan area is A4 minus page margins and the title block", () => {
  assert.deepEqual(planAreaMm(), { w: 186, h: 237 });
});

test("fitScale picks the smallest standard scale that fits A4", () => {
  // Small lot draws big.
  assert.deepEqual(fitScale(10, 15), { denom: 100, fits: true });
  // The typical suburban lot from the brief prints at 1:200.
  assert.deepEqual(fitScale(20.12, 40.25), { denom: 200, fits: true });
  // Rural-ish lot drops to 1:500.
  assert.deepEqual(fitScale(40, 80), { denom: 500, fits: true });
});

test("fitScale keeps a scale that fits exactly, and is honest when none do", () => {
  // 162 mm x 207 mm available at 1:100 = 16.2 m x 20.7 m — exactly on the line.
  assert.deepEqual(fitScale(16.2, 20.7), { denom: 100, fits: true });
  // A lot beyond A4 at 1:500 must say so, not pretend.
  assert.deepEqual(fitScale(200, 300), { denom: 500, fits: false });
});

test("paper conversion round-trips", () => {
  close(mToMmOnPaper(20.12, 200), 100.6);
  close(mmOnPaperToM(mToMmOnPaper(7.3, 500), 500), 7.3);
  // 3 mm of annotation text is 0.6 m of drawing at 1:200.
  close(mmOnPaperToM(3, 200), 0.6);
});

test("scale bar is a round length no longer than ~50 mm of paper", () => {
  assert.equal(scaleBarMetres(100), 5);
  assert.equal(scaleBarMetres(200), 10);
  assert.equal(scaleBarMetres(500), 20);
});

test("setbacks measure to all four boundaries, street at the bottom", () => {
  const s = setbacks({ x: 1, y: 2, w: 3, d: 4 }, 10, 20);
  assert.deepEqual(s, { left: 1, right: 6, rear: 2, front: 14 });
});

test("clampToLot keeps structures inside, pins oversize to the origin", () => {
  assert.deepEqual(clampToLot(-5, -5, 3, 3, 10, 10), { x: 0, y: 0 });
  assert.deepEqual(clampToLot(9, 9, 3, 3, 10, 10), { x: 7, y: 7 });
  assert.deepEqual(clampToLot(2, 2, 15, 15, 10, 10), { x: 0, y: 0 });
});

test("defaultPlacement staggers but never leaves the lot", () => {
  for (let count = 0; count < 8; count++) {
    for (const p of STRUCTURE_PRESETS) {
      const { x, y } = defaultPlacement(p.w, p.d, 20, 40, count);
      assert.ok(x >= 0 && y >= 0, `${p.kind} inside at count ${count}`);
      assert.ok(x + p.w <= 20 + 1e-9 && y + p.d <= 40 + 1e-9);
    }
  }
});

test("snap rounds to the step", () => {
  close(snap(1.234, 0.05), 1.25);
  close(snap(0.04, 0.1), 0);
});

test("parseMetres takes decimals (comma too), rejects junk, caps at 2 dp", () => {
  assert.equal(parseMetres("20.12"), 20.12);
  assert.equal(parseMetres("20,12"), 20.12);
  assert.equal(parseMetres("3.456"), 3.46);
  assert.equal(parseMetres("0"), null);
  assert.equal(parseMetres("-3"), null);
  assert.equal(parseMetres("shed"), null);
  assert.equal(parseMetres(""), null);
});

test("dimensions trim, setbacks always carry 2 dp", () => {
  assert.equal(fmtM(20.12), "20.12");
  assert.equal(fmtM(3), "3");
  assert.equal(fmtM(0.3), "0.3");
  assert.equal(fmtM2(1.5), "1.50");
  assert.equal(fmtM2(0), "0.00");
});

test("the six presets are the six from the spec", () => {
  assert.deepEqual(STRUCTURE_PRESETS.map((p) => p.kind),
    ["dwelling", "patio", "shed", "pool", "carport", "retaining"]);
  const shed = STRUCTURE_PRESETS.find((p) => p.kind === "shed");
  assert.deepEqual({ w: shed.w, d: shed.d }, { w: 3, d: 3 });
});
