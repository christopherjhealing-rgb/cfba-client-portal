// Span tables for the engineering checker. One generic SAMPLE set ships so
// the page works end to end; replace/extend with real supplier sets when
// Chris provides them. Shape anticipates per-client access: when the time
// comes, add `clients?: string[]` per set and filter in the page.
//
// SAFETY: any set with sample:true renders behind a "demonstration only —
// not for design" banner. Do not remove the flag from data that hasn't come
// from a supplier's certified tables.

export interface SpanRow {
  section: string;
  /** Max span/height in metres per wind class, aligned with table.windClasses. */
  spans: (number | null)[];
}
export interface SpanTable {
  key: string;
  member: string;
  note?: string;
  unit: "m span" | "m height";
  windClasses: string[];
  rows: SpanRow[];
}
export interface SpanSet {
  key: string;
  name: string;
  sample: boolean;
  note?: string;
  tables: SpanTable[];
}

export const SPAN_SETS: SpanSet[] = [
  {
    key: "sample",
    name: "Sample tables — demonstration only",
    sample: true,
    note:
      "Indicative figures so you can see how the checker works. The tables in " +
      "your engineering pack govern your design — always check against those.",
    tables: [
      {
        key: "rafters",
        member: "Patio / carport rafters (C-section)",
        unit: "m span",
        note: "Single span, sheet roof, rafters at 900 mm centres.",
        windClasses: ["N1", "N2", "N3"],
        rows: [
          { section: "C15015", spans: [3.9, 3.6, 3.0] },
          { section: "C15019", spans: [4.4, 4.1, 3.4] },
          { section: "C20015", spans: [4.9, 4.6, 3.8] },
          { section: "C20019", spans: [5.6, 5.2, 4.3] },
          { section: "C25019", spans: [6.4, 6.0, 5.0] },
          { section: "C25024", spans: [7.0, 6.6, 5.5] },
        ],
      },
      {
        key: "beams",
        member: "Beams supporting rafters (back-to-back C-section)",
        unit: "m span",
        note: "Supporting rafter spans up to 4.0 m.",
        windClasses: ["N1", "N2", "N3"],
        rows: [
          { section: "C15019 B2B", spans: [3.2, 3.0, 2.5] },
          { section: "C20019 B2B", spans: [4.1, 3.8, 3.2] },
          { section: "C25019 B2B", spans: [4.9, 4.6, 3.8] },
          { section: "C25024 B2B", spans: [5.4, 5.0, 4.2] },
        ],
      },
      {
        key: "posts",
        member: "Posts (SHS)",
        unit: "m height",
        note: "Maximum post height, attached structure.",
        windClasses: ["N1", "N2", "N3"],
        rows: [
          { section: "89×89×2.0 SHS", spans: [3.0, 3.0, 2.7] },
          { section: "100×100×3.0 SHS", spans: [3.6, 3.6, 3.3] },
        ],
      },
    ],
  },
];
