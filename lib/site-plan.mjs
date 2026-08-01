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

/** Distances from a structure to the four boundaries, in metres. Front is
 *  the street (bottom) edge, rear the top. Measurements only — whether any
 *  of them is acceptable is assessment's call, never this file's. */
export function setbacks(s, lotW, lotD) {
  return {
    left: s.x,
    right: lotW - (s.x + s.w),
    rear: s.y,
    front: lotD - (s.y + s.d),
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
