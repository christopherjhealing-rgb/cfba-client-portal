import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planAreaMm, fitScale, mToMmOnPaper, mmOnPaperToM, scaleBarMetres,
  snap, clampToLot, setbacks, defaultPlacement, parseMetres, fmtM, fmtM2,
  STRUCTURE_PRESETS,
  deriveStreet, normalisePts, rotatePts, polyBounds, lShapePts, shapePts,
  footprint, boundsOf, polygonArea, structureArea, isSimplePolygon,
  polyFromFootprint, rotateStructure, setbackMarks, alignSnap, resizeBounds,
  MERCATOR_M_PER_PX_Z0, UNDERLAY_DEFAULT_OPACITY, UNDERLAY_MAX_ZOOM,
  metresPerPixel, zoomForMetresPerPixel, underlayZoom, underlayScale,
  rotationCoverScale, underlayMapSize, groundToPlanVector, planToGroundVector,
  offsetLatLng, metresBetween, underlayAnchor, underlayCentre,
  clampUnderlayOpacity, clampUnderlayRot, sanitiseUnderlay,
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

// ---------------------------------------------------------------------------
// The aerial underlay: Web Mercator, and lining a photo up with the drawing.
// Perth sits at about -31.95°, so that latitude carries most of these.
// ---------------------------------------------------------------------------

const PERTH_LAT = -31.95;

test("metresPerPixel is the Web Mercator ground resolution", () => {
  // Zoom 0 on the equator is the constant itself.
  close(metresPerPixel(0, 0), MERCATOR_M_PER_PX_Z0);
  // Every zoom step halves it.
  for (let z = 0; z < 22; z++) close(metresPerPixel(PERTH_LAT, z + 1), metresPerPixel(PERTH_LAT, z) / 2);
  // At Perth, zoom 20 is about 12.7 cm on the ground per pixel.
  close(metresPerPixel(PERTH_LAT, 20), 0.12667499863177872, 1e-12);
  close(metresPerPixel(PERTH_LAT, 21), 0.06333749931588936, 1e-12);
  // Latitude enters as cos, so north and south of the equator match.
  close(metresPerPixel(-PERTH_LAT, 18), metresPerPixel(PERTH_LAT, 18));
  // Away from the equator a pixel covers less ground.
  assert.ok(metresPerPixel(PERTH_LAT, 18) < metresPerPixel(0, 18));
});

test("zoomForMetresPerPixel inverts metresPerPixel exactly", () => {
  for (const lat of [0, PERTH_LAT, -12.46, 51.5]) {
    for (const z of [1, 12, 17.5, 21.708]) {
      close(zoomForMetresPerPixel(lat, metresPerPixel(lat, z)), z, 1e-9);
    }
  }
});

test("underlayZoom asks for the zoom that draws one metre as one plan metre", () => {
  // A 20 x 40 m lot at 1:200 gives a 24.8 m wide canvas; 640 px of screen
  // across it is 25.8 px per drawing metre.
  const pxPerM = 640 / 24.8;
  const z = underlayZoom(PERTH_LAT, pxPerM);
  close(z, 21.70886359777834, 1e-9);
  // At that zoom the correction is a no-op: the map is already exact.
  close(underlayScale(PERTH_LAT, z, pxPerM), 1, 1e-12);
  // Clamped at both ends rather than asking for a zoom that cannot exist.
  assert.equal(underlayZoom(PERTH_LAT, 1e9), UNDERLAY_MAX_ZOOM);
  assert.equal(underlayZoom(PERTH_LAT, 0), 1);
  assert.equal(underlayZoom(PERTH_LAT, -3), 1);
});

test("underlayScale corrects whatever zoom the map really settled on", () => {
  const pxPerM = 640 / 24.8;
  // Satellite imagery runs out around 21: the photo goes soft, not wrong.
  close(underlayScale(PERTH_LAT, 21, pxPerM), 1.63451611137779, 1e-9);
  // A whole zoom step is a factor of two either way.
  close(underlayScale(PERTH_LAT, 20, pxPerM), 2 * underlayScale(PERTH_LAT, 21, pxPerM), 1e-9);
  assert.ok(underlayScale(PERTH_LAT, 22, pxPerM) < 1);
  // The invariant that matters: screen pixels per ground metre after the
  // correction equal the drawing's own pixels per metre, at any zoom at all.
  for (const z of [17, 19, 20, 21, 21.7, 22]) {
    close((1 / metresPerPixel(PERTH_LAT, z)) * underlayScale(PERTH_LAT, z, pxPerM), pxPerM, 1e-9);
  }
  // And on a phone-width canvas, where the ideal zoom lands almost exactly
  // on a whole number.
  const phonePx = 390 / 24.8;
  close((1 / metresPerPixel(PERTH_LAT, 21)) * underlayScale(PERTH_LAT, 21, phonePx), phonePx, 1e-9);
});

test("rotationCoverScale is how much bigger a turned box has to be", () => {
  assert.equal(rotationCoverScale(100, 200, 0), 1);
  assert.equal(rotationCoverScale(100, 200, 180), 1);
  close(rotationCoverScale(300, 300, 45), Math.SQRT2, 1e-12);
  // A quarter turn on a 2:1 box has to double to cover its old self.
  close(rotationCoverScale(100, 200, 90), 2, 1e-12);
  // Symmetric in sign, and never below 1.
  close(rotationCoverScale(300, 500, -30), rotationCoverScale(300, 500, 30), 1e-12);
  for (let d = -360; d <= 360; d += 7) assert.ok(rotationCoverScale(300, 500, d) >= 1 - 1e-12);
  assert.equal(rotationCoverScale(0, 0, 45), 1);
});

test("underlayMapSize covers the clip once rotated and scaled", () => {
  // No rotation, exact zoom: the map element is just the clip box.
  assert.deepEqual(underlayMapSize(400, 700, 0, 1), { w: 400, h: 700 });
  // Scaled up by the zoom correction, the element itself shrinks to match.
  const half = underlayMapSize(400, 700, 0, 2);
  assert.deepEqual(half, { w: 200, h: 350 });
  // Turned 45°, it grows by the cover factor.
  const turned = underlayMapSize(400, 700, 45, 1);
  assert.ok(turned.w >= 400 * rotationCoverScale(400, 700, 45) - 1);
  // Whatever the angle or scale, element × scale covers clip × cover.
  for (const deg of [0, 12, 45, 90, 135, 270]) {
    for (const k of [0.6, 1, 1.63, 3]) {
      const { w, h } = underlayMapSize(400, 700, deg, k);
      const cover = rotationCoverScale(400, 700, deg);
      assert.ok(w * k >= 400 * cover - 1, `w at ${deg}° x${k}`);
      assert.ok(h * k >= 700 * cover - 1, `h at ${deg}° x${k}`);
    }
  }
  // Clamped so a silly canvas never asks Google for a wall of tiles.
  assert.deepEqual(underlayMapSize(4, 4, 0, 1), { w: 64, h: 64 });
  assert.deepEqual(underlayMapSize(99999, 99999, 0, 1), { w: 4096, h: 4096 });
});

test("ground metres map onto the sheet through the north arrow", () => {
  // North arrow straight up: north is up the page, east is to the right.
  assert.deepEqual(groundToPlanVector(0, 10, 0), { dx: 0, dy: -10 });
  const east0 = groundToPlanVector(10, 0, 0);
  close(east0.dx, 10); close(east0.dy, 0);
  // North arrow turned a quarter clockwise: north points right, east down.
  const n90 = groundToPlanVector(0, 10, 90);
  close(n90.dx, 10); close(n90.dy, 0);
  const e90 = groundToPlanVector(10, 0, 90);
  close(e90.dx, 0); close(e90.dy, 10);
  // Half turn: north is down the page.
  const n180 = groundToPlanVector(0, 10, 180);
  close(n180.dx, 0); close(n180.dy, 10);
});

test("planToGroundVector reads the same numbers back", () => {
  for (const deg of [0, 45, 90, 137.5, 270, 315]) {
    const { dx, dy } = groundToPlanVector(12.5, -7.25, deg);
    const back = planToGroundVector(dx, dy, deg);
    close(back.east, 12.5, 1e-9);
    close(back.north, -7.25, 1e-9);
    // Rotation preserves length — the photo is turned, never stretched.
    close(Math.hypot(dx, dy), Math.hypot(12.5, 7.25), 1e-9);
  }
});

test("offsetLatLng and metresBetween are exact inverses over a lot", () => {
  const site = { lat: PERTH_LAT, lng: 115.86 };
  // 100 m north is about 0.000898° of latitude anywhere.
  const north100 = offsetLatLng(site.lat, site.lng, 0, 100);
  close(north100.lat - site.lat, 0.0008983152841195215, 1e-12);
  close(north100.lng, site.lng);
  // 100 m east is a bigger step in longitude this far from the equator.
  const east100 = offsetLatLng(site.lat, site.lng, 100, 0);
  close(east100.lng - site.lng, 0.0010586970766628936, 1e-12);
  for (const [e, n] of [[0, 0], [12.5, -30], [-240, 180], [3, 3]]) {
    const to = offsetLatLng(site.lat, site.lng, e, n);
    const back = metresBetween(site, to);
    close(back.east, e, 1e-6);
    close(back.north, n, 1e-6);
  }
});

test("underlayAnchor puts the geocoded point in the middle of the lot", () => {
  assert.deepEqual(underlayAnchor(20, 40), { x: 10, y: 20 });
  // Dragging the photo moves the anchor, in drawing metres.
  assert.deepEqual(underlayAnchor(20, 40, -1.5, 2.25), { x: 8.5, y: 22.25 });
});

test("underlayCentre lands the geocoded site exactly where the plan wants it", () => {
  const site = { lat: PERTH_LAT, lng: 115.8613 };
  // The canvas for a 20 x 40 m lot at 1:200, in the drawing's own metres.
  const elementCentre = { x: -3.2 + 24.8 / 2, y: -2.8 + 46 / 2 };
  for (const deg of [0, 45, 90, 180, 292.5]) {
    for (const [ox, oy] of [[0, 0], [2.4, -1.1], [-12, 6]]) {
      const anchor = underlayAnchor(20, 40, ox, oy);
      const centre = underlayCentre(site, anchor, elementCentre, deg);
      // Walk it back: where does the site actually appear, relative to the
      // element's centre, once the imagery is turned by deg?
      // A tenth of a millimetre: the tangent plane is taken at the site's
      // latitude and read back at the map centre's, and over a lot that is
      // the whole of the disagreement.
      const g = metresBetween(centre, site);
      const p = groundToPlanVector(g.east, g.north, deg);
      close(elementCentre.x + p.dx, anchor.x, 1e-4);
      close(elementCentre.y + p.dy, anchor.y, 1e-4);
    }
  }
});

test("underlay clamps keep opacity readable and the fine turn small", () => {
  assert.equal(clampUnderlayOpacity(0.55), 0.55);
  assert.equal(clampUnderlayOpacity(0), 0.15);
  assert.equal(clampUnderlayOpacity(9), 1);
  assert.equal(clampUnderlayOpacity("x"), UNDERLAY_DEFAULT_OPACITY);
  assert.equal(clampUnderlayRot(3.14), 3.1);
  assert.equal(clampUnderlayRot(-90), -45);
  assert.equal(clampUnderlayRot(90), 45);
  assert.equal(clampUnderlayRot(undefined), 0);
});

test("sanitiseUnderlay: a design saved before the aerial existed loads unchanged", () => {
  const blank = sanitiseUnderlay(undefined);
  assert.deepEqual(blank, {
    lat: null, lng: null, zoom: null, offsetX: 0, offsetY: 0, rot: 0,
    opacity: UNDERLAY_DEFAULT_OPACITY, visible: true, locked: true,
  });
  // Same for junk, a null, or a record with no site in it.
  assert.deepEqual(sanitiseUnderlay(null), blank);
  assert.deepEqual(sanitiseUnderlay("nope"), blank);
  assert.deepEqual(sanitiseUnderlay({ offsetX: 5, rot: 12, locked: false }), blank);
});

test("sanitiseUnderlay keeps a real alignment and defaults to locked", () => {
  const u = sanitiseUnderlay({
    lat: PERTH_LAT, lng: 115.86, zoom: 21.7, offsetX: 1.2345678,
    offsetY: -0.5, rot: 62, opacity: 0.02, visible: false,
  });
  assert.equal(u.lat, PERTH_LAT);
  assert.equal(u.lng, 115.86);
  assert.equal(u.zoom, 21.7);
  assert.equal(u.offsetX, 1.235);
  assert.equal(u.offsetY, -0.5);
  assert.equal(u.rot, 45);          // clamped
  assert.equal(u.opacity, 0.15);    // clamped, still readable
  assert.equal(u.visible, false);   // the client hid it; keep it hidden
  assert.equal(u.locked, true);     // locked unless the record says otherwise
  assert.equal(sanitiseUnderlay({ lat: PERTH_LAT, lng: 115.86, locked: false }).locked, false);
  // Nonsense coordinates are no site at all.
  assert.equal(sanitiseUnderlay({ lat: 99, lng: 115.86 }).lat, null);
  assert.equal(sanitiseUnderlay({ lat: PERTH_LAT, lng: 900 }).lng, null);
  assert.equal(sanitiseUnderlay({ lat: PERTH_LAT, lng: 115.86, zoom: 99 }).zoom, UNDERLAY_MAX_ZOOM);
});
