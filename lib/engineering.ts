// Engineering checker sets. Each set is a self-contained HTML app holding
// licensed engineering data (span tables, solver), so the files live in
// PRIVATE storage at engineering/<key>.html — never in this repo, which is
// public. This module is just the registry: names, storage keys, and which
// client companies may open each set.
import * as repo from "./repo";

export interface EngSet {
  key: string;
  name: string;
  note?: string;
  /** Lowercased company names allowed to open this set. Empty or absent =
      every signed-in client. Staff always see every set. */
  clients?: string[];
  uploadedAt?: string;
}

const SETTING_KEY = "engineering_sets";

export const setStoragePath = (key: string) => `engineering/${key}.html`;

export async function listEngSets(): Promise<EngSet[]> {
  return (await repo.getSetting<EngSet[]>(SETTING_KEY)) || [];
}

export async function saveEngSets(sets: EngSet[]): Promise<void> {
  await repo.setSetting(SETTING_KEY, sets);
}

export function canAccessSet(
  set: EngSet, companyName: string, staff: boolean
): boolean {
  if (staff) return true;
  if (!set.clients || set.clients.length === 0) return true;
  return set.clients.includes(companyName.trim().toLowerCase());
}

export function slugify(s: string): string {
  const slug = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return (slug || "set").slice(0, 60);
}
