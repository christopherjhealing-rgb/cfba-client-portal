export const A4_MM: { w: number; h: number };
export const PAGE_MARGIN_MM: number;
export const TITLE_BLOCK_MM: number;
export const DRAW_MARGIN_MM: { left: number; right: number; top: number; bottom: number };
export const STANDARD_SCALES: number[];

export function planAreaMm(): { w: number; h: number };
export function fitScale(lotW: number, lotD: number): { denom: number; fits: boolean };
export function mmOnPaperToM(mm: number, denom: number): number;
export function mToMmOnPaper(m: number, denom: number): number;
export function scaleBarMetres(denom: number): number;

export function snap(n: number, step?: number): number;
export function clampToLot(
  x: number, y: number, w: number, d: number, lotW: number, lotD: number,
): { x: number; y: number };

export interface Pt {
  x: number;
  y: number;
}

/** Already there, or being applied for. Proposed is the default and is every
 *  structure saved before this existed. */
export type StructureState = "proposed" | "existing";

/** A structure as the geometry sees it: a rectangle by default, an L or a
 *  drawn polygon when `shape` says so. Old saved rectangles carry none of
 *  the optional fields and behave exactly as before. */
export interface StructureShape {
  x: number;
  y: number;
  w: number;
  d: number;
  rot?: number;
  shape?: "rect" | "lshape" | "poly";
  notchW?: number;
  notchD?: number;
  pts?: Pt[];
  state?: StructureState;
  kind?: string;
  patio?: PatioParams;
}

/** A patio's parameters, held only on a structure of kind "patio". Everything
 *  here is optional on disk and defaulted by sanitisePatio — a patio saved
 *  before this existed draws as a plain flat rectangle until it's given a
 *  roof. Sides are the rectangle's own edges, 0 top / 1 right / 2 bottom /
 *  3 left, in the unrotated frame. */
export interface PatioParams {
  mount: "free" | "attached";
  /** Which side abuts the dwelling (attached only). */
  attach: number;
  roof: "flat" | "skillion" | "gable";
  /** Roof pitch in degrees, 0–PATIO_MAX_PITCH. */
  pitch: number;
  /** The low / gutter side (flat, skillion); one eave side (gable). */
  fall: number;
  /** Posts per side, corners included: [top, right, bottom, left]. */
  cols: number[];
  /** Post/eave height in metres. */
  colHeight: number;
  /** How many downpipes the client has placed. */
  downpipes: number;
  /** The chosen soakwell size and count, or null for none. */
  soak: { key: string; count: number } | null;
}

export function setbacks(
  s: StructureShape, lotW: number, lotD: number,
): { left: number; right: number; rear: number; front: number };

export interface SetbackMark {
  v: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export function setbackMarks(
  s: StructureShape, lotW: number, lotD: number,
): { left: SetbackMark; right: SetbackMark; rear: SetbackMark; front: SetbackMark };

export function defaultPlacement(
  w: number, d: number, lotW: number, lotD: number, count?: number,
  centre?: Pt | null,
): { x: number; y: number };

export function normalisePts(pts: Pt[]): Pt[];
export function rotatePts(pts: Pt[], rot: number): Pt[];
export function polyBounds(pts: Pt[]): { minX: number; minY: number; maxX: number; maxY: number };
export function lShapePts(w: number, d: number, notchW: number, notchD: number): Pt[];
export function shapePts(s: StructureShape): Pt[];
export function footprint(s: StructureShape): Pt[];
export function boundsOf(s: StructureShape): { w: number; d: number };
export function polygonArea(pts: Pt[]): number;
export function structureArea(s: StructureShape): number;
export function isSimplePolygon(pts: Pt[]): boolean;
export function polyFromFootprint(
  absPts: Pt[], rot?: number,
): { x: number; y: number; w: number; d: number; pts: Pt[] };
export function rotateStructure(
  s: StructureShape, lotW: number, lotD: number,
): { rot: number; x: number; y: number };

// --- the parametric patio (studio only) ------------------------------------

export const PATIO_ROOFS: PatioParams["roof"][];
export const PATIO_MAX_PITCH: number;
export const PATIO_MAX_COLS: number;
export const GUTTER_M_PER_DOWNPIPE: number;

export function sanitisePatio(raw: unknown): PatioParams;

/** Post positions in lot metres, with the local side each belongs to. */
export interface PatioColumn extends Pt {
  side: number;
}
export function patioColumns(s: StructureShape): PatioColumn[];

/** Which sides carry a gutter, and their total placed length in metres. */
export function patioGutter(s: StructureShape): { sides: number[]; length: number };

export function downpipesNeeded(gutterM: number, perM?: number): number;

/** Eave/ridge heights in metres. `ridge` is the gable peak, or null. */
export function patioRoofHeights(s: StructureShape): {
  type: "flat" | "skillion" | "gable";
  eave: number;
  high: number;
  ridge: number | null;
  rise: number;
};

/** One patio elevation, reduced to what a view needs. `span` is "w" (width
 *  face) or "d" (depth face). */
export interface PatioElevation {
  span: "w" | "d";
  width: number;
  roof: PatioParams["roof"];
  pitch: number;
  eave: number;
  high: number;
  ridge: number | null;
  rise: number;
  /** The roof's slope shows as a true rake in this view (not into the page). */
  slopeInPlane: boolean;
  /** The low (eave) end is at x = 0 rather than x = width. */
  lowAtStart: boolean;
  /** The dwelling wall meets the patio in this view (attached only). */
  attachHere: boolean;
  attachAtStart: boolean;
  /** Post positions across the face, in metres from x = 0. */
  postXs: number[];
}
export function patioElevationProfile(
  s: StructureShape, span: "w" | "d",
): PatioElevation;

// --- the lot, rectangle or polygon -----------------------------------------

export function rectLotPts(lotW: number, lotD: number): Pt[];
export const RECT_FRONTAGE: number;

/** Where a boundary came from. `cadastre-adjusted` is a fetched boundary that
 *  has since been moved by hand — it is never allowed to read as the State's
 *  record, on screen or on the printed sheet. */
export type LotOrigin = "typed" | "traced" | "cadastre" | "cadastre-adjusted";
export const LOT_ORIGINS: LotOrigin[];
export const LOT_INDICATIVE: string;

/** The lot as it is stored on a design. `kind: "rect"` is the default and is
 *  every design saved before the cadastre existed. */
export interface Lot {
  kind: "rect" | "poly";
  /** Corners in plan metres, top-left normalised at (0, 0). */
  pts: Pt[];
  /** The parcel's own ground ring, [[lat, lng], …] — what re-orienting the
   *  sheet is recomputed from. Empty for a lot that wasn't fetched. */
  ring: [number, number][];
  /** Index of the street boundary: edge i runs pts[i] → pts[i + 1]. */
  frontage: number;
  /** True north for this placement, degrees clockwise from straight up. */
  north: number;
  /** Plan position of the point at `lat`/`lng` — anchors the aerial. */
  anchor: Pt | null;
  lat: number | null;
  lng: number | null;
  /** Where the boundary came from, and the date it was fetched. Both are
   *  printed on the sheet; neither is ever a claim of survey accuracy. */
  source: string;
  fetched: string;
  lotId: string;
  address: string;
  /** What this boundary actually is. Printed on the sheet, always. */
  origin: LotOrigin;
}

export function fmtDate(iso: string | null | undefined): string;
export function lotOrigin(lot: unknown): LotOrigin;
export function nextLotOrigin(origin: LotOrigin | string): LotOrigin;
export function boundaryRow(lot: unknown): string;
export function boundaryFooter(lot: unknown): string;
export function lotOriginNote(lot: unknown): string;

// --- editing the boundary by hand ------------------------------------------

export const LOT_STEP_M: number;
export const LOT_ALIGN_M: number;
export const LOT_SQUARE_TOL_DEG: number;
export const LOT_MIN_CORNERS: number;

export interface LotBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function reanchorLot(
  pts: Pt[],
): { pts: Pt[]; dx: number; dy: number; w: number; d: number };
export function isRectLot(pts: Pt[], tol?: number): boolean;
export function cornerAlign(
  pts: Pt[], i: number, x: number, y: number, threshold?: number,
): { x: number; y: number; guides: AlignGuide[] };
export function squareCorner(
  pts: Pt[], i: number, p: Pt, tolDeg?: number,
): Pt | null;
export function moveLotCorner(
  pts: Pt[], i: number, x: number, y: number,
  opts?: {
    snap?: boolean; step?: number; threshold?: number;
    squareTol?: number; bounds?: LotBounds | null;
  },
): { pts: Pt[]; guides: AlignGuide[]; squared: boolean } | null;
export function moveLotEdge(
  pts: Pt[], i: number, x: number, y: number,
  opts?: { snap?: boolean; step?: number; bounds?: LotBounds | null },
): { pts: Pt[]; offset: number } | null;
export function addLotCorner(
  pts: Pt[], edge: number, at?: Pt | null, frontage?: number,
): { pts: Pt[]; frontage: number } | null;
export function removeLotCorner(
  pts: Pt[], i: number, frontage?: number,
): { pts: Pt[]; frontage: number } | null;
export function frontageFacingStreet(pts: Pt[]): number;
export function lotRingFromPts(lot: unknown): [number, number][];
export function holdUnderlayAnchor(
  u: { offsetX: number; offsetY: number } | null | undefined,
  before: { lotW: number; lotD: number; base?: Pt | null },
  after: { lotW: number; lotD: number; base?: Pt | null },
  shift?: { dx: number; dy: number },
): { offsetX: number; offsetY: number };
export function applyLotEdit(
  lot: Lot | null | undefined, pts: Pt[],
  opts?: { origin?: LotOrigin | null; frontage?: number | null; reset?: boolean },
): { lot: Lot; lotW: number; lotD: number; shift: { dx: number; dy: number } } | null;
export function pushHistory<T>(stack: T[], entry: T, cap?: number): T[];

export function lotPts(lot: Lot | null | undefined, lotW: number, lotD: number): Pt[];
export function lotFrontage(lot: Lot | null | undefined): number;

export interface LotEdge {
  i: number;
  a: Pt;
  b: Pt;
  length: number;
  mid: Pt;
  /** Outward unit normal — where a label sits clear of the lot. */
  nx: number;
  ny: number;
}
export function lotEdges(pts: Pt[]): LotEdge[];
export function edgeLabels(n: number, frontage: number): string[];
export function polygonCentroid(pts: Pt[]): Pt;
export function closestOnSegment(a: Pt, b: Pt, p: Pt): Pt;
export function pointToSegment(a: Pt, b: Pt, p: Pt): number;
export function minDistPolyToSegment(
  poly: Pt[], a: Pt, b: Pt,
): { d: number; from: Pt; to: Pt };
export function polygonContains(pts: Pt[], p: Pt): boolean;
export function polygonInside(inner: Pt[], outer: Pt[], tol?: number): boolean;

export interface LotSetback {
  i: number;
  label: string;
  /** Shortest distance from the structure's outline to this boundary. */
  v: number;
  length: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
export function lotSetbacks(
  s: StructureShape, pts: Pt[], frontage?: number,
): LotSetback[];
export function sanitiseLot(raw: unknown): Lot;

export interface AlignGuide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}
export function alignSnap(
  x: number, y: number, w: number, d: number,
  others: { x: number; y: number; w: number; d: number }[],
  threshold?: number,
): { x: number; y: number; guides: AlignGuide[] };

export function resizeBounds(
  b: { x: number; y: number; w: number; d: number },
  handle: string, px: number, py: number, lotW: number, lotD: number,
  opts?: { min?: number; step?: number },
): { x: number; y: number; w: number; d: number };

export function deriveStreet(address: string | null | undefined): string;

/** True when a stored street name is really the address copied into the field
 *  (or still carries a number or a lot/unit marker) rather than a street name
 *  somebody typed. A genuinely different frontage — a corner lot — is never
 *  a copy, and is never re-derived over. */
export function streetLooksCopied(
  street: string | null | undefined, address: string | null | undefined,
): boolean;

// --- the aerial underlay (screen only) -------------------------------------

export const MERCATOR_M_PER_PX_Z0: number;
export const EARTH_RADIUS_M: number;
export const UNDERLAY_MIN_ZOOM: number;
export const UNDERLAY_MAX_ZOOM: number;
export const UNDERLAY_DEFAULT_OPACITY: number;
export const UNDERLAY_MIN_OPACITY: number;
export const UNDERLAY_MAX_ROT: number;

export function metresPerPixel(latitude: number, zoom: number): number;
export function zoomForMetresPerPixel(latitude: number, mpp: number): number;
export function underlayZoom(
  latitude: number, pxPerMetre: number, opts?: { min?: number; max?: number },
): number;
export function underlayScale(latitude: number, zoom: number, pxPerMetre: number): number;
export function rotationCoverScale(w: number, h: number, deg: number): number;
export function underlayMapSize(
  clipW: number, clipH: number, deg: number, scale: number,
  opts?: { min?: number; max?: number },
): { w: number; h: number };

export function groundToPlanVector(
  east: number, north: number, deg: number,
): { dx: number; dy: number };
export function planToGroundVector(
  dx: number, dy: number, deg: number,
): { east: number; north: number };

export interface LatLng {
  lat: number;
  lng: number;
}
export function offsetLatLng(lat: number, lng: number, east: number, north: number): LatLng;
export function metresBetween(from: LatLng, to: LatLng): { east: number; north: number };
export function underlayAnchor(
  lotW: number, lotD: number, offsetX?: number, offsetY?: number,
  base?: Pt | null,
): Pt;
export function underlayCentre(
  site: LatLng, anchor: Pt, elementCentre: Pt, deg: number,
): LatLng;

export function clampUnderlayOpacity(v: unknown): number;
export function clampUnderlayRot(v: unknown): number;

/** The underlay as it is stored on a design. No site means no photo — which
 *  is every design saved before the aerial existed. */
export interface Underlay {
  lat: number | null;
  lng: number | null;
  zoom: number | null;
  offsetX: number;
  offsetY: number;
  rot: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
}
export function sanitiseUnderlay(raw: unknown): Underlay;

// --- the house-plan underlay (screen only, browser-local) ------------------

export const PLAN_UNDERLAY_MIN_MPP: number;
export const PLAN_UNDERLAY_MAX_MPP: number;

/** A house-plan underlay's placement, stored on the design. The picture itself
 *  lives in the browser (IndexedDB), never here and never on the server; this
 *  is only where it sits, how big and how turned. `mpp` is metres of real
 *  ground per image pixel; `cx`/`cy` the image centre in plan metres; `rot` its
 *  own free turn in degrees; `w`/`h` the picture's natural pixel size. */
export interface PlanUnderlay {
  placed: boolean;
  cx: number;
  cy: number;
  mpp: number;
  rot: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  w: number;
  h: number;
  page: number;
}
export function sanitisePlanUnderlay(raw: unknown): PlanUnderlay;
export function rescalePlanUnderlay(mpp: number, nowM: number, realM: number): number;

export function parseMetres(s: string | null | undefined): number | null;
export function fmtM(n: number): string;
export function fmtM2(n: number): string;

// --- distances between structures -------------------------------------------

/** The shortest distance between two outlines and where it runs. `overlap`
 *  marks the pair as sharing ground — `d` is 0 for a touch and for an overlap
 *  alike, and is never negative. */
export interface Gap {
  d: number;
  from: Pt;
  to: Pt;
  overlap: boolean;
}
export function polyDistance(a: Pt[], b: Pt[]): Gap;
export function structureGap(s1: StructureShape, s2: StructureShape): Gap;

export const GAP_NEAR_M: number;
export const GAP_SHOW_LIMIT: number;
export const GAP_PRINT_LIMIT: number;
export const PIN_CAP: number;

export interface NearGap extends Gap {
  /** The other structure. */
  id: string;
}
export function nearbyGaps<T extends StructureShape & { id: string }>(
  target: (StructureShape & { id: string }) | null | undefined,
  others: T[],
  opts?: { limit?: number; within?: number },
): NearGap[];

/** A pinned pair, stored on the design lowest id first. */
export type Pin = [string, string];
export function pairKey(a: unknown, b: unknown): string;
export function togglePin(pins: unknown, a: string, b: string): Pin[];
export function isPinned(pins: unknown, a: string, b: string): boolean;
export function sanitisePins(raw: unknown, ids?: Iterable<string> | null): Pin[];

export interface PrintedGap extends Gap {
  a: string;
  b: string;
  pinned: boolean;
}
export function printedGaps<T extends StructureShape & { id: string }>(
  structures: T[], pins?: unknown, opts?: { limit?: number; within?: number },
): PrintedGap[];

export const STRUCTURE_STATES: StructureState[];
export function structureState(s: unknown): StructureState;
export function toggleState(state: StructureState | string): StructureState;

export interface StructurePreset {
  kind: string;
  label: string;
  w: number;
  d: number;
  /** Absent means proposed. Only the dwelling lands existing. */
  state?: StructureState;
}
export const STRUCTURE_PRESETS: StructurePreset[];
