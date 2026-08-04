import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import { env } from "@/lib/env";
import { mailJobRecord } from "@/lib/record-mail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Send the correspondence record for this job to the office now, instead of
 * waiting for the client to download their package.
 *
 * It runs the real thing — same builder, same attachment, same size fallback,
 * same mailbox — because a test that takes a different path only tells you the
 * test works. The one difference is that it can be run twice; the automatic
 * copy fires once, on first download.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ ref: string }> }
) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const ref = decodeURIComponent((await params).ref);

  try {
    const r = await mailJobRecord(ref, { force: true });
    const said: Record<string, string> = {
      sent: `Sent to ${env.officeEmail}. Give it a minute.`,
      "no-messages": "Nothing was ever said on this job through the portal, so there is no record to send. Try a job with messages against it.",
      "no-mailbox": "No office inbox is set. Add OFFICE_EMAIL to the deployment and it will have somewhere to go.",
      off: "Correspondence records are switched off (RECORD_EMAIL=0).",
      failed: "The record was built but the mailbox wouldn't take it — check the Graph mail credentials.",
    };
    return NextResponse.json(
      { ok: r === "sent", result: r, message: said[r] || r },
      { status: r === "sent" ? 200 : 409 }
    );
  } catch (e) {
    console.error(`records test-send ${ref}:`, e);
    return NextResponse.json(
      { error: `Couldn't send it: ${(e as Error).message}` }, { status: 500 }
    );
  }
}
