import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planAreaMm, fitScale, mToMmOnPaper, mmOnPaperToM, scaleBarMetres,
  snap, clampToLot, setbacks, defaultPlacement, parseMetres, fmtM, fmtM2,
  STRUCTURE_PRESETS,
  deriveStreet, normalisePts, rotatePts, polyBounds, lShapePts, shapePts,
  footprint, boundsOf, polygonArea, structureArea, isSimplePolygon,
  polyFromFootprint, rotateStructure, setbackMarks, alignSnap, resizeBounds,
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

// ---------------------------------------------------------------------------
// Street from address.
// ---------------------------------------------------------------------------

test("deriveStreet strips lot/unit/number tokens and keeps the street", () => {
  assert.equal(deriveStreet("24 Narranbee Ridge"), "Narranbee Ridge");
  assert.equal(deriveStreet("Lot 214 Bushmead Rd, Hazelmere WA"), "Bushmead Rd");
  assert.equal(deriveStreet("Unit 2/24 Smith St, Wanneroo"), "Smith St");
  assert.equal(deriveStreet("2/24 Smith St"), "Smith St");
  assert.equal(deriveStreet("24a Wandoo Rise, Baldivis"), "Wandoo Rise");
  assert.equal(deriveStreet("24-26 Ranford Road, Canning Vale"), "Ranford Road");
  assert.equal(deriveStreet("No. 5 Elvira St, Palmyra"), "Elvira St");
});

test("deriveStreet leaves street-only text alone and never invents one", () => {
  // No leading number — already just a street.
  assert.equal(deriveStreet("Wandoo Rise"), "Wandoo Rise");
  // Numbered street names survive: "1st" is not a house number.
  assert.equal(deriveStreet("12 1st Avenue, Bassendean"), "1st Avenue");
  // Nothing left after the tokens means no street to offer.
  assert.equal(deriveStreet("Lot 512"), "");
  assert.equal(deriveStreet(""), "");
  assert.equal(deriveStreet(null), "");
  assert.equal(deriveStreet(undefined), "");
});

// ---------------------------------------------------------------------------
// Shapes and rotation.
// ---------------------------------------------------------------------------

const rect210 = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 0, y: 1 }];

test("rotatePts turns clockwise in quarter steps and re-anchors at the origin", () => {
  assert.deepEqual(rotatePts(rect210, 0), rect210);
  assert.deepEqual(rotatePts(rect210, 90),
    [{ x: 1, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 2 }, { x: 0, y: 0 }]);
  assert.deepEqual(rotatePts(rect210, 180),
    [{ x: 2, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 0 }, { x: 2, y: 0 }]);
  assert.deepEqual(rotatePts(rect210, 270),
    [{ x: 0, y: 2 }, { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 2 }]);
  // Four quarter turns come home.
  assert.deepEqual(rotatePts(rotatePts(rect210, 180), 180), rect210);
});

test("normalisePts and polyBounds anchor and measure an outline", () => {
  const pts = normalisePts([{ x: 3, y: 5 }, { x: 7, y: 5 }, { x: 7, y: 6 }]);
  assert.deepEqual(pts, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 1 }]);
  assert.deepEqual(polyBounds(pts), { minX: 0, minY: 0, maxX: 4, maxY: 1 });
});

test("lShapePts cuts the notch from the street-side right corner and clamps it", () => {
  const pts = lShapePts(6, 4, 3, 2);
  assert.equal(pts.length, 6);
  assert.equal(polygonArea(pts), 6 * 4 - 3 * 2);
  // The notch corner is missing: no vertex at (6, 4).
  assert.ok(!pts.some((p) => p.x === 6 && p.y === 4));
  // An impossible notch is clamped, never allowed to erase the whole shape.
  assert.ok(polygonArea(lShapePts(6, 4, 99, 99)) > 0);
});

test("footprint and boundsOf: a quarter-turned structure swaps width and depth", () => {
  const s = { x: 1, y: 2, w: 4, d: 2, rot: 90, shape: "rect" };
  assert.deepEqual(boundsOf(s), { w: 2, d: 4 });
  const b = polyBounds(footprint(s));
  assert.deepEqual(b, { minX: 1, minY: 2, maxX: 3, maxY: 6 });
  // Old saved rectangles carry no shape/rot at all and still measure true.
  assert.deepEqual(boundsOf({ x: 0, y: 0, w: 5, d: 3 }), { w: 5, d: 3 });
});

test("setbacks stay correct for every shape and rotation", () => {
  // The long-standing rectangle case, exactly as before.
  assert.deepEqual(setbacks({ x: 1, y: 2, w: 3, d: 4 }, 10, 20),
    { left: 1, right: 6, rear: 2, front: 14 });
  // Quarter-turned rectangle: the footprint is what gets measured.
  assert.deepEqual(setbacks({ x: 1, y: 2, w: 4, d: 2, rot: 90 }, 10, 20),
    { left: 1, right: 7, rear: 2, front: 14 });
  // An L measures from its envelope — the nearest built part on each side.
  const l = { x: 2, y: 3, w: 6, d: 4, rot: 0, shape: "lshape", notchW: 3, notchD: 2 };
  assert.deepEqual(setbacks(l, 20, 40), { left: 2, right: 12, rear: 3, front: 33 });
});

test("setbackMarks leave from the middle of the nearest face", () => {
  const l = { x: 2, y: 3, w: 6, d: 4, rot: 0, shape: "lshape", notchW: 3, notchD: 2 };
  const m = setbackMarks(l, 20, 40);
  assert.equal(m.left.v, 2);
  close(m.left.y1, 5);          // full-height left face: mid of y 3..7
  assert.equal(m.right.v, 12);
  close(m.right.y1, 4);         // right face only spans y 3..5 beside the notch
  assert.equal(m.rear.v, 3);
  close(m.rear.x1, 5);          // full-width rear face: mid of x 2..8
  assert.equal(m.front.v, 33);
  close(m.front.x1, 3.5);       // front face is the leg left of the notch
});

test("polygonArea (shoelace) and structureArea agree with rectangle maths", () => {
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]), 12);
  assert.equal(polygonArea([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }]), 6);
  assert.equal(structureArea({ x: 0, y: 0, w: 5, d: 2 }), 10);
  assert.equal(structureArea({ x: 0, y: 0, w: 6, d: 4, shape: "lshape", notchW: 3, notchD: 2 }), 18);
});

test("isSimplePolygon accepts honest outlines and rejects self-crossers", () => {
  assert.ok(isSimplePolygon([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]));
  assert.ok(isSimplePolygon(lShapePts(6, 4, 3, 2)));
  // The bowtie: two edges cross mid-air.
  assert.ok(!isSimplePolygon([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }]));
  // Too few corners, or no area at all.
  assert.ok(!isSimplePolygon([{ x: 0, y: 0 }, { x: 2, y: 2 }]));
  assert.ok(!isSimplePolygon([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]));
});

test("polyFromFootprint stores an outline that footprint() reproduces", () => {
  const abs = [{ x: 5, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 7 }, { x: 6, y: 7 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  for (const rot of [0, 90, 180, 270]) {
    const stored = polyFromFootprint(abs, rot);
    assert.equal(stored.x, 5);
    assert.equal(stored.y, 5);
    const back = footprint({ ...stored, rot, shape: "poly" });
    assert.deepEqual(back, abs.map((p) => ({ x: p.x, y: p.y })), `round trip at ${rot}°`);
  }
  const flat = polyFromFootprint(abs, 0);
  assert.deepEqual({ w: flat.w, d: flat.d }, { w: 3, d: 2 });
});

test("rotateStructure steps 90° about the centre and stays inside the lot", () => {
  const s = { x: 2, y: 2, w: 6, d: 2, rot: 0 };
  const r = rotateStructure(s, 20, 40);
  assert.equal(r.rot, 90);
  // Centre was (5, 3); new 2 × 6 bounds centred there → x 4, y 0.
  assert.deepEqual({ x: r.x, y: r.y }, { x: 4, y: 0 });
  // Hard against the boundary: the re-centred footprint clamps back in.
  const edge = rotateStructure({ x: 0, y: 0, w: 8, d: 2, rot: 0 }, 20, 40);
  assert.deepEqual({ rot: edge.rot, x: edge.x, y: edge.y }, { rot: 90, x: 3, y: 0 });
  // A full lap returns to 0°.
  assert.equal(rotateStructure({ ...s, rot: 270 }, 20, 40).rot, 0);
});

// ---------------------------------------------------------------------------
// Magnetic alignment and handle resizing.
// ---------------------------------------------------------------------------

test("alignSnap pulls edges level within the threshold and reports the guide", () => {
  const others = [{ x: 5, y: 10, w: 4, d: 3 }];
  // My left edge 0.2 m off their left edge: snaps level, one vertical guide.
  const r = alignSnap(5.2, 20, 3, 3, others);
  assert.equal(r.x, 5);
  assert.equal(r.y, 20);
  assert.equal(r.guides.length, 1);
  assert.deepEqual(r.guides[0], { axis: "x", at: 5, from: 10, to: 23 });
  // My right edge against their left edge — abutment lines up too.
  assert.equal(alignSnap(1.8, 20, 3, 3, others).x, 2);
  // Centres attract centres (theirs is at x 7): edge-to-centre never snaps.
  const c = alignSnap(6.15, 20, 2, 3, others);
  assert.equal(c.x, 6);
  assert.equal(c.guides[0].at, 7);
  // Beyond the threshold nothing moves and no guide is drawn.
  const far = alignSnap(9.5, 20, 3, 3, others);
  assert.equal(far.x, 9.5);
  assert.deepEqual(far.guides, []);
});

test("alignSnap works per axis and can snap both at once", () => {
  const others = [{ x: 5, y: 10, w: 4, d: 3 }];
  const r = alignSnap(9.25, 13.1, 3, 3, others);
  assert.equal(r.x, 9);          // left edge to their right edge
  assert.equal(r.y, 13);         // top edge to their bottom edge
  assert.equal(r.guides.length, 2);
  assert.equal(r.guides[0].axis, "x");
  assert.equal(r.guides[1].axis, "y");
});

test("resizeBounds drags one edge, snaps the size to 0.1 m and respects limits", () => {
  const b = { x: 2, y: 3, w: 4, d: 5 };
  // East handle: width follows the pointer, snapped.
  assert.deepEqual(resizeBounds(b, "e", 7.34, 0, 20, 40), { x: 2, y: 3, w: 5.3, d: 5 });
  // West handle: right edge holds still.
  assert.deepEqual(resizeBounds(b, "w", 1.02, 0, 20, 40), { x: 1, y: 3, w: 5, d: 5 });
  // Corner moves both axes.
  assert.deepEqual(resizeBounds(b, "se", 7.14, 9.06, 20, 40), { x: 2, y: 3, w: 5.1, d: 6.1 });
  // North handle: bottom edge holds still.
  assert.deepEqual(resizeBounds(b, "n", 0, 1.96, 20, 40), { x: 2, y: 2, w: 4, d: 6 });
  // Never below 0.1 m, never past the boundary.
  assert.equal(resizeBounds(b, "e", 1, 0, 20, 40).w, 0.1);
  assert.equal(resizeBounds(b, "e", 99, 0, 20, 40).w, 18);
  assert.equal(resizeBounds(b, "w", -5, 0, 20, 40).x, 0);
});
