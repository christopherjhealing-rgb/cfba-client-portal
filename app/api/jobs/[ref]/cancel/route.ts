import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";
import * as monday from "@/lib/monday";
import { sendMail, officeCancelEmail } from "@/lib/mail";
import { canCancel, CANCELLED_STATUS } from "@/lib/core.mjs";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Free text, but bounded. Long enough for a builder to explain a job properly,
// short enough that it can't be used to post an essay onto the board.
const MAX_REASON = 600;

/**
 * A client asking to cancel their job — a REQUEST the office confirms, not an
 * immediate portal-side cancellation (owner's call, Aug 2026: "we authorise
 * and confirm").
 *
 * What happens on request: the reason lands on the Monday card as an update,
 * the office is emailed, and the portal remembers the request so the job says
 * "cancellation requested" and can't be asked twice. What does NOT happen:
 * no status write — the office cancels the card on the board when they've
 * confirmed, and the next sync flips the portal. Work-stopping stays a human
 * decision; the request just gets it in front of one fast.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  const session = await getClientSession();
  if (!session) {
    return NextResponse.json(
      { error: "Your session has ended — sign in again and you can pick up where you left off." },
      { status: 401 }
    );
  }
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — cancelling is disabled." },
      { status: 403 }
    );
  }

  const ref = decodeURIComponent((await params).ref);
  const job = await repo.getJob(ref);
  // Never leak another company's job — same 404 whether missing or not theirs.
  if (!job || job.companyId !== session.companyId) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (!canCancel(job)) {
    return NextResponse.json(
      {
        error:
          job.mondayStatus === CANCELLED_STATUS
            ? "This job is already cancelled."
            : "This job has been certified, so it can't be cancelled from the portal. " +
              "Give us a ring on 1300 029 074 and we'll talk through what you need.",
      },
      { status: 409 }
    );
  }

  // One request per job. Asking again changes nothing — we already have it.
  const existing = await repo.getSetting<{ at: string }>(`cancelreq:${ref}`).catch(() => null);
  if (existing?.at) {
    return NextResponse.json(
      { error: "You've already asked us to cancel this one — it's with us to confirm. Anything urgent, ring 1300 029 074." },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const reason = String(body.reason || "").trim().slice(0, MAX_REASON);
  if (!reason) {
    return NextResponse.json(
      { error: "Let us know why you're cancelling — a line is plenty." },
      { status: 400 }
    );
  }

  const who = session.displayName
    ? `${session.displayName}, ${session.companyName}`
    : session.companyName;

  // The request onto the card first — the surveyor working the job must see
  // it where they work. Best-effort: the office email below is the second
  // channel, and the portal marker is the client's receipt either way.
  if (job.mondayItemId) {
    try {
      await monday.postUpdate(
        job.mondayItemId,
        `CANCELLATION REQUESTED by ${who} through the client portal — please confirm and cancel the card.\n\nTheir reason:\n${reason}`
      );
    } catch (e) {
      console.warn(`cancel-request ${ref}: could not post to the card:`, (e as Error).message);
    }
  }

  // The portal's memory of the request: shows "cancellation requested" on the
  // job, blocks a duplicate ask, and clears naturally once the office cancels
  // the card (the job then reads Cancelled from the board, which wins).
  await repo.setSetting(`cancelreq:${ref}`, {
    at: new Date().toISOString(), by: who, reason,
  });

  if (env.officeEmail) {
    try {
      const mail = officeCancelEmail({
        companyName: who, ref, address: job.address || "", reason,
      });
      await sendMail([env.officeEmail], mail.subject, mail.html);
    } catch (e) {
      console.warn(`cancel-request ${ref}: office notify failed:`, (e as Error).message);
    }
  }

  await repo.logAudit(
    "job.cancelrequest", ref, `${who}: ${reason}`, session.username || "client"
  );

  // Hard-whitelisted, like every other client response.
  return NextResponse.json({ ok: true });
}
