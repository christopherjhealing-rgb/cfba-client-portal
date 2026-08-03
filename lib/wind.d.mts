// Types for lib/wind.mjs — the AS 4055 wind classification tables.

export interface WindOption {
  key: string;
  label: string;
  short?: string;
  detail?: string;
  note?: string;
  escarpmentOnly?: boolean;
}

export const REGIONS: readonly WindOption[];
export const TERRAIN: readonly WindOption[];
export const SHIELDING: readonly WindOption[];
export const TOPOGRAPHY: readonly WindOption[];
export const SLOPE_BANDS: readonly WindOption[];
export const LANDFORMS: readonly WindOption[];
export const POSITIONS: readonly WindOption[];

export const REGION_KEYS: readonly string[];
export const TERRAIN_KEYS: readonly string[];
export const TOPO_KEYS: readonly string[];
export const SHIELDING_KEYS: readonly string[];
export const VEGETATION_NOT_SHIELDING: readonly string[];
export const MAX_LANDFORM_HEIGHT_M: number;

export const GUST: Record<string, string>;
export function gustSpeed(cls: string): number | null;
export function rowCells(region: string, terrain: string): string[] | null;

export type WindResult =
  | { ok: true; windClass: string; cyclonic: boolean; gust: string | null; speed: number | null }
  | { ok: false; reason: "incomplete" | "not-covered" };

export function windClass(input?: {
  region?: string; terrain?: string; topography?: string; shielding?: string;
}): WindResult;

export type TopoResult =
  | { ok: true; topography: string; reason?: string }
  | { ok: false; reason: "incomplete" | "too-steep" };

export function topographicClass(input?: {
  landform?: string; slope?: string; position?: string;
}): TopoResult;

export const WIND_SOURCE: string;
export const WIND_CAVEAT: string;
