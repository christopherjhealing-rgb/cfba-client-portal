// The one module in the portal that talks to Landgate.
//
// Everything else about this feature — reading the parcel, projecting it,
// working out the frontage, measuring the setbacks — is pure and tested in
// lib/cadastre.mjs. This file is deliberately the only place a socket opens,
// so the untestable part is as small as it can be and the rest is proven
// without the network at all.
//
// ---------------------------------------------------------------------------
// THE ENDPOINT IS UNVERIFIED.
//
// This build had no outbound access to services.slip.wa.gov.au, so the URL
// below is the best-known Landgate/SLIP cadastre layer rather than one that
// has been called and seen to answer. That is why it is an environment
// variable with a default and not a constant: if it is wrong, correcting it
// is a Vercel setting and a redeploy, not a code change. docs/SPECS.md § 7
// has the exact query this builds, what a good answer looks like, and how to
// find the right layer URL in Landgate's own service directory.
// ---------------------------------------------------------------------------
//
// The query is an ArcGIS REST layer query: a point, in WGS84, asking for the
// polygon that contains it. Nothing in it comes from the client except two
// numbers that have already been checked against Western Australia's bounding
// box — the host is pinned here and can never be chosen by a request, so this
// route can never be turned into a relay for someone else's traffic.

import { env, DEMO_MODE } from "./env";

export const CADASTRE_SOURCE = env.cadastreSource;

/** Whether the feature is switched on AND has somewhere to call. Off is the
 *  default: until the endpoint has been confirmed against the live service,
 *  the site plan tool behaves exactly as it did before this build. */
export const CADASTRE_READY = env.cadastreEnabled && !!env.cadastreUrl;

export type ParcelMiss =
  | "unconfigured"    // no CADASTRE_ENABLED=1, or no URL
  | "not-found"       // the service answered, the lot isn't in the cadastre
  | "timeout"
  | "upstream"        // a non-200, or an answer that wasn't JSON
  | "network";

export type ParcelResult =
  | { ok: true; raw: unknown }
  | { ok: false; reason: ParcelMiss };

/** The exact URL a lookup calls. Exported so it can be read back in a test
 *  and printed in the runbook — never so a caller can supply one. */
export function parcelQueryUrl(lat: number, lng: number): string {
  const base = env.cadastreUrl.replace(/\/+$/, "");
  const url = new URL(`${base}/query`);
  const p = url.searchParams;
  p.set("geometry", `${lng},${lat}`);        // ArcGIS wants x,y — longitude first
  p.set("geometryType", "esriGeometryPoint");
  p.set("inSR", "4326");
  p.set("outSR", "4326");
  p.set("spatialRel", "esriSpatialRelIntersects");
  p.set("outFields", "*");
  p.set("returnGeometry", "true");
  p.set("returnCountOnly", "false");
  p.set("resultRecordCount", "1");
  p.set("f", "geojson");
  // SLIP's public services are open. An authenticated one takes a token, and
  // it is a server-side variable — never NEXT_PUBLIC_, never in a response.
  if (env.cadastreToken) p.set("token", env.cadastreToken);
  return url.toString();
}

/**
 * One lookup. Returns the service's own JSON untouched — parsing it is
 * lib/cadastre.mjs's job, and keeping the two apart is what lets every
 * response shape be tested without a network.
 *
 * Never throws. Every way this can fail is a reason code, and every reason
 * code lands the client in the same warm place: the lot isn't there yet, draw
 * it by hand. New subdivisions are a large share of CFBA's work and will
 * often be missing from the cadastre entirely, so that path is a main road,
 * not an error handler.
 */
export async function fetchParcel(lat: number, lng: number): Promise<ParcelResult> {
  // A development seam, demo mode only: point CADASTRE_FIXTURE at a JSON file
  // and the success path can be walked end to end without Landgate. It cannot
  // be reached in production — DEMO_MODE means no Supabase is configured.
  if (DEMO_MODE && env.cadastreFixture) {
    try {
      const { readFile } = await import("node:fs/promises");
      return { ok: true, raw: JSON.parse(await readFile(env.cadastreFixture, "utf8")) };
    } catch (e) {
      console.warn("cadastre fixture unreadable:", (e as Error).message);
      return { ok: false, reason: "unconfigured" };
    }
  }

  if (!CADASTRE_READY) return { ok: false, reason: "unconfigured" };

  const stop = AbortSignal.timeout(env.cadastreTimeoutMs);
  try {
    const r = await fetch(parcelQueryUrl(lat, lng), {
      signal: stop,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!r.ok) {
      console.warn(`cadastre upstream ${r.status} for ${lat},${lng}`);
      return { ok: false, reason: "upstream" };
    }
    const text = await r.text();
    try {
      return { ok: true, raw: JSON.parse(text) };
    } catch {
      // ArcGIS answers a bad layer index with an HTML page or an error object
      // rather than a 4xx, which is exactly the "wrong URL" case.
      console.warn("cadastre upstream returned non-JSON — check CADASTRE_URL");
      return { ok: false, reason: "upstream" };
    }
  } catch (e) {
    const name = (e as Error)?.name;
    if (name === "TimeoutError" || name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    console.warn("cadastre lookup failed:", (e as Error).message);
    return { ok: false, reason: "network" };
  }
}
