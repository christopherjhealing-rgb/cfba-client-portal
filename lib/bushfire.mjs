/**
 * Reading whether a point falls in a designated Bush Fire Prone Area.
 *
 * WA's DFES publishes the Bush Fire Prone Areas as polygons on Landgate's SLIP.
 * A lot inside one of those polygons triggers the need for a BAL (Bushfire
 * Attack Level) assessment before habitable building work. This module turns
 * the service's answer into a single yes/no — and no more than that.
 *
 * It does NOT give the BAL rating (BAL-12.5, 19, 29, 40, FZ). That is a site
 * assessment — slope, vegetation classification, separation distances — and
 * cannot be decided from an address. All this settles is the one question that
 * CAN be answered from a coordinate: is the lot in a bush fire prone area at
 * all, so that a BAL assessment is on the table.
 *
 * Plain ESM on the cadastre pattern. Nothing here touches the network — the one
 * module that does is lib/bushfire-source.ts — so every shape the service might
 * answer in is proven without SLIP. See tests/bushfire.test.mjs.
 */

import { inWA, WA_BBOX } from "./cadastre.mjs";

// Re-exported so a caller has one import for the whole feature, and so the
// State bounding box the route guards on is defined in exactly one place.
export { inWA, WA_BBOX };

/** Cache key for one lookup, to the same ~metre as the cadastre so a lot
 *  geocoded once answers from the same point.
 *
 *  `source` — which layer the answer came from — is part of the key on purpose:
 *  the designation layer can be repointed (BUSHFIRE_URL), and an answer one
 *  layer gave must not be served for another. Without it, switching from a
 *  layer that called a lot "not prone" to one that calls it "prone" would keep
 *  handing back the old answer until the cache aged out. */
export function bushfireKey(lat, lng, source = "") {
  const at = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
  return source ? `bushfire:${at}:${source}` : `bushfire:${at}`;
}

/** A short stable tag for the upstream URL, used as the cache key's source.
 *
 *  The WHOLE URL, not just the trailing layer number: SLIP hosts two
 *  similarly-named bushfire services whose layer numbers mean different
 *  things, so ".../Bush_Fire_Prone_Areas/MapServer/3" and
 *  ".../Bush_Fire_Prone_Areas_FS/MapServer/3" would otherwise share a cache
 *  slot — and a stale "not prone" from the wrong service would mask the right
 *  answer for months after the URL was corrected. */
export function sourceTag(url) {
  const s = String(url || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * How many features the service returned for a point-intersect query.
 *
 * Accepts the shapes SLIP might answer in — a count (`{count}` from
 * returnCountOnly=true, the shape the portal actually asks for), GeoJSON
 * (`features`), an ArcGIS identify (`results`) — and returns null for anything
 * we can't read. ArcGIS reports its OWN failures as a 200 with an `{ error }`
 * body, so that shape is "couldn't tell", not "no features": the difference
 * between saying nothing and wrongly telling a client their bushfire-prone lot
 * is clear.
 */
function featureCount(raw) {
  if (!raw || typeof raw !== "object") return null;
  if ("error" in raw && raw.error) return null;
  if (Number.isFinite(raw.count)) return raw.count;
  const list = Array.isArray(raw.features) ? raw.features
    : Array.isArray(raw.results) ? raw.results
    : null;
  return list ? list.length : null;
}

/**
 * The verdict for a point, from the service's raw answer.
 *
 * The query asks the Bush Fire Prone Areas layer for the polygons that contain
 * the point. That layer holds the prone areas ONLY, so a single returned
 * feature is the whole answer — the point is inside one. No features means the
 * service looked and the point is outside every prone area.
 *
 *   { prone: true  }  — inside a designated bush fire prone area
 *   { prone: false }  — the service answered, and it's outside
 *   null              — couldn't determine; the caller says so, never "safe"
 */
export function readBushfire(raw) {
  const n = featureCount(raw);
  if (n === null) return null;
  return { prone: n > 0 };
}

/** The BAL ratings a client can pick, and the exemption code — the EXACT
 *  labels on the board's BAL column (status_10__1), read off the live board.
 *  What the portal writes has to match an option that already exists, or
 *  create_labels_if_missing would mint a stray label on the firm's board. */
export const BAL_RATINGS = ["LOW", "12.5", "19", "29", "40", "FZ"];
export const BAL_EXEMPTION = "R31BA(1) Item1 (c)";
export const BAL_LABELS = [...BAL_RATINGS, BAL_EXEMPTION];

/**
 * Which BAL-relevant structures a job's item rows contain — so the assessment
 * never asks what the form already knows.
 *
 * Only Class 10a BUILDINGS trigger the bushfire questions. 10b work (retaining
 * walls, pools, tanks) never does; nor do CBC or commercial lodgements — the
 * exemption rule turns on the dwelling the structure serves, and those jobs
 * aren't a structure beside a house. Free-text rows are matched by word, and a
 * 10a row that matches nothing triggers nothing: better to stay quiet than to
 * interrogate someone lodging a flagpole.
 */
export function balKinds(items) {
  const kinds = { patio: false, shed: false };
  for (const it of items || []) {
    if (!it || typeof it !== "object" || it.classKey !== "10a") continue;
    const said = `${it.type || ""} ${it.text || ""}`.toLowerCase();
    if (/patio|carport|verandah?|pergola|alfresco|gazebo/.test(said)) kinds.patio = true;
    if (/shed|workshop|garage/.test(said)) kinds.shed = true;
  }
  return kinds;
}

/**
 * What a Class 10 structure in a bush fire prone area needs — from the three
 * things only the client knows and the portal can't: how far the structure
 * sits from the house, whether it's a patio/carport or a shed, and (for a
 * patio/carport) whether the house predates the 2016 bushfire provisions.
 *
 * The rule, as CFBA applies it:
 *   • 6 m or more from the house → nothing.
 *   • within 6 m, a shed → its own new BAL report.
 *   • within 6 m, a patio or carport → the house's BAL rating, evidenced;
 *       but a house built before 2016 was never assessed, so it's exempt.
 *
 * Returns null until enough is answered to decide. `tone` drives the colour;
 * `summary` is the one line filed with the lodgement; `mondayBal` is the BAL
 * column label to stamp on the card, or null to leave it for the office to set.
 * Pure — see tests/bushfire.test.mjs.
 */
export function balVerdict({ distance, kind, age, rating } = {}) {
  if (distance === "far") {
    return {
      tone: "clear",
      headline: "No BAL rating is required.",
      detail: "The structure is 6 m or more from the house, so bushfire construction doesn't apply to it.",
      summary: "BAL: not required — 6 m or more from the house.",
      mondayBal: null,
    };
  }
  if (distance !== "near") return null;

  if (kind === "shed") {
    return {
      tone: "action",
      headline: "The shed needs its own new BAL report.",
      detail: "A shed within 6 m of the house is assessed in its own right, not off the house's rating. We don't prepare BAL reports — attach the shed's new report in the box below; the job can't lodge without it.",
      summary: "BAL: shed within 6 m — needs its own new BAL report.",
      mondayBal: null,
    };
  }
  if (kind !== "patio") return null;

  if (age === "pre2016") {
    return {
      tone: "clear",
      headline: "Exempt — no BAL rating needed.",
      detail: "The house was built before 2016, so it was never BAL-assessed and its patios and carports are exempt.",
      summary: "BAL: exempt — patio/carport on a house built before 2016.",
      mondayBal: BAL_EXEMPTION,
    };
  }
  if (age === "post2016") {
    const r = BAL_RATINGS.includes(rating) ? rating : null;
    return {
      tone: "action",
      headline: "We'll need the house's BAL rating.",
      detail: "A patio or carport within 6 m takes the house's BAL rating. Tell us what it is if you know it, and attach the evidence — the original BAL report or certificate, the house's Certificate of Design Compliance, or the original house plans if it's noted on them — in the box below; the job can't lodge without it. We don't prepare BAL reports ourselves.",
      summary: r
        ? `BAL: patio/carport within 6 m, house 2016 or later — rating ${r} (evidence to follow).`
        : "BAL: patio/carport within 6 m, house 2016 or later — needs the house's BAL rating and evidence.",
      mondayBal: r,
    };
  }
  if (age === "unsure") {
    return {
      tone: "info",
      headline: "We'll check the house's age when we assess it.",
      detail: "If the house was built before 2016 it's exempt; if it's newer we'll need evidence of its BAL rating. Lodge the job and we'll let you know which.",
      summary: "BAL: patio/carport within 6 m, house age unknown — to confirm on assessment.",
      mondayBal: null,
    };
  }
  return null;
}
