// Client-facing sections staff can switch off from /admin — for updating a
// section's content without taking the whole portal down. Dashboard, My jobs
// and My details are deliberately not toggleable: they ARE the portal.
import * as repo from "./repo";

export const TOGGLEABLE_PAGES = [
  { key: "submit", href: "/submit", label: "Lodge a Job" },
  { key: "amend", href: "/amend", label: "Amend a Job" },
  { key: "downloads", href: "/downloads", label: "Downloads" },
  { key: "infoSheets", href: "/info-sheets", label: "Info Sheets" },
  { key: "resources", href: "/resources", label: "Resources" },
  { key: "sitePlan", href: "/site-plan", label: "Site Plan Tool" },
  { key: "messages", href: "/messages", label: "Messages" },
  { key: "help", href: "/help", label: "Help & Support" },
] as const;

export type PageKey = (typeof TOGGLEABLE_PAGES)[number]["key"];

export const isPageKey = (k: string): k is PageKey =>
  TOGGLEABLE_PAGES.some((p) => p.key === k);

// Nav items governed by their own admin setting rather than the page
// toggles. Engineering rides the /admin engineering control: hidden from the
// menu unless that setting is enabled (the page itself also guards).
const SETTING_PAGES = [{ key: "engineering", href: "/engineering" }] as const;

export async function disabledPages(): Promise<Set<string>> {
  const [disabled, eng] = await Promise.all([
    repo.disabledPages(),
    repo.getSetting<{ enabled?: boolean }>("engineering"),
  ]);
  const set = new Set(disabled);
  if (!eng?.enabled) set.add("engineering");
  return set;
}

export async function pageDisabled(key: PageKey): Promise<boolean> {
  return (await repo.disabledPages()).has(key);
}

/** Sidebar hrefs to hide, given the disabled set. */
export function hiddenHrefs(disabled: Set<string>): string[] {
  return [...TOGGLEABLE_PAGES, ...SETTING_PAGES]
    .filter((p) => disabled.has(p.key)).map((p) => p.href);
}
