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

// ---------------------------------------------------------------------------
// The parametric patio — studio only.
//
// A patio here is a rectangle you hand a roof, posts and drainage to. All of
// this is pure geometry and arithmetic: where the posts land, how far the
// gutter runs, how many downpipes that length asks for, and how tall the roof
// stands at its eave and its ridge. What it never does is decide whether any
// of it is enough — that is the same line the whole tool holds. The studio
// offers this as help to a builder drawing their own plan; the certifier's
// client portal never turns it on, because a surveyor must not be seen to
// design what they certify.
//
// Sides are the rectangle's own four edges, numbered as everything else here
// is: 0 top, 1 right, 2 bottom, 3 left, in the patio's UNROTATED frame, so a
// side index means the same thing whichever way the patio is turned on the lot
// (the rotation carries it, exactly as it carries the L-shape's notch).
// ---------------------------------------------------------------------------

export const PATIO_ROOFS = ["flat", "skillion", "gable"];
export const PATIO_MAX_PITCH = 45;
export const PATIO_MAX_COLS = 12;
/** One downpipe per this many metres of gutter — a common rule of thumb, said
 *  on screen as guidance and never as a gate. */
export const GUTTER_M_PER_DOWNPIPE = 12;

const clampInt = (v, lo, hi, fb) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, lo), hi) : fb;
};

/**
 * Read a patio's parameters back off a saved structure, filling every gap with
 * a sensible default. A patio saved before this existed — or any structure
 * that isn't a patio — comes back as a plain flat patio with corner posts,
 * which draws as the bare rectangle it always was until someone opens the
 * panel and gives it a roof.
 */
export function sanitisePatio(raw) {
  const p = raw && typeof raw === "object" ? raw : {};
  const roof = PATIO_ROOFS.includes(p.roof) ? p.roof : "flat";
  const pitchRaw = Number(p.pitch);
  const pitch = Number.isFinite(pitchRaw)
    ? Math.min(Math.max(pitchRaw, 0), PATIO_MAX_PITCH)
    : (roof === "flat" ? 2 : 15);
  const cols = Array.isArray(p.cols) && p.cols.length === 4
    ? p.cols.map((n) => clampInt(n, 0, PATIO_MAX_COLS, 2))
    : [2, 2, 2, 2];
  const colHeightRaw = Number(p.colHeight);
  const colHeight = Number.isFinite(colHeightRaw)
    ? Math.round(Math.min(Math.max(colHeightRaw, 1.8), 6) * 100) / 100
    : 2.4;
  const soak = p.soak && typeof p.soak === "object" && typeof p.soak.key === "string"
    ? { key: p.soak.key, count: clampInt(p.soak.count, 1, 10, 1) }
    : null;
  return {
    mount: p.mount === "attached" ? "attached" : "free",
    // Which side abuts the dwelling (attached only) and which side the roof
    // falls to / has its gutter (a gable has an eave each side of that one).
    attach: clampInt(p.attach, 0, 3, 0),
    roof,
    pitch,
    fall: clampInt(p.fall, 0, 3, 2),
    cols,
    colHeight,
    downpipes: clampInt(p.downpipes, 0, 20, 0),
    soak,
  };
}

/** The rectangle's four sides, as pairs of footprint-corner indices. Side k
 *  runs between corner k and corner k+1, so side 0 is the top edge, and so on
 *  round. footprint() returns the corners in this same order. */
const PATIO_SIDES = [[0, 1], [1, 2], [2, 3], [3, 0]];

/** Placed length of local side k, from a patio's footprint corners. */
function patioSideLength(fp, k) {
  const [a, b] = PATIO_SIDES[k];
  return Math.hypot(fp[b].x - fp[a].x, fp[b].y - fp[a].y);
}

/**
 * Where the posts land, in lot metres.
 *
 * A count per side, corners included, spaced evenly along the placed edge —
 * so the posts turn and stretch with the patio without any separate maths for
 * rotation. The side that abuts the dwelling carries a wall, not posts, so it
 * gets none. Corner posts are shared between two sides and drawn once.
 */
export function patioColumns(s) {
  const p = sanitisePatio(s.patio);
  const fp = footprint(s);
  if (fp.length !== 4) return [];
  const attachLocal = p.mount === "attached" ? p.attach : -1;
  const posts = [];
  for (let k = 0; k < 4; k++) {
    if (k === attachLocal) continue;
    const n = p.cols[k];
    if (!(n >= 1)) continue;
    const [ai, bi] = PATIO_SIDES[k];
    const a = fp[ai], b = fp[bi];
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      posts.push({ x: r4(a.x + (b.x - a.x) * t), y: r4(a.y + (b.y - a.y) * t), side: k });
    }
  }
  const seen = new Map();
  for (const q of posts) {
    const key = `${q.x.toFixed(2)},${q.y.toFixed(2)}`;
    if (!seen.has(key)) seen.set(key, q);
  }
  return [...seen.values()];
}

/**
 * The gutter: which sides carry one, and how far it runs in total.
 *
 * Flat and skillion roofs drain to a single low side; a gable has an eave —
 * and so a gutter — each side of its ridge. The side against the dwelling
 * (attached) carries no gutter of its own.
 */
export function patioGutter(s) {
  const p = sanitisePatio(s.patio);
  const fp = footprint(s);
  if (fp.length !== 4) return { sides: [], length: 0 };
  const attachLocal = p.mount === "attached" ? p.attach : -1;
  let sides = p.roof === "gable" ? [p.fall, (p.fall + 2) % 4] : [p.fall];
  sides = sides.filter((k) => k !== attachLocal);
  const length = r4(sides.reduce((sum, k) => sum + patioSideLength(fp, k), 0));
  return { sides, length };
}

/** How many downpipes a run of gutter asks for, at one per `perM` metres. A
 *  roof with any gutter at all wants at least one; the arithmetic never
 *  rounds a real roof down to none. */
export function downpipesNeeded(gutterM, perM = GUTTER_M_PER_DOWNPIPE) {
  const g = Number(gutterM);
  if (!(g > 0)) return 0;
  return Math.max(1, Math.ceil(g / perM - 1e-9));
}

/**
 * Eave and ridge heights, in metres, from the post height and the pitch.
 *
 * The pitch climbs over the span that runs across the slope: the whole
 * footprint dimension for a skillion, half of it for a gable (the ridge sits
 * down the middle). A flat roof still falls a little, so it too has a low side
 * and a high side — just a shallow one. `eave` is the low/post height the
 * client set; `high` is the tall side; `ridge` is the gable peak, or null.
 */
export function patioRoofHeights(s) {
  const p = sanitisePatio(s.patio);
  const tan = Math.tan(p.pitch * Math.PI / 180);
  // Fall side 0/2 are the horizontal top/bottom edges, so the slope runs the
  // depth; 1/3 are the vertical sides, so it runs the width.
  const run = (p.fall % 2 === 0) ? s.d : s.w;
  const eave = r4(p.colHeight);
  if (p.roof === "gable") {
    const rise = r4((run / 2) * tan);
    return { type: "gable", eave, high: r4(eave + rise), ridge: r4(eave + rise), rise };
  }
  const rise = r4(run * tan);
  return { type: p.roof, eave, high: r4(eave + rise), ridge: null, rise };
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
    // A rectangle is what the width and depth fields describe, and nothing
    // else. Every design saved before provenance existed lands here.
    origin: "typed",
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
    // Read back rather than trusted: a saved lot from before this existed
    // carries no origin at all, and a polygon that names a source could only
    // ever have come from the cadastre.
    origin: lotOrigin({ kind: "poly", origin: l.origin, source: str(l.source) }),
  };
}

// ---------------------------------------------------------------------------
// Where the boundary came from, and how the sheet says so.
//
// This matters more than any of the drawing does. A plan that feeds a building
// permit application must let its reader tell a boundary fetched from the
// State's records from one somebody drew over a photograph — without being
// told, and without having to ask. So every lot carries its provenance:
//
//   typed             — the width and depth fields. A rectangle.
//   traced            — drawn or dragged by hand. The applicant's own measurement.
//   cadastre          — fetched from the State's cadastre, untouched since.
//   cadastre-adjusted — fetched, and then moved by hand. NOT the State's record
//                       any more, and the sheet must never let it read as if it
//                       were.
//
// A design saved before any of this existed has no origin on it at all: a
// rectangle reads as typed, and a polygon reads as cadastre if it names a
// source (the only way a polygon could exist back then) and traced otherwise.
// ---------------------------------------------------------------------------

export const LOT_ORIGINS = ["typed", "traced", "cadastre", "cadastre-adjusted"];

/** Said on screen, and in longer form on the printed sheet. Warm, short, and
 *  never a judgement about whether anything complies. */
export const LOT_INDICATIVE =
  "Boundaries from the State's cadastre are indicative — the shape is right, " +
  "but they can sit a metre or so off the pegs. Check anything tight against " +
  "your survey.";

/** Named when a fetched lot arrived without the service naming itself. The
 *  lookup only ever asks one thing, so this is a description and not a guess. */
const SOURCE_FALLBACK = "the State's cadastre";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** A stored ISO date as a builder would read it. Read in UTC so a stored
 *  "2026-08-02" is the second of August wherever the browser thinks it is,
 *  and anything unparseable comes back as it went in rather than as
 *  "Invalid Date". */
export function fmtDate(iso) {
  const t = Date.parse(String(iso ?? ""));
  if (!Number.isFinite(t)) return String(iso ?? "");
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** What this lot's boundary actually is. */
export function lotOrigin(lot) {
  if (!lot || lot.kind !== "poly") return "typed";
  const o = typeof lot.origin === "string" ? lot.origin : "";
  if (o === "traced" || o === "cadastre" || o === "cadastre-adjusted") return o;
  // A polygon was never typed; and before this existed, the only polygon the
  // tool could produce was a fetched one.
  return lot.source ? "cadastre" : "traced";
}

/** What a boundary becomes once a hand has been on it. A fetched lot stops
 *  being the fetched lot; everything else is simply hand-drawn. */
export function nextLotOrigin(origin) {
  return origin === "cadastre" || origin === "cadastre-adjusted"
    ? "cadastre-adjusted" : "traced";
}

/** The Lot boundary row in the printed title block — what the boundary is and
 *  where it came from, in the words the block has room for. Empty for a typed
 *  rectangle, which the block already states as a width and a depth. */
export function boundaryRow(lot) {
  const o = lotOrigin(lot);
  if (o === "typed") return "";
  if (o === "traced") return "Drawn by hand by the applicant — not a surveyed boundary";
  const id = lot && lot.lotId ? `${lot.lotId} — ` : "";
  const src = (lot && lot.source) || SOURCE_FALLBACK;
  const got = lot && lot.fetched ? `, retrieved ${fmtDate(lot.fetched)}` : "";
  // The row has one line of the title block to say this in. What "adjusted by
  // hand" means in full is the footer's job, directly underneath.
  return o === "cadastre"
    ? `${id}${src}${got}`
    : `${id}${src}${got} — adjusted by hand`;
}

/** The footer on the printed sheet. Four wordings for four provenances, and
 *  the two that name the cadastre are the only two allowed to. */
export function boundaryFooter(lot) {
  const o = lotOrigin(lot);
  const src = (lot && lot.source) || SOURCE_FALLBACK;
  const on = lot && lot.fetched ? ` on ${fmtDate(lot.fetched)}` : "";
  if (o === "cadastre") {
    return "Prepared by the applicant using the CFBA plan tool. The lot " +
      `boundary is taken from ${src}${on}: cadastral boundaries are indicative ` +
      "and can sit a metre or more from the surveyed pegs. Structures, " +
      "dimensions and the nominated frontage are as entered by the applicant. " +
      "Not a certified document and not a survey.";
  }
  if (o === "cadastre-adjusted") {
    // Kept to four printed lines, like the untouched-cadastre wording it sits
    // beside. A fifth line spilled a deep lot onto a second sheet, and a site
    // plan that runs to two pages is a site plan somebody loses half of.
    return "Prepared by the applicant using the CFBA plan tool. The lot " +
      `boundary came from ${src}${on} and the applicant has since adjusted it ` +
      "by hand — what is drawn is their own measurement, not that record. " +
      "Everything else on this plan is as entered by the applicant. Not a " +
      "certified document and not a survey.";
  }
  if (o === "traced") {
    return "Prepared by the applicant using the CFBA plan tool. The lot " +
      "boundary was drawn by hand by the applicant and is not taken from a " +
      "survey or from any land record — boundaries and dimensions are as " +
      "entered by the applicant. Not a certified document and not a survey.";
  }
  return "Prepared by the applicant using the CFBA plan tool — boundaries and " +
    "dimensions as entered by the applicant. Not a certified document and not " +
    "a survey.";
}

/** The same four states said on screen, in the portal's own voice. */
export function lotOriginNote(lot) {
  const o = lotOrigin(lot);
  const src = (lot && lot.source) || SOURCE_FALLBACK;
  const got = lot && lot.fetched ? `, fetched ${fmtDate(lot.fetched)}` : "";
  if (o === "cadastre") return `${src}${got}. ${LOT_INDICATIVE}`;
  if (o === "cadastre-adjusted") {
    return `${src}${got} — and you've moved it by hand since, so it isn't ` +
      "what the State holds any more. It's your own measurement now, and the " +
      "printed plan says so.";
  }
  if (o === "traced") {
    return "You drew this boundary yourself, so it's your own measurement " +
      "rather than a survey — worth checking anything tight. The printed plan " +
      "says where it came from.";
  }
  return "A typed rectangle. Drag its corners or edges on the plan to match " +
    "the photo, or trace the lot over the aerial.";
}

// ---------------------------------------------------------------------------
// Editing the boundary by hand.
//
// The cadastre draws the lot that is actually there — when it has it. A great
// many Perth lots aren't in it yet, and a typed 19 × 40 rectangle is nobody's
// real block. So the outline has to be editable: drag a corner, drag a whole
// edge, add one, take one away, or lay it out from scratch over the photo.
//
// Everything here works on the outline and nothing else. The rules it keeps:
//
//   • the outline never crosses itself — a fold is refused and the last
//     honest shape stands,
//   • it never drops below three corners,
//   • the drawing's origin stays the outline's top-left, so an edit that grows
//     the lot upward or leftward reports the shift it made and the caller
//     carries the structures and the photo along with it — nothing jumps,
//   • and a boundary that has been touched by hand says so.
// ---------------------------------------------------------------------------

/** A dragged boundary lands on tenths of a metre — the precision anybody
 *  actually measures a block to. */
export const LOT_STEP_M = 0.1;
/** How close a dragged corner has to come to another corner's line before it
 *  pulls level with it. Same threshold the structures already use. */
export const LOT_ALIGN_M = 0.3;
/** How near square a corner has to land before it is squared off. Most Perth
 *  lots are rectangular but photographed at an angle, so this saves the
 *  fiddling that would otherwise be the whole job. */
export const LOT_SQUARE_TOL_DEG = 2.5;
export const LOT_MIN_CORNERS = 3;

const clampN = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Re-anchor an edited outline at the origin and report the shift it took, so
 *  the caller can carry the structures (and the aerial) with it. */
export function reanchorLot(pts) {
  const b = polyBounds(pts);
  const dx = -b.minX, dy = -b.minY;
  return {
    pts: pts.map((p) => ({ x: r4(p.x + dx), y: r4(p.y + dy) })),
    dx: r4(dx), dy: r4(dy),
    w: r4(b.maxX - b.minX), d: r4(b.maxY - b.minY),
  };
}

/** Is this outline exactly what the typed width and depth fields describe —
 *  a plain axis-aligned rectangle at the origin, wound from the top-left? */
export function isRectLot(pts, tol = 1e-4) {
  if (!Array.isArray(pts) || pts.length !== 4) return false;
  const b = polyBounds(pts);
  if (Math.abs(b.minX) > tol || Math.abs(b.minY) > tol) return false;
  if (!(b.maxX > tol) || !(b.maxY > tol)) return false;
  const want = rectLotPts(b.maxX, b.maxY);
  return pts.every((p, i) =>
    Math.abs(p.x - want[i].x) <= tol && Math.abs(p.y - want[i].y) <= tol);
}

/** Pull a dragged corner level with the lot's other corners, one axis at a
 *  time, and report the dashed guide to draw along each match. */
export function cornerAlign(pts, i, x, y, threshold = LOT_ALIGN_M) {
  let bx = null, by = null;
  for (let j = 0; j < pts.length; j++) {
    if (j === i) continue;
    const p = pts[j];
    const dx = p.x - x;
    if (Math.abs(dx) <= threshold && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, p };
    const dy = p.y - y;
    if (Math.abs(dy) <= threshold && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, p };
  }
  const nx = r4(bx ? x + bx.d : x);
  const ny = r4(by ? y + by.d : y);
  const guides = [];
  if (bx) {
    guides.push({
      axis: "x", at: r4(bx.p.x),
      from: Math.min(ny, bx.p.y), to: Math.max(ny, bx.p.y),
    });
  }
  if (by) {
    guides.push({
      axis: "y", at: r4(by.p.y),
      from: Math.min(nx, by.p.x), to: Math.max(nx, by.p.x),
    });
  }
  return { x: nx, y: ny, guides };
}

/** Square a corner that landed nearly square, or null if it didn't.
 *
 *  The corners at which the angle to the two neighbours is exactly a right
 *  angle are the circle with those neighbours as its diameter — Thales — so
 *  squaring is a push the short way onto that circle, which moves the corner
 *  as little as it possibly can. */
export function squareCorner(pts, i, p, tolDeg = LOT_SQUARE_TOL_DEG) {
  const n = pts.length;
  if (!(n >= 3)) return null;
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  const u = { x: a.x - p.x, y: a.y - p.y }, v = { x: b.x - p.x, y: b.y - p.y };
  const lu = Math.hypot(u.x, u.y), lv = Math.hypot(v.x, v.y);
  if (lu < 1e-6 || lv < 1e-6) return null;
  const cos = clampN((u.x * v.x + u.y * v.y) / (lu * lv), -1, 1);
  const deg = (Math.acos(cos) * 180) / Math.PI;
  if (Math.abs(deg - 90) > tolDeg) return null;
  const c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  const dx = p.x - c.x, dy = p.y - c.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6 || r < 1e-6) return null;
  return { x: r4(c.x + (dx / len) * r), y: r4(c.y + (dy / len) * r) };
}

/** Move one corner. Snapping is the grid, then the other corners' lines, then
 *  square — in that order, each a smaller correction than the last. Hold Alt
 *  (snap: false) and none of it happens. A move that would fold the lot comes
 *  back null and the caller keeps the shape it had. */
export function moveLotCorner(pts, i, x, y, {
  snap: doSnap = true, step = LOT_STEP_M, threshold = LOT_ALIGN_M,
  squareTol = LOT_SQUARE_TOL_DEG, bounds = null,
} = {}) {
  if (!Array.isArray(pts) || pts.length < 3) return null;
  if (!(i >= 0 && i < pts.length)) return null;
  let p = { x, y };
  if (bounds) {
    p = { x: clampN(p.x, bounds.minX, bounds.maxX), y: clampN(p.y, bounds.minY, bounds.maxY) };
  }
  let guides = [], squared = false;
  if (doSnap) {
    p = { x: snap(p.x, step), y: snap(p.y, step) };
    const al = cornerAlign(pts, i, p.x, p.y, threshold);
    p = { x: al.x, y: al.y };
    guides = al.guides;
    // The angle is the whole gate: pushing onto the Thales circle is by
    // construction the smallest move that squares the corner, so a couple of
    // degrees of tolerance is already a couple of degrees of travel.
    const sq = squareCorner(pts, i, p, squareTol);
    if (sq) { p = sq; squared = true; }
  }
  const next = pts.map((q, j) => (j === i ? { x: r4(p.x), y: r4(p.y) } : { x: q.x, y: q.y }));
  if (!isSimplePolygon(next)) return null;
  return { pts: next, guides, squared };
}

/** How far a point may travel along a unit vector and stay inside a box. */
function travelRange(q, nx, ny, b) {
  let lo = -Infinity, hi = Infinity;
  const axis = (v, n, min, max) => {
    if (Math.abs(n) < 1e-9) return;
    const t1 = (min - v) / n, t2 = (max - v) / n;
    lo = Math.max(lo, Math.min(t1, t2));
    hi = Math.min(hi, Math.max(t1, t2));
  };
  axis(q.x, nx, b.minX, b.maxX);
  axis(q.y, ny, b.minY, b.maxY);
  return { lo, hi };
}

/** Move a whole edge, keeping it straight and parallel to where it was: both
 *  its ends travel together along the boundary's own outward normal, so the
 *  two edges either side stretch and the edge itself doesn't turn. */
export function moveLotEdge(pts, i, x, y, {
  snap: doSnap = true, step = LOT_STEP_M, bounds = null,
} = {}) {
  const n = Array.isArray(pts) ? pts.length : 0;
  if (n < 3 || !(i >= 0 && i < n)) return null;
  const e = lotEdges(pts)[i];
  if (!(e.length > 1e-9)) return null;
  const j = (i + 1) % n;
  let t = (x - e.mid.x) * e.nx + (y - e.mid.y) * e.ny;
  if (doSnap) {
    // An upright or level boundary lands on the grid itself, so a typed
    // 19 m lot dragged wider reads 19.4 and not 19.37.
    if (Math.abs(e.nx) > 0.999) t = (snap(pts[i].x + e.nx * t, step) - pts[i].x) / e.nx;
    else if (Math.abs(e.ny) > 0.999) t = (snap(pts[i].y + e.ny * t, step) - pts[i].y) / e.ny;
    else t = snap(t, step);
  }
  if (bounds) {
    const a = travelRange(pts[i], e.nx, e.ny, bounds);
    const b = travelRange(pts[j], e.nx, e.ny, bounds);
    t = clampN(t, Math.max(a.lo, b.lo), Math.min(a.hi, b.hi));
  }
  const next = pts.map((q, k) => (k === i || k === j
    ? { x: r4(q.x + e.nx * t), y: r4(q.y + e.ny * t) }
    : { x: q.x, y: q.y }));
  if (!isSimplePolygon(next)) return null;
  return { pts: next, offset: r4(t) };
}

/** Put a new corner on a boundary — at the point given, or at its middle.
 *  The frontage travels with it: boundaries after the split shift up one. */
export function addLotCorner(pts, edge, at = null, frontage = 0) {
  const n = Array.isArray(pts) ? pts.length : 0;
  if (n < 3) return null;
  const i = ((Math.round(edge) % n) + n) % n;
  const a = pts[i], b = pts[(i + 1) % n];
  const on = at && Number.isFinite(at.x) && Number.isFinite(at.y)
    ? closestOnSegment(a, b, at)
    : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  // A corner dropped on top of an existing one can never be grabbed again —
  // keep it a fifth of the boundary clear of either end.
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (!(len > 1e-6)) return null;
  const t = clampN(((on.x - a.x) * (b.x - a.x) + (on.y - a.y) * (b.y - a.y)) / (len * len), 0.2, 0.8);
  const p = { x: r4(a.x + (b.x - a.x) * t), y: r4(a.y + (b.y - a.y) * t) };
  const next = [...pts.slice(0, i + 1), p, ...pts.slice(i + 1)];
  if (!isSimplePolygon(next)) return null;
  const f = ((Math.round(frontage) % n) + n) % n;
  return { pts: next, frontage: f > i ? f + 1 : f };
}

/** Take a corner out. Never below three — the caller says so gently rather
 *  than the outline quietly collapsing. Removing a corner merges the two
 *  boundaries either side of it, and the frontage follows the merge. */
export function removeLotCorner(pts, i, frontage = 0) {
  const n = Array.isArray(pts) ? pts.length : 0;
  if (n <= LOT_MIN_CORNERS) return null;
  const k = ((Math.round(i) % n) + n) % n;
  const next = pts.filter((_, j) => j !== k).map((p) => ({ x: p.x, y: p.y }));
  if (!isSimplePolygon(next)) return null;
  let f = ((Math.round(frontage) % n) + n) % n;
  if (f === k) f = (k - 1 + n) % n;
  if (f > k) f -= 1;
  const m = n - 1;
  return { pts: next, frontage: ((f % m) + m) % m };
}

/** Which boundary of a hand-drawn outline faces the street. The tool has
 *  always drawn the road along the bottom of the sheet, so the boundary
 *  nearest it, facing it, is the opening offer — tapping any other overrules
 *  it exactly as it does for a fetched lot. */
export function frontageFacingStreet(pts) {
  const es = lotEdges(pts);
  let best = 0, bestY = -Infinity;
  for (const e of es) {
    if (e.ny > 0.2 && e.mid.y > bestY + 1e-9) { bestY = e.mid.y; best = e.i; }
  }
  if (bestY > -Infinity) return best;
  let bestN = -Infinity;
  for (const e of es) if (e.ny > bestN + 1e-9) { bestN = e.ny; best = e.i; }
  return best;
}

/** The ground ring behind an edited outline: plan metres carried back to
 *  lat/lng through the same anchor point and bearing the parcel was laid out
 *  with. It exactly inverts cadastre.ringToPlan, so a lot that has been
 *  adjusted by hand can still be turned onto another frontage without the
 *  adjustment being thrown away. No known ground point, no ring — which is
 *  every lot drawn freehand with no photo behind it. */
export function lotRingFromPts(lot) {
  if (!lot || !Array.isArray(lot.pts) || lot.pts.length < 3) return [];
  const a = lot.anchor;
  if (!a || !Number.isFinite(a.x) || !Number.isFinite(a.y)) return [];
  if (!Number.isFinite(lot.lat) || !Number.isFinite(lot.lng)) return [];
  const deg = Number.isFinite(lot.north) ? lot.north : 0;
  return lot.pts.map((p) => {
    const g = planToGroundVector(p.x - a.x, p.y - a.y, deg);
    const ll = offsetLatLng(lot.lat, lot.lng, g.east, g.north);
    return [ll.lat, ll.lng];
  });
}

/** Keep the aerial photo exactly where it sits while the lot around it
 *  changes shape. The photo hangs off one ground point; this works out the
 *  nudge that leaves that point on the same patch of drawing it was on
 *  before, so a boundary edit never slides the imagery off the block. */
export function holdUnderlayAnchor(u, before, after, shift = { dx: 0, dy: 0 }) {
  const was = underlayAnchor(
    before.lotW, before.lotD, u ? u.offsetX : 0, u ? u.offsetY : 0, before.base ?? null,
  );
  const now = underlayAnchor(after.lotW, after.lotD, 0, 0, after.base ?? null);
  const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
  return {
    offsetX: r3(was.x + (shift.dx ?? 0) - now.x),
    offsetY: r3(was.y + (shift.dy ?? 0) - now.y),
  };
}

/**
 * Apply an edited outline to a lot.
 *
 * One door for every edit — a dragged corner, a dragged edge, a corner added
 * or taken away, or a whole outline traced over the photo. It re-anchors the
 * outline at the origin, reports the shift so the structures travel with it,
 * re-derives the ground ring where there is one to derive, and settles the
 * provenance: a typed rectangle that is still a rectangle stays typed, and
 * anything else that has been touched by hand says so from here on.
 *
 * Null for an outline that crosses itself — the caller keeps what it had.
 */
export function applyLotEdit(lot, pts, { origin = null, frontage = null, reset = false } = {}) {
  if (!isSimplePolygon(pts)) return null;
  const re = reanchorLot(pts);
  const lotW = Math.max(Math.ceil(re.w * 100) / 100, 1);
  const lotD = Math.max(Math.ceil(re.d * 100) / 100, 1);
  const was = lotOrigin(lot);
  const next = origin
    || (was === "typed" && isRectLot(re.pts) ? "typed" : nextLotOrigin(was));
  const shift = { dx: re.dx, dy: re.dy };
  // Back to a plain rectangle: nothing left worth recording, and the width
  // and depth fields come back as the precise path.
  if (next === "typed") return { lot: sanitiseLot(undefined), lotW, lotD, shift };
  const base = reset ? sanitiseLot(undefined) : (lot && typeof lot === "object" ? lot : {});
  const n = re.pts.length;
  const f = frontage === null
    ? ((Math.round(reset ? 0 : lotFrontage(lot)) % n) + n) % n
    : ((Math.round(frontage) % n) + n) % n;
  const a = base.anchor;
  const anchor = !reset && a && Number.isFinite(a.x) && Number.isFinite(a.y)
    ? { x: r4(a.x + re.dx), y: r4(a.y + re.dy) } : null;
  const built = sanitiseLot({
    ...base, kind: "poly", pts: re.pts, frontage: f, origin: next, anchor,
    ring: [],
  });
  // The ring is re-derived from the outline that is actually drawn, never
  // carried over — a stale ring would put the old shape back the moment
  // somebody chose a different frontage.
  return { lot: { ...built, ring: lotRingFromPts(built) }, lotW, lotD, shift };
}

/** A short undo stack. Boundary dragging is fiddly and an accidental drag
 *  needs a way back; oldest entries fall off the bottom. */
export function pushHistory(stack, entry, cap = 20) {
  const s = Array.isArray(stack) ? stack : [];
  return [...s, entry].slice(-Math.max(1, cap));
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

/**
 * Is a stored street name really just a copy of the address, rather than a
 * street somebody typed?
 *
 * A design saved before deriveStreet existed holds the WHOLE address in the
 * street field. That is not what the derived street would be, so the old test
 * read it as a hand-edit, refused to re-derive, and the sheet carried
 * "24 Narranbee Ridge" as its street frontage for good — a field saying the
 * same words as the one above it.
 *
 * Two things give a copy away: it IS the address, or it still carries a street
 * number or a lot/unit marker, which no street name does. Anything else is the
 * client's own word and is left exactly alone — including the corner lot whose
 * frontage is a different street from the one in its address, which is the
 * whole reason the field exists.
 */
export function streetLooksCopied(street, address) {
  const s = String(street ?? "").trim().replace(/\s+/g, " ");
  if (!s) return false;
  const a = String(address ?? "").trim().replace(/\s+/g, " ");
  if (a && s.toLowerCase() === a.toLowerCase()) return true;
  // Still a number, a Lot, a unit — or still dragging a suburb behind it.
  return deriveStreet(s) !== s;
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
// Distances between structures.
//
// Setbacks measure to the lot boundaries. The other half of the question is
// what sits between the buildings: separation between one building and the
// next, and how far a pool is from the things around it. Both are things an
// assessor measures off the sheet, and both are currently absent from it.
//
// This measures and it does not judge — that has been true of every number
// this file produces and it does not change here. A distance is reported. What
// it means is assessment's call.
//
// The measurement is the shortest distance between the two OUTLINES, never
// centre to centre, so a long shed sitting alongside a house reports the gap
// you could walk through and not the distance between two abstract points.
// ---------------------------------------------------------------------------

/** Do two segments properly cross — interiors meeting? An end touching the
 *  other segment, or the two lying along each other, is not a crossing. */
function segmentsProperlyCross(p1, p2, p3, p4) {
  const o1 = orient(p1, p2, p3), o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1), o4 = orient(p3, p4, p2);
  return o1 !== o2 && o3 !== o4 && o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0;
}

/** Where two properly crossing segments meet. */
function segmentCrossPoint(p1, p2, p3, p4) {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-12) return null;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  return { x: r4(p1.x + t * (p2.x - p1.x)), y: r4(p1.y + t * (p2.y - p1.y)) };
}

/** The first point at which the two outlines cross, or null. */
function firstCross(a, b) {
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i], a2 = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j], b2 = b[(j + 1) % b.length];
      if (segmentsProperlyCross(a1, a2, b1, b2)) {
        const p = segmentCrossPoint(a1, a2, b1, b2);
        if (p) return p;
      }
    }
  }
  return null;
}

/**
 * The shortest distance between two closed outlines, and the pair of points
 * that achieves it — which is where the dimension line goes.
 *
 * Three relationships, one honest answer each:
 *
 *   apart      — the gap, corner-to-side or corner-to-corner, both ways round.
 *   touching   — zero. Sharing a wall is a gap of nothing, not a negative one.
 *   overlapping— zero as well, marked `overlap` so the drawing can say so, and
 *                the point given is inside the ground they share rather than
 *                on some far outline. One shape wholly inside another is
 *                overlapping too, however far apart their outlines run.
 *
 * `overlap` is a hint for the drawing. `d` is the measurement, and it is right
 * in every one of the three cases.
 */
export function polyDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 3 || b.length < 3) {
    return { d: 0, from: { x: 0, y: 0 }, to: { x: 0, y: 0 }, overlap: false };
  }
  const cross = firstCross(a, b);
  if (cross) return { d: 0, from: cross, to: cross, overlap: true };
  // Neither outline crosses the other, so either they are apart, they touch,
  // or one is wholly inside the other — and the last of those is the one the
  // outline-to-outline distance would get wrong.
  const aInB = polygonInside(a, b), bInA = polygonInside(b, a);
  if (aInB || bInA) {
    const c = polygonCentroid(aInB ? a : b);
    return { d: 0, from: c, to: c, overlap: true };
  }
  let best = { d: Infinity, from: a[0], to: b[0] };
  const scan = (P, Q, flip) => {
    for (const p of P) {
      for (let i = 0; i < Q.length; i++) {
        const on = closestOnSegment(Q[i], Q[(i + 1) % Q.length], p);
        const d = Math.hypot(p.x - on.x, p.y - on.y);
        if (d < best.d) best = flip ? { d, from: on, to: p } : { d, from: p, to: on };
      }
    }
  };
  scan(a, b, false);
  scan(b, a, true);
  return {
    d: r4(best.d),
    from: { x: r4(best.from.x), y: r4(best.from.y) },
    to: { x: r4(best.to.x), y: r4(best.to.y) },
    overlap: false,
  };
}

/** The gap between two structures — outlines, rotation and all. */
export function structureGap(s1, s2) {
  return polyDistance(footprint(s1), footprint(s2));
}

// --- which distances to show ------------------------------------------------
//
// A lot with six structures on it has fifteen distances between them, and a
// sheet carrying all fifteen is a mesh of lines nobody can read. So there is a
// rule, and it is deliberately narrow:
//
//   on screen — the nearest few, and only those within a short reach. If
//               nothing is within reach the single nearest still shows, so
//               selecting a shed on a big block always answers "what's my
//               closest neighbour" rather than showing nothing at all.
//   on paper  — what the client pinned, plus each proposed structure's
//               distance to its nearest existing ones. Never the whole mesh.

/** How far apart two structures can be before the distance stops being drawn
 *  automatically. Six metres covers the gaps that get measured on these jobs;
 *  anything further is a pin away. */
export const GAP_NEAR_M = 6;
/** Most distances drawn at once from one selected structure. */
export const GAP_SHOW_LIMIT = 3;
/** Most existing neighbours dimensioned automatically per proposed structure
 *  on the printed sheet. */
export const GAP_PRINT_LIMIT = 2;
/** A sheet's worth of pinned dimensions, and no more. */
export const PIN_CAP = 24;

/** The distances to show from one selected structure: nearest first, only
 *  those within reach, capped — and never an empty list while there is another
 *  structure on the lot. */
export function nearbyGaps(target, others, {
  limit = GAP_SHOW_LIMIT, within = GAP_NEAR_M,
} = {}) {
  if (!target) return [];
  const all = (Array.isArray(others) ? others : [])
    .filter((o) => o && o.id !== target.id)
    .map((o) => ({ id: o.id, ...structureGap(target, o) }))
    // Ties broken on id so the same lot always draws the same lines.
    .sort((p, q) => p.d - q.d || String(p.id).localeCompare(String(q.id)));
  const near = all.filter((g) => g.d <= within).slice(0, Math.max(0, limit));
  return near.length ? near : all.slice(0, 1);
}

/** One key for a pair of structures, whichever way round it is named. */
export function pairKey(a, b) {
  const x = String(a ?? ""), y = String(b ?? "");
  return x <= y ? `${x}|${y}` : `${y}|${x}`;
}

/** Pin a distance, or take the pin out again. A pinned dimension is part of
 *  the drawing and prints; an unpinned one is a screen aid. */
export function togglePin(pins, a, b) {
  const list = sanitisePins(pins);
  if (!a || !b || String(a) === String(b)) return list;
  const key = pairKey(a, b);
  const kept = list.filter((p) => pairKey(p[0], p[1]) !== key);
  if (kept.length !== list.length) return kept;
  const [x, y] = String(a) <= String(b) ? [String(a), String(b)] : [String(b), String(a)];
  return [...kept, [x, y]].slice(-PIN_CAP);
}

export function isPinned(pins, a, b) {
  const key = pairKey(a, b);
  return sanitisePins(pins).some((p) => pairKey(p[0], p[1]) === key);
}

/** The pins as they are stored on a design: proper pairs, in a settled order,
 *  no duplicates, and — when the structure ids are given — nothing pointing at
 *  a structure that has since been removed. A design saved before pinning
 *  existed has none, which is exactly what this returns for it. */
export function sanitisePins(raw, ids = null) {
  const ok = ids ? new Set([...ids].map(String)) : null;
  const seen = new Set();
  const out = [];
  for (const p of Array.isArray(raw) ? raw : []) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const a = String(p[0] ?? ""), b = String(p[1] ?? "");
    if (!a || !b || a === b) continue;
    if (ok && (!ok.has(a) || !ok.has(b))) continue;
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a <= b ? [a, b] : [b, a]);
  }
  return out.slice(0, PIN_CAP);
}

/**
 * What the printed sheet carries: every pinned dimension, plus each proposed
 * structure's distance to its nearest existing neighbours.
 *
 * That second half is the dimension an assessor goes looking for — how far the
 * new patio sits from the house that is already there — and it is only
 * derivable because every structure says which it is. It is capped per
 * proposed structure and bounded by the same reach the screen uses, so the
 * sheet never becomes the full mesh.
 *
 * A design with nothing pinned and nothing marked existing prints exactly what
 * it printed before any of this existed: no gap dimensions at all.
 */
export function printedGaps(structures, pins = [], {
  limit = GAP_PRINT_LIMIT, within = GAP_NEAR_M,
} = {}) {
  const list = (Array.isArray(structures) ? structures : []).filter((s) => s && s.id);
  const by = new Map(list.map((s) => [String(s.id), s]));
  const rows = new Map();
  const add = (s1, s2, pinned) => {
    if (!s1 || !s2 || String(s1.id) === String(s2.id)) return;
    const key = pairKey(s1.id, s2.id);
    const was = rows.get(key);
    if (was) { if (pinned) was.pinned = true; return; }
    rows.set(key, {
      a: String(s1.id), b: String(s2.id), pinned, ...structureGap(s1, s2),
    });
  };
  // The client's own dimensions come first — they are the drawing.
  for (const [x, y] of sanitisePins(pins, list.map((s) => s.id))) {
    add(by.get(x), by.get(y), true);
  }
  const existing = list.filter((s) => structureState(s) === "existing");
  for (const s of list) {
    if (structureState(s) !== "proposed") continue;
    for (const g of nearbyGaps(s, existing, { limit, within })) {
      add(s, by.get(String(g.id)), false);
    }
  }
  return [...rows.values()];
}

// ---------------------------------------------------------------------------
// Existing or proposed.
//
// A site plan that doesn't say which buildings are already there and which are
// being applied for isn't a site plan — it is a picture of a block with some
// rectangles on it. So every structure carries a state, and the drawing shows
// it without relying on colour, because these sheets get printed in black and
// white and faxed, photocopied and scanned before anybody assesses them.
//
// Proposed is the default. Every design saved before this existed loads as
// proposed and draws exactly as it always did.
// ---------------------------------------------------------------------------
export const STRUCTURE_STATES = ["proposed", "existing"];

/** A structure's state, read defensively. Anything that isn't the word
 *  "existing" is proposed — which is every structure saved before today. */
export function structureState(s) {
  return s && s.state === "existing" ? "existing" : "proposed";
}

/** The other one — what a single tap on the toggle gives you. */
export function toggleState(state) {
  return state === "existing" ? "proposed" : "existing";
}

// ---------------------------------------------------------------------------
// The six v1 presets. Default sizes are typical, not recommendations — every
// dimension is editable the moment the structure lands.
//
// The dwelling lands as EXISTING and everything else as proposed. The bulk of
// this firm's work is a patio, a shed, a pool or a carport going onto a house
// that is already there, so that is one less tap in the common case — and the
// toggle sits at the top of the structure's own panel for the new builds.
// ---------------------------------------------------------------------------
export const STRUCTURE_PRESETS = [
  { kind: "dwelling", label: "Dwelling", w: 15, d: 10, state: "existing" },
  { kind: "patio", label: "Patio", w: 6, d: 4 },
  { kind: "shed", label: "Shed", w: 3, d: 3 },
  { kind: "pool", label: "Pool", w: 8, d: 4 },
  { kind: "carport", label: "Carport", w: 6, d: 3 },
  { kind: "retaining", label: "Retaining Wall", w: 10, d: 0.3 },
];
