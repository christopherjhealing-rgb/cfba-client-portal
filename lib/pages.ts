// Client-facing sections staff can switch off from /admin — for updating a
// section's content without taking the whole portal down. Dashboard, My jobs
// and My details are deliberately not toggleable: they ARE the portal.
import * as repo from "./repo";

export const TOGGLEABLE_PAGES = [
  { key: "submit", href: "/submit", label: "Lodge a job" },
  { key: "amend", href: "/amend", label: "Amend a job" },
  { key: "downloads", href: "/downloads", label: "Downloads" },
  { key: "infoSheets", href: "/info-sheets", label: "Info sheets" },
  { key: "messages", href: "/messages", label: "Messages" },
  { key: "help", href: "/help", label: "Help & support" },
] as const;

export type PageKey = (typeof TOGGLEABLE_PAGES)[number]["key"];

export const isPageKey = (k: string): k is PageKey =>
  TOGGLEABLE_PAGES.some((p) => p.key === k);

export async function disabledPages(): Promise<Set<string>> {
  return repo.disabledPages();
}

export async function pageDisabled(key: PageKey): Promise<boolean> {
  return (await repo.disabledPages()).has(key);
}

/** Sidebar hrefs to hide, given the disabled set. */
export function hiddenHrefs(disabled: Set<string>): string[] {
  return TOGGLEABLE_PAGES.filter((p) => disabled.has(p.key)).map((p) => p.href);
}
