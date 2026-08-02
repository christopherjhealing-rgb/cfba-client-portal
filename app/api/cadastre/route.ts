// Lot boundary lookup for the site plan tool.
//
// Read-only, signed-in clients only, and it takes exactly two numbers: a
// latitude and a longitude, both of which must land inside Western Australia.
// It never takes a URL, a host, a layer name or a query — the upstream service
// is pinned in lib/cadastre-source.ts, so this route cannot be turned into a
// relay for someone else's traffic however it is called.
//
// What comes back is hard-whitelisted, like every other client API in the
// portal: the parcel's outline, what it is called, and where the boundary came
// from. None of the service's other attributes, none of its own URLs, and
// nothing about how the lookup was made.
//
// Failure is not exceptional here. New subdivisions are a large share of
// CFBA's work and they are routinely missing from the cadastre, so "we didn't
// find it" is an ordinary 200 with `found: false` and a reason — the client
// then does exactly what the tool did before this existed. Only a signed-out
// caller or a nonsense coordinate is an error.

import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { cadastreKey, inWA, parseParcel, dedupeRing } from "@/lib/cadastre.mjs";
import { CADASTRE_READY, CADASTRE_SOURCE, fetchParcel } from "@/lib/cadastre-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_OUT = {
  error: "Your session has ended — sign in again and you can pick up where you left off.",
};

/** How long a "not on the cadastre" answer is trusted for. A brand new
 *  estate turns up in the State's records eventually, and a client who tries
 *  again next month should get the real boundary rather than last month's
 *  blank. A found lot is kept indefinitely: boundaries don't move. */
const MISS_TTL_DAYS = 14;

interface CachedLot {
  ring: [number, number][];
  lotId: string;
  address: string;
  source: string;
  fetched: string;
}
interface CachedMiss {
  miss: true;
  fetched: string;
}
type Cached = CachedLot | CachedMiss;

const isMiss = (c: Cached): c is CachedMiss => "miss" in c && c.miss === true;

const staleMiss = (c: CachedMiss) => {
  const at = Date.parse(c.fetched);
  return !Number.isFinite(at) || Date.now() - at > MISS_TTL_DAYS * 86400_000;
};

/** The only shape this route ever returns for a lot. */
const lotBody = (lot: CachedLot, cached: boolean) => ({
  found: true as const,
  cached,
  lot: {
    ring: lot.ring,
    lotId: lot.lotId,
    address: lot.address,
    source: lot.source,
    fetched: lot.fetched,
  },
});

export async function GET(req: Request) {
  try {
    const session = await getClientSession();
    if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });

    const url = new URL(req.url);
    const lat = Number(url.searchParams.get("lat"));
    const lng = Number(url.searchParams.get("lng"));
    if (!inWA(lat, lng)) {
      return NextResponse.json(
        { error: "That doesn't look like a spot in Western Australia — check the address and try again." },
        { status: 400 },
      );
    }

    // Cache first, always. One lookup per lot, ever, whoever asks for it —
    // the difference between paying Landgate once and paying every time
    // somebody opens their plan.
    const key = cadastreKey(lat, lng);
    const hit = await repo.getSetting<Cached>(key).catch(() => null);
    if (hit && !isMiss(hit) && Array.isArray(hit.ring) && hit.ring.length >= 3) {
      return NextResponse.json(lotBody(hit, true));
    }
    if (hit && isMiss(hit) && !staleMiss(hit)) {
      return NextResponse.json({ found: false, reason: "not-found", cached: true });
    }

    if (!CADASTRE_READY) {
      return NextResponse.json({ found: false, reason: "unconfigured", cached: false });
    }

    const res = await fetchParcel(lat, lng);
    if (!res.ok) {
      return NextResponse.json({ found: false, reason: res.reason, cached: false });
    }

    const parcel = parseParcel(res.raw);
    const ring = dedupeRing(parcel?.ring);
    const fetched = new Date().toISOString().slice(0, 10);
    if (!parcel || ring.length < 3) {
      // The service answered and there is nothing there. Remember that for a
      // fortnight so a new estate doesn't cost a lookup on every visit.
      await repo.setSetting(key, { miss: true, fetched } satisfies CachedMiss).catch(() => {});
      return NextResponse.json({ found: false, reason: "not-found", cached: false });
    }

    const lot: CachedLot = {
      ring,
      lotId: parcel.lotId,
      address: parcel.address,
      source: CADASTRE_SOURCE,
      fetched,
    };
    // A cache write that fails costs another lookup later; it must never cost
    // the client the boundary that was just found.
    await repo.setSetting(key, lot).catch(() => {});
    return NextResponse.json(lotBody(lot, false));
  } catch (e) {
    console.error("cadastre lookup failed:", e);
    // Even a bug here lands the client on the hand-drawn path rather than on
    // an error they can do nothing about.
    return NextResponse.json({ found: false, reason: "upstream", cached: false });
  }
}
