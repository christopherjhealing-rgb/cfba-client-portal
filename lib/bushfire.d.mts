// Types for lib/bushfire.mjs — reading whether a point is in a designated
// Bush Fire Prone Area.

export const WA_BBOX: { south: number; north: number; west: number; east: number };

export function inWA(lat: number, lng: number): boolean;

export function bushfireKey(lat: number, lng: number): string;

/** The verdict from the service's raw answer, or null when it couldn't be
 *  read (an error object, HTML, garbage) — never guessed as "not prone". */
export function readBushfire(raw: unknown): { prone: boolean } | null;
