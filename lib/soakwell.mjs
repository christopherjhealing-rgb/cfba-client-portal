// Soakwell sizing.
//
// Transcribed from the City of Bayswater "Recommended Soakwell Capacity"
// sheet: one formula and one table of standard precast sizes.
//
//     AREA (m²) × 0.0125 = VOLUME (m³)
//
// The sheet's own worked example: 60 m² of paved area × 0.0125 = 0.75 m³,
// giving a 900 × 1200 well (0.76 m³), with the instruction "always round up to
// the nearest volume". That rounding rule is the whole of the selection logic
// below — this module never returns a combination that holds less than the
// required volume.
//
// Written out the way it is printed rather than computed, for the same reason
// as the wind tables: anyone with the sheet in front of them can check a row
// without reading any code. The capacities are all π r² h to two decimals, and
// the tests re-derive every one of them to prove the transcription is right,
// but the printed figure is what ships — if Bayswater and the geometry ever
// disagree, the council's number is the one a client will be held to.
//
// On the rate: 0.0125 m³/m² is 12.5 mm of rain retained on site.
//
// Checked 3 Aug 2026, three ways. The sheet prints both the formula and a
// worked example, and they pin each other — 60 × 0.0125 is the 0.75 printed,
// where 0.0120 would give 0.72 and 0.0130 would give 0.78 — so the figure
// can't have been mis-transcribed in either direction. The same rate appears
// in the Town of Claremont's on-site drainage specification, so it is not one
// council's quirk.
//
// It is not universal either, and the spread runs upward as well as down. The
// City of Swan publishes 0.0122 for single residential and 0.0159 for
// commercial, industrial and R30-or-higher density — the latter is 27% more
// than this module returns. That is why SOAKWELL_CAVEAT names the rate rather
// than hiding it, and why it says out loud that some councils want more. This
// module is sized for the residential work we do; anything commercial should
// be checked against the council before it goes on a plan.
//
// Deliberately not claimed anywhere: which design storm 12.5 mm represents.
// Secondary sources disagree — 1:10 and 1:20 are both asserted — and the
// council's own sheet doesn't say. "12.5 mm retained" is arithmetic and true;
// a storm event would be a guess wearing a number.

// ---------------------------------------------------------------------------
// The formula
// ---------------------------------------------------------------------------

/** Cubic metres of storage per square metre of roof or paved area. */
export const RATE_M3_PER_M2 = 0.0125;

/** The same rate said the way a person understands it. */
export const RATE_MM_RETAINED = 12.5;

/**
 * Storage required for a catchment area, in cubic metres.
 *
 * Rounded to two decimals because that is the precision the sheet works to and
 * the precision every capacity in the table is printed to — carrying more
 * places makes 0.7499999 fail a comparison against a 0.75 requirement.
 */
export function requiredVolume(areaM2) {
  const a = Number(areaM2);
  if (!Number.isFinite(a) || a <= 0) return 0;
  return round2(a * RATE_M3_PER_M2);
}

const round2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// The table, as printed
// ---------------------------------------------------------------------------

/** Standard precast soakwells: diameter and depth in mm, capacity in m³. */
export const SOAKWELLS = [
  { dia: 600,  depth: 600,  capacity: 0.17 },
  { dia: 900,  depth: 600,  capacity: 0.38 },
  { dia: 900,  depth: 900,  capacity: 0.57 },
  { dia: 900,  depth: 1200, capacity: 0.76 },
  { dia: 1070, depth: 600,  capacity: 0.54 },
  { dia: 1070, depth: 1200, capacity: 1.09 },
  { dia: 1200, depth: 600,  capacity: 0.68 },
  { dia: 1200, depth: 900,  capacity: 1.02 },
  { dia: 1200, depth: 1200, capacity: 1.36 },
  { dia: 1200, depth: 1500, capacity: 1.70 },
  { dia: 1500, depth: 600,  capacity: 1.06 },
  { dia: 1500, depth: 1200, capacity: 2.10 },
  { dia: 1500, depth: 1500, capacity: 2.65 },
  { dia: 1800, depth: 600,  capacity: 1.53 },
  { dia: 1800, depth: 900,  capacity: 2.29 },
  { dia: 1800, depth: 1200, capacity: 3.05 },
  { dia: 1800, depth: 1500, capacity: 3.82 },
  { dia: 1800, depth: 1800, capacity: 4.58 },
];

/** "1200 × 900" — how a builder and a supplier both say it. */
export const sizeLabel = (s) => `${s.dia} × ${s.depth}`;

/** A stable id for a size, for React keys and for reading a saved selection. */
export const sizeKey = (s) => `${s.dia}x${s.depth}`;

/** Find a size by its key. Returns null rather than undefined so a bad value
 *  out of a form is a miss, not a crash two lines later. */
export function findSize(key) {
  return SOAKWELLS.find((s) => sizeKey(s) === key) || null;
}

// ---------------------------------------------------------------------------
// Choosing wells
// ---------------------------------------------------------------------------

/**
 * More than this many wells of one size and the answer has stopped being
 * useful — nobody puts fourteen 600 × 600s in a back yard. Options past it are
 * dropped rather than shown and ignored.
 */
export const MAX_WELLS = 10;

/**
 * Ways to make up a required volume out of one repeated standard size.
 *
 * One size repeated, not a mixed set, because that is how they are bought and
 * how they are drawn on a site plan. Ordered by fewest wells, then by least
 * excess capacity, so the first option is the one most people want and the
 * rest are there for whatever the supplier actually has in the yard.
 *
 * Every option holds at least the required volume — the sheet's "always round
 * up" rule, applied by construction rather than by advice.
 */
export function options(requiredM3, { max = MAX_WELLS } = {}) {
  const need = round2(Number(requiredM3) || 0);
  if (need <= 0) return [];

  const out = [];
  for (const s of SOAKWELLS) {
    // The epsilon is doing real work: 0.75 / 0.25 is 2.9999999999999996 in
    // binary floating point, and a bare ceil would buy a third well for it.
    const n = Math.ceil(need / s.capacity - 1e-9);
    if (n > max) continue;
    const total = round2(n * s.capacity);
    out.push({
      size: s, count: n, total,
      excess: round2(total - need),
      label: n === 1 ? sizeLabel(s) : `${n} × ${sizeLabel(s)}`,
    });
  }

  return out.sort((a, b) =>
    a.count - b.count || a.excess - b.excess || a.size.dia - b.size.dia);
}

/**
 * The one to lead with.
 *
 * The fewest wells that will do it, and among those the least wasted capacity.
 * A single well when a single well exists, which is what the council sheet's
 * own worked example returns.
 */
export function bestOption(requiredM3, opts = {}) {
  return options(requiredM3, opts)[0] || null;
}

/** Total capacity of a list of { size, count } — what's already in the ground. */
export function totalCapacity(wells = []) {
  return round2(
    wells.reduce((sum, w) => {
      const s = w.size || findSize(w.key);
      const n = Math.max(0, Math.floor(Number(w.count) || 0));
      return s ? sum + s.capacity * n : sum;
    }, 0)
  );
}

// ---------------------------------------------------------------------------
// The two questions people actually arrive with
// ---------------------------------------------------------------------------

/**
 * New wells for a new structure, with nothing existing to count.
 *
 * `areas` is whatever contributes: the roof, and any paving that drains to the
 * same place. They are summed rather than asked for as one number because a
 * patio added to a house is two areas to the person filling it in, and adding
 * them up in your head is where the mistake goes in.
 */
export function sizeNew({ roofM2 = 0, pavedM2 = 0 } = {}) {
  const area = round2(num(roofM2) + num(pavedM2));
  const required = requiredVolume(area);
  if (!required) return { ok: false, reason: "incomplete" };
  return {
    ok: true,
    area,
    required,
    options: options(required),
    best: bestOption(required),
  };
}

/**
 * Adding to a lot that already has soakwells.
 *
 * The council sizes storage against the *whole* catchment, not the new part of
 * it, so an extension is assessed on existing roof plus proposed roof. What is
 * already in the ground counts towards that total — which is the entire point
 * of the question, and the thing people get wrong by sizing the new patio on
 * its own and finding the house was never covered either.
 *
 * Returns the shortfall, and what would close it. A shortfall of zero is a
 * real answer and says so; it is not the same as an unanswered form.
 */
export function sizeExisting({
  existingRoofM2 = 0, proposedRoofM2 = 0, pavedM2 = 0, existingWells = [],
} = {}) {
  const existingArea = round2(num(existingRoofM2));
  const proposedArea = round2(num(proposedRoofM2) + num(pavedM2));
  const area = round2(existingArea + proposedArea);
  const required = requiredVolume(area);
  if (!required) return { ok: false, reason: "incomplete" };

  const have = totalCapacity(existingWells);
  const shortfall = round2(Math.max(0, required - have));

  return {
    ok: true,
    existingArea, proposedArea, area,
    required, have,
    shortfall,
    covered: shortfall <= 0,
    // Spare capacity is worth naming: it is the difference between "you're
    // fine" and "you're fine with 0.02 m³ to spare", and only one of those
    // should be relied on without someone checking the wells are sound.
    spare: round2(Math.max(0, have - required)),
    options: shortfall > 0 ? options(shortfall) : [],
    best: shortfall > 0 ? bestOption(shortfall) : null,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// ---------------------------------------------------------------------------
// What every screen using this has to say
// ---------------------------------------------------------------------------

export const SOAKWELL_SOURCE =
  "Formula and capacities from the City of Bayswater “Recommended Soakwell " +
  "Capacity” sheet: area (m²) × 0.0125 = volume (m³), rounded up to the next " +
  "standard size.";

export const SOAKWELL_CAVEAT =
  "Perth councils vary, and some publish their own sizing tables. This uses " +
  "Bayswater's rate of 12.5 mm retained on site, which is also the Town of " +
  "Claremont's. Some councils require more — the City of Swan asks about a " +
  "quarter again for commercial, industrial and higher-density work — so " +
  "check your own council, or ask us and we'll tell you what they expect. " +
  "Capacities are the nominal figures on the sheet; your supplier's own " +
  "capacity for the well you buy is the one that counts.";

/** Note 11 says soakwells barely work in clay. A calculator that hands back a
 *  confident number for a hills block would quietly contradict our own
 *  guidance, so it says it here instead. */
export const SOAKWELL_SOIL_NOTE =
  "Soakwells suit the sandy soils of the coastal plain. On clay or filled " +
  "ground they barely soak at all, and the answer is designed storage, a " +
  "lawful connection, or an engineer's drainage detail — not more wells.";

export const SOAKWELL_SITE_PLAN = [
  "Soakwell locations marked on the site plan, with size (diameter × depth) or capacity in litres.",
  "Downpipe positions, and which well each one connects to.",
  "Clearance from buildings, footings and boundaries — about 1.8 m as a rule of thumb, unless the design says otherwise.",
  "The overflow path for the storm the wells can't hold, falling away from buildings and not over a boundary.",
];
