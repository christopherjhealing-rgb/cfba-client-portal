// The one module that asks Landgate whether a point is bush fire prone.
//
// Everything about reading the answer is pure and tested in lib/bushfire.mjs.
// This file is the only place a socket opens for the feature, so the untestable
// part is as small as it can be.
//
// ---------------------------------------------------------------------------
// THE ENDPOINT IS UNVERIFIED — exactly like the cadastre.
//
// This build has no outbound access to services.slip.wa.gov.au, so the URL is
// a Vercel setting with no default rather than a constant guessed in code: a
// wrong bushfire answer is worse than no answer, so the feature stays OFF until
// BUSHFIRE_URL is set to the confirmed DFES "Bush Fire Prone Areas" layer and
// BUSHFIRE_ENABLED=1. Find the layer in Landgate's SLIP service directory
// (services.slip.wa.gov.au/public/rest/services) under the emergency/DFES
// services; it is an ArcGIS MapServer/FeatureServer layer of prone-area
// polygons. docs/SPECS.md records the query this builds and what a good answer
// looks like.
// ---------------------------------------------------------------------------
//
// The query is an ArcGIS REST layer query: a point, in WGS84, asking for the
// polygon that contains it. The only things in it from the caller are two
// numbers already checked against Western Australia's bounding box — the host
// is pinned here and can never be chosen by a request, so this route can never
// be turned into a relay for someone else's traffic.

import { env, DEMO_MODE } from "./env";

export const BUSHFIRE_SOURCE = env.bushfireSource;

/** On only when it's switched on AND has somewhere to call. Off is the default,
 *  so until the endpoint is confirmed the portal behaves exactly as before. */
export const BUSHFIRE_READY = env.bushfireEnabled && !!env.bushfireUrl;

export type BushfireMiss =
  | "unconfigured"   // no BUSHFIRE_ENABLED=1, or no URL
  | "timeout"
  | "upstream"       // a non-200, or an answer that wasn't JSON
  | "network";

export type BushfireResult =
  | { ok: true; raw: unknown }
  | { ok: false; reason: BushfireMiss };

/** Bumped whenever the query below changes shape. Part of the cache key, so
 *  every answer fetched by an older shape is retired the moment the shape
 *  changes — a cached verdict is only as good as the query that fetched it. */
export const BUSHFIRE_QUERY_VERSION = "2";

/** The exact URL a lookup calls. Exported so a test and the runbook can read it
 *  back — never so a caller can supply one.
 *
 *  A COUNT query, deliberately the plainest thing ArcGIS can be asked: no
 *  geometry back, no fields, no f=geojson (which some servers don't support),
 *  no resultRecordCount (which needs pagination support). This exact shape was
 *  verified by hand against the live SLIP service on a known designated lot —
 *  layers 0, 2 and 3 all answered {"count":1} — after the earlier, fancier
 *  query shape disagreed with it. All we ever need is whether a prone-area
 *  polygon contains the point, and a count answers that in ~20 bytes. */
export function bushfireQueryUrl(lat: number, lng: number): string {
  const base = env.bushfireUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/query`);
  const p = url.searchParams;
  p.set("geometry", `${lng},${lat}`);       // ArcGIS wants x,y — longitude first
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("returnCountOnly", "true");
  p.set("f", "json");
  if (env.bushfireToken) p.set("token", env.bushfireToken);
  return url.toString();
}

/**
 * One lookup. Returns the service's own JSON untouched — reading it is
 * lib/bushfire.mjs's job, and keeping the two apart is what lets every response
 * shape be tested without a network.
 *
 * Never throws. Every failure is a reason code, and the route turns all of them
 * into the same quiet outcome: no flag shown. A missing bushfire notice is a
 * non-event; a wrong one isn't.
 */
export async function fetchBushfire(lat: number, lng: number): Promise<BushfireResult> {
  // A demo-only seam, mirroring the cadastre: point BUSHFIRE_FIXTURE at a JSON
  // file and the whole path can be walked without SLIP. Unreachable in
  // production — DEMO_MODE means no Supabase is configured.
  if (DEMO_MODE && env.bushfireFixture) {
    try {
      const { readFile } = await import("node:fs/promises");
      return { ok: true, raw: JSON.parse(await readFile(env.bushfireFixture, "utf8")) };
    } catch (e) {
      console.warn("bushfire fixture unreadable:", (e as Error).message);
      return { ok: false, reason: "unconfigured" };
    }
  }

  if (!BUSHFIRE_READY) return { ok: false, reason: "unconfigured" };

  const stop = AbortSignal.timeout(env.bushfireTimeoutMs);
  try {
    const r = await fetch(bushfireQueryUrl(lat, lng), {
      signal: stop,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      console.warn(`bushfire upstream ${r.status} for ${lat},${lng}`);
      return { ok: false, reason: "upstream" };
    }
    const text = await r.text();
    try {
      return { ok: true, raw: JSON.parse(text) };
    } catch {
      console.warn("bushfire upstream returned non-JSON — check BUSHFIRE_URL");
      return { ok: false, reason: "upstream" };
    }
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    console.warn("bushfire lookup failed:", (e as Error).message);
    return { ok: false, reason: "network" };
  }
}
