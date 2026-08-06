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
 *  geocoded once answers both the boundary and the bushfire question from the
 *  same point. */
export function bushfireKey(lat, lng) {
  return `bushfire:${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
}

/**
 * How many features the service returned for a point-intersect query.
 *
 * Accepts the shapes SLIP might answer in — GeoJSON (`features`), an ArcGIS
 * identify (`results`) — and returns null for anything we can't read. ArcGIS
 * reports its OWN failures as a 200 with an `{ error }` body, so that shape is
 * "couldn't tell", not "no features": the difference between saying nothing and
 * wrongly telling a client their bushfire-prone lot is clear.
 */
function featureCount(raw) {
  if (!raw || typeof raw !== "object") return null;
  if ("error" in raw && raw.error) return null;
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
