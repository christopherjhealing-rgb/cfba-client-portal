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
  { file: "CFBA-note-08-boundaries.pdf", title: "08 — Building on or near a boundary" },
  { file: "CFBA-note-09-pool-barriers.pdf", title: "09 — Swimming pool & spa barriers" },
  { file: "CFBA-note-10-wind-site.pdf", title: "10 — Wind class & site classification" },
  { file: "CFBA-note-11-stormwater.pdf", title: "11 — Stormwater & soak wells" },
  { file: "CFBA-note-12-easements-sewer.pdf", title: "12 — Easements, sewer & drainage" },
  { file: "CFBA-note-13-after-permit.pdf", title: "13 — After your permit is issued" },
  { file: "CFBA-note-14-planning-class10.pdf", title: "14 — Planning approval & Class 10" },
] as const;

export const isPublishedSheet = (f: string): boolean =>
  PUBLISHED_SHEETS.some((s) => s.file === f);

export const sheetStoragePath = (f: string) => `info-sheets/${f}`;
