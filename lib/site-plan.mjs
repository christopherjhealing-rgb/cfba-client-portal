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
 *  existing structure so repeated clicks don't stack invisibly. */
export function defaultPlacement(w, d, lotW, lotD, count = 0) {
  const stagger = (count % 5) * 1.2;
  const x = snap((lotW - w) / 2 + stagger, 0.05);
  const y = snap((lotD - d) / 2 + stagger, 0.05);
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

/** Where the geocoded point should sit in plan metres: the middle of the lot,
 *  shifted by however far the client has dragged the photo. Geocoding lands
 *  on a rooftop or a driveway, so that nudge is the whole game. */
export function underlayAnchor(lotW, lotD, offsetX = 0, offsetY = 0) {
  return { x: lotW / 2 + offsetX, y: lotD / 2 + offsetY };
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
