import type { Lot, Pt } from "./site-plan.d.mts";

export const WA_BBOX: { south: number; north: number; west: number; east: number };
export function inWA(lat: number, lng: number): boolean;
export function cadastreKey(lat: number, lng: number): string;

/** A ground ring, [[lat, lng], …]. */
export type Ring = [number, number][];

export interface Parcel {
  ring: Ring;
  /** "Lot 214 on Plan 78123" where the service gives enough to say so. */
  lotId: string;
  address: string;
}

export function parseParcel(raw: unknown): Parcel | null;
export function dedupeRing(ring: unknown): Ring;
export function ringCentroid(ring: Ring): { lat: number; lng: number };
export function ringToGround(
  ring: Ring, origin?: { lat: number; lng: number },
): { east: number; north: number }[];
export function inferFrontage(
  ring: Ring, streetPt?: { lat: number; lng: number } | null,
): number;
export function ringToPlan(ring: Ring, frontage?: number): {
  pts: Pt[];
  north: number;
  anchor: Pt;
  lat: number;
  lng: number;
  area: number;
  width: number;
  depth: number;
};
export function buildLot(
  parcel: Parcel | null | undefined,
  streetPt?: { lat: number; lng: number } | null,
  meta?: { source?: string; fetched?: string; lotId?: string; address?: string },
): Lot | null;
export function reorientLot(lot: Lot, frontage: number): Lot;
