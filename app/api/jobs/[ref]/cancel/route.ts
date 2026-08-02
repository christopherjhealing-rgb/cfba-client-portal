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

const BOARD_DOWN =
  "We couldn't put that through just now — the job has NOT been cancelled. " +
  "Please try again in a minute, or ring us on 1300 029 074 and we'll do it " +
  "at our end.";

/**
 * A client cancelling their own job.
 *
 * Monday is the gate, deliberately. The alternative — record it here and flag
 * it somewhere for staff — means a portal that says "cancelled" over a board
 * that still says the job is live, and the office finding out only if somebody
 * reads a banner. That is the one failure this feature must not have: the
 * whole point of cancelling is that work stops. So if the board won't take the
 * write, the client is told plainly that nothing happened and given the phone
 * number, which is a worse experience and a correct one. It also keeps Monday
 * as the system of record, which is the rule the rest of the portal follows.
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

  // The reason goes on first. If the status write below then fails, the office
  // is left with a visible request on a live card rather than nothing at all —
  // which is the right way round for this to break.
  if (job.mondayItemId) {
    try {
      await monday.postUpdate(
        job.mondayItemId,
        `Cancelled by ${who} through the client portal.\n\nTheir reason:\n${reason}`
      );
    } catch (e) {
      console.warn(`cancel ${ref}: could not post the reason:`, (e as Error).message);
    }

    // The gate. A card that won't move stops the whole thing here.
    let wrote: monday.StatusWrite;
    try {
      wrote = await monday.setStatus(job.mondayItemId, CANCELLED_STATUS);
    } catch (e) {
      console.error(`cancel ${ref}: Monday write threw:`, (e as Error).message);
      return NextResponse.json({ error: BOARD_DOWN }, { status: 502 });
    }
    if (!wrote.ok && wrote.reason === "no-such-label") {
      console.error(
        `cancel ${ref}: the board's status column has no "${CANCELLED_STATUS}" label. ` +
        `Labels on the column: ${wrote.labels.join(", ")}.`
      );
      return NextResponse.json({ error: BOARD_DOWN }, { status: 502 });
    }
    if (!wrote.ok && wrote.reason === "moved-on") {
      console.error(`cancel ${ref}: Monday refused — card is at "${wrote.status}".`);
      return NextResponse.json({ error: BOARD_DOWN }, { status: 502 });
    }
    // reason "off" is demo mode or no token: nothing was written anywhere, and
    // nothing was meant to be. The dry run carries on.
  }

  // The board has it. Now the portal, so the job reads as cancelled straight
  // away rather than after the next sync.
  await repo.markCancelled(ref);

  if (env.officeEmail) {
    try {
      const mail = officeCancelEmail({
        companyName: who, ref, address: job.address || "", reason,
      });
      await sendMail([env.officeEmail], mail.subject, mail.html);
    } catch (e) {
      console.warn(`cancel ${ref}: office notify failed:`, (e as Error).message);
    }
  }

  await repo.logAudit(
    "job.cancel", ref, `${who}: ${reason}`, session.username || "client"
  );

  // Hard-whitelisted, like every other client response.
  return NextResponse.json({ ok: true });
}
