// Types for lib/fir.mjs — the standard FIR library and its shortcuts.

export interface FirItem {
  code: string;
  aliases?: string[];
  group?: string;
  title: string;
  body: string;
}

export interface FirHeld {
  typed: string;
  /** null when nothing was close — a bare word that isn't a shortcut. */
  meant: FirItem | null;
  why?: "typo" | "off" | "bare";
}

export type FirParse =
  /** Every fragment was a shortcut — send composeFir(items). */
  | { kind: "expand"; items: FirItem[]; held: [] }
  /** Something looked like a mistyped shortcut — send nothing, note the card. */
  | { kind: "held"; items: []; held: FirHeld[] }
  /** Not shortcuts at all — send the text exactly as typed, as always. */
  | { kind: "verbatim"; items: []; held: [] };

export const FIR_ITEMS: readonly FirItem[];

export function normalise(s: string): string;
export function editDistance(a: string, b: string): number;
export function typoAllowance(len: number): number;
export function splitCodes(text: string): string[];
export function keysFor(item: FirItem): string[];
export function nearest(key: string, library?: readonly FirItem[]): FirItem | null;
export function isBareWord(s: string): boolean;
export function parseFir(
  text: string,
  library?: readonly FirItem[],
  /** Shortcuts that exist but are switched off — recognised, never sent. */
  retired?: readonly FirItem[]
): FirParse;
export function composeFir(
  items: readonly FirItem[],
  opts?: { address?: string }
): string;
export function firCardNote(items: readonly FirItem[]): string;
export function firHeldNote(
  held: readonly FirHeld[],
  library?: readonly FirItem[]
): string;
export function firGroups(
  library?: readonly FirItem[]
): { name: string; items: FirItem[] }[];
export function duplicateKeys(
  library?: readonly FirItem[]
): { key: string; codes: string[] }[];
