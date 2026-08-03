// Wind classification (AS 4055).
//
// Transcribed from the Stratco "Determining Wind Speed" design guide, which
// classifies in accordance with AS 4055:2012 and derives its speeds from
// AS/NZS 1170.2:2011 (500-year return period, ~5 m average structure height,
// 5% allowance). It is an approximate method for residential structures — the
// guide says so itself, and so does every screen that uses this module.
//
// The tables are written out the way they're printed rather than as nested
// objects, so anyone with the guide open can check a row against the page
// without reading any code. Nothing here is computed; it is all transcription,
// which is exactly why the tests re-check the shape of every row.

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

// Boundaries read off Figure 1 of the guide, which marks them by latitude on
// the west coast (20°, 25°, 27°, 30°) and by distance inland (50/100/150 km).
// Named towns are only used where the boundary genuinely lands on one — the
// rest stay as latitudes, because inventing a town is how a description drifts.
export const REGIONS = [
  { key: "A", label: "Region A",
    note: "Everywhere else — the whole south-west including Perth, the Wheatbelt, the Goldfields and the interior. Nearly all of our work." },
  { key: "B", label: "Region B",
    note: "The west coast roughly between 25°S and 30°S, plus a band inland of Region C further north." },
  { key: "C", label: "Region C",
    note: "Cyclonic. The northern and north-west coast, inland of Region D." },
  { key: "D", label: "Region D",
    note: "Severe cyclonic. A narrow strip of the north-west coast, roughly 20°S to 25°S — Port Hedland down to about Carnarvon." },
];

/**
 * Where the authoritative answer comes from.
 *
 * Same principle as the bushfire check: the portal points at the official
 * source rather than keeping a copy, because a region boundary is not
 * something to be settled by a paraphrase on our own website.
 */
export const REGION_MAP_LINKS = [
  { label: "DFES — wind classifications and regions",
    url: "https://publications.dfes.wa.gov.au/publications/fact-sheet-2-wind-classifications-and-regions" }, // confirm
  { label: "Building and Energy — Industry Bulletin 124, wind classifications",
    url: "https://www.wa.gov.au/government/publications/industry-bulletin-124-warning-inappropriate-wind-classifications" }, // confirm
];

/** Terrain categories, worded as the guide words them. */
export const TERRAIN = [
  { key: "1", label: "Category 1", short: "Exposed open terrain",
    detail: "Exposed open terrain with few or no obstructions and enclosed water surfaces. For example, flat, treeless, poorly grassed plains; rivers, canals and lakes; and enclosed bays less than 10 km in the wind direction." },
  { key: "1.5", label: "Category 1.5", short: "Open water",
    detail: "Open water surfaces, for example coastal waters, large open bays on seas and oceans, lakes and enclosed bays extending greater than 10 km in the wind direction." },
  { key: "2", label: "Category 2", short: "Open terrain / grassland",
    detail: "Open terrain, including grassland, with well scattered obstructions having heights typically from 1.5–5 m, with no more than two obstructions per hectare." },
  { key: "2.5", label: "Category 2.5", short: "Developing outer urban",
    detail: "Terrain with a few trees or isolated obstructions, for example terrain in developing outer urban areas with scattered houses." },
  { key: "3", label: "Category 3", short: "Suburban housing",
    detail: "Terrain with numerous closely spaced obstructions with heights typically between 3–10 m, for example suburban housing." },
];

export const SHIELDING = [
  { key: "FS", label: "Full shielding", short: "10+ houses per hectare upwind",
    detail: "At least two rows of houses or similar sized permanent obstructions surround the building. Appropriate for typical suburban development — 10 or more houses and/or similar sized obstructions per hectare. In Regions A and B, heavily vegetated areas within 100 m of the site can provide full shielding." },
  { key: "PS", label: "Partial shielding", short: "About 2.5 per hectare upwind",
    detail: "Intermediate situations with at least 2.5 houses or sheds per hectare upwind, for example typical acreage development or wooded parkland. The second row of houses abutting open water or parkland may be partial shielding." },
  { key: "NS", label: "No shielding", short: "Fewer than 2.5 per hectare upwind",
    detail: "No permanent obstructions upwind, or fewer than 2.5 per hectare. For example the first row of houses, or a single house abutting open water, an airfield or open parkland." },
];

/** In Regions C and D, trees and vegetation are not shielding elements. */
export const VEGETATION_NOT_SHIELDING = ["C", "D"];

export const TOPOGRAPHY = [
  { key: "T0", label: "T0", note: "No topographic effect — flat, or ground slope flatter than 1:20 (about 3°)." },
  { key: "T1", label: "T1", note: "Slight." },
  { key: "T2", label: "T2", note: "Moderate." },
  { key: "T3", label: "T3", note: "Severe." },
];

export const SHIELDING_KEYS = ["FS", "PS", "NS"];
export const TOPO_KEYS = ["T0", "T1", "T2", "T3"];
export const TERRAIN_KEYS = ["1", "1.5", "2", "2.5", "3"];
export const REGION_KEYS = ["A", "B", "C", "D"];

// ---------------------------------------------------------------------------
// Table 2 — wind classification
//
// Read left to right exactly as printed:
//     T0: FS PS NS | T1: FS PS NS | T2: FS PS NS | T3: FS PS NS
// "NA" is the guide's own entry: that combination is off the end of this
// method, not a gap in the transcription.
// ---------------------------------------------------------------------------

const TABLE_2 = {
  A: {
    "1":   "N2 N3 N3 | N3 N3 N3 | N3 N4 N4 | N3 N4 N4",
    "1.5": "N2 N2 N3 | N2 N3 N3 | N3 N3 N4 | N3 N4 N4",
    "2":   "N1 N2 N2 | N2 N3 N3 | N2 N3 N3 | N3 N3 N4",
    "2.5": "N1 N2 N2 | N2 N2 N3 | N2 N3 N3 | N3 N3 N3",
    "3":   "N1 N1 N2 | N1 N2 N2 | N2 N3 N3 | N2 N3 N3",
  },
  B: {
    "1":   "N3 N4 N4 | N4 N4 N5 | N4 N5 N5 | N5 N5 N5",
    "1.5": "N3 N4 N4 | N3 N4 N4 | N4 N4 N5 | N4 N5 N5",
    "2":   "N3 N3 N3 | N3 N4 N4 | N4 N4 N4 | N4 N4 N5",
    "2.5": "N3 N3 N3 | N3 N3 N4 | N3 N4 N4 | N4 N4 N5",
    "3":   "N2 N3 N3 | N3 N3 N3 | N3 N4 N4 | N3 N4 N4",
  },
  C: {
    "1":   "C2 C3 C3 | C3 C3 C4 | C3 C4 C4 | C4 C4 NA",
    "1.5": "C2 C3 C3 | C2 C3 C3 | C3 C3 C4 | C3 C4 C4",
    "2":   "C2 C2 C2 | C2 C3 C3 | C3 C3 C3 | C3 C3 C4",
    "2.5": "C1 C2 C2 | C2 C2 C3 | C2 C3 C3 | C3 C3 C4",
    "3":   "C1 C2 C2 | C2 C2 C2 | C2 C3 C3 | C2 C3 C3",
  },
  D: {
    "1":   "C4 C4 NA | C4 NA NA | NA NA NA | NA NA NA",
    "1.5": "C3 C4 C4 | C4 C4 NA | C4 NA NA | NA NA NA",
    "2":   "C3 C3 C4 | C3 C4 C4 | C4 NA NA | C4 NA NA",
    "2.5": "C3 C3 C3 | C3 C4 C4 | C4 C4 NA | C4 NA NA",
    "3":   "C2 C3 C3 | C3 C3 C4 | C3 C4 C4 | C4 C4 NA",
  },
};

/** The twelve cells of a printed row, in order. */
export function rowCells(region, terrain) {
  const row = TABLE_2[region]?.[terrain];
  if (!row) return null;
  return row.split("|").flatMap((g) => g.trim().split(/\s+/));
}

// ---------------------------------------------------------------------------
// Table 1 — classification to permissible gust wind speed (m/s)
// ---------------------------------------------------------------------------

export const GUST = {
  N1: "W28", N2: "W33", N3: "W41", N4: "W50", N5: "W60", N6: "W70",
  C1: "W41", C2: "W50", C3: "W60", C4: "W70",
};

export const gustSpeed = (cls) => {
  const w = GUST[cls];
  return w ? Number(w.slice(1)) : null;
};

/**
 * The wind classification for a site.
 *
 * Returns `{ ok: false, reason: "not-covered" }` for the cells the guide marks
 * NA. That is a real answer, not an error — the combination is off the end of
 * this method and needs a full analysis, and saying so is the only safe thing
 * to do with it.
 */
export function windClass({ region, terrain, topography, shielding } = {}) {
  const cells = rowCells(region, terrain);
  const t = TOPO_KEYS.indexOf(topography);
  const s = SHIELDING_KEYS.indexOf(shielding);
  if (!cells || t < 0 || s < 0) return { ok: false, reason: "incomplete" };

  const cls = cells[t * 3 + s];
  if (!cls || cls === "NA") return { ok: false, reason: "not-covered" };

  return {
    ok: true,
    windClass: cls,
    cyclonic: cls.startsWith("C"),
    gust: GUST[cls] || null,
    speed: gustSpeed(cls),
  };
}

// ---------------------------------------------------------------------------
// Topographic classification
//
// From the hill and escarpment diagrams. The maximum slope is the steepest
// slope through the top half of the hill, ridge or escarpment — measured for
// the landform, not for the site. Position is which third of its HEIGHT the
// site sits in.
//
// A hill is symmetric: the same third reads the same whether the site is on
// the windward or leeward flank, which is why there's no "behind the crest"
// for one. An escarpment has a plateau behind it, and the steeper it is the
// further that effect carries — which is the whole difference between the two.
// ---------------------------------------------------------------------------

export const SLOPE_BANDS = [
  { key: "flat", label: "Flatter than 1:20 (under 3°)",
    note: "No topographic effect. This is most suburban blocks." },
  { key: "b1", label: "1:20 (3°) to under 1:10 (6°)" },
  { key: "b2", label: "1:10 (6°) to under 1:7.5 (7.5°)" },
  { key: "b3", label: "1:7.5 (7.5°) to under 1:5 (11°)" },
  { key: "b4", label: "1:5 (11°) to under 1:3 (18.5°)" },
  { key: "steeper", label: "1:3 (18.5°) or steeper",
    note: "Past the range of this method." },
];

export const LANDFORMS = [
  { key: "hill", label: "Hill or ridge", note: "Rises to a crest and falls away again." },
  { key: "escarpment", label: "Escarpment", note: "Rises to a crest and stays up — flat behind." },
];

export const POSITIONS = [
  { key: "lower", label: "Lower third", note: "Near the base." },
  { key: "middle", label: "Middle third" },
  { key: "top", label: "Top third, at or near the crest" },
  { key: "plateau", label: "On the flat behind the crest", escarpmentOnly: true },
];

// [lower, middle, top] — a hill has no behind-the-crest position.
const HILL = {
  b1: ["T0", "T0", "T1"],
  b2: ["T0", "T1", "T2"],
  b3: ["T0", "T1", "T2"],
  b4: ["T0", "T2", "T3"],
};

// [lower, middle, top, plateau]
const ESCARPMENT = {
  b1: ["T0", "T0", "T1", "T0"],
  b2: ["T0", "T1", "T2", "T0"],
  b3: ["T0", "T1", "T2", "T1"],
  b4: ["T0", "T2", "T3", "T2"],
};

/** Heights the guide's diagrams cover. Past this, AS 4055 itself is needed. */
export const MAX_LANDFORM_HEIGHT_M = 30;

/**
 * Work out the topographic classification from the landform.
 *
 * Optional: someone who already knows their T class picks it directly. This is
 * for everyone else, and it refuses rather than guesses at the edges — a site
 * on a 25° slope isn't a T3, it's a site this method doesn't cover.
 */
export function topographicClass({ landform, slope, position } = {}) {
  if (slope === "flat") return { ok: true, topography: "T0", reason: "flat" };
  if (slope === "steeper") return { ok: false, reason: "too-steep" };

  const table = landform === "hill" ? HILL : landform === "escarpment" ? ESCARPMENT : null;
  if (!table || !table[slope]) return { ok: false, reason: "incomplete" };

  const order = landform === "hill"
    ? ["lower", "middle", "top"]
    : ["lower", "middle", "top", "plateau"];
  const i = order.indexOf(position);
  // "Behind the crest" on a hill isn't a place — a hill falls away, so the
  // far flank is just the lower or middle third of the other side.
  if (i < 0) return { ok: false, reason: "incomplete" };

  return { ok: true, topography: table[slope][i] };
}

// ---------------------------------------------------------------------------
// What every screen using this has to say
// ---------------------------------------------------------------------------

export const WIND_SOURCE =
  "Method from the Stratco “Determining Wind Speed” design guide, " +
  "classified in accordance with AS 4055:2012, with wind speeds derived from " +
  "AS/NZS 1170.2:2011.";

export const WIND_CAVEAT =
  "An approximate method for residential structures only. Speeds assume a " +
  "500-year design return period and an average five metre structure height, " +
  "with a 5% allowance applied when allocating the classification. For a full " +
  "analysis refer to AS/NZS 1170.2. CFBA confirms the classification when we " +
  "assess the job — treat this as a guide, not a determination.";

/** Building and Energy has audited this and found AS 4055 being applied
 *  inconsistently, which is worth saying out loud on a tool that applies it. */
export const WIND_REGULATOR_NOTE =
  "Building and Energy has warned that AS 4055 is often applied inconsistently " +
  "in WA (Industry Bulletin 124). The classification for a job is the one on " +
  "our certificate, not the one on this screen.";
