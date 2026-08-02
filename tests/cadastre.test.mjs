import { test } from "node:test";
import assert from "node:assert/strict";
import {
  WA_BBOX, inWA, cadastreKey, parseParcel, dedupeRing, ringCentroid,
  ringToGround, accessLegEdge, inferFrontage, ringToPlan, buildLot, reorientLot,
} from "../lib/cadastre.mjs";
import {
  edgeLabels, lotEdges, lotSetbacks, polygonArea, polygonInside,
} from "../lib/site-plan.mjs";
import {
  SUBURBAN, SUBURBAN_RING, SUBURBAN_STREET, SUBURBAN_ESRI,
  CORNER, CORNER_STREET, BATTLEAXE, BATTLEAXE_STREET,
  IRREGULAR, IRREGULAR_STREET, MULTIPART, EMPTY,
} from "./fixtures/cadastre.mjs";

const close = (a, b, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b} (within ${eps})`);

/** Eight decimal places of longitude is about a millimetre, so every length
 *  that comes back out of a fixture is allowed a couple of them. */
const MM5 = 0.005;

const ringOf = (fc) => dedupeRing(parseParcel(fc).ring);
const lens = (pts) =>
  pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    return Math.hypot(b.x - a.x, b.y - a.y);
  });

// ---------------------------------------------------------------------------
// The bounding box and the cache key.
// ---------------------------------------------------------------------------

test("inWA accepts Western Australia and refuses everywhere else", () => {
  assert.ok(inWA(-31.95, 115.86));            // Perth
  assert.ok(inWA(-32.3234, 115.8412));        // Baldivis
  assert.ok(inWA(-17.96, 122.24));            // Broome
  assert.ok(inWA(-33.86, 121.89));            // Esperance
  assert.ok(!inWA(-33.87, 151.21));           // Sydney
  assert.ok(!inWA(-37.81, 144.96));           // Melbourne
  assert.ok(!inWA(0, 0));                     // the Gulf of Guinea
  assert.ok(!inWA(51.5, -0.12));              // London
  assert.ok(!inWA(NaN, 115.86));
  assert.ok(!inWA(-31.95, undefined));
  // The box itself, so a change to it is a deliberate one.
  assert.deepEqual(WA_BBOX, { south: -35.5, north: -13.0, west: 112.0, east: 129.5 });
});

test("cadastreKey rounds to about a metre so one address is one lookup", () => {
  assert.equal(cadastreKey(-32.3234, 115.8412), "cadastre:-32.32340,115.84120");
  // A tenth of a millimetre apart is the same lot, so the same key.
  assert.equal(cadastreKey(-32.3234001, 115.8412001), cadastreKey(-32.3234, 115.8412));
  // A hundred metres apart is not.
  assert.notEqual(cadastreKey(-32.3234, 115.8412), cadastreKey(-32.3243, 115.8412));
});

// ---------------------------------------------------------------------------
// Reading the service's answer.
// ---------------------------------------------------------------------------

test("parseParcel reads a GeoJSON polygon and its identifiers", () => {
  const p = parseParcel(SUBURBAN);
  assert.equal(p.lotId, "Lot 214 on Plan 78123");
  assert.equal(p.address, "12 WANDOO RISE, BALDIVIS");
  assert.equal(p.ring.length, SUBURBAN_RING.length);
  // GeoJSON is [lng, lat]; the ring comes back the way the rest of the portal
  // reads coordinates, [lat, lng].
  assert.deepEqual(p.ring[0], [SUBURBAN_RING[0][1], SUBURBAN_RING[0][0]]);
  assert.ok(p.ring[0][0] < 0 && p.ring[0][1] > 100, "latitude first");
});

test("parseParcel reads Esri JSON too — f=geojson being ignored is survivable", () => {
  const p = parseParcel(SUBURBAN_ESRI);
  assert.equal(p.lotId, "Lot 214 on Plan 78123");
  assert.equal(p.address, "12 WANDOO RISE, BALDIVIS");
  assert.deepEqual(p.ring, parseParcel(SUBURBAN).ring);
});

test("parseParcel takes the real lot out of a multipart parcel, not the sliver", () => {
  const p = parseParcel(MULTIPART);
  assert.equal(p.lotId, "Lot 9 on Plan 12345");
  assert.equal(dedupeRing(p.ring).length, 4);
  const plan = ringToPlan(dedupeRing(p.ring), 0);
  close(plan.area, 400, 0.05);
});

test("parseParcel returns null for nothing found and for junk", () => {
  // The ordinary answer for a new subdivision: the service worked, the lot
  // simply isn't in the cadastre yet.
  assert.equal(parseParcel(EMPTY), null);
  assert.equal(parseParcel(null), null);
  assert.equal(parseParcel("<html>Service Unavailable</html>"), null);
  assert.equal(parseParcel({ error: { code: 400 } }), null);
  assert.equal(parseParcel({ features: [{ geometry: { type: "Point", coordinates: [115, -32] } }] }), null);
  // A ring with too few corners is not a lot.
  assert.equal(parseParcel({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[115, -32], [115.001, -32]]] } }],
  }), null);
});

test("parseParcel degrades to no identifier rather than failing on a strange schema", () => {
  const p = parseParcel({
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { SOMETHING_ELSE: "x", polygon_number: "P99" },
      geometry: { type: "Polygon", coordinates: [SUBURBAN_RING] },
    }],
  });
  assert.equal(p.lotId, "Parcel P99");
  assert.equal(p.address, "");
  assert.equal(p.ring.length, 5);
  const blank = parseParcel({
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [SUBURBAN_RING] } }],
  });
  assert.equal(blank.lotId, "");
  assert.equal(blank.ring.length, 5);
});

// ---------------------------------------------------------------------------
// Tidying the ring — without ever simplifying a lot into a nicer one.
// ---------------------------------------------------------------------------

test("dedupeRing drops the closing repeat and duplicate corners", () => {
  assert.equal(SUBURBAN_RING.length, 5);
  assert.equal(dedupeRing(parseParcel(SUBURBAN).ring).length, 4);
  const doubled = [[-32.3234, 115.8412], [-32.3234, 115.8412], [-32.3234, 115.8425],
    [-32.3231, 115.8425], [-32.3231, 115.8412]];
  assert.equal(dedupeRing(doubled).length, 4);
  assert.deepEqual(dedupeRing([]), []);
  assert.deepEqual(dedupeRing(null), []);
  assert.deepEqual(dedupeRing("nope"), []);
});

test("dedupeRing removes corners that sit on the line, and only those", () => {
  const ring = parseParcel(SUBURBAN).ring.slice(0, 4);
  // A capture artefact half way along the front boundary: not a corner.
  const withMid = [
    ring[0],
    [(ring[0][0] + ring[1][0]) / 2, (ring[0][1] + ring[1][1]) / 2],
    ring[1], ring[2], ring[3],
  ];
  assert.equal(dedupeRing(withMid).length, 4);
  // Nudge that same point 200 mm off the line and it becomes a real corner.
  const bent = withMid.slice();
  bent[1] = [bent[1][0] + 0.0000018, bent[1][1]];
  assert.equal(dedupeRing(bent).length, 5);
  // Never below a triangle, whatever it is handed.
  assert.equal(dedupeRing([[-32.32, 115.84], [-32.32, 115.8401], [-32.32, 115.8402]]).length, 3);
});

test("dedupeRing keeps every corner of a battleaxe — the access leg survives", () => {
  const ring = ringOf(BATTLEAXE);
  assert.equal(ring.length, 8);
  const plan = ringToPlan(ring, 0);
  const l = lens(plan.pts).map((v) => Math.round(v * 10) / 10);
  // The leg: a 4 m end closed by two 30 m sides. Simplification would have
  // eaten all three and left a tidy rectangle that is not this lot.
  assert.deepEqual(l, [4, 30, 8, 25, 20, 25, 8, 30]);
  close(plan.area, 620, 0.05);
});

// ---------------------------------------------------------------------------
// Projection at Perth's latitude.
// ---------------------------------------------------------------------------

test("ringCentroid and ringToGround put the lot in metres about its own middle", () => {
  const ring = ringOf(SUBURBAN);
  const c = ringCentroid(ring);
  close(c.lat, -32.32325627, 1e-7);
  close(c.lng, 115.84126644, 1e-7);
  const g = ringToGround(ring, c);
  // 12.5 m wide, 32 m deep, measured from the centre outwards.
  close(g[0].east, -6.25, MM5);
  close(g[0].north, -16, MM5);
  close(g[2].east, 6.25, MM5);
  close(g[2].north, 16, MM5);
});

test("ringToPlan holds true lengths and area through the projection", () => {
  const plan = ringToPlan(ringOf(SUBURBAN), 0);
  const l = lens(plan.pts);
  close(l[0], 12.5, MM5);
  close(l[1], 32, MM5);
  close(plan.area, 400, 0.05);
  close(plan.width, 12.5, MM5);
  close(plan.depth, 32, MM5);
  // Shoelace of the laid-out polygon is the same number ringToPlan reports.
  close(polygonArea(plan.pts), plan.area, 0.002);
});

// ---------------------------------------------------------------------------
// Where the street is.
// ---------------------------------------------------------------------------

test("the frontage of an ordinary suburban lot is the boundary the address faces", () => {
  const ring = ringOf(SUBURBAN);
  // The roof point is 8 m back from the front and only 6.25 m from each side
  // fence — so "nearest boundary" would call a side fence the frontage. Which
  // way the address lies from the middle of the lot is the signal that works.
  assert.equal(inferFrontage(ring, SUBURBAN_STREET), 0);
  assert.equal(ringToPlan(ring, 0).north, 0);
});

test("a corner lot takes the street its address is on, not the nearest one", () => {
  const ring = ringOf(CORNER);
  assert.equal(inferFrontage(ring, CORNER_STREET), 1);
  const plan = ringToPlan(ring, 1);
  // The east boundary along the bottom of the sheet puts north to the right.
  assert.equal(plan.north, 90);
  close(plan.width, 25, MM5);
  close(plan.depth, 18, MM5);
});

test("a battleaxe fronts the end of its access leg, whatever the address point says", () => {
  const ring = ringOf(BATTLEAXE);
  // The address geocodes to the dwelling at the back of the lot — no help at
  // all. The driveway is unmistakable in the geometry, so it wins outright.
  assert.equal(accessLegEdge(ringToPlan(ring, 0).pts.map((p) => ({ x: p.x, y: -p.y }))), 0);
  assert.equal(inferFrontage(ring, BATTLEAXE_STREET), 0);
  assert.equal(inferFrontage(ring, null), 0);
  const plan = ringToPlan(ring, 0);
  close(lens(plan.pts)[0], 4, MM5);
});

test("a splayed corner is not mistaken for an access leg", () => {
  // 18 x 25 with a 4 m truncation across the corner: a short edge with long
  // neighbours, but they meet at a right angle rather than running back on
  // themselves, which is what tells a splay from a driveway.
  const splay = [
    { x: 0, y: 0 }, { x: 14, y: 0 }, { x: 18, y: 4 },
    { x: 18, y: 25 }, { x: 6, y: 25 }, { x: 0, y: 19 },
  ];
  assert.equal(accessLegEdge(splay), -1);
  // And an ordinary narrow block: front and rear both look like necks, so
  // neither is picked and the address point decides instead.
  assert.equal(accessLegEdge([
    { x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 40 }, { x: 0, y: 40 },
  ]), -1);
});

test("an irregular lot fronts the boundary its address faces, and labels count round", () => {
  const ring = ringOf(IRREGULAR);
  assert.equal(ring.length, 6);
  assert.equal(inferFrontage(ring, IRREGULAR_STREET), 0);
  const plan = ringToPlan(ring, 0);
  close(plan.area, 495, 0.05);
  // Six sides: "rear" would be a fiction, so they are numbered from the front.
  assert.deepEqual(edgeLabels(6, 0),
    ["Front", "Boundary 2", "Boundary 3", "Boundary 4", "Boundary 5", "Boundary 6"]);
});

test("with no address point at all the shortest boundary is the guess", () => {
  assert.equal(inferFrontage(ringOf(SUBURBAN), null), 0);
  // And a point sitting on the middle of the lot tells us nothing either.
  const middle = ringCentroid(ringOf(SUBURBAN));
  assert.equal(inferFrontage(ringOf(SUBURBAN), middle), 0);
});

// ---------------------------------------------------------------------------
// Laying the lot on the sheet.
// ---------------------------------------------------------------------------

test("ringToPlan puts the frontage along the bottom with the lot above it", () => {
  for (const [fc, street] of [[SUBURBAN, SUBURBAN_STREET], [CORNER, CORNER_STREET],
    [BATTLEAXE, BATTLEAXE_STREET], [IRREGULAR, IRREGULAR_STREET]]) {
    const ring = ringOf(fc);
    const f = inferFrontage(ring, street);
    const plan = ringToPlan(ring, f);
    const n = plan.pts.length;
    const a = plan.pts[f], b = plan.pts[(f + 1) % n];
    const maxY = Math.max(...plan.pts.map((p) => p.y));
    close(a.y, b.y, MM5);                      // horizontal
    close(a.y, maxY, MM5);                     // and the lowest thing on the sheet
    // Nothing sticks out of the top-left corner: the outline is normalised.
    close(Math.min(...plan.pts.map((p) => p.x)), 0, 1e-9);
    close(Math.min(...plan.pts.map((p) => p.y)), 0, 1e-9);
  }
});

test("north is derived from the parcel, not guessed in 45° steps", () => {
  // Same lot, four different boundaries chosen as the street: north follows.
  const ring = ringOf(SUBURBAN);
  assert.equal(ringToPlan(ring, 0).north, 0);
  assert.equal(ringToPlan(ring, 1).north, 90);
  assert.equal(ringToPlan(ring, 2).north, 180);
  assert.equal(ringToPlan(ring, 3).north, 270);
  // And on a lot that isn't square to the compass it lands off the 45s.
  const skew = [[-32.3234, 115.8412], [-32.32335, 115.84133], [-32.32311, 115.84123], [-32.32316, 115.8411]];
  const n = ringToPlan(skew, 0).north;
  assert.ok(n > 0 && n < 360);
  assert.ok(Math.abs(n % 45) > 1, `derived north ${n} is a real bearing, not a step`);
});

test("the anchor is the parcel's own centre in plan metres", () => {
  const plan = ringToPlan(ringOf(SUBURBAN), 0);
  // The photo hangs off this: the point at plan.lat/plan.lng sits here.
  close(plan.anchor.x, 6.25, MM5);
  close(plan.anchor.y, 16, MM5);
  close(plan.lat, -32.32325627, 1e-7);
  close(plan.lng, 115.84126644, 1e-7);
});

// ---------------------------------------------------------------------------
// The whole thing, and changing your mind about the frontage.
// ---------------------------------------------------------------------------

test("buildLot makes a lot record ready to sit on a design", () => {
  const lot = buildLot(parseParcel(SUBURBAN), SUBURBAN_STREET, {
    source: "Landgate cadastre (SLIP)", fetched: "2026-08-02",
  });
  assert.equal(lot.kind, "poly");
  assert.equal(lot.pts.length, 4);
  assert.equal(lot.ring.length, 4);
  assert.equal(lot.frontage, 0);
  assert.equal(lot.north, 0);
  assert.equal(lot.lotId, "Lot 214 on Plan 78123");
  assert.equal(lot.address, "12 WANDOO RISE, BALDIVIS");
  assert.equal(lot.source, "Landgate cadastre (SLIP)");
  assert.equal(lot.fetched, "2026-08-02");
  close(polygonArea(lot.pts), 400, 0.05);
});

test("buildLot refuses a sliver, a line and nothing at all", () => {
  assert.equal(buildLot(null), null);
  assert.equal(buildLot({ ring: [] }), null);
  assert.equal(buildLot({ ring: [[-32.32, 115.84], [-32.32, 115.8401]] }), null);
  // Under a square metre is a capture artefact, not a lot.
  assert.equal(buildLot({ ring: [[-32.32, 115.84], [-32.32, 115.840005], [-32.319995, 115.84]] }), null);
});

test("tapping another boundary re-lays the lot and re-derives north and the labels", () => {
  const lot = buildLot(parseParcel(SUBURBAN), SUBURBAN_STREET, { source: "s", fetched: "d" });
  assert.deepEqual(edgeLabels(4, lot.frontage), ["Front", "Side", "Rear", "Side"]);
  const turned = reorientLot(lot, 1);
  assert.equal(turned.frontage, 1);
  assert.equal(turned.north, 90);
  assert.deepEqual(edgeLabels(4, turned.frontage), ["Side", "Front", "Side", "Rear"]);
  // The lot is the same lot: same area, same ground ring, same identifiers.
  close(polygonArea(turned.pts), polygonArea(lot.pts), 1e-6);
  assert.deepEqual(turned.ring, lot.ring);
  assert.equal(turned.lotId, lot.lotId);
  // And its new frontage is along the bottom.
  const maxY = Math.max(...turned.pts.map((p) => p.y));
  close(turned.pts[1].y, maxY, MM5);
  close(turned.pts[2].y, maxY, MM5);
  // A full lap comes home.
  close(reorientLot(turned, 0).north, 0, 1e-9);
});

test("reorienting a lot with no ground ring behind it only moves the labels", () => {
  const traced = {
    kind: "poly", ring: [], frontage: 0, north: 0, anchor: null, lat: null, lng: null,
    pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
    source: "", fetched: "", lotId: "", address: "",
  };
  const turned = reorientLot(traced, 2);
  assert.equal(turned.frontage, 2);
  assert.deepEqual(turned.pts, traced.pts);
  assert.equal(turned.north, 0);
});

// ---------------------------------------------------------------------------
// Setbacks measured to a real boundary.
// ---------------------------------------------------------------------------

test("setbacks to an irregular lot measure to each boundary line, not to a box", () => {
  const lot = buildLot(parseParcel(IRREGULAR), IRREGULAR_STREET, {});
  // A 10 x 8 m dwelling set 6 m back from the front boundary.
  const s = { x: 3, y: lot.pts[0].y - 6 - 8, w: 10, d: 8, rot: 0, shape: "rect" };
  const sb = lotSetbacks(s, lot.pts, lot.frontage);
  assert.equal(sb.length, 6);
  assert.equal(sb[0].label, "Front");
  close(sb[0].v, 6, MM5);
  // Every boundary gets a number, every number is a real distance, and the
  // shortest of them is to a boundary the bounding box would have missed.
  for (const e of sb) assert.ok(e.v >= 0 && Number.isFinite(e.v));
  const edges = lotEdges(lot.pts);
  for (const e of sb) close(e.length, edges[e.i].length, 1e-6);
  // The dwelling sits inside the lot.
  assert.ok(polygonInside(
    [{ x: 3, y: s.y }, { x: 13, y: s.y }, { x: 13, y: s.y + 8 }, { x: 3, y: s.y + 8 }],
    lot.pts,
  ));
});

test("a structure in the leg of a battleaxe measures to the leg, not the block", () => {
  const lot = buildLot(parseParcel(BATTLEAXE), BATTLEAXE_STREET, {});
  const front = lot.pts[0];                     // top of the leg's end edge
  // A 3 m wide shed in the 4 m leg: 0.5 m each side, whatever the rest of the
  // lot is doing 30 m away.
  const s = { x: front.x + 0.5, y: front.y - 10, w: 3, d: 4, rot: 0, shape: "rect" };
  const sb = lotSetbacks(s, lot.pts, lot.frontage);
  const byI = Object.fromEntries(sb.map((e) => [e.i, e.v]));
  close(byI[0], 6, MM5);                        // to the street end of the leg
  close(byI[1], 0.5, MM5);                      // to one side of the leg
  close(byI[7], 0.5, MM5);                      // to the other
  assert.equal(sb[0].label, "Front");
});
