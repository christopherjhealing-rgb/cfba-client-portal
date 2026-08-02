// Turning a parcel from the State's cadastre into a lot on the drawing.
//
// Plain ESM on the core.mjs pattern: Node's test runner imports this directly,
// the API route imports it on the server, and SitePlanBuilder imports the same
// single source in the browser. Nothing in here touches the network — the one
// module that does is lib/cadastre-source.ts, and it is deliberately the only
// one, so everything that can be proven without Landgate is proven without
// Landgate.
//
// The job, in order:
//   1. read a parcel out of whatever the service hands back (GeoJSON from an
//      ArcGIS `f=geojson` query or a WFS, or Esri JSON from a plain one),
//   2. tidy the ring — duplicate and collinear vertices, no simplification
//      that could eat a battleaxe leg,
//   3. work out which boundary is the street,
//   4. lay the parcel on the sheet with that boundary along the bottom, which
//      falls out as the sheet's true north for free.
//
// A cadastral boundary is INDICATIVE. In parts of Perth it sits a metre or
// more off the surveyed pegs. Every number this file produces is a
// measurement of the State's record, never a statement about the pegs, and
// never a verdict about anything.

import {
  groundToPlanVector, metresBetween, normalisePts, polyBounds, polygonArea,
  polygonCentroid, pointToSegment,
} from "./site-plan.mjs";

const r3 = (v) => Math.round(v * 1000) / 1000 + 0;
const r4 = (v) => Math.round(v * 10000) / 10000 + 0;
const norm360 = (d) => ((d % 360) + 360) % 360;

/** Western Australia, generously boxed. The route refuses anything outside
 *  it: this service answers for one State, and a request for a point in
 *  Sydney (or in the ocean off Africa) is a bug or a probe, not a client. */
export const WA_BBOX = { south: -35.5, north: -13.0, west: 112.0, east: 129.5 };

export function inWA(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= WA_BBOX.south && lat <= WA_BBOX.north &&
    lng >= WA_BBOX.west && lng <= WA_BBOX.east;
}

/** Cache key for one lookup. Five decimal places is about a metre — close
 *  enough that the same address geocoded twice hits the same key, fine
 *  enough that it can never be two different lots. */
export function cadastreKey(lat, lng) {
  return `cadastre:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

// ---------------------------------------------------------------------------
// Reading the service's answer.
//
// Three shapes turn up in the wild and all three are cheap to accept:
//   GeoJSON FeatureCollection  — features[].geometry.coordinates, [lng, lat]
//   Esri JSON                  — features[].geometry.rings,       [x, y]
//   a bare Feature or geometry — the same, one level up
// Accepting all of them means a service that ignores `f=geojson` still works,
// which is one less thing that has to be right first time.
// ---------------------------------------------------------------------------

/** Attribute names the lot and plan numbers might arrive under. Landgate's
 *  cadastre has used several spellings over the years and different SLIP
 *  services expose different ones, so every candidate is tried, case
 *  insensitively. An unknown schema costs the identifier line on the sheet —
 *  never the boundary itself. */
const LOT_KEYS = [
  "lot_number", "lotnumber", "lot_no", "lotno", "survey_lot_no",
  "cad_lot_number", "lot", "landgate_lot_number",
];
const PLAN_KEYS = [
  "plan_number", "plannumber", "plan_no", "planno", "survey_plan_no",
  "cad_plan_number", "plan", "dp_number", "deposited_plan",
];
const ADDRESS_KEYS = [
  "address", "full_address", "formatted_address", "street_address",
  "site_address", "address_text", "land_address",
];
const ID_KEYS = ["land_id", "landid", "polygon_number", "parcel_id", "objectid", "pin"];

function pick(attrs, keys) {
  if (!attrs || typeof attrs !== "object") return "";
  const lower = {};
  for (const [k, v] of Object.entries(attrs)) lower[k.toLowerCase()] = v;
  for (const k of keys) {
    const v = lower[k];
    if (v === null || v === undefined) continue;
    const s = String(v).trim();
    if (s && s.toLowerCase() !== "null") return s;
  }
  return "";
}

/** Outer rings out of a GeoJSON geometry, as [[lng, lat], …]. Holes are
 *  ignored: a lot with a hole in it is not something this tool can draw
 *  honestly, and dropping the hole is more truthful than pretending. */
function geoJsonRings(geom) {
  if (!geom || typeof geom !== "object") return [];
  if (geom.type === "Polygon" && Array.isArray(geom.coordinates)) {
    return geom.coordinates.slice(0, 1);
  }
  if (geom.type === "MultiPolygon" && Array.isArray(geom.coordinates)) {
    return geom.coordinates.map((poly) => (Array.isArray(poly) ? poly[0] : null)).filter(Boolean);
  }
  return [];
}

/** Ring area in square degrees — only ever used to pick the biggest part of
 *  a multipart parcel, so the units don't matter, only the ordering. */
function ringSize(ring) {
  return polygonArea((ring || []).map((c) => ({ x: Number(c[0]) || 0, y: Number(c[1]) || 0 })));
}

/**
 * The first usable parcel in a service response.
 * Returns `{ ring, lotId, address }` with the ring as [[lat, lng], …], or
 * null when there is nothing in there — which is the ordinary answer for a
 * new subdivision that the cadastre hasn't caught up with yet.
 */
export function parseParcel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const features = Array.isArray(raw.features) ? raw.features
    : raw.type === "Feature" ? [raw]
    : raw.geometry || raw.rings || raw.coordinates ? [raw]
    : [];
  for (const f of features) {
    if (!f || typeof f !== "object") continue;
    const attrs = f.properties && typeof f.properties === "object" ? f.properties
      : f.attributes && typeof f.attributes === "object" ? f.attributes
      : {};
    const geom = f.geometry && typeof f.geometry === "object" ? f.geometry : f;
    // Esri JSON keeps its rings on the geometry; GeoJSON has a typed shape.
    const rings = Array.isArray(geom.rings) && geom.rings.length
      ? geom.rings
      : geoJsonRings(geom);
    if (!rings.length) continue;
    // Multipart parcel: the biggest part is the lot, the rest are slivers.
    const ring = rings.slice().sort((a, b) => ringSize(b) - ringSize(a))[0];
    const latLng = (ring || [])
      .filter((c) => Array.isArray(c) && c.length >= 2)
      .map((c) => [Number(c[1]), Number(c[0])])       // [lng, lat] → [lat, lng]
      .filter((c) => Number.isFinite(c[0]) && Number.isFinite(c[1]));
    if (latLng.length < 3) continue;
    const lot = pick(attrs, LOT_KEYS);
    const plan = pick(attrs, PLAN_KEYS);
    const id = pick(attrs, ID_KEYS);
    const lotId = lot && plan ? `Lot ${lot} on Plan ${plan}`
      : lot ? `Lot ${lot}`
      : plan ? `Plan ${plan}`
      : id ? `Parcel ${id}` : "";
    return { ring: latLng, lotId, address: pick(attrs, ADDRESS_KEYS) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Tidying the ring.
//
// Cadastral rings repeat their first corner at the end, and often carry
// vertices that are on the line between their neighbours — an artefact of how
// the parcel was captured, not a corner anybody surveyed. Both are removed.
//
// What is NOT removed is anything with real geometry in it. The tolerance is
// twenty millimetres, which is far below any corner a battleaxe leg turns, so
// a flag lot keeps its access leg and measures it. Simplification that
// "cleans up" a lot into a neat quadrilateral would be the single worst thing
// this feature could do.
// ---------------------------------------------------------------------------

const COLLINEAR_TOL_M = 0.02;

/** Rough local metres between two [lat, lng] points — good to a fraction of
 *  a percent over a lot, which is all the collinearity test needs. */
function roughMetres(a, b) {
  const midLat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  return {
    x: (b[1] - a[1]) * 111320 * Math.cos(midLat),
    y: (b[0] - a[0]) * 110540,
  };
}

export function dedupeRing(ring) {
  const pts = (Array.isArray(ring) ? ring : [])
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const out = [];
  const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-7 && Math.abs(a[1] - b[1]) < 1e-7;
  for (const p of pts) {
    if (out.length && same(out[out.length - 1], p)) continue;
    out.push(p);
  }
  // The closing repeat of the first corner.
  while (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
  if (out.length < 3) return out;
  // Collinear removal: a corner that sits on the line between its two
  // neighbours was never a corner. Twenty millimetres of tolerance, and the
  // ring never drops below a triangle.
  const keep = out.slice();
  let i = 0;
  while (keep.length > 3 && i < keep.length) {
    const prev = keep[(i - 1 + keep.length) % keep.length];
    const next = keep[(i + 1) % keep.length];
    const v = roughMetres(prev, next);
    const w = roughMetres(prev, keep[i]);
    const base = Math.hypot(v.x, v.y);
    const off = base > 1e-9 ? Math.abs(v.x * w.y - v.y * w.x) / base : Infinity;
    if (off < COLLINEAR_TOL_M) keep.splice(i, 1);
    else i++;
  }
  return keep;
}

/** Mean corner of a ring, as a lat/lng. The tangent plane for everything
 *  below is taken here, so it sits in the middle of the parcel and the
 *  approximation is at its best across the whole lot. */
export function ringCentroid(ring) {
  const n = ring.length || 1;
  return {
    lat: ring.reduce((s, p) => s + p[0], 0) / n,
    lng: ring.reduce((s, p) => s + p[1], 0) / n,
  };
}

/** The ring in local ground metres — east and north from its own centre. */
export function ringToGround(ring, origin = ringCentroid(ring)) {
  return ring.map((p) => metresBetween(origin, { lat: p[0], lng: p[1] }));
}

// ---------------------------------------------------------------------------
// Which boundary is the street.
//
// The cadastre does not say — it records parcels, not frontages. Three
// signals, in order of how much they can be trusted:
//
//   1. An access leg. A battleaxe meets the road across the end of its
//      driveway and nowhere else, and a driveway is unmistakable in the
//      geometry: a short edge closing a long, parallel-sided neck. Where one
//      exists it IS the frontage, whatever else we think.
//   2. The address point. Which way it lies from the middle of the lot is a
//      much better signal than how close it is to a boundary — on a 12.5 m
//      wide block a roof point 8 m back from the front is nearer the side
//      fence than the front boundary, so "nearest edge" gets it wrong on the
//      commonest lot in Perth.
//   3. Nothing useful. Then the shortest boundary is the guess, because Perth
//      lots are deeper than they are wide.
//
// It is inference either way. Tapping an edge on the plan overrules it, and
// the sheet never claims the frontage was told to us.
// ---------------------------------------------------------------------------

/** How far off the centre the address point has to be before its direction
 *  means anything. Inside this, it is "somewhere in the lot" and no more. */
const STREET_PT_MIN_OFFSET_M = 2;
/** The widest driveway this counts as an access leg. */
const LEG_MAX_WIDTH_M = 8;
/** How much longer the neck's sides must be than the end it closes. */
const LEG_MIN_RATIO = 4;
/** How parallel the neck's sides must be: cos 20°, in opposite directions. */
const LEG_PARALLEL = -0.94;

/** Outward unit normals for a ring given in a plain 2D frame. */
function outwardNormals(g) {
  const n = g.length;
  const c = polygonCentroid(g);
  return g.map((a, i) => {
    const b = g[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len, ny = dx / len;
    const mx = (a.x + b.x) / 2 - c.x, my = (a.y + b.y) / 2 - c.y;
    if (mx * nx + my * ny < 0) { nx = -nx; ny = -ny; }
    return { nx, ny, len: Math.hypot(dx, dy), ux: dx / len, uy: dy / len };
  });
}

/**
 * The end of an access leg, or -1.
 *
 * A driveway shows up as a short edge whose two neighbours run back the way
 * they came — antiparallel — and are several times longer than it. A splayed
 * corner truncation looks superficially similar and is deliberately excluded:
 * its neighbours meet at a right angle, not head on. The answer only counts
 * when exactly one edge fits, so an ordinary narrow block (whose front and
 * rear both fit the description) falls through to the next signal instead of
 * picking one of them at random.
 */
export function accessLegEdge(g) {
  const n = g.length;
  if (n < 6) return -1;
  const e = outwardNormals(g);
  const found = [];
  for (let i = 0; i < n; i++) {
    const prev = e[(i - 1 + n) % n], next = e[(i + 1) % n];
    if (e[i].len > LEG_MAX_WIDTH_M) continue;
    if (prev.len < e[i].len * LEG_MIN_RATIO || next.len < e[i].len * LEG_MIN_RATIO) continue;
    if (prev.ux * next.ux + prev.uy * next.uy > LEG_PARALLEL) continue;
    found.push(i);
  }
  return found.length === 1 ? found[0] : -1;
}

export function inferFrontage(ring, streetPt = null) {
  const n = ring.length;
  if (n < 3) return 0;
  const origin = ringCentroid(ring);
  const g = ringToGround(ring, origin).map((v) => ({ x: v.east, y: v.north }));

  const leg = accessLegEdge(g);
  if (leg >= 0) return leg;

  const e = outwardNormals(g);
  if (streetPt && Number.isFinite(streetPt.lat) && Number.isFinite(streetPt.lng)) {
    const s = metresBetween(origin, { lat: streetPt.lat, lng: streetPt.lng });
    const p = { x: s.east, y: s.north };
    const c = polygonCentroid(g);
    const vx = p.x - c.x, vy = p.y - c.y;
    const away = Math.hypot(vx, vy);
    if (away >= STREET_PT_MIN_OFFSET_M) {
      let best = 0, bestScore = -Infinity, bestD = Infinity;
      for (let i = 0; i < n; i++) {
        const score = (e[i].nx * vx + e[i].ny * vy) / away;
        const d = pointToSegment(g[i], g[(i + 1) % n], p);
        if (score > bestScore + 1e-9 || (Math.abs(score - bestScore) <= 1e-9 && d < bestD)) {
          bestScore = score; bestD = d; best = i;
        }
      }
      return best;
    }
  }

  let best = 0, bestLen = Infinity;
  for (let i = 0; i < n; i++) {
    if (e[i].len < bestLen - 1e-9) { bestLen = e[i].len; best = i; }
  }
  return best;
}

/**
 * Lay the parcel on the sheet.
 *
 * The chosen boundary goes along the bottom, horizontal, with the lot above
 * it — which is where a site plan puts the street, and where this tool has
 * always drawn it. Everything else follows:
 *
 *   • the sheet's true north falls straight out of that rotation, so the
 *     north arrow is derived rather than guessed at in 45° steps,
 *   • the aerial photo can be turned by the same angle and lands on the lot
 *     with no dragging at all,
 *   • the lot area is the shoelace of the result, in real square metres,
 *     because rotating a polygon doesn't change its area.
 *
 * `anchor` is where the parcel's own centre lands in plan metres. Paired with
 * the lat/lng returned beside it, that is one point whose ground position is
 * known exactly — which is what anchors the photo.
 */
export function ringToPlan(ring, frontage = 0) {
  const n = ring.length;
  const origin = ringCentroid(ring);
  const g = ringToGround(ring, origin);
  const f = ((Math.round(frontage) % n) + n) % n;
  const a = g[f], b = g[(f + 1) % n];
  // Bearing of the frontage, clockwise from north; put it across the page.
  const phi = (Math.atan2(b.east - a.east, b.north - a.north) * 180) / Math.PI;
  let deg = norm360(90 - phi);
  // Two rotations make it horizontal; take the one with the lot above it.
  const c = polygonCentroid(g.map((v) => ({ x: v.east, y: v.north })));
  const mid = { east: (a.east + b.east) / 2, north: (a.north + b.north) / 2 };
  if (groundToPlanVector(c.x - mid.east, c.y - mid.north, deg).dy > 0) {
    deg = norm360(deg + 180);
  }
  const raw = g.map((v) => {
    const q = groundToPlanVector(v.east, v.north, deg);
    return { x: q.dx, y: q.dy };
  });
  const pts = normalisePts(raw);
  const bounds = polyBounds(raw);
  return {
    pts,
    north: r3(deg),
    anchor: { x: r4(-bounds.minX), y: r4(-bounds.minY) },
    lat: origin.lat,
    lng: origin.lng,
    area: r3(polygonArea(pts)),
    width: r4(bounds.maxX - bounds.minX),
    depth: r4(bounds.maxY - bounds.minY),
  };
}

/**
 * The whole thing: a parcel and the point it was found from, in, a lot record
 * ready to sit on a design, out. Null when the ring can't make an honest
 * outline — the caller then does what it does for a lot that isn't on the
 * cadastre at all, which is the ordinary path for a new subdivision.
 */
export function buildLot(parcel, streetPt = null, meta = {}) {
  const ring = dedupeRing(parcel && parcel.ring);
  if (ring.length < 3) return null;
  const frontage = inferFrontage(ring, streetPt);
  const placed = ringToPlan(ring, frontage);
  if (!(placed.area > 1)) return null;      // a sliver is not a lot
  return {
    kind: "poly",
    ring,
    pts: placed.pts,
    frontage,
    north: placed.north,
    anchor: placed.anchor,
    lat: placed.lat,
    lng: placed.lng,
    source: String(meta.source || ""),
    fetched: String(meta.fetched || ""),
    lotId: String((parcel && parcel.lotId) || meta.lotId || ""),
    address: String((parcel && parcel.address) || meta.address || ""),
  };
}

/** Make another boundary the street. The parcel is re-laid from its own
 *  ground ring, so the lot turns on the sheet, north follows it, and the
 *  labels re-derive — nothing is re-measured or re-approximated. A lot with
 *  no ground ring behind it (one traced by hand) keeps its shape and only
 *  the labels move. */
export function reorientLot(lot, frontage) {
  if (!lot || lot.kind !== "poly" || !Array.isArray(lot.pts) || lot.pts.length < 3) return lot;
  const n = lot.pts.length;
  const f = ((Math.round(frontage) % n) + n) % n;
  if (!Array.isArray(lot.ring) || lot.ring.length !== n) return { ...lot, frontage: f };
  const placed = ringToPlan(lot.ring, f);
  return {
    ...lot, frontage: f, pts: placed.pts, north: placed.north,
    anchor: placed.anchor, lat: placed.lat, lng: placed.lng,
  };
}
