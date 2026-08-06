// Types for lib/bushfire.mjs — reading whether a point is in a designated
// Bush Fire Prone Area.

export const WA_BBOX: { south: number; north: number; west: number; east: number };

export function inWA(lat: number, lng: number): boolean;

export function bushfireKey(lat: number, lng: number, source?: string): string;

/** The verdict from the service's raw answer, or null when it couldn't be
 *  read (an error object, HTML, garbage) — never guessed as "not prone". */
export function readBushfire(raw: unknown): { prone: boolean } | null;

export interface BalVerdict {
  /** clear = nothing needed; action = evidence/report needed; info = to confirm. */
  tone: "clear" | "action" | "info";
  headline: string;
  detail: string;
  /** One line filed with the lodgement so the office sees the answer. */
  summary: string;
}

/** The BAL outcome for a Class 10 structure, from the three answers only the
 *  client can give. Null until enough is answered to decide. */
export function balVerdict(input: {
  /** "near" = within 6 m of the house; "far" = 6 m or more. */
  distance: "near" | "far" | null;
  /** "patio" = patio or carport; "shed" = shed. */
  kind: "patio" | "shed" | null;
  age: "pre2016" | "post2016" | "unsure" | null;
}): BalVerdict | null;
