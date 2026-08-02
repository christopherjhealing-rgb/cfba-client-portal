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

export function parseMetres(s: string | null | undefined): number | null;
export function fmtM(n: number): string;
export function fmtM2(n: number): string;

export interface StructurePreset {
  kind: string;
  label: string;
  w: number;
  d: number;
}
export const STRUCTURE_PRESETS: StructurePreset[];
