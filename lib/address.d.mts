export const WA_BOUNDS: { south: number; west: number; north: number; east: number };

export interface SuggestionRequest {
  input: string;
  sessionToken: unknown;
  includedRegionCodes: string[];
  locationBias: { south: number; west: number; north: number; east: number };
}
export function suggestionRequest(input: string, sessionToken?: unknown): SuggestionRequest;

export function stripCountry(s: string | null | undefined): string;
