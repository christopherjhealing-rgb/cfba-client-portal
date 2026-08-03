import * as repo from "./repo";
import { FIR_ITEMS, normalise, type FirItem } from "./fir.mjs";

/**
 * The FIR library as this office actually words it.
 *
 * The shipped set in lib/fir.mjs is the floor, not the law: the wording is the
 * whole product here, and a request that reads wrong is something to fix on a
 * Tuesday afternoon rather than wait out a deploy for. Edits live in
 * portal_settings like everything else — no migration, and reverting is
 * deleting a row rather than rolling back a release.
 *
 * Three kinds of change, kept separate so "what did we change" stays legible:
 *   edits    — a shipped item reworded. Its code and aliases stay put.
 *   extra    — an item this office added. Ours entirely.
 *   disabled — a shipped item we don't use, hidden without deleting the text.
 */
export type FirEdits = {
  edits?: Record<string, { title?: string; body?: string }>;
  extra?: FirItem[];
  disabled?: string[];
};

const KEY = "fir_library";

export async function getFirEdits(): Promise<FirEdits> {
  const raw = await repo.getSetting<FirEdits>(KEY).catch(() => null);
  return {
    edits: raw?.edits && typeof raw.edits === "object" ? raw.edits : {},
    extra: Array.isArray(raw?.extra) ? raw.extra : [],
    disabled: Array.isArray(raw?.disabled) ? raw.disabled : [],
  };
}

export async function setFirEdits(next: FirEdits): Promise<void> {
  await repo.setSetting(KEY, {
    edits: next.edits || {},
    extra: (next.extra || []).filter((e) => e && e.code && e.title && e.body),
    disabled: next.disabled || [],
  });
}

/**
 * The library the sync and the screens both read.
 *
 * Shipped items first, in their declared order, so the groups stay in the
 * order somebody learned them; this office's own additions after. A disabled
 * shipped item is gone from the list entirely — if it isn't offered, it must
 * not fire either, or a code nobody can look up still expands.
 */
export async function getFirLibrary(): Promise<FirItem[]> {
  const { edits, extra, disabled } = await getFirEdits();
  const off = new Set((disabled || []).map(normalise));

  const shipped = FIR_ITEMS
    .filter((it) => !off.has(normalise(it.code)))
    .map((it) => {
      const e = edits?.[it.code];
      return e ? { ...it, title: e.title || it.title, body: e.body || it.body } : it;
    });

  // An added item that reuses a shipped code would shadow it in a way nobody
  // could see from the screen. The shipped one wins and the extra is dropped.
  const taken = new Set(shipped.map((it) => normalise(it.code)));
  const ours = (extra || [])
    .filter((it) => it?.code && !taken.has(normalise(it.code)))
    .map((it) => ({ ...it, group: it.group || "Ours" }));

  return [...shipped, ...ours];
}

/**
 * The shortcuts that exist but are switched off.
 *
 * The sync needs these as much as it needs the live ones: somebody's muscle
 * memory outlives a settings change by months, and a retired code arriving on
 * a card has to be held rather than posted to the client as a bare word.
 */
export async function getRetiredFir(): Promise<FirItem[]> {
  const { disabled } = await getFirEdits();
  const off = new Set((disabled || []).map(normalise));
  return FIR_ITEMS.filter((it) => off.has(normalise(it.code)));
}

/** Whether a shipped item has been reworded here — for the screen's badge. */
export function isEdited(item: FirItem, edits: FirEdits): boolean {
  const e = edits.edits?.[item.code];
  if (!e) return false;
  const shipped = FIR_ITEMS.find((s) => s.code === item.code);
  if (!shipped) return false;
  return (!!e.title && e.title !== shipped.title) || (!!e.body && e.body !== shipped.body);
}

export const isShipped = (code: string): boolean =>
  FIR_ITEMS.some((s) => normalise(s.code) === normalise(code));
