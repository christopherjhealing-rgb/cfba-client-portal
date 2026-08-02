// Pure geometry for the site plan tool. Plain ESM on the core.mjs pattern —
// Node's test runner imports it directly and SitePlanBuilder imports the same
// single source. No DOM, no React, no rounding surprises: everything works in
// metres, and "paper" means real millimetres on an A4 sheet.

// ---------------------------------------------------------------------------
// Paper. A4 portrait with the print margin the stylesheet sets, a title block
// reserved at the bottom, and clear margins inside the drawing for the
// dimension strings, north arrow, scale bar and street label. These numbers
// and the print CSS must move together — fitScale's promise that a chosen
// scale fits the page is only as good as them agreeing.
// ---------------------------------------------------------------------------
export const A4_MM = { w: 210, h: 297 };
export const PAGE_MARGIN_MM = 12;
export const TITLE_BLOCK_MM = 36;
export const DRAW_MARGIN_MM = { left: 16, right: 8, top: 14, bottom: 16 };

/** Millimetres available for the drawing (lot + annotation margins). */
export function planAreaMm() {
  return {
    w: A4_MM.w - 2 * PAGE_MARGIN_MM,
    h: A4_MM.h - 2 * PAGE_MARGIN_MM - TITLE_BLOCK_MM,
  };
}

// ---------------------------------------------------------------------------
// Scale. Site plans are read against a stated scale, so the sheet must carry
// a standard one, not "fit to page". Smallest denominator (largest drawing)
// that fits wins; a lot too big for 1:500 on A4 falls back with fits:false
// and the sheet says "reduced to fit" instead of claiming a scale.
// ---------------------------------------------------------------------------
export const STANDARD_SCALES = [100, 200, 500];

export function fitScale(lotW, lotD) {
  const area = planAreaMm();
  const availW = area.w - DRAW_MARGIN_MM.left - DRAW_MARGIN_MM.right;
  const availH = area.h - DRAW_MARGIN_MM.top - DRAW_MARGIN_MM.bottom;
  for (const denom of STANDARD_SCALES) {
    if (mToMmOnPaper(lotW, denom) <= availW && mToMmOnPaper(lotD, denom) <= availH) {
      return { denom, fits: true };
    }
  }
  return { denom: STANDARD_SCALES[STANDARD_SCALES.length - 1], fits: false };
}

/** Real metres a millimetre on paper represents at 1:denom — used to size
 *  annotation text and margins in the drawing's metre coordinates, so screen
 *  and print render identically from one set of numbers. */
export function mmOnPaperToM(mm, denom) {
  return (mm * denom) / 1000;
}

export function mToMmOnPaper(m, denom) {
  return (m * 1000) / denom;
}

/** Scale bar length in metres: a round number spanning at most ~50 mm of
 *  paper so the bar reads as a ruler, not a border. */
export function scaleBarMetres(denom) {
  const nice = [50, 20, 10, 5, 2, 1];
  for (const m of nice) if (mToMmOnPaper(m, denom) <= 50) return m;
  return 1;
}

// ---------------------------------------------------------------------------
// Placement. The lot's coordinate space is metres, origin top-left, street
// along the bottom edge (y = lotD).
// ---------------------------------------------------------------------------
export function snap(n, step = 0.05) {
  return Math.round(n / step) * step;
}

/** Keep a structure inside the lot. A structure larger than the lot pins to
 *  the top/left rather than jittering — the size fields are where that gets
 *  fixed, not the drag. */
export function clampToLot(x, y, w, d, lotW, lotD) {
  return {
    x: Math.min(Math.max(x, 0), Math.max(lotW - w, 0)),
    y: Math.min(Math.max(y, 0), Math.max(lotD - d, 0)),
  };
}

/** Distances from a structure to the four boundaries, in metres — the
 *  minimum from the shape's outline to each boundary, whatever the shape or
 *  rotation (for a plain rectangle these are the same numbers as ever).
 *  Front is the street (bottom) edge, rear the top. Measurements only —
 *  whether any of them is acceptable is assessment's call, never this
 *  file's. */
export function setbacks(s, lotW, lotD) {
  const b = polyBounds(footprint(s));
  return {
    left: b.minX,
    right: lotW - b.maxX,
    rear: b.minY,
    front: lotD - b.maxY,
  };
}

/** Where a new structure lands: near the centre, staggered a little per
 *  existing structure so repeated clicks don't stack invisibly.
 *
 *  `centre` is the lot's own middle, which is only the middle of its
 *  bounding box for a rectangle. Give a polygon lot its real centroid and
 *  the first shed on a battleaxe lands in the block rather than out on the
 *  neighbour's, which is where the bounding box would have put it. */
export function defaultPlacement(w, d, lotW, lotD, count = 0, centre = null) {
  const stagger = (count % 5) * 1.2;
  const cx = centre && Number.isFinite(centre.x) ? centre.x : lotW / 2;
  const cy = centre && Number.isFinite(centre.y) ? centre.y : lotD / 2;
  const x = snap(cx - w / 2 + stagger, 0.05);
  const y = snap(cy - d / 2 + stagger, 0.05);
  return clampToLot(x, y, w, d, lotW, lotD);
}

// ---------------------------------------------------------------------------
// Shapes. A structure is no longer only a rectangle: it can be an L (overall
// width/depth with a notch cut out) or any simple polygon the client draws.
// Everything below resolves a structure to one honest representation — its
// footprint, a polygon in lot metres with rotation applied — and measures
// from that. Points are {x, y} in metres; rotation is quarter turns only.
// ---------------------------------------------------------------------------

/** Kill float dust and negative zero so snapped inputs stay snapped. */
const r4 = (v) => Math.round(v * 10000) / 10000 + 0;

/** Translate points so the bounding box's top-left sits at (0, 0). */
export function normalisePts(pts) {
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: r4(p.x - minX), y: r4(p.y - minY) }));
}

/** Rotate points clockwise in 90° steps (y grows downward, as on screen),
 *  then re-anchor at the origin. 0 returns a normalised copy. */
export function rotatePts(pts, rot) {
  const r = ((Math.round(rot / 90) * 90) % 360 + 360) % 360;
  const turned = pts.map(({ x, y }) => {
    if (r === 90) return { x: -y, y: x };
    if (r === 180) return { x: -x, y: -y };
    if (r === 270) return { x: y, y: -x };
    return { x, y };
  });
  return normalisePts(turned);
}

export function polyBounds(pts) {
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return {
    minX: Math.min(...xs), minY: Math.min(...ys),
    maxX: Math.max(...xs), maxY: Math.max(...ys),
  };
}

/** L outline: a w × d envelope with a notchW × notchD corner cut from the
 *  bottom-right (the street-side right corner at rotation 0 — rotating the
 *  structure carries the notch to the other corners). The notch is clamped
 *  so at least 0.1 m of the leg always remains in each direction. */
export function lShapePts(w, d, notchW, notchD) {
  const nw = Math.min(Math.max(notchW, 0.1), Math.max(w - 0.1, 0.1));
  const nd = Math.min(Math.max(notchD, 0.1), Math.max(d - 0.1, 0.1));
  return [
    { x: 0, y: 0 }, { x: w, y: 0 },
    { x: r4(w), y: r4(d - nd) }, { x: r4(w - nw), y: r4(d - nd) },
    { x: r4(w - nw), y: r4(d) }, { x: 0, y: d },
  ].map((p) => ({ x: r4(p.x), y: r4(p.y) }));
}

/** A structure's outline in its own unrotated space, top-left at (0, 0).
 *  Plain rectangles (every design saved before shapes existed) need no
 *  shape field at all. */
export function shapePts(s) {
  if (s.shape === "poly" && Array.isArray(s.pts) && s.pts.length >= 3) {
    return normalisePts(s.pts);
  }
  if (s.shape === "lshape") {
    return lShapePts(s.w, s.d, s.notchW ?? s.w / 2, s.notchD ?? s.d / 2);
  }
  return [{ x: 0, y: 0 }, { x: s.w, y: 0 }, { x: s.w, y: s.d }, { x: 0, y: s.d }];
}

/** The footprint: outline rotated and placed on the lot. s.x/s.y is always
 *  the top-left of the rotated bounding box, whatever the rotation. */
export function footprint(s) {
  return rotatePts(shapePts(s), s.rot ?? 0)
    .map((p) => ({ x: r4(p.x + s.x), y: r4(p.y + s.y) }));
}

/** Rotated bounding-box size — what clamping and dragging work against.
 *  A quarter turn swaps width and depth. */
export function boundsOf(s) {
  let w = s.w, d = s.d;
  if (s.shape === "poly" && Array.isArray(s.pts) && s.pts.length >= 3) {
    const b = polyBounds(s.pts);
    w = b.maxX - b.minX; d = b.maxY - b.minY;
  }
  const quarter = (((s.rot ?? 0) / 90) % 2 + 2) % 2;
  return quarter === 1 ? { w: r4(d), d: r4(w) } : { w: r4(w), d: r4(d) };
}

/** Shoelace area of a polygon, in square metres. */
export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** Area of any structure — rectangle, L or drawn outline alike. */
export function structureArea(s) {
  return polygonArea(shapePts(s));
}

const orient = (p, q, r) => {
  const v = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return Math.abs(v) < 1e-9 ? 0 : v > 0 ? 1 : -1;
};
const onSeg = (p, q, r) =>
  Math.min(p.x, r.x) - 1e-9 <= q.x && q.x <= Math.max(p.x, r.x) + 1e-9 &&
  Math.min(p.y, r.y) - 1e-9 <= q.y && q.y <= Math.max(p.y, r.y) + 1e-9;

function segmentsCross(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSeg(p1, p3, p2)) return true;
  if (o2 === 0 && onSeg(p1, p4, p2)) return true;
  if (o3 === 0 && onSeg(p3, p1, p4)) return true;
  if (o4 === 0 && onSeg(p3, p2, p4)) return true;
  return false;
}

/** True for an honest outline: at least three corners, some area, and no
 *  edge crossing another. Adjacent edges may share their corner; anything
 *  else touching is a self-intersection and the drawing tool refuses it. */
export function isSimplePolygon(pts) {
  if (!Array.isArray(pts) || pts.length < 3) return false;
  if (polygonArea(pts) < 1e-6) return false;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if ((i + 1) % n === j || (j + 1) % n === i) continue;
      if (segmentsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return true;
}

/** Store an absolute footprint back on a structure: anchor at the outline's
 *  own top-left, un-rotate the points, keep w/d mirroring the outline's
 *  unrotated bounds. footprint() of the result reproduces the input. */
export function polyFromFootprint(absPts, rot = 0) {
  const b = polyBounds(absPts);
  const rel = absPts.map((p) => ({ x: p.x - b.minX, y: p.y - b.minY }));
  const pts = rotatePts(rel, (360 - (((rot % 360) + 360) % 360)) % 360);
  const pb = polyBounds(pts);
  return { x: r4(b.minX), y: r4(b.minY), w: r4(pb.maxX), d: r4(pb.maxY), pts };
}

/** One quarter turn clockwise, keeping the footprint centred where it was
 *  (then clamped back inside the lot). Returns the patch to apply. */
export function rotateStructure(s, lotW, lotD) {
  const rot = (((s.rot ?? 0) + 90) % 360);
  const before = boundsOf(s);
  const after = boundsOf({ ...s, rot });
  const cx = s.x + before.w / 2, cy = s.y + before.d / 2;
  const pos = clampToLot(
    snap(cx - after.w / 2, 0.05), snap(cy - after.d / 2, 0.05),
    after.w, after.d, lotW, lotD,
  );
  return { rot, ...pos };
}

/** Where each setback line is drawn: from the outline's nearest face
 *  straight to the boundary, leaving from the middle of that face. For a
 *  rectangle this is the face midpoint the tool has always used. */
export function setbackMarks(s, lotW, lotD) {
  const pts = footprint(s);
  const b = polyBounds(pts);
  const eps = 1e-6;
  const mid = (arr) => (Math.min(...arr) + Math.max(...arr)) / 2;
  const leftY = mid(pts.filter((p) => p.x - b.minX < eps).map((p) => p.y));
  const rightY = mid(pts.filter((p) => b.maxX - p.x < eps).map((p) => p.y));
  const rearX = mid(pts.filter((p) => p.y - b.minY < eps).map((p) => p.x));
  const frontX = mid(pts.filter((p) => b.maxY - p.y < eps).map((p) => p.x));
  return {
    left: { v: b.minX, x1: b.minX, y1: leftY, x2: 0, y2: leftY },
    right: { v: lotW - b.maxX, x1: b.maxX, y1: rightY, x2: lotW, y2: rightY },
    rear: { v: b.minY, x1: rearX, y1: b.minY, x2: rearX, y2: 0 },
    front: { v: lotD - b.maxY, x1: frontX, y1: b.maxY, x2: frontX, y2: lotD },
  };
}

// ---------------------------------------------------------------------------
// The lot itself. It used to be a rectangle and nothing else — lotW × lotD,
// street along the bottom. It still is by default, and every design saved
// before this build loads as exactly that. But a lot can now also be a
// polygon: the real parcel from the State's cadastre, or one traced over the
// aerial. Corner lots, battleaxes, six-sided infill blocks — the shapes that
// were previously squashed into a rectangle and quietly mis-measured.
//
// Everything below works on the polygon, and the rectangle is simply the
// four-cornered case of it. Edge i runs pts[i] → pts[i + 1] (wrapping), so
// an edge index means the same thing everywhere: on the canvas, in the
// labels, in the setback list.
//
// Setbacks stop being "distance to the bounding box" and become the honest
// thing: the shortest distance from the structure's outline to that boundary
// line. Still measurements. Still never a verdict.
// ---------------------------------------------------------------------------

/** The rectangle lot as a polygon, wound so the street edge is index 2 —
 *  the bottom edge, exactly where the tool has always drawn it. */
export function rectLotPts(lotW, lotD) {
  return [
    { x: 0, y: 0 }, { x: r4(lotW), y: 0 },
    { x: r4(lotW), y: r4(lotD) }, { x: 0, y: r4(lotD) },
  ];
}

/** Index of the street edge on a rectangle lot: the bottom one. */
export const RECT_FRONTAGE = 2;

/** The lot's outline, whichever kind it is. A polygon lot carries its own
 *  corners; anything else is the plain rectangle. */
export function lotPts(lot, lotW, lotD) {
  if (lot && lot.kind === "poly" && Array.isArray(lot.pts) && lot.pts.length >= 3) {
    return lot.pts;
  }
  return rectLotPts(lotW, lotD);
}

/** Which edge is the street. A rectangle's is always the bottom. */
export function lotFrontage(lot) {
  if (lot && lot.kind === "poly" && Array.isArray(lot.pts) && lot.pts.length >= 3) {
    const n = lot.pts.length;
    const i = Number.isFinite(lot.frontage) ? Math.round(lot.frontage) : 0;
    return ((i % n) + n) % n;
  }
  return RECT_FRONTAGE;
}

/** Every boundary, in order, with its ends, length and midpoint, plus the
 *  outward normal so a label can sit clear of the lot rather than inside it. */
export function lotEdges(pts) {
  const n = pts.length;
  const c = polygonCentroid(pts);
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // Two candidate normals; the outward one points away from the centre.
    let nx = len > 1e-9 ? -dy / len : 0;
    let ny = len > 1e-9 ? dx / len : 0;
    if ((mid.x - c.x) * nx + (mid.y - c.y) * ny < 0) { nx = -nx; ny = -ny; }
    // + 0 so a normal of exactly zero is never negative zero, which reads
    // back as -0 in a deep comparison and in an SVG transform alike.
    return { i, a, b, length: r4(len), mid, nx: nx + 0, ny: ny + 0 };
  });
}

/** What each boundary is called. Four-sided lots get the words a builder
 *  uses — Front, Side, Rear, Side, reckoned from whichever edge is the
 *  street. Anything else is numbered from the frontage, because "rear" on a
 *  six-sided block means nothing and guessing would be worse than counting. */
export function edgeLabels(n, frontage) {
  if (!(n >= 3)) return [];
  const f = ((Math.round(frontage) % n) + n) % n;
  if (n === 4) {
    const names = ["Front", "Side", "Rear", "Side"];
    return Array.from({ length: 4 }, (_, i) => names[(i - f + 4) % 4]);
  }
  return Array.from({ length: n }, (_, i) =>
    i === f ? "Front" : `Boundary ${((i - f + n) % n) + 1}`);
}

/** Shoelace centroid. Falls back to the mean corner for a degenerate ring so
 *  a bad outline never produces NaN halfway across the drawing. */
export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    const f = p.x * q.y - q.x * p.y;
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-12) {
    const n = pts.length || 1;
    return {
      x: r4(pts.reduce((s, p) => s + p.x, 0) / n),
      y: r4(pts.reduce((s, p) => s + p.y, 0) / n),
    };
  }
  return { x: r4(cx / (3 * a)), y: r4(cy / (3 * a)) };
}

/** Nearest point on segment a→b to p. A zero-length segment is its own
 *  nearest point. */
export function closestOnSegment(a, b, p) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-12) return { x: a.x, y: a.y };
  const t = Math.min(Math.max(((p.x - a.x) * vx + (p.y - a.y) * vy) / len2, 0), 1);
  return { x: a.x + t * vx, y: a.y + t * vy };
}

export function pointToSegment(a, b, p) {
  const q = closestOnSegment(a, b, p);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Shortest distance from a closed outline to one boundary segment, and the
 *  pair of points that achieves it — which is where the setback line gets
 *  drawn. Two segments that don't cross are always nearest at an end of one
 *  of them, so checking every corner against the other's span finds it. */
export function minDistPolyToSegment(poly, a, b) {
  let best = { d: Infinity, from: poly[0], to: a };
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i], q = poly[(i + 1) % n];
    // Crossing the boundary is zero distance, however the corners lie.
    if (segmentsCross(p, q, a, b)) {
      return { d: 0, from: p, to: closestOnSegment(a, b, p) };
    }
    const onAB = closestOnSegment(a, b, p);
    const d1 = Math.hypot(p.x - onAB.x, p.y - onAB.y);
    if (d1 < best.d) best = { d: d1, from: p, to: onAB };
    for (const end of [a, b]) {
      const onPoly = closestOnSegment(p, q, end);
      const d2 = Math.hypot(end.x - onPoly.x, end.y - onPoly.y);
      if (d2 < best.d) best = { d: d2, from: onPoly, to: { x: end.x, y: end.y } };
    }
  }
  return { d: r4(best.d), from: best.from, to: best.to };
}

/** Ray casting: is a point inside the outline? Corners exactly on the line
 *  are decided by the tolerance in polygonInside, not here. */
export function polygonContains(pts, p) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > p.y) !== (b.y > p.y) &&
        p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Every corner of `inner` inside (or on) `outer`. A structure hanging over
 *  a boundary is worth saying out loud — as a measurement, not a ruling. */
export function polygonInside(inner, outer, tol = 1e-6) {
  return inner.every((p) => {
    if (polygonContains(outer, p)) return true;
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length];
      if (pointToSegment(a, b, p) <= tol) return true;
    }
    return false;
  });
}

/** Distances from a structure to every boundary of a polygon lot: the
 *  shortest distance from its outline to each boundary line, with the
 *  boundary's own name, its length, and where to draw the dimension.
 *
 *  For the rectangle lot this returns precisely the numbers the tool has
 *  always shown — rear, side, front, side — because the shortest distance to
 *  a boundary you sit square inside is the gap to that face. */
export function lotSetbacks(s, pts, frontage = 0) {
  const fp = footprint(s);
  const labels = edgeLabels(pts.length, frontage);
  const n = pts.length;
  return pts.map((a, i) => {
    const b = pts[(i + 1) % n];
    const m = minDistPolyToSegment(fp, a, b);
    return {
      i, label: labels[i], v: m.d,
      length: r4(Math.hypot(b.x - a.x, b.y - a.y)),
      x1: r4(m.from.x), y1: r4(m.from.y), x2: r4(m.to.x), y2: r4(m.to.y),
    };
  });
}

/** The lot record as it is stored on a design. No lot, a half-written one,
 *  or an outline that crosses itself all come back as the plain rectangle —
 *  which is every design saved before the cadastre existed, loading and
 *  behaving exactly as it did before. */
export function sanitiseLot(raw) {
  const blank = {
    kind: "rect", pts: [], ring: [], frontage: 0, north: 0, anchor: null,
    lat: null, lng: null, source: "", fetched: "", lotId: "", address: "",
  };
  const l = raw && typeof raw === "object" ? raw : {};
  if (l.kind !== "poly") return blank;
  const pts = (Array.isArray(l.pts) ? l.pts : [])
    .filter((p) => p && typeof p === "object" &&
      Number.isFinite(p.x) && Number.isFinite(p.y))
    .map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 3 || !isSimplePolygon(pts)) return blank;
  const n = pts.length;
  const num = (v, fb) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const str = (v) => (typeof v === "string" ? v.slice(0, 160) : "");
  const lat = num(l.lat, null), lng = num(l.lng, null);
  const sited = lat !== null && lng !== null && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
  const a = l.anchor;
  return {
    kind: "poly",
    pts: normalisePts(pts),
    ring: (Array.isArray(l.ring) ? l.ring : [])
      .filter((p) => Array.isArray(p) && p.length >= 2 &&
        Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
      .map((p) => [Number(p[0]), Number(p[1])]),
    frontage: ((Math.round(num(l.frontage, 0)) % n) + n) % n,
    north: ((num(l.north, 0) % 360) + 360) % 360,
    anchor: a && typeof a === "object" && Number.isFinite(a.x) && Number.isFinite(a.y)
      ? { x: r4(a.x), y: r4(a.y) } : null,
    lat: sited ? lat : null,
    lng: sited ? lng : null,
    source: str(l.source), fetched: str(l.fetched),
    lotId: str(l.lotId), address: str(l.address),
  };
}

// ---------------------------------------------------------------------------
// Magnetic alignment. While a structure is dragged its edges (and centre)
// pull level with other structures' within a small threshold, one axis at a
// time, and the caller draws a dashed guide along the match. Nudging by
// arrow key never comes through here — that path stays exact.
// ---------------------------------------------------------------------------
export function alignSnap(x, y, w, d, others, threshold = 0.3) {
  let bestX = null, bestY = null;
  // Faces align with faces (level or abutting), centres with centres —
  // never a face with a centre, which reads as a snap to nothing.
  const consider = (mine, theirs, o, axis) => {
    const delta = theirs - mine;
    if (Math.abs(delta) > threshold) return;
    if (axis === "x") {
      if (!bestX || Math.abs(delta) < Math.abs(bestX.delta)) bestX = { delta, at: theirs, o };
    } else if (!bestY || Math.abs(delta) < Math.abs(bestY.delta)) {
      bestY = { delta, at: theirs, o };
    }
  };
  for (const o of others) {
    for (const mine of [x, x + w]) {
      for (const theirs of [o.x, o.x + o.w]) consider(mine, theirs, o, "x");
    }
    consider(x + w / 2, o.x + o.w / 2, o, "x");
    for (const mine of [y, y + d]) {
      for (const theirs of [o.y, o.y + o.d]) consider(mine, theirs, o, "y");
    }
    consider(y + d / 2, o.y + o.d / 2, o, "y");
  }
  const nx = r4(bestX ? x + bestX.delta : x);
  const ny = r4(bestY ? y + bestY.delta : y);
  const guides = [];
  if (bestX) {
    guides.push({
      axis: "x", at: bestX.at,
      from: Math.min(ny, bestX.o.y), to: Math.max(ny + d, bestX.o.y + bestX.o.d),
    });
  }
  if (bestY) {
    guides.push({
      axis: "y", at: bestY.at,
      from: Math.min(nx, bestY.o.x), to: Math.max(nx + w, bestY.o.x + bestY.o.w),
    });
  }
  return { x: nx, y: ny, guides };
}

// ---------------------------------------------------------------------------
// Resize handles. Dragging a handle moves one edge (or corner) of the
// footprint's bounding box; the opposite edge holds still, the changing
// dimension snaps to 0.1 m, and nothing leaves the lot or collapses below
// 0.1 m. The numeric fields remain the exact-entry path.
// ---------------------------------------------------------------------------
const clampDim = (v, min, max) => Math.min(Math.max(v, min), Math.max(max, min));

export function resizeBounds(b, handle, px, py, lotW, lotD, { min = 0.1, step = 0.1 } = {}) {
  let { x, y, w, d } = b;
  const right = b.x + b.w, bottom = b.y + b.d;
  if (handle.includes("e")) w = clampDim(snap(px - b.x, step), min, lotW - b.x);
  if (handle.includes("w")) {
    const nw = clampDim(snap(right - px, step), min, right);
    x = right - nw; w = nw;
  }
  if (handle.includes("s")) d = clampDim(snap(py - b.y, step), min, lotD - b.y);
  if (handle.includes("n")) {
    const nd = clampDim(snap(bottom - py, step), min, bottom);
    y = bottom - nd; d = nd;
  }
  return { x: r4(x), y: r4(y), w: r4(w), d: r4(d) };
}

// ---------------------------------------------------------------------------
// Street from address. "24 Narranbee Ridge, Baldivis" and the street field
// want the same words typed twice — so derive the street: the segment before
// any comma, minus leading lot/unit/number tokens. Corner lots where the
// frontage differs stay a hand-edit; this is only the default.
// ---------------------------------------------------------------------------
export function deriveStreet(address) {
  const seg = String(address ?? "").split(",")[0].trim();
  if (!seg) return "";
  const words = seg.split(/\s+/);
  const marker = /^(lot|unit|u|no|apt|flat|shop|suite|villa|hse|house)\.?$/i;
  const numberish = /^\d+[a-z]?(\/\d+[a-z]?)?$/i;          // 24, 24a, 2/24
  const range = /^\d+[a-z]?[-–]\d+[a-z]?$/i;               // 24-26
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (marker.test(w) || numberish.test(w) || range.test(w)) { i++; continue; }
    break;
  }
  return words.slice(i).join(" ");
}

// ---------------------------------------------------------------------------
// The aerial underlay — screen only, never printed.
//
// An aerial photo sits behind the drawing so the client can trace their lot
// over what is actually there. For that to be worth anything it has to be at
// the drawing's own scale: one metre in the plan must be one metre on the
// photo. Everything below is the maths that makes that true, kept pure so it
// can be tested without a browser or a Google key.
//
// Web Mercator ground resolution at a given latitude and zoom, in metres per
// (CSS) pixel, for the 256 px tiles the Maps JavaScript API uses:
//
//     156543.03392 * cos(latitude) / 2^zoom
//
// Two knobs come out of that: the zoom to ask the map for, and a CSS scale
// factor that corrects whatever zoom the map actually settled on (raster maps
// round to whole zooms, and satellite imagery runs out somewhere around 21).
// The scale factor is what keeps the drawing honest when the zoom cannot be
// exact — the photo goes soft, never wrong.
// ---------------------------------------------------------------------------

/** Metres of ground per pixel at zoom 0 on the equator. */
export const MERCATOR_M_PER_PX_Z0 = 156543.03392;
/** WGS84 semi-major axis — the sphere Web Mercator is built on. */
export const EARTH_RADIUS_M = 6378137;
export const UNDERLAY_MIN_ZOOM = 1;
export const UNDERLAY_MAX_ZOOM = 22;
export const UNDERLAY_DEFAULT_OPACITY = 0.6;
export const UNDERLAY_MIN_OPACITY = 0.15;
/** The imagery's own fine turn, on top of the sheet's north. The sheet
 *  already rotates in 45° steps, so ±45° here reaches every angle. */
export const UNDERLAY_MAX_ROT = 45;

const DEG = Math.PI / 180;

export function metresPerPixel(latitude, zoom) {
  return (MERCATOR_M_PER_PX_Z0 * Math.cos(latitude * DEG)) / 2 ** zoom;
}

/** The (fractional) zoom whose ground resolution is `mpp` metres per pixel. */
export function zoomForMetresPerPixel(latitude, mpp) {
  if (!(mpp > 0)) return UNDERLAY_MAX_ZOOM;
  return Math.log2((MERCATOR_M_PER_PX_Z0 * Math.cos(latitude * DEG)) / mpp);
}

/** The zoom to ask for so one drawing metre is one screen pixel × pxPerMetre.
 *  Fractional: vector maps honour it exactly, raster maps round and the scale
 *  factor below picks up the difference. */
export function underlayZoom(latitude, pxPerMetre, { min = UNDERLAY_MIN_ZOOM, max = UNDERLAY_MAX_ZOOM } = {}) {
  if (!(pxPerMetre > 0)) return min;
  const z = zoomForMetresPerPixel(latitude, 1 / pxPerMetre);
  return Math.min(Math.max(z, min), max);
}

/** The CSS scale to apply to the map element so that, whatever zoom the map
 *  is really at, one drawing metre lands on one metre of imagery. 1 when the
 *  zoom came out exactly; above 1 when the map (or the imagery) capped out. */
export function underlayScale(latitude, zoom, pxPerMetre) {
  if (!(pxPerMetre > 0)) return 1;
  return metresPerPixel(latitude, zoom) * pxPerMetre;
}

/** Smallest uniform scale at which a w × h box, turned `deg` about its own
 *  centre, still covers the w × h box it started as — i.e. how much bigger
 *  the map has to be so rotation never opens a blank corner. */
export function rotationCoverScale(w, h, deg) {
  if (!(w > 0) || !(h > 0)) return 1;
  const r = (((deg % 180) + 180) % 180) * DEG;
  const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r));
  return Math.max((w * c + h * s) / w, (w * s + h * c) / h);
}

/** Unscaled pixel size for the map element: big enough that after the CSS
 *  rotation and scale it still covers the clip box, and no bigger — every
 *  extra pixel is a map tile someone pays for. */
export function underlayMapSize(clipW, clipH, deg, scale, { min = 64, max = 4096 } = {}) {
  const cover = rotationCoverScale(clipW, clipH, deg);
  const k = scale > 0 ? scale : 1;
  const fit = (v) => Math.min(Math.max(Math.ceil((v * cover) / k), min), max);
  return { w: fit(clipW), h: fit(clipH) };
}

// --- ground ↔ plan --------------------------------------------------------
// The plan's metre space has x to the right and y down the sheet, and its
// north arrow points `deg` clockwise from straight up. So a ground vector of
// east/north metres lands on the sheet as:
//
//     dx = east·cos(deg) + north·sin(deg)
//     dy = east·sin(deg) − north·cos(deg)
//
// which is its own inverse — the same numbers read the other way.

export function groundToPlanVector(east, north, deg) {
  const r = deg * DEG, c = Math.cos(r), s = Math.sin(r);
  return { dx: east * c + north * s, dy: east * s - north * c };
}

export function planToGroundVector(dx, dy, deg) {
  const r = deg * DEG, c = Math.cos(r), s = Math.sin(r);
  return { east: dx * c + dy * s, north: dx * s - dy * c };
}

/** Move a lat/lng by a local ground offset in metres. A tangent plane at the
 *  starting latitude: exact enough over a lot, and the exact inverse of
 *  metresBetween below. */
export function offsetLatLng(lat, lng, east, north) {
  return {
    lat: lat + north / (EARTH_RADIUS_M * DEG),
    lng: lng + east / (EARTH_RADIUS_M * Math.cos(lat * DEG) * DEG),
  };
}

/** Ground metres east and north from one point to another. */
export function metresBetween(from, to) {
  return {
    east: (to.lng - from.lng) * DEG * EARTH_RADIUS_M * Math.cos(from.lat * DEG),
    north: (to.lat - from.lat) * DEG * EARTH_RADIUS_M,
  };
}

/** Where the ground point behind the photo should sit in plan metres,
 *  shifted by however far the client has dragged it.
 *
 *  With no cadastre lot that point is the geocoded address and `base` is
 *  absent, so it lands in the middle of the lot and the nudge is the whole
 *  game — geocoding hits a rooftop or a driveway, not a lot corner.
 *
 *  With a cadastre lot, `base` is the plan position of a point whose real
 *  latitude and longitude we know exactly, so the photo lines itself up and
 *  the nudge is only there for the cases where the cadastre itself is off. */
export function underlayAnchor(lotW, lotD, offsetX = 0, offsetY = 0, base = null) {
  const bx = base && Number.isFinite(base.x) ? base.x : lotW / 2;
  const by = base && Number.isFinite(base.y) ? base.y : lotD / 2;
  return { x: bx + offsetX, y: by + offsetY };
}

/** The lat/lng to centre the map element on, so the geocoded site lands at
 *  `anchor` while the element's own centre sits at `elementCentre` — both in
 *  plan metres — with the imagery turned `deg` clockwise. */
export function underlayCentre(site, anchor, elementCentre, deg) {
  const { east, north } = planToGroundVector(
    elementCentre.x - anchor.x, elementCentre.y - anchor.y, deg,
  );
  return offsetLatLng(site.lat, site.lng, east, north);
}

export function clampUnderlayOpacity(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : UNDERLAY_DEFAULT_OPACITY;
  return Math.min(Math.max(Math.round(n * 100) / 100, UNDERLAY_MIN_OPACITY), 1);
}

export function clampUnderlayRot(v) {
  const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
  return Math.min(Math.max(Math.round(n * 10) / 10, -UNDERLAY_MAX_ROT), UNDERLAY_MAX_ROT);
}

/** Read an underlay back off a saved design. A design saved before the aerial
 *  existed — or one with a half-written record — comes back with no site and
 *  every switch at its default, which is exactly how the tool behaved before
 *  this build: no photo, nothing on screen, nothing on the print. */
export function sanitiseUnderlay(raw) {
  const u = raw && typeof raw === "object" ? raw : {};
  const num = (v, fb) => (typeof v === "number" && Number.isFinite(v) ? v : fb);
  const lat = num(u.lat, null);
  const lng = num(u.lng, null);
  const sited = lat !== null && lng !== null && Math.abs(lat) <= 85 && Math.abs(lng) <= 180;
  const zoom = num(u.zoom, null);
  return {
    lat: sited ? lat : null,
    lng: sited ? lng : null,
    zoom: sited && zoom !== null
      ? Math.min(Math.max(zoom, UNDERLAY_MIN_ZOOM), UNDERLAY_MAX_ZOOM)
      : null,
    offsetX: sited ? Math.round(num(u.offsetX, 0) * 1000) / 1000 : 0,
    offsetY: sited ? Math.round(num(u.offsetY, 0) * 1000) / 1000 : 0,
    rot: sited ? clampUnderlayRot(u.rot) : 0,
    opacity: clampUnderlayOpacity(u.opacity),
    visible: sited ? u.visible !== false : true,
    // Locked is the resting state: once it's lined up, dragging the plan must
    // never move the photo underneath it.
    locked: sited ? u.locked !== false : true,
  };
}

// ---------------------------------------------------------------------------
// Numbers in and out.
// ---------------------------------------------------------------------------

/** Parse a metres field. Positive decimals only, capped at 2 dp — "20.12"
 *  not "20.11999…". Returns null for anything unusable so callers keep the
 *  previous good value instead of collapsing the drawing. */
export function parseMetres(s) {
  const n = Number.parseFloat(String(s ?? "").replace(",", ".").trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** Dimension label: 2 dp with trailing zeros trimmed — "20.12", "3", "0.3". */
export function fmtM(n) {
  return String(Number(n.toFixed(2)));
}

/** Setback label: always 2 dp — "1.50" reads as measured, "1.5" as guessed. */
export function fmtM2(n) {
  return n.toFixed(2);
}

// ---------------------------------------------------------------------------
// The six v1 presets. Default sizes are typical, not recommendations — every
// dimension is editable the moment the structure lands.
// ---------------------------------------------------------------------------
export const STRUCTURE_PRESETS = [
  { kind: "dwelling", label: "Dwelling", w: 15, d: 10 },
  { kind: "patio", label: "Patio", w: 6, d: 4 },
  { kind: "shed", label: "Shed", w: 3, d: 3 },
  { kind: "pool", label: "Pool", w: 8, d: 4 },
  { kind: "carport", label: "Carport", w: 6, d: 3 },
  { kind: "retaining", label: "Retaining wall", w: 10, d: 0.3 },
];
