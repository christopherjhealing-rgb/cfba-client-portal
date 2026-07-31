// The published guidance notes. The originals ship with the app in
// /public/notes; staff can supersede any of them from /admin, after which the
// portal serves the storage copy (info-sheets/<file>) until it's reverted.
// Client links go through /api/notes/<file>, which picks the right source.

export const PUBLISHED_SHEETS = [
  { file: "CFBA-note-07-lodging-checklist.pdf", title: "07 — Lodging checklist" },
  { file: "CFBA-note-site-plans.pdf", title: "01 — What your site plan needs to show" },
  { file: "CFBA-note-elevations.pdf", title: "05 — Elevations" },
  { file: "CFBA-note-engineering.pdf", title: "02 — Engineering certification" },
  { file: "CFBA-note-bal.pdf", title: "03 — BAL ratings" },
  { file: "CFBA-note-retaining.pdf", title: "04 — Retaining walls" },
  { file: "CFBA-note-06-amendments.pdf", title: "06 — Amending a job" },
] as const;

export const isPublishedSheet = (f: string): boolean =>
  PUBLISHED_SHEETS.some((s) => s.file === f);

export const sheetStoragePath = (f: string) => `info-sheets/${f}`;
