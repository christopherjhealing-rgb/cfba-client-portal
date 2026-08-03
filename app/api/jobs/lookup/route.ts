import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { matchCompany, sameRef } from "@/lib/core.mjs";
import { getPastJobs } from "@/lib/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Does this client have a job with this reference?
 *
 * Exists so somebody amending an old job finds out BEFORE they fill the form
 * in and press Lodge. Their current jobs are in the page already; this is for
 * the ones the portal never synced, which is most of the board.
 *
 * It says nothing a client couldn't learn by lodging: a reference belonging to
 * someone else and a reference that doesn't exist give the identical answer,
 * so it can't be used to find out whose jobs are whose.
 */

// Per-company, in memory. Enough to stop a script walking the reference range
// — which is worth stopping only because each miss costs a Monday query, not
// because a miss leaks anything.
const hits = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX = 20;

function tooMany(key: string, now = Date.now()): boolean {
  const from = now - WINDOW_MS;
  if (hits.size > 2000) {
    for (const [k, times] of hits) {
      const live = times.filter((t) => t > from);
      if (live.length) hits.set(k, live); else hits.delete(k);
    }
  }
  const arr = (hits.get(key) || []).filter((t) => t > from);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > MAX;
}

const NOT_FOUND = { found: false as const };

export async function GET(req: Request) {
  const session = await getClientSession();
  if (!session) return NextResponse.json(NOT_FOUND, { status: 401 });

  const ref = (new URL(req.url).searchParams.get("ref") || "").trim().slice(0, 40);
  // Two characters can't identify a job and would match half the board.
  if (ref.replace(/[\s\-\/._#]/g, "").length < 3) return NextResponse.json(NOT_FOUND);

  if (tooMany(session.companyId)) {
    return NextResponse.json(
      { found: false, error: "Too many lookups — wait a minute and try again." },
      { status: 429 }
    );
  }

  try {
    // Already in the portal: no need to trouble the board.
    const own = await repo.listJobsForCompany(session.companyId);
    const mineAlready = own.find((j) => sameRef(j.ref, ref));
    if (mineAlready) {
      return NextResponse.json({
        found: true, ref: mineAlready.ref, address: mineAlready.address, historic: false,
      });
    }

    // The past-jobs index, which already knows every job we've done for them.
    // Answers instantly and costs nothing, and covers the case this endpoint
    // exists for. The board is only troubled when the index doesn't have it —
    // a job finished since the index was last built.
    const past = await getPastJobs(session.companyId).catch(() => []);
    const known = past.find((j) => sameRef(j.ref, ref));
    if (known) {
      return NextResponse.json({
        found: true, ref: known.ref, address: known.address, historic: true,
      });
    }

    const cards = await monday.findByRef(ref);
    if (!cards.length) return NextResponse.json(NOT_FOUND);

    const companies = await repo.companiesForMatch();
    const mine = companies.filter((c) => c.id === session.companyId);
    const card = cards.find(
      (c) => matchCompany({ clientName: c.clientName, email: c.email }, mine) === session.companyId
    );
    // Somebody else's job answers exactly like a job that doesn't exist.
    if (!card) return NextResponse.json(NOT_FOUND);

    return NextResponse.json({
      found: true, ref: card.ref, address: card.address, historic: true,
    });
  } catch (e) {
    console.warn("job lookup failed:", (e as Error).message);
    return NextResponse.json(NOT_FOUND);
  }
}
