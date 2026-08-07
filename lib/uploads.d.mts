/** Categories that get combined into one PDF and renamed, mapped to base name. */
export const COMBINE: Record<string, string>;
export function combinable(category: string): boolean;
/** Street + suburb, with state, postcode and country trimmed off. */
export function addressForName(address: string): string;
/** A string made safe to use as a file name (no extension). */
export function safeForFilename(s: string): string;
/** A file-name date stamp read in Perth time, e.g. "7 Aug 2026". */
export function formatStamp(date: Date | string | number): string;
/** The combined PDF's file name for a category, or null if not combined.
 *  `date` appends the day it came in (FIR responses). */
export function combinedName(
  category: string, address: string, date?: Date | string | number | null
): string | null;
/** The name shown in the form before sending (placeholder when no address). */
export function plannedName(
  category: string, address: string, date?: Date | string | number | null
): string | null;
