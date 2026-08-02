import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import { env } from "@/lib/env";
import { groupJobs, isClientVisible } from "@/lib/core.mjs";
import { unreadCount } from "@/lib/unread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Jobs the payload will ever name. A client sitting on more ready packages
 *  than this has better news than a notification can carry. */
const READY_CAP = 20;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * The portal's heartbeat, polled by a signed-in browser about once a minute
 * so a client who's sitting on a page finds out about a new message or a
 * finished certificate without reaching for refresh.
 *
 * Deliberately the smallest thing that can answer two questions: how many
 * message threads are unread, and which jobs are ready to download. The two
 * fields below are written out one at a time rather than spread from a job
 * record, so nothing can be widened here by accident — if a future feature
 * seems to want a third field, it needs saying out loud first.
 *
 * Both answers come from the same helpers the pages use (unreadCount, and
 * the existing job grouping), so this can never disagree with what the
 * client sees when they land on Messages or Downloads.
 */
export async function GET() {
  const session = await getClientSession();
  // Signed out, or a session that's quietly expired. The browser stops
  // polling for good on this rather than knocking every minute.
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: NO_STORE });
  }

  try {
    const [unread, jobs] = await Promise.all([
      unreadCount(session.companyId),
      repo.listJobsForCompany(session.companyId),
    ]);

    const grouped = groupJobs(
      jobs.map(repo.toPortalJob).filter(isClientVisible),
      new Date(),
      env.retentionMonths
    );
    const ready = grouped.ready.slice(0, READY_CAP).map((j) => ({
      ref: String(j.ref),
      address: String(j.address || ""),
    }));

    return NextResponse.json({ unread, ready }, { headers: NO_STORE });
  } catch {
    // Never guess. An empty answer would read as "everything's read and
    // nothing is ready", and the browser would write that down as the truth
    // — quietly swallowing news it had never passed on. Fail instead, and
    // let the poller back off until the store is answering again.
    return new Response(null, { status: 503, headers: NO_STORE });
  }
}
