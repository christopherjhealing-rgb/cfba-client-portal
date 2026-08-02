// The published guidance notes. The originals ship with the app in
// /public/notes; staff can supersede any of them from /admin, after which the
// portal serves the storage copy (info-sheets/<file>) until it's reverted.
// Client links go through /api/notes/<file>, which picks the right source.

export const PUBLISHED_SHEETS = [
  { file: "CFBA-note-07-lodging-checklist.pdf", title: "07 — Lodging Checklist" },
  { file: "CFBA-note-site-plans.pdf", title: "01 — What Your Site Plan Needs to Show" },
  { file: "CFBA-note-elevations.pdf", title: "05 — Elevations" },
  { file: "CFBA-note-engineering.pdf", title: "02 — Engineering Certification" },
  { file: "CFBA-note-bal.pdf", title: "03 — BAL Ratings" },
  { file: "CFBA-note-retaining.pdf", title: "04 — Retaining Walls" },
  { file: "CFBA-note-06-amendments.pdf", title: "06 — Amending a Job" },
  { file: "CFBA-note-08-boundaries.pdf", title: "08 — Building on or Near a Boundary" },
  { file: "CFBA-note-09-pool-barriers.pdf", title: "09 — Swimming Pool & Spa Barriers" },
  { file: "CFBA-note-10-wind-site.pdf", title: "10 — Wind Class & Site Classification" },
  { file: "CFBA-note-11-stormwater.pdf", title: "11 — Stormwater & Soak Wells" },
  { file: "CFBA-note-12-easements-sewer.pdf", title: "12 — Easements, Sewer & Drainage" },
  { file: "CFBA-note-13-after-permit.pdf", title: "13 — After Your Permit Is Issued" },
  { file: "CFBA-note-14-planning-class10.pdf", title: "14 — Planning Approval & Class 10" },
] as const;

export const isPublishedSheet = (f: string): boolean =>
  PUBLISHED_SHEETS.some((s) => s.file === f);

export const sheetStoragePath = (f: string) => `info-sheets/${f}`;
