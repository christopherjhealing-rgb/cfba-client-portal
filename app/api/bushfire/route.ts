// Bush fire prone check for the Lodge a Job form.
//
// Read-only, signed-in clients only, and it takes exactly two numbers: a
// latitude and a longitude, both of which must land inside Western Australia.
// It never takes a URL, a host or a layer — the upstream service is pinned in
// lib/bushfire-source.ts, so this route cannot be turned into a relay.
//
// What comes back is hard-whitelisted, like every client API in the portal: a
// single boolean and whether it was answered. None of the service's own fields,
// none of its URLs, nothing about how the lookup was made.
//
// Not finding an answer is ordinary, not an error. No key, the feature off, the
// service quiet, a brand-new lot — all land the same way: { checked: false },
// and the form simply shows no flag. A 400 is only a nonsense coordinate; a 401
// only a signed-out caller.

import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { env } from "@/lib/env";
import { inWA, bushfireKey, readBushfire, sourceTag } from "@/lib/bushfire.mjs";
import { BUSHFIRE_READY, fetchBushfire } from "@/lib/bushfire-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_OUT = {
  error: "Your session has ended — sign in again and you can pick up where you left off.",
};

/** How long an answer is trusted. A prone-area designation changes rarely, but
 *  it does change when DFES revises the map, so it isn't kept forever — a few
 *  months balances not re-charging a lookup on every keystroke against not
 *  quoting a year-old designation. */
const TTL_DAYS = 120;

interface Cached {
  prone: boolean;
  fetched: string;
}

const fresh = (c: Cached) => {
  const at = Date.parse(c.fetched);
  return Number.isFinite(at) && Date.now() - at <= TTL_DAYS * 86400_000;
};

export async function GET(req: Request) {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });

    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!inWA(lat, lng)) {
      return NextResponse.json(
        { error: "That doesn't look like a spot in Western Australia." },
        { status: 400 },
      );
    }

    // Cache first, always — one lookup per lot, whoever asks. Keyed by the
    // point AND the whole upstream URL (hashed), so ANY repoint of
    // BUSHFIRE_URL — layer number, service, host — re-queries rather than
    // serving the old source's answer for a point already looked up.
    const key = bushfireKey(lat, lng, sourceTag(env.bushfireUrl));
    const hit = await repo.getSetting<Cached>(key).catch(() => null);
    if (hit && typeof hit.prone === "boolean" && fresh(hit)) {
      return NextResponse.json({ checked: true, prone: hit.prone, cached: true });
    }

    if (!BUSHFIRE_READY) {
      return NextResponse.json({ checked: false, reason: "unconfigured" });
    }

    const res = await fetchBushfire(lat, lng);
    if (!res.ok) {
      return NextResponse.json({ checked: false, reason: res.reason });
    }

    const verdict = readBushfire(res.raw);
    if (!verdict) {
      // The service answered with something we couldn't read. Say nothing
      // rather than guess — and don't cache a non-answer.
      return NextResponse.json({ checked: false, reason: "upstream" });
    }

    const fetched = new Date().toISOString().slice(0, 10);
    await repo.setSetting(key, { prone: verdict.prone, fetched } satisfies Cached).catch(() => {});
    return NextResponse.json({ checked: true, prone: verdict.prone, cached: false });
  } catch (e) {
    console.error("bushfire lookup failed:", e);
    // Even a bug here just means no flag — never an error the client can't act
    // on, and never a lodgement blocked.
    return NextResponse.json({ checked: false, reason: "upstream" });
  }
}
