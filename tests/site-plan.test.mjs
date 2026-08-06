import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planAreaMm, fitScale, mToMmOnPaper, mmOnPaperToM, scaleBarMetres,
  snap, clampToLot, setbacks, defaultPlacement, parseMetres, fmtM, fmtM2,
  STRUCTURE_PRESETS, STRUCTURE_STATES, structureState, toggleState,
  polyDistance, structureGap, nearbyGaps, printedGaps,
  pairKey, togglePin, isPinned, sanitisePins, PIN_CAP,
  deriveStreet, streetLooksCopied,
  normalisePts, rotatePts, polyBounds, lShapePts, shapePts,
  footprint, boundsOf, polygonArea, structureArea, isSimplePolygon,
  polyFromFootprint, rotateStructure, setbackMarks, alignSnap, resizeBounds,
  rectLotPts, RECT_FRONTAGE, lotPts, lotFrontage, lotEdges, edgeLabels,
  polygonCentroid, closestOnSegment, pointToSegment, minDistPolyToSegment,
  polygonContains, polygonInside, lotSetbacks, sanitiseLot,
  lotOrigin, nextLotOrigin, boundaryRow, boundaryFooter, lotOriginNote, fmtDate,
  LOT_ALIGN_M, LOT_SQUARE_TOL_DEG, reanchorLot, isRectLot, cornerAlign,
  squareCorner, moveLotCorner, moveLotEdge, addLotCorner, removeLotCorner,
  frontageFacingStreet, lotRingFromPts, holdUnderlayAnchor, applyLotEdit,
  pushHistory,
  MERCATOR_M_PER_PX_Z0, UNDERLAY_DEFAULT_OPACITY, UNDERLAY_MAX_ZOOM,
  metresPerPixel, zoomForMetresPerPixel, underlayZoom, underlayScale,
  rotationCoverScale, underlayMapSize, groundToPlanVector, planToGroundVector,
  offsetLatLng, metresBetween, underlayAnchor, underlayCentre,
  clampUnderlayOpacity, clampUnderlayRot, sanitiseUnderlay,
  PATIO_ROOFS, PATIO_MAX_PITCH, GUTTER_M_PER_DOWNPIPE,
  sanitisePatio, patioColumns, patioGutter, downpipesNeeded, patioRoofHeights,
  patioElevationProfile,
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

test("defaultPlacement centres on the lot's own middle when it has one", () => {
  // A battleaxe: rear block up the top, a 4 m access leg down to the street.
  // The bounding box's centre is out in the leg's neighbour's yard; the lot's
  // own centroid is in the block, which is where a new shed belongs.
  const flag = [
    { x: 8, y: 55 }, { x: 12, y: 55 }, { x: 12, y: 25 }, { x: 20, y: 25 },
    { x: 20, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 25 }, { x: 8, y: 25 },
  ];
  const c = polygonCentroid(flag);
  const shed = ({ x, y }) =>
    [{ x, y }, { x: x + 3, y }, { x: x + 3, y: y + 3 }, { x, y: y + 3 }];
  let boxMisses = 0;
  for (let count = 0; count < 5; count++) {
    const at = defaultPlacement(3, 3, 20, 55, count, c);
    assert.ok(polygonInside(shed(at), flag),
      `shed ${count} at ${at.x}, ${at.y} lands inside the lot`);
    if (!polygonInside(shed(defaultPlacement(3, 3, 20, 55, count)), flag)) boxMisses++;
  }
  // The bounding box's centre is out in the access leg, and the stagger walks
  // it straight through the side fence.
  assert.ok(boxMisses > 0, "the bounding-box centre would have missed the lot");
  // And with no centre given, nothing about the old behaviour moves.
  assert.deepEqual(defaultPlacement(3, 3, 20, 40, 0), { x: 8.5, y: 18.5 });
  assert.deepEqual(defaultPlacement(3, 3, 20, 40, 0, null),
    defaultPlacement(3, 3, 20, 40, 0));
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
// Existing or proposed.
// ---------------------------------------------------------------------------

test("a structure saved before states existed is proposed, and nothing else", () => {
  // Every design already in a client's browser: no state field at all.
  assert.equal(structureState({ x: 0, y: 0, w: 3, d: 3 }), "proposed");
  assert.equal(structureState({ state: "proposed" }), "proposed");
  assert.equal(structureState({ state: "existing" }), "existing");
  // Nothing else is ever read as existing — a typo must not quietly demote a
  // structure the application is actually for.
  assert.equal(structureState({ state: "EXISTING" }), "proposed");
  assert.equal(structureState({ state: "" }), "proposed");
  assert.equal(structureState({ state: 1 }), "proposed");
  assert.equal(structureState(null), "proposed");
  assert.equal(structureState(undefined), "proposed");
});

test("one tap swaps the state", () => {
  assert.equal(toggleState("proposed"), "existing");
  assert.equal(toggleState("existing"), "proposed");
  // A junk state toggles to existing, matching structureState reading it as
  // proposed — the toggle can never land on the value it started from.
  assert.equal(toggleState("nonsense"), "existing");
  assert.deepEqual(STRUCTURE_STATES, ["proposed", "existing"]);
});

test("the dwelling lands existing; everything else lands proposed", () => {
  // The common job here is a patio or a shed going onto a house that is
  // already there, so the dwelling saves the client a tap.
  const state = (kind) =>
    structureState(STRUCTURE_PRESETS.find((p) => p.kind === kind));
  assert.equal(state("dwelling"), "existing");
  for (const kind of ["patio", "shed", "pool", "carport", "retaining"]) {
    assert.equal(state(kind), "proposed", kind);
  }
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

test("streetLooksCopied catches a street field holding the address", () => {
  // The reported bug: a design saved before deriveStreet existed put the whole
  // address in the street field, and it stayed there for good.
  assert.equal(streetLooksCopied("24 Narranbee Ridge", "24 Narranbee Ridge"), true);
  // Same, with the suburb still on it, either side or both.
  assert.equal(
    streetLooksCopied("24 Narranbee Ridge, Baldivis", "24 Narranbee Ridge, Baldivis"), true);
  assert.equal(streetLooksCopied("24 Narranbee Ridge", "24 Narranbee Ridge, Baldivis"), true);
  assert.equal(streetLooksCopied("Narranbee Ridge, Baldivis", "24 Narranbee Ridge, Baldivis"), true);
  // A lot or unit marker is never part of a street name.
  assert.equal(streetLooksCopied("Lot 214 Foo Street", "Lot 214 Foo Street"), true);
  assert.equal(streetLooksCopied("Unit 2/24 Smith St", "Unit 2/24 Smith St, Wanneroo"), true);
  // Copied and then re-cased or re-spaced is still copied.
  assert.equal(streetLooksCopied("24  NARRANBEE  RIDGE", "24 Narranbee Ridge"), true);
});

test("streetLooksCopied leaves a real street name alone", () => {
  // The derived value: right, and not a copy of anything.
  assert.equal(streetLooksCopied("Narranbee Ridge", "24 Narranbee Ridge"), false);
  // THE CASE THAT MUST NOT REGRESS. A corner lot's frontage is a different
  // street from the one in its address, typed by hand. Re-deriving over it
  // would throw the client's own word away every time the design loaded.
  assert.equal(streetLooksCopied("Wandoo Rise", "24 Narranbee Ridge"), false);
  // Nothing typed is nothing to preserve — the field derives itself.
  assert.equal(streetLooksCopied("", "24 Narranbee Ridge"), false);
  assert.equal(streetLooksCopied("   ", "24 Narranbee Ridge"), false);
  assert.equal(streetLooksCopied(null, "24 Narranbee Ridge"), false);
  assert.equal(streetLooksCopied(undefined, undefined), false);
  // A street name with a number in it is still a street name.
  assert.equal(streetLooksCopied("1st Avenue", "12 1st Avenue, Bassendean"), false);
  // No address to be a copy of.
  assert.equal(streetLooksCopied("Wandoo Rise", ""), false);
});

test("a street the client typed survives the load that re-derives a copied one", () => {
  // How the builder reads it: only a genuine hand-typed street suppresses
  // re-derivation, and a copied one is corrected on the spot.
  const load = (street, address) => {
    const edited = !!(String(street).trim() && !streetLooksCopied(street, address));
    return { street: edited ? street : deriveStreet(address), edited };
  };
  assert.deepEqual(load("24 Narranbee Ridge", "24 Narranbee Ridge"),
    { street: "Narranbee Ridge", edited: false });
  assert.deepEqual(load("Wandoo Rise", "24 Narranbee Ridge"),
    { street: "Wandoo Rise", edited: true });
  assert.deepEqual(load("", "24 Narranbee Ridge"),
    { street: "Narranbee Ridge", edited: false });
  assert.deepEqual(load("Narranbee Ridge", "24 Narranbee Ridge"),
    { street: "Narranbee Ridge", edited: true });
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
// The lot: a rectangle by default, a polygon when there's a real one.
// ---------------------------------------------------------------------------

test("the rectangle lot is the four-cornered case of the polygon lot", () => {
  assert.deepEqual(rectLotPts(20, 40),
    [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 40 }, { x: 0, y: 40 }]);
  // Edge 2 is the bottom one — the street, where it has always been.
  assert.equal(RECT_FRONTAGE, 2);
  const pts = rectLotPts(20, 40);
  assert.deepEqual(pts[RECT_FRONTAGE], { x: 20, y: 40 });
  assert.deepEqual(pts[(RECT_FRONTAGE + 1) % 4], { x: 0, y: 40 });
  // A design with no lot record, or a half-written one, is that rectangle.
  assert.deepEqual(lotPts(null, 20, 40), pts);
  assert.deepEqual(lotPts({ kind: "rect" }, 20, 40), pts);
  assert.deepEqual(lotPts({ kind: "poly", pts: [{ x: 0, y: 0 }] }, 20, 40), pts);
  assert.equal(lotFrontage(null), 2);
  assert.equal(lotFrontage({ kind: "rect" }), 2);
});

test("lotEdges gives every boundary its length, middle and outward normal", () => {
  const e = lotEdges(rectLotPts(20, 40));
  assert.equal(e.length, 4);
  assert.deepEqual(e.map((x) => x.length), [20, 40, 20, 40]);
  assert.deepEqual(e[0].mid, { x: 10, y: 0 });
  // Normals point away from the lot: the top edge's is up the page (y grows
  // downward), the bottom edge's is down it.
  assert.deepEqual({ nx: e[0].nx, ny: e[0].ny }, { nx: 0, ny: -1 });
  assert.deepEqual({ nx: e[1].nx, ny: e[1].ny }, { nx: 1, ny: 0 });
  assert.deepEqual({ nx: e[2].nx, ny: e[2].ny }, { nx: 0, ny: 1 });
  assert.deepEqual({ nx: e[3].nx, ny: e[3].ny }, { nx: -1, ny: 0 });
});

test("four-sided lots get Front, Side, Rear, Side from wherever the street is", () => {
  assert.deepEqual(edgeLabels(4, 2), ["Rear", "Side", "Front", "Side"]);
  assert.deepEqual(edgeLabels(4, 0), ["Front", "Side", "Rear", "Side"]);
  assert.deepEqual(edgeLabels(4, 1), ["Side", "Front", "Side", "Rear"]);
  assert.deepEqual(edgeLabels(4, 3), ["Side", "Rear", "Side", "Front"]);
  // Out-of-range indices wrap rather than throwing.
  assert.deepEqual(edgeLabels(4, 6), edgeLabels(4, 2));
  assert.deepEqual(edgeLabels(4, -2), edgeLabels(4, 2));
});

test("irregular lots are counted round from the front, never guessed at", () => {
  assert.deepEqual(edgeLabels(5, 0), ["Front", "Boundary 2", "Boundary 3", "Boundary 4", "Boundary 5"]);
  assert.deepEqual(edgeLabels(3, 1), ["Boundary 3", "Front", "Boundary 2"]);
  assert.deepEqual(edgeLabels(6, 4)[4], "Front");
  assert.deepEqual(edgeLabels(6, 4)[5], "Boundary 2");
  assert.deepEqual(edgeLabels(2, 0), []);
});

test("polygonCentroid is the shoelace centre, and survives a degenerate ring", () => {
  assert.deepEqual(polygonCentroid(rectLotPts(20, 40)), { x: 10, y: 20 });
  // An L: the centre is pulled towards the bulk, not the bounding box middle.
  const l = lShapePts(6, 4, 3, 2);
  const c = polygonCentroid(l);
  assert.ok(c.x < 3 && c.y < 2, `${c.x}, ${c.y} sits in the leg, not the notch`);
  // No area at all falls back to the mean corner rather than dividing by zero.
  assert.deepEqual(polygonCentroid([{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }]), { x: 2, y: 2 });
});

test("closestOnSegment and pointToSegment stop at the ends of the line", () => {
  const a = { x: 0, y: 0 }, b = { x: 10, y: 0 };
  assert.deepEqual(closestOnSegment(a, b, { x: 4, y: 3 }), { x: 4, y: 0 });
  // Past either end, the end itself is the nearest point — a boundary is a
  // segment, not an infinite line, and measuring to the line would flatter.
  assert.deepEqual(closestOnSegment(a, b, { x: -5, y: 0 }), { x: 0, y: 0 });
  assert.deepEqual(closestOnSegment(a, b, { x: 99, y: 4 }), { x: 10, y: 0 });
  close(pointToSegment(a, b, { x: 4, y: 3 }), 3);
  close(pointToSegment(a, b, { x: 13, y: 4 }), 5);
  // A zero-length edge is its own nearest point rather than a NaN.
  assert.deepEqual(closestOnSegment(a, a, { x: 3, y: 4 }), { x: 0, y: 0 });
});

test("minDistPolyToSegment finds the nearest pair, corner to corner included", () => {
  const box = [{ x: 4, y: 4 }, { x: 8, y: 4 }, { x: 8, y: 7 }, { x: 4, y: 7 }];
  // Face to face.
  const left = minDistPolyToSegment(box, { x: 0, y: 0 }, { x: 0, y: 20 });
  close(left.d, 4);
  close(left.to.x, 0);
  // Corner to corner: the boundary runs out before the face does.
  const corner = minDistPolyToSegment(box, { x: 0, y: 0 }, { x: 1, y: 1 });
  close(corner.d, Math.hypot(3, 3), 1e-4);
  assert.deepEqual(corner.from, { x: 4, y: 4 });
  // Crossing the boundary is nothing at all, not a positive number.
  close(minDistPolyToSegment(box, { x: 6, y: 0 }, { x: 6, y: 20 }).d, 0);
});

test("polygonContains and polygonInside know a structure from a lot", () => {
  const lot = rectLotPts(20, 40);
  assert.ok(polygonContains(lot, { x: 10, y: 20 }));
  assert.ok(!polygonContains(lot, { x: 25, y: 20 }));
  const shed = [{ x: 2, y: 2 }, { x: 5, y: 2 }, { x: 5, y: 5 }, { x: 2, y: 5 }];
  assert.ok(polygonInside(shed, lot));
  // Hard against the boundary still counts as in.
  assert.ok(polygonInside([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }], lot));
  // Hanging over it does not.
  assert.ok(!polygonInside([{ x: 19, y: 0 }, { x: 22, y: 0 }, { x: 22, y: 3 }, { x: 19, y: 3 }], lot));
});

test("lotSetbacks on the rectangle lot are exactly the numbers the tool always gave", () => {
  const sb = lotSetbacks({ x: 1, y: 2, w: 3, d: 4 }, rectLotPts(10, 20), RECT_FRONTAGE);
  const by = Object.fromEntries(sb.map((e) => [e.label, e.v]));
  const old = setbacks({ x: 1, y: 2, w: 3, d: 4 }, 10, 20);
  close(by.Rear, old.rear);
  close(by.Front, old.front);
  assert.deepEqual(sb.map((e) => e.v), [2, 6, 14, 1]);   // rear, side, front, side
  assert.deepEqual(sb.map((e) => e.label), ["Rear", "Side", "Front", "Side"]);
  assert.deepEqual(sb.map((e) => e.length), [10, 20, 10, 20]);
  // Rotated and L-shaped structures agree with the old measurements too.
  const l = { x: 2, y: 3, w: 6, d: 4, rot: 0, shape: "lshape", notchW: 3, notchD: 2 };
  const lsb = lotSetbacks(l, rectLotPts(20, 40), RECT_FRONTAGE);
  const lold = setbacks(l, 20, 40);
  close(lsb[0].v, lold.rear);
  close(lsb[1].v, lold.right);
  close(lsb[2].v, lold.front);
  close(lsb[3].v, lold.left);
});

test("lotSetbacks measure to a slanted boundary, where a bounding box would lie", () => {
  // A four-sided lot with one boundary running on a diagonal.
  const lot = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 12, y: 30 }, { x: 0, y: 30 }];
  const shed = { x: 8, y: 4, w: 4, d: 4 };
  const sb = lotSetbacks(shed, lot, 2);
  // The diagonal is edge 1, from (20, 0) to (12, 30). The boundary leans in
  // as it goes down the page, so the nearest corner of the shed is its
  // bottom-right one at (12, 8), and the honest number is that corner's
  // perpendicular distance to the line — not 20 − 12.
  const dx = 12 - 20, dy = 30 - 0, len = Math.hypot(dx, dy);
  const expect = Math.abs(dx * (8 - 0) - dy * (12 - 20)) / len;
  close(sb[1].v, expect, 1e-4);
  assert.ok(sb[1].v < 8, "measured to the boundary, not to the bounding box");
  // And it carries the boundary's true length, which is not 30.
  close(sb[1].length, len, 1e-4);
});

test("sanitiseLot: a design saved before the cadastre existed loads as a rectangle", () => {
  const blank = {
    kind: "rect", pts: [], ring: [], frontage: 0, north: 0, anchor: null,
    lat: null, lng: null, source: "", fetched: "", lotId: "", address: "",
    origin: "typed",
  };
  assert.deepEqual(sanitiseLot(undefined), blank);
  assert.deepEqual(sanitiseLot(null), blank);
  assert.deepEqual(sanitiseLot("nope"), blank);
  assert.deepEqual(sanitiseLot({}), blank);
  // A polygon lot with an outline that can't be drawn is a rectangle too.
  assert.deepEqual(sanitiseLot({ kind: "poly", pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }), blank);
  assert.deepEqual(sanitiseLot({
    kind: "poly",
    pts: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }],   // a bowtie
  }), blank);
});

test("sanitiseLot keeps a real lot and normalises what it keeps", () => {
  const lot = sanitiseLot({
    kind: "poly",
    pts: [{ x: 3, y: 5 }, { x: 15.5, y: 5 }, { x: 15.5, y: 37 }, { x: 3, y: 37 }],
    ring: [[-32.3234, 115.8412], [-32.3234, 115.84133], ["x", 1], [-32.32311, 115.8412]],
    frontage: 6, north: 451.5, anchor: { x: 6.25, y: 16 },
    lat: -32.32326, lng: 115.84127,
    source: "Landgate cadastre (SLIP)", fetched: "2026-08-02",
    lotId: "Lot 214 on Plan 78123", address: "12 Wandoo Rise, Baldivis",
  });
  assert.equal(lot.kind, "poly");
  // Anchored at the origin, whatever it was saved as.
  assert.deepEqual(lot.pts[0], { x: 0, y: 0 });
  assert.equal(polygonArea(lot.pts), 400);
  assert.equal(lot.frontage, 2);              // wrapped into range
  assert.equal(lot.north, 91.5);              // wrapped into 0–360
  assert.equal(lot.ring.length, 3);           // the unreadable corner dropped
  assert.equal(lot.lotId, "Lot 214 on Plan 78123");
  // Nonsense coordinates mean no anchor point for the photo.
  assert.equal(sanitiseLot({ kind: "poly", pts: rectLotPts(10, 20), lat: 99, lng: 115.8 }).lat, null);
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

// ---------------------------------------------------------------------------
// Provenance. The part that isn't negotiable: a boundary somebody drew by
// hand must never read as if it came from the State's records.
// ---------------------------------------------------------------------------

const CAD = {
  kind: "poly", pts: rectLotPts(19, 40), ring: [], frontage: 2, north: 0,
  anchor: null, lat: null, lng: null,
  source: "Landgate cadastre (SLIP)", fetched: "2026-08-02",
  lotId: "Lot 214 on Plan 78123", address: "", origin: "cadastre",
};

test("fmtDate reads a stored ISO date the way a builder would, in UTC", () => {
  assert.equal(fmtDate("2026-08-02"), "2 August 2026");
  assert.equal(fmtDate("2026-12-25T03:00:00Z"), "25 December 2026");
  // Unparseable comes back as it went in, never as "Invalid Date".
  assert.equal(fmtDate("sometime"), "sometime");
  assert.equal(fmtDate(""), "");
  assert.equal(fmtDate(undefined), "");
});

test("lotOrigin reads old designs honestly: no origin field is not a claim", () => {
  // Every design saved before provenance existed.
  assert.equal(lotOrigin(undefined), "typed");
  assert.equal(lotOrigin(sanitiseLot(undefined)), "typed");
  assert.equal(lotOrigin({ kind: "rect" }), "typed");
  // A polygon that names a source could only have come from the cadastre.
  assert.equal(lotOrigin({ kind: "poly", source: "Landgate cadastre (SLIP)" }), "cadastre");
  // A polygon with no source was drawn by hand.
  assert.equal(lotOrigin({ kind: "poly", source: "" }), "traced");
  // A recorded origin is kept; nonsense and "typed" on a polygon are not.
  assert.equal(lotOrigin({ kind: "poly", origin: "cadastre-adjusted", source: "x" }), "cadastre-adjusted");
  assert.equal(lotOrigin({ kind: "poly", origin: "surveyed", source: "" }), "traced");
  assert.equal(lotOrigin({ kind: "poly", origin: "typed", source: "" }), "traced");
});

test("a hand on the boundary changes what it is, and never back again", () => {
  assert.equal(nextLotOrigin("typed"), "traced");
  assert.equal(nextLotOrigin("traced"), "traced");
  assert.equal(nextLotOrigin("cadastre"), "cadastre-adjusted");
  assert.equal(nextLotOrigin("cadastre-adjusted"), "cadastre-adjusted");
});

test("the printed footer says exactly where the boundary came from", () => {
  const typed = boundaryFooter(sanitiseLot(undefined));
  const traced = boundaryFooter({ ...CAD, source: "", fetched: "", lotId: "", origin: "traced" });
  const cad = boundaryFooter(CAD);
  const adj = boundaryFooter({ ...CAD, origin: "cadastre-adjusted" });

  // Typed is word for word what the sheet said before the cadastre existed.
  assert.equal(typed,
    "Prepared by the applicant using the CFBA plan tool — boundaries and " +
    "dimensions as entered by the applicant. Not a certified document and not " +
    "a survey.");
  // Cadastre is word for word what it said after.
  assert.equal(cad,
    "Prepared by the applicant using the CFBA plan tool. The lot boundary is " +
    "taken from Landgate cadastre (SLIP) on 2 August 2026: cadastral " +
    "boundaries are indicative and can sit a metre or more from the surveyed " +
    "pegs. Structures, dimensions and the nominated frontage are as entered " +
    "by the applicant. Not a certified document and not a survey.");

  // Neither hand-made boundary may name a source or a retrieval date.
  for (const s of [typed, traced]) {
    assert.ok(!/Landgate/.test(s), "a hand boundary never names the cadastre");
    assert.ok(!/cadastr/i.test(s), "nor the word");
    assert.ok(/not a survey\.$/.test(s));
  }
  assert.ok(/drawn by hand by the applicant/.test(traced));
  assert.ok(/not taken from a survey or from any land record/.test(traced));

  // The adjusted one names the source AND says plainly it has been moved.
  assert.ok(/Landgate cadastre \(SLIP\)/.test(adj));
  assert.ok(/on 2 August 2026/.test(adj));
  assert.ok(/the applicant has since adjusted it by hand/.test(adj));
  assert.ok(/what is drawn is their own measurement/.test(adj));
  assert.ok(/not that record/.test(adj));
  // It has to fit the sheet in the space the untouched-cadastre wording fits
  // in: a fifth printed line spills a deep lot onto a second page.
  assert.ok(adj.length <= boundaryFooter(CAD).length + 40,
    `adjusted footer is ${adj.length} characters against ${boundaryFooter(CAD).length}`);
  // And it never uses the untouched wording.
  assert.ok(!/boundary is taken from/.test(adj));
  assert.notEqual(adj, cad);
});

test("the printed Lot boundary row matches the footer's story", () => {
  assert.equal(boundaryRow(sanitiseLot(undefined)), "");
  assert.equal(boundaryRow({ ...CAD, source: "", fetched: "", lotId: "", origin: "traced" }),
    "Drawn by hand by the applicant — not a surveyed boundary");
  assert.equal(boundaryRow(CAD),
    "Lot 214 on Plan 78123 — Landgate cadastre (SLIP), retrieved 2 August 2026");
  assert.equal(boundaryRow({ ...CAD, origin: "cadastre-adjusted" }),
    "Lot 214 on Plan 78123 — Landgate cadastre (SLIP), retrieved 2 August 2026 " +
    "— adjusted by hand");
  // A fetched lot the service didn't name still says what it is.
  assert.equal(boundaryRow({ ...CAD, source: "", lotId: "" }),
    "the State's cadastre, retrieved 2 August 2026");
});

test("the on-screen note tells the same four stories", () => {
  assert.match(lotOriginNote(sanitiseLot(undefined)), /typed rectangle/i);
  assert.match(lotOriginNote({ ...CAD, source: "", origin: "traced" }), /your own measurement/i);
  assert.match(lotOriginNote(CAD), /Landgate cadastre \(SLIP\), fetched 2 August 2026/);
  assert.match(lotOriginNote({ ...CAD, origin: "cadastre-adjusted" }),
    /isn't what the State holds any more/);
});

// ---------------------------------------------------------------------------
// Editing the boundary by hand.
// ---------------------------------------------------------------------------

const RECT = rectLotPts(19, 40);

test("reanchorLot puts an edited outline back on the origin and reports the shift", () => {
  const grown = [{ x: -2, y: -1.5 }, { x: 19, y: 0 }, { x: 19, y: 40 }, { x: 0, y: 40 }];
  const re = reanchorLot(grown);
  assert.deepEqual(re.pts[0], { x: 0, y: 0 });
  assert.equal(re.dx, 2);
  assert.equal(re.dy, 1.5);
  assert.equal(re.w, 21);
  assert.equal(re.d, 41.5);
  // Every corner moved by the same shift — the outline itself is unchanged.
  grown.forEach((p, i) => {
    close(re.pts[i].x, p.x + re.dx, 1e-9);
    close(re.pts[i].y, p.y + re.dy, 1e-9);
  });
});

test("isRectLot knows the typed rectangle from everything else", () => {
  assert.ok(isRectLot(RECT));
  assert.ok(isRectLot(rectLotPts(1.5, 2)));
  // A corner moved: not the rectangle the width and depth fields describe.
  assert.ok(!isRectLot([{ x: 0, y: 0 }, { x: 19, y: 0.4 }, { x: 19, y: 40 }, { x: 0, y: 40 }]));
  // Right shape, wrong winding — the tool's rectangle starts at the top-left.
  assert.ok(!isRectLot([{ x: 0, y: 40 }, { x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 40 }]));
  assert.ok(!isRectLot([{ x: 0, y: 0 }, { x: 19, y: 0 }, { x: 19, y: 40 }]));
  assert.ok(!isRectLot(RECT.map((p) => ({ x: p.x + 3, y: p.y }))));   // off the origin
});

test("a dragged corner snaps to 0.1 m and pulls level with the other corners", () => {
  // Drag the top-right corner of a 19 x 40 rectangle a long way in, to a
  // point no other corner is anywhere near.
  const far = moveLotCorner(RECT, 1, 14.437, 6.22);
  assert.equal(far.pts[1].x, 14.4);       // snapped to the tenth
  assert.equal(far.pts[1].y, 6.2);
  assert.equal(far.guides.length, 0);
  // The other three corners never move.
  for (const i of [0, 2, 3]) assert.deepEqual(far.pts[i], RECT[i]);

  // Now a small, sloppy drag: within 0.3 m of the corner below it in x and
  // the corner beside it in y, so it pulls level with both and reports a
  // dashed guide for each.
  const near = moveLotCorner(RECT, 1, 18.82, 0.17);
  assert.deepEqual(near.pts[1], { x: 19, y: 0 });
  assert.equal(near.guides.length, 2);
  assert.deepEqual(near.guides.find((g) => g.axis === "x"),
    { axis: "x", at: 19, from: 0, to: 40 });
  assert.deepEqual(near.guides.find((g) => g.axis === "y"),
    { axis: "y", at: 0, from: 0, to: 19 });
  // Which is exactly the rectangle back — an accidental nudge heals itself.
  assert.ok(isRectLot(near.pts));
});

test("Alt turns every bit of the snapping off", () => {
  const free = moveLotCorner(RECT, 1, 18.817, 0.174, { snap: false });
  assert.deepEqual(free.pts[1], { x: 18.817, y: 0.174 });
  assert.equal(free.guides.length, 0);
  assert.equal(free.squared, false);
});

test("right-angle assist squares a corner that landed nearly square", () => {
  // A four-sided lot with the top-left corner pulled well off, so no other
  // corner is within alignment range: the only aid in play is squaring.
  const lot = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }];
  // Aim corner 1 at a point where the angle 0–1–2 is about 91°: near enough
  // to square that a builder meant it to be square.
  const off = { x: 20.3, y: 0.6 };
  const res = moveLotCorner(lot, 1, off.x, off.y, { threshold: 0 });
  assert.ok(res.squared, "a near-square corner gets squared");
  const p = res.pts[1];
  const u = { x: lot[0].x - p.x, y: lot[0].y - p.y };
  const v = { x: lot[2].x - p.x, y: lot[2].y - p.y };
  const deg = (Math.acos((u.x * v.x + u.y * v.y) /
    (Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y))) * 180) / Math.PI;
  // Square to a tenth of a millimetre, which is where the corner is stored.
  close(deg, 90, 0.01);
  // A corner nowhere near square is left exactly where the finger put it.
  const skew = moveLotCorner(lot, 1, 12, 9, { threshold: 0 });
  assert.equal(skew.squared, false);
  assert.deepEqual(skew.pts[1], { x: 12, y: 9 });
});

test("squareCorner only fires inside its tolerance", () => {
  const lot = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }];
  assert.equal(squareCorner(lot, 1, { x: 20, y: 0 }, LOT_SQUARE_TOL_DEG) !== null, true);
  assert.equal(squareCorner(lot, 1, { x: 10, y: 10 }, LOT_SQUARE_TOL_DEG), null);
  // Already exactly square: the push onto the circle is a no-op.
  const p = squareCorner(lot, 1, { x: 20, y: 0 }, LOT_SQUARE_TOL_DEG);
  close(p.x, 20, 1e-9);
  close(p.y, 0, 1e-9);
});

test("a dragged edge moves whole and stays straight", () => {
  // The right-hand boundary of the rectangle, dragged out to 21.4 m.
  const res = moveLotEdge(RECT, 1, 21.37, 12);
  assert.deepEqual(res.pts, [
    { x: 0, y: 0 }, { x: 21.4, y: 0 }, { x: 21.4, y: 40 }, { x: 0, y: 40 },
  ]);
  assert.ok(isRectLot(res.pts), "a rectangle dragged by an edge is still a rectangle");
  // Dragging along the edge rather than across it does nothing: an edge
  // travels on its own normal, so it can never turn.
  const along = moveLotEdge(RECT, 1, 19, 3);
  assert.deepEqual(along.pts, RECT);

  // A slanted boundary keeps its bearing exactly.
  const skew = [{ x: 0, y: 0 }, { x: 20, y: 4 }, { x: 20, y: 34 }, { x: 0, y: 30 }];
  const moved = moveLotEdge(skew, 0, 6, -2);
  const bearing = (a, b) => Math.atan2(b.y - a.y, b.x - a.x);
  close(bearing(moved.pts[0], moved.pts[1]), bearing(skew[0], skew[1]), 1e-9);
  // Both ends travelled by the same vector.
  close(moved.pts[0].x - skew[0].x, moved.pts[1].x - skew[1].x, 1e-6);
  close(moved.pts[0].y - skew[0].y, moved.pts[1].y - skew[1].y, 1e-6);
  // And the two boundaries either side stretched to meet it.
  assert.deepEqual(moved.pts[2], skew[2]);
  assert.deepEqual(moved.pts[3], skew[3]);
});

test("an edge drag stays inside the canvas it was dragged on", () => {
  const bounds = { minX: -2, minY: -2, maxX: 24, maxY: 45 };
  const res = moveLotEdge(RECT, 1, 900, 12, { bounds });
  assert.equal(res.pts[1].x, 24);
  assert.equal(res.pts[2].x, 24);
});

test("a fold is refused and the outline that was there stands", () => {
  // Drag the top-right corner across to the far side of the lot: the sides
  // would cross, so the move never happens.
  assert.equal(moveLotCorner(RECT, 1, -3, 20, { snap: false }), null);
  // A bowtie can't be applied either.
  assert.equal(applyLotEdit(sanitiseLot(undefined),
    [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 2, y: 0 }, { x: 0, y: 2 }]), null);
  // And a legitimate big move still goes through.
  assert.ok(moveLotCorner(RECT, 1, 8, 12, { snap: false }));
});

test("adding a corner splits the boundary and carries the frontage with it", () => {
  const add = addLotCorner(RECT, 0, null, 2);
  assert.equal(add.pts.length, 5);
  assert.deepEqual(add.pts[1], { x: 9.5, y: 0 });          // the midpoint
  assert.equal(add.frontage, 3, "the street was boundary 2 and is now 3");
  // Adding after the frontage leaves it where it is.
  assert.equal(addLotCorner(RECT, 3, null, 2).frontage, 2);
  // A corner asked for at a point lands on that boundary, not off it…
  const at = addLotCorner(RECT, 2, { x: 6, y: 55 }, 2);
  close(at.pts[3].y, 40, 1e-9);   // pulled back onto the boundary itself
  close(at.pts[3].x, 6, 1e-9);
  // …and never on top of an end, where it could never be grabbed again.
  const end = addLotCorner(RECT, 0, { x: 0, y: 0 }, 2);
  assert.ok(end.pts[1].x >= 19 * 0.2 - 1e-9);
  // The outline stays honest.
  assert.ok(isSimplePolygon(add.pts));
});

test("removing a corner merges its two boundaries, and three is the floor", () => {
  const five = addLotCorner(RECT, 0, null, 2).pts;         // 5 corners
  const back = removeLotCorner(five, 1, 3);
  assert.equal(back.pts.length, 4);
  assert.deepEqual(back.pts, RECT);
  assert.equal(back.frontage, 2, "the street came back to boundary 2");
  // Taking out the frontage corner itself lands the street on the merge.
  assert.equal(removeLotCorner(five, 3, 3).frontage, 2);
  // Never below three — the caller says so gently, it isn't done silently.
  const tri = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }];
  assert.equal(removeLotCorner(tri, 0, 0), null);
});

test("a rectangle only becomes a polygon when it stops being a rectangle", () => {
  const blank = sanitiseLot(undefined);
  // An edge drag keeps it a rectangle: still typed, still the numeric fields.
  const wider = applyLotEdit(blank, moveLotEdge(RECT, 1, 21.4, 12).pts);
  assert.equal(wider.lot.kind, "rect");
  assert.equal(lotOrigin(wider.lot), "typed");
  assert.equal(wider.lotW, 21.4);
  assert.equal(wider.lotD, 40);

  // A corner drag does not: it becomes a polygon lot, drawn by hand.
  const bent = applyLotEdit(blank, moveLotCorner(RECT, 1, 15, 3, { snap: false }).pts);
  assert.equal(bent.lot.kind, "poly");
  assert.equal(lotOrigin(bent.lot), "traced");
  assert.equal(bent.lot.pts.length, 4);
  assert.equal(bent.lot.frontage, 2, "the street is still the boundary it was");
  assert.equal(bent.lot.source, "");
  assert.equal(bent.lot.fetched, "");

  // Dragged back into a rectangle, it goes back to being one.
  const flat = applyLotEdit(bent.lot, RECT);
  assert.equal(flat.lot.kind, "poly", "hand-drawn stays hand-drawn");
  const fromTyped = applyLotEdit(blank, RECT);
  assert.equal(fromTyped.lot.kind, "rect");
});

test("an adjusted cadastre lot keeps its identity and loses its claim", () => {
  const lot = sanitiseLot({
    ...CAD, pts: rectLotPts(19, 40), anchor: { x: 9.5, y: 20 },
    lat: -32.3, lng: 115.84,
  });
  assert.equal(lotOrigin(lot), "cadastre");
  const moved = moveLotCorner(lot.pts, 1, 17.6, 1.2, { snap: false });
  const out = applyLotEdit(lot, moved.pts);
  assert.equal(out.lot.kind, "poly");
  assert.equal(lotOrigin(out.lot), "cadastre-adjusted");
  // The record it came from is still named — that's the point of the wording.
  assert.equal(out.lot.source, "Landgate cadastre (SLIP)");
  assert.equal(out.lot.fetched, "2026-08-02");
  assert.equal(out.lot.lotId, "Lot 214 on Plan 78123");
  // The ground ring is re-derived from what is actually drawn, so choosing a
  // different frontage later can never put the old shape back.
  assert.equal(out.lot.ring.length, 4);
  assert.ok(out.lot.anchor);
});

test("an edit that grows the lot reports the shift the structures must follow", () => {
  const blank = sanitiseLot(undefined);
  // Drag the left-hand boundary 3 m further out.
  const wider = moveLotEdge(RECT, 3, -3, 20);
  const out = applyLotEdit(blank, wider.pts);
  assert.equal(out.shift.dx, 3);
  assert.equal(out.shift.dy, 0);
  assert.equal(out.lotW, 22);
  assert.equal(out.lot.kind, "rect");
  // A shed 1 m off the old left fence is still 1 m off it afterwards: it sat
  // at x = 1 and the fence moved, so on the sheet it is now at x = 4.
  const wasAt = 1;
  assert.equal(wasAt + out.shift.dx, 4);
});

test("setbacks, labels, area and north all recompute from an edited outline", () => {
  const lot = sanitiseLot({
    kind: "poly", pts: rectLotPts(20, 30), frontage: 2, north: 137.5,
    source: "Landgate cadastre (SLIP)", fetched: "2026-08-02",
    anchor: { x: 10, y: 15 }, lat: -32.3, lng: 115.84,
  });
  const shed = { x: 8, y: 8, w: 4, d: 3 };
  const before = lotSetbacks(shed, lot.pts, lot.frontage);
  assert.equal(polygonArea(lot.pts), 600);
  assert.deepEqual(edgeLabels(4, lot.frontage), ["Rear", "Side", "Front", "Side"]);

  // Pull the street boundary 5 m towards the shed.
  const out = applyLotEdit(lot, moveLotEdge(lot.pts, 2, 10, 25).pts);
  assert.equal(out.lotD, 25);
  assert.equal(polygonArea(out.lot.pts), 500);
  const after = lotSetbacks(shed, out.lot.pts, out.lot.frontage);
  assert.equal(after[2].label, "Front");
  close(before[2].v, 30 - 11, 1e-9);
  close(after[2].v, 25 - 11, 1e-9);          // 5 m nearer the street
  // North is a property of the parcel's bearing and does not move because a
  // fence did.
  assert.equal(out.lot.north, 137.5);

  // Add a corner and the labels stop pretending a five-sided lot has a rear.
  const five = addLotCorner(out.lot.pts, 0, null, out.lot.frontage);
  const grown = applyLotEdit(out.lot, five.pts, { frontage: five.frontage });
  assert.equal(grown.lot.pts.length, 5);
  const names = edgeLabels(5, grown.lot.frontage);
  assert.equal(names[grown.lot.frontage], "Front");
  assert.ok(!names.includes("Rear"));
  assert.equal(lotSetbacks(shed, grown.lot.pts, grown.lot.frontage).length, 5);
});

test("a traced outline replaces the lot outright — no source travels with it", () => {
  const cad = sanitiseLot({ ...CAD, anchor: { x: 9.5, y: 20 }, lat: -32.3, lng: 115.84 });
  const traced = [{ x: 1, y: 2 }, { x: 18, y: 1 }, { x: 19, y: 36 }, { x: 2, y: 38 }];
  const out = applyLotEdit(cad, traced, {
    origin: "traced", frontage: frontageFacingStreet(traced), reset: true,
  });
  assert.equal(lotOrigin(out.lot), "traced");
  assert.equal(out.lot.source, "");
  assert.equal(out.lot.fetched, "");
  assert.equal(out.lot.lotId, "");
  assert.equal(out.lot.lat, null);
  assert.equal(out.lot.ring.length, 0);
  assert.equal(boundaryRow(out.lot), "Drawn by hand by the applicant — not a surveyed boundary");
  // Anchored at the origin, with the shift the caller has to apply reported.
  assert.deepEqual(out.lot.pts[0], { x: 0, y: 1 });
  assert.equal(out.shift.dx, -1);
  assert.equal(out.shift.dy, -1);
});

test("a hand-traced lot puts the street on the boundary nearest the road", () => {
  // Drawn with the street at the bottom of the sheet, as the tool draws it.
  const traced = [{ x: 0, y: 0 }, { x: 18, y: 1 }, { x: 19, y: 36 }, { x: 1, y: 38 }];
  assert.equal(frontageFacingStreet(traced), 2, "the bottom boundary");
  // A battleaxe whose leg runs down to the road: the leg's end is lowest.
  const flag = [
    { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 24 }, { x: 12, y: 24 },
    { x: 12, y: 40 }, { x: 8, y: 40 }, { x: 8, y: 24 }, { x: 0, y: 24 },
  ];
  assert.equal(frontageFacingStreet(flag), 4);
});

test("lotRingFromPts inverts the layout, so an adjusted lot can still be turned", () => {
  const lot = {
    kind: "poly", pts: rectLotPts(20, 30), north: 137.5,
    anchor: { x: 10, y: 15 }, lat: -32.3, lng: 115.84,
  };
  const ring = lotRingFromPts(lot);
  assert.equal(ring.length, 4);
  // Read the ring back into plan metres through the same anchor and bearing.
  for (let i = 0; i < ring.length; i++) {
    const g = metresBetween({ lat: lot.lat, lng: lot.lng }, { lat: ring[i][0], lng: ring[i][1] });
    const p = groundToPlanVector(g.east, g.north, lot.north);
    close(lot.anchor.x + p.dx, lot.pts[i].x, 1e-6);
    close(lot.anchor.y + p.dy, lot.pts[i].y, 1e-6);
  }
  // No known ground point, no ring — which is every freehand lot.
  assert.deepEqual(lotRingFromPts({ ...lot, anchor: null }), []);
  assert.deepEqual(lotRingFromPts({ ...lot, lat: null }), []);
  assert.deepEqual(lotRingFromPts({ pts: [] }), []);
});

test("the aerial holds still while the lot changes shape around it", () => {
  const u = { offsetX: 0.4, offsetY: -1.2 };
  // No lot anchor: the photo hangs off the middle of the lot, so widening it
  // by 4 m would slide the imagery 2 m unless the offset takes it up.
  const held = holdUnderlayAnchor(u, { lotW: 19, lotD: 40 }, { lotW: 23, lotD: 40 }, { dx: 4, dy: 0 });
  const was = underlayAnchor(19, 40, u.offsetX, u.offsetY);
  const now = underlayAnchor(23, 40, held.offsetX, held.offsetY);
  close(now.x, was.x + 4, 1e-9);
  close(now.y, was.y, 1e-9);
  // A lot-anchored photo hangs off the parcel's own point, which travels with
  // the shift — so nothing needs to change at all.
  const cad = holdUnderlayAnchor(u,
    { lotW: 19, lotD: 40, base: { x: 9.5, y: 20 } },
    { lotW: 23, lotD: 40, base: { x: 13.5, y: 20 } }, { dx: 4, dy: 0 });
  assert.deepEqual(cad, { offsetX: 0.4, offsetY: -1.2 });
});

test("pushHistory keeps a short stack and drops the oldest", () => {
  let h = [];
  for (let i = 0; i < 5; i++) h = pushHistory(h, i, 3);
  assert.deepEqual(h, [2, 3, 4]);
  assert.deepEqual(pushHistory(undefined, "a", 3), ["a"]);
  assert.equal(pushHistory([], "a", 0).length, 1);
});

test("cornerAlign never matches a corner against itself", () => {
  const res = cornerAlign(RECT, 1, 19, 0, LOT_ALIGN_M);
  // Corner 1 is at (19, 0); corner 2 shares its x and corner 0 its y.
  assert.deepEqual({ x: res.x, y: res.y }, { x: 19, y: 0 });
  assert.equal(res.guides.length, 2);
});

// ---------------------------------------------------------------------------
// Distances between structures.
// ---------------------------------------------------------------------------

const rectPts = (x, y, w, d) =>
  [{ x, y }, { x: x + w, y }, { x: x + w, y: y + d }, { x, y: y + d }];

test("two rectangles apart report the gap between their faces", () => {
  // A 4 x 4 at the origin and another 3 m to its right: the gap is 3, not the
  // 7 m between their centres.
  const g = polyDistance(rectPts(0, 0, 4, 4), rectPts(7, 0, 4, 4));
  assert.equal(g.d, 3);
  assert.equal(g.overlap, false);
  assert.deepEqual(g.from, { x: 4, y: 0 });
  assert.deepEqual(g.to, { x: 7, y: 0 });
  // Diagonally offset: corner to corner, 3-4-5.
  const diag = polyDistance(rectPts(0, 0, 4, 4), rectPts(7, 8, 4, 4));
  assert.equal(diag.d, 5);
  assert.deepEqual(diag.from, { x: 4, y: 4 });
  assert.deepEqual(diag.to, { x: 7, y: 8 });
});

test("the closest approach runs face to face, not corner to corner", () => {
  // Overlapping in y, so the nearest points are on the facing walls and the
  // dimension line is square to them.
  const g = polyDistance(rectPts(0, 0, 4, 10), rectPts(6, 3, 4, 4));
  assert.equal(g.d, 2);
  close(g.from.y, g.to.y);
  assert.equal(g.from.x, 4);
  assert.equal(g.to.x, 6);
});

test("touching is a gap of nothing, never a negative one", () => {
  const wall = polyDistance(rectPts(0, 0, 4, 4), rectPts(4, 0, 4, 4));
  assert.equal(wall.d, 0);
  // Sharing a wall is not sharing ground.
  assert.equal(wall.overlap, false);
  const corner = polyDistance(rectPts(0, 0, 4, 4), rectPts(4, 4, 4, 4));
  assert.equal(corner.d, 0);
  assert.equal(corner.overlap, false);
});

test("overlapping reports 0 m and says so, and the point is on shared ground", () => {
  const g = polyDistance(rectPts(0, 0, 4, 4), rectPts(3, 3, 4, 4));
  assert.equal(g.d, 0);
  assert.equal(g.overlap, true);
  assert.ok(g.d >= 0);
  // The dimension is placed where they actually meet, not out on a far corner.
  assert.ok(g.from.x >= 3 && g.from.x <= 4, `${g.from.x}`);
  assert.ok(g.from.y >= 3 && g.from.y <= 4, `${g.from.y}`);
  assert.deepEqual(g.from, g.to);
});

test("one structure wholly inside another is 0 m, not the gap between outlines", () => {
  // The outlines are 1 m apart everywhere, but there is no gap to walk
  // through — this is the case a plain outline-to-outline measure gets wrong.
  const g = polyDistance(rectPts(0, 0, 10, 10), rectPts(1, 1, 8, 8));
  assert.equal(g.d, 0);
  assert.equal(g.overlap, true);
  // Identical footprints, one exactly on the other.
  const same = polyDistance(rectPts(0, 0, 4, 4), rectPts(0, 0, 4, 4));
  assert.equal(same.d, 0);
  assert.equal(same.overlap, true);
});

test("a degenerate outline never produces a nonsense distance", () => {
  assert.deepEqual(polyDistance([], rectPts(0, 0, 4, 4)),
    { d: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, overlap: false });
  assert.equal(polyDistance(rectPts(0, 0, 4, 4), null).d, 0);
});

test("structureGap measures rotated rectangles, Ls and drawn outlines", () => {
  // A quarter turn swaps the footprint's width and depth, and the gap follows.
  const a = { x: 0, y: 0, w: 8, d: 2, rot: 0 };
  const b = { x: 0, y: 5, w: 8, d: 2, rot: 0 };
  assert.equal(structureGap(a, b).d, 3);
  const turned = { x: 0, y: 5, w: 8, d: 2, rot: 90 };   // now 2 wide, 8 deep
  assert.equal(structureGap(a, turned).d, 3);
  // Into the notch of an L: the 6 x 4 L has a 3 x 2 corner cut out of its
  // street-side right corner, so a shed tucked in there is measured to the
  // inside faces of the notch and not to the L's bounding box.
  const l = { x: 0, y: 0, w: 6, d: 4, rot: 0, shape: "lshape", notchW: 3, notchD: 2 };
  const inNotch = { x: 3.5, y: 2.5, w: 2, d: 1, rot: 0 };
  assert.equal(structureGap(l, inNotch).d, 0.5);
  // A traced outline is measured on the outline, not on its bounds.
  const tri = {
    x: 10, y: 0, w: 4, d: 4, rot: 0, shape: "poly",
    pts: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }],
  };
  // The triangle's nearest point to a 6-wide rect at the origin is its
  // top-left corner, sitting at (10, 0) — 4 m clear of the rect's right face.
  const rect = { x: 0, y: 0, w: 6, d: 1, rot: 0 };
  assert.equal(structureGap(rect, tri).d, 4);
});

test("the gap is symmetric whichever structure is named first", () => {
  const a = { id: "a", x: 0, y: 0, w: 4, d: 4, rot: 0 };
  const b = { id: "b", x: 9.5, y: 0, w: 4, d: 4, rot: 0 };
  assert.equal(structureGap(a, b).d, structureGap(b, a).d);
  assert.equal(structureGap(a, b).d, 5.5);
});

// --- which distances get drawn ----------------------------------------------

const S = (id, x, y, w = 2, d = 2, state = "proposed") =>
  ({ id, x, y, w, d, rot: 0, state });

test("nearbyGaps shows the nearest few, in reach, nearest first", () => {
  const me = S("me", 0, 0, 2, 2);
  const others = [
    S("far", 40, 0), S("near", 5, 0), S("mid", 7, 0), S("close", 3, 0),
  ];
  const got = nearbyGaps(me, others);
  // "far" is 38 m off and stays off the drawing.
  assert.deepEqual(got.map((g) => [g.id, g.d]), [["close", 1], ["near", 3], ["mid", 5]]);
  // The cap is the cap: a crowded corner never becomes a mesh.
  assert.equal(nearbyGaps(me, others, { limit: 2 }).length, 2);
});

test("nearbyGaps keeps out-of-reach neighbours off the drawing", () => {
  const me = S("me", 0, 0);
  // Within reach at 6 m, out of reach past it.
  assert.deepEqual(nearbyGaps(me, [S("o", 8, 0)]).map((g) => g.d), [6]);
  assert.deepEqual(nearbyGaps(me, [S("o", 8.5, 0)], { limit: 3, within: 6 }).map((g) => g.d), [6.5]);
  // …but the single nearest always shows, so selecting a shed on a big block
  // still answers "what's my closest neighbour" rather than showing nothing.
  const lonely = nearbyGaps(me, [S("a", 60, 0), S("b", 30, 0)]);
  assert.deepEqual(lonely.map((g) => g.id), ["b"]);
  // Nothing else on the lot is nothing to draw.
  assert.deepEqual(nearbyGaps(me, []), []);
  assert.deepEqual(nearbyGaps(me, [me]), []);
  assert.deepEqual(nearbyGaps(null, [S("a", 1, 1)]), []);
});

test("nearbyGaps orders the same way twice, so the sheet never jitters", () => {
  const me = S("me", 0, 0);
  // Two neighbours at exactly the same distance: the id settles it.
  const got = nearbyGaps(me, [S("zed", 5, 0), S("abe", -5, 0)]);
  assert.deepEqual(got.map((g) => g.id), ["abe", "zed"]);
});

test("pins are stored one way round and toggle cleanly", () => {
  assert.equal(pairKey("b", "a"), pairKey("a", "b"));
  let pins = togglePin([], "b", "a");
  assert.deepEqual(pins, [["a", "b"]]);
  assert.equal(isPinned(pins, "a", "b"), true);
  assert.equal(isPinned(pins, "b", "a"), true);
  assert.equal(isPinned(pins, "a", "c"), false);
  // Naming the same pair the other way round takes the pin out again.
  pins = togglePin(pins, "b", "a");
  assert.deepEqual(pins, []);
  // A structure is never pinned to itself, and junk is simply ignored.
  assert.deepEqual(togglePin([], "a", "a"), []);
  assert.deepEqual(togglePin(undefined, "a", ""), []);
});

test("sanitisePins drops what a design shouldn't carry", () => {
  // Every design saved before pinning existed.
  assert.deepEqual(sanitisePins(undefined), []);
  assert.deepEqual(sanitisePins("nonsense"), []);
  assert.deepEqual(sanitisePins([["a"], [], null, ["a", "a"], 7]), []);
  // Duplicates, either way round, collapse to one.
  assert.deepEqual(sanitisePins([["b", "a"], ["a", "b"]]), [["a", "b"]]);
  // A pin pointing at a structure that has since been removed goes with it.
  assert.deepEqual(sanitisePins([["a", "b"], ["a", "gone"]], ["a", "b", "c"]), [["a", "b"]]);
  // The cap holds.
  const many = Array.from({ length: PIN_CAP + 6 }, (_, i) => [`a${i}`, `b${i}`]);
  assert.equal(sanitisePins(many).length, PIN_CAP);
});

test("the printed sheet carries pins plus proposed-to-existing, never the mesh", () => {
  const house = S("house", 0, 0, 12, 8, "existing");
  const pool = S("pool", 0, 12, 6, 3, "existing");
  const patio = S("patio", 0, 9, 6, 2, "proposed");
  const shed = S("shed", 0, 30, 3, 3, "proposed");
  const rows = printedGaps([house, pool, patio, shed], []);
  const seen = rows.map((r) => [pairKey(r.a, r.b), r.d, r.pinned]).sort();
  // The patio's two existing neighbours, and — nothing being within reach of
  // the shed — the shed's single nearest existing. NOT house-to-pool, which is
  // two existing structures, nor patio-to-shed, which is two proposed ones.
  assert.deepEqual(seen, [
    ["house|patio", 1, false],
    ["patio|pool", 1, false],
    ["pool|shed", 15, false],
  ]);
});

test("a pinned dimension prints whatever the states are", () => {
  const a = S("a", 0, 0, 2, 2);
  const b = S("b", 30, 0, 2, 2);
  // Both proposed and 28 m apart — nothing would draw this automatically.
  assert.deepEqual(printedGaps([a, b], []), []);
  const rows = printedGaps([a, b], [["b", "a"]]);
  assert.deepEqual(rows.map((r) => [pairKey(r.a, r.b), r.d, r.pinned]), [["a|b", 28, true]]);
  // A pair that would also print automatically is listed once, and pinned.
  const house = S("house", 0, 0, 4, 4, "existing");
  const patio = S("patio", 5, 0, 2, 2, "proposed");
  const both = printedGaps([house, patio], [["house", "patio"]]);
  assert.equal(both.length, 1);
  assert.equal(both[0].pinned, true);
  assert.equal(both[0].d, 1);
});

test("a design saved before any of this prints exactly what it printed before", () => {
  // No state on anything, no pins: every structure reads as proposed, there is
  // no existing structure to measure to, and the sheet gains nothing.
  const old = [
    { id: "1", x: 0, y: 0, w: 10, d: 6, rot: 0 },
    { id: "2", x: 0, y: 8, w: 4, d: 3, rot: 0 },
  ];
  assert.deepEqual(printedGaps(old, undefined), []);
  assert.deepEqual(printedGaps([], []), []);
});

test("printed rows report 0 m for structures drawn on top of each other", () => {
  const house = S("house", 0, 0, 10, 8, "existing");
  const patio = S("patio", 8, 6, 4, 4, "proposed");
  const rows = printedGaps([house, patio], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].d, 0);
  assert.equal(rows[0].overlap, true);
});

// ---------------------------------------------------------------------------
// The parametric patio
// ---------------------------------------------------------------------------

// A 6 × 4 patio at the origin, unrotated, ready to hand a patio record to.
const P = (patio) => ({ id: "p", kind: "patio", x: 0, y: 0, w: 6, d: 4, rot: 0, patio });

test("a patio with no parameters reads as a flat patio with corner posts", () => {
  const p = sanitisePatio(undefined);
  assert.equal(p.mount, "free");
  assert.equal(p.roof, "flat");
  assert.deepEqual(p.cols, [2, 2, 2, 2]);
  assert.equal(p.colHeight, 2.4);
  assert.equal(p.downpipes, 0);
  assert.equal(p.soak, null);
  // Every roof type is a known one; every side index is in range.
  assert.ok(PATIO_ROOFS.includes(p.roof));
  assert.ok(p.fall >= 0 && p.fall <= 3);
});

test("patio parameters are clamped to sane ranges", () => {
  const p = sanitisePatio({
    mount: "attached", attach: 9, roof: "hip", pitch: 200,
    cols: [99, -3, 2, 2], colHeight: 40, fall: -1, downpipes: 999,
    soak: { key: "1200x1200", count: 99 },
  });
  assert.equal(p.mount, "attached");
  assert.equal(p.attach, 3);            // 9 clamped into 0..3
  assert.equal(p.roof, "flat");         // an unknown roof falls back to flat
  assert.equal(p.pitch, PATIO_MAX_PITCH);
  assert.deepEqual(p.cols, [12, 0, 2, 2]);
  assert.equal(p.colHeight, 6);
  assert.equal(p.fall, 0);
  assert.equal(p.downpipes, 20);
  assert.deepEqual(p.soak, { key: "1200x1200", count: 10 });
});

test("corner posts only means four posts at the four corners", () => {
  const posts = patioColumns(P({ cols: [2, 2, 2, 2] }));
  assert.equal(posts.length, 4);
  const at = posts.map((q) => `${q.x},${q.y}`).sort();
  assert.deepEqual(at, ["0,0", "0,4", "6,0", "6,4"].sort());
});

test("an extra post on a side lands at its midpoint, corners shared not doubled", () => {
  // 3 posts on the top (side 0), 2 on the others: the corners are shared, so
  // the count is 4 corners + 1 midpoint = 5, not 3 + 2 + 2 + 2.
  const posts = patioColumns(P({ cols: [3, 2, 2, 2] }));
  assert.equal(posts.length, 5);
  assert.ok(posts.some((q) => q.x === 3 && q.y === 0), "midpoint of the top edge");
});

test("an attached patio carries a wall, not posts, on the side it attaches", () => {
  const posts = patioColumns(P({ mount: "attached", attach: 0, cols: [2, 2, 2, 2] }));
  // Side 0 (the top) is the wall — no posts along y === 0 except where a
  // remaining side's corner reaches it... side 3 and side 1 still own the top
  // corners, so those corners stay. But no post is added FOR side 0 itself.
  // With only corner posts everywhere, the four corners remain (each also
  // belongs to a standing side), so this checks the wall doesn't remove them.
  assert.ok(posts.length >= 2);
  // A mid-wall post on side 0 must not appear even when side 0 asks for it.
  const wall = patioColumns(P({ mount: "attached", attach: 0, cols: [5, 2, 2, 2] }));
  assert.ok(!wall.some((q) => q.y === 0 && q.x > 0 && q.x < 6),
    "no intermediate posts along the attached wall");
});

test("posts turn with the patio", () => {
  const posts = patioColumns({ ...P({ cols: [2, 2, 2, 2] }), rot: 90 });
  // A quarter turn swaps the footprint to 4 wide × 6 deep; the four corners
  // are still the four corners of that placed box.
  assert.equal(posts.length, 4);
  const xs = posts.map((q) => q.x), ys = posts.map((q) => q.y);
  assert.equal(Math.max(...xs), 4);
  assert.equal(Math.max(...ys), 6);
});

test("a flat/skillion gutter runs the low side; a gable has one each side", () => {
  // Fall to side 2 (the bottom, length 6): one gutter of 6 m.
  assert.equal(patioGutter(P({ roof: "skillion", fall: 2 })).length, 6);
  // Gable falling on side 2: eaves on sides 2 and 0, both length 6 → 12 m.
  const g = patioGutter(P({ roof: "gable", fall: 2 }));
  assert.deepEqual(g.sides.sort(), [0, 2]);
  assert.equal(g.length, 12);
  // Fall to a vertical side (1, length 4): a 4 m gutter.
  assert.equal(patioGutter(P({ roof: "skillion", fall: 1 })).length, 4);
});

test("the attached wall carries no gutter", () => {
  // Gable falling on side 2, attached on side 0: the eave on 0 is a wall, so
  // only the side-2 gutter remains.
  const g = patioGutter(P({ roof: "gable", fall: 2, mount: "attached", attach: 0 }));
  assert.deepEqual(g.sides, [2]);
  assert.equal(g.length, 6);
});

test("downpipes: one per 12 m of gutter, and never none for a real roof", () => {
  assert.equal(GUTTER_M_PER_DOWNPIPE, 12);
  assert.equal(downpipesNeeded(0), 0);
  assert.equal(downpipesNeeded(6), 1);
  assert.equal(downpipesNeeded(12), 1);
  assert.equal(downpipesNeeded(12.5), 2);
  assert.equal(downpipesNeeded(24), 2);
  assert.equal(downpipesNeeded(25), 3);
});

test("an elevation shows the slope as a rake in one view, into the page in the other", () => {
  // Skillion falling to side 2 (the bottom, horizontal): the slope runs the
  // depth, so it's a true rake in the depth view and flat in the width view.
  const s = P({ roof: "skillion", pitch: 10, fall: 2, cols: [3, 2, 3, 2] });
  const front = patioElevationProfile(s, "w");
  const side = patioElevationProfile(s, "d");
  assert.equal(front.width, 6);
  assert.equal(side.width, 4);
  assert.equal(front.slopeInPlane, false);   // width view: slope into the page
  assert.equal(side.slopeInPlane, true);     // depth view: the rake
  assert.equal(side.lowAtStart, false);      // fall side 2 sits at x = width
  // The width face reads the busier of sides 0 and 2 (both 3) → 3 posts.
  assert.equal(front.postXs.length, 3);
  assert.deepEqual(front.postXs, [0, 3, 6]);
});

test("an attached elevation knows the dwelling meets it, and drops that side's posts", () => {
  const s = P({ mount: "attached", attach: 0, roof: "skillion", fall: 2, cols: [4, 2, 4, 2] });
  const front = patioElevationProfile(s, "w");   // sides 0 & 2; 0 is the wall
  assert.equal(front.attachHere, true);
  assert.equal(front.attachAtStart, true);
  // Side 0 is the wall (no posts); side 2 still has 4 → 4 across the face.
  assert.equal(front.postXs.length, 4);
  const side = patioElevationProfile(s, "d");     // sides 1 & 3; neither is 0
  assert.equal(side.attachHere, false);
});

test("roof heights: skillion rises over the full run, gable over half", () => {
  // Fall to side 2 (horizontal) → the slope runs the depth, 4 m.
  const sk = patioRoofHeights(P({ roof: "skillion", pitch: 10, fall: 2, colHeight: 2.4 }));
  assert.equal(sk.eave, 2.4);
  close(sk.rise, 4 * Math.tan(10 * Math.PI / 180), 1e-3);
  close(sk.high, 2.4 + sk.rise, 1e-9);
  assert.equal(sk.ridge, null);
  // A gable of the same pitch rises over half the run.
  const ga = patioRoofHeights(P({ roof: "gable", pitch: 10, fall: 2, colHeight: 2.4 }));
  close(ga.rise, 2 * Math.tan(10 * Math.PI / 180), 1e-3);
  assert.equal(ga.ridge, ga.high);
});
