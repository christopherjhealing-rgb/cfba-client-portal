/** Categories that get combined into one PDF and renamed, mapped to base name. */
export const COMBINE: Record<string, string>;
export function combinable(category: string): boolean;
/** Street + suburb, with state, postcode and country trimmed off. */
export function addressForName(address: string): string;
/** A string made safe to use as a file name (no extension). */
export function safeForFilename(s: string): string;
/** The combined PDF's file name for a category, or null if not combined. */
export function combinedName(category: string, address: string): string | null;
/** The name shown in the form before lodging (placeholder when no address). */
export function plannedName(category: string, address: string): string | null;
