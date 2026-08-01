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

export interface StructureRect {
  x: number;
  y: number;
  w: number;
  d: number;
}

export function setbacks(
  s: StructureRect, lotW: number, lotD: number,
): { left: number; right: number; rear: number; front: number };

export function defaultPlacement(
  w: number, d: number, lotW: number, lotD: number, count?: number,
): { x: number; y: number };

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
