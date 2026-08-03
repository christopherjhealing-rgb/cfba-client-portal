// Types for lib/soakwell.mjs — the City of Bayswater soakwell sizing tables.

export interface SoakwellSize {
  dia: number;
  depth: number;
  capacity: number;
}

export interface SoakwellOption {
  size: SoakwellSize;
  count: number;
  total: number;
  excess: number;
  label: string;
}

/** What's already in the ground, or what's being proposed. */
export interface WellCount {
  size?: SoakwellSize;
  key?: string;
  count: number;
}

export const RATE_M3_PER_M2: number;
export const RATE_MM_RETAINED: number;
export const MAX_WELLS: number;
export const SOAKWELLS: readonly SoakwellSize[];

export function requiredVolume(areaM2: number): number;
export function sizeLabel(s: SoakwellSize): string;
export function sizeKey(s: SoakwellSize): string;
export function findSize(key: string): SoakwellSize | null;
export function options(
  requiredM3: number,
  opts?: { max?: number }
): SoakwellOption[];
export function bestOption(
  requiredM3: number,
  opts?: { max?: number }
): SoakwellOption | null;
export function totalCapacity(wells?: readonly WellCount[]): number;

export type NewResult =
  | { ok: false; reason: "incomplete" }
  | {
      ok: true;
      area: number;
      required: number;
      options: SoakwellOption[];
      best: SoakwellOption | null;
    };

export function sizeNew(input?: { roofM2?: number; pavedM2?: number }): NewResult;

export type ExistingResult =
  | { ok: false; reason: "incomplete" }
  | {
      ok: true;
      existingArea: number;
      proposedArea: number;
      area: number;
      required: number;
      have: number;
      shortfall: number;
      covered: boolean;
      spare: number;
      options: SoakwellOption[];
      best: SoakwellOption | null;
    };

export function sizeExisting(input?: {
  existingRoofM2?: number;
  proposedRoofM2?: number;
  pavedM2?: number;
  existingWells?: readonly WellCount[];
}): ExistingResult;

export const SOAKWELL_SOURCE: string;
export const SOAKWELL_CAVEAT: string;
export const SOAKWELL_SOIL_NOTE: string;
export const SOAKWELL_SITE_PLAN: readonly string[];
