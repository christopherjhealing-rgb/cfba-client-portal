import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import { env } from "@/lib/env";
import { mailJobRecord } from "@/lib/record-mail";
import { fileJobRecord } from "@/lib/record-file";

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
    // The SharePoint copy, when it's switched on. Deliberately NOT forced past
    // its flag: a test that writes into the document library before the office
    // has opted in isn't a test, it's a surprise. Flag on → the button proves
    // the whole path, write permission included.
    let message = said[r] || r;
    if (env.recordToFolderEnabled) {
      const f = await fileJobRecord(ref);
      const filed: Record<string, string> = {
        filed: "Also filed into the job's SharePoint Issued folder.",
        "no-folder": "Not filed to SharePoint — this job has no recorded source folder (it will after its next sync).",
        "no-messages": "",
        failed: "Not filed to SharePoint — check the Graph app has write permission (Sites.ReadWrite.All).",
        off: "",
      };
      if (filed[f]) message += ` ${filed[f]}`;
    }
    return NextResponse.json(
      { ok: r === "sent", result: r, message },
      { status: r === "sent" ? 200 : 409 }
    );
  } catch (e) {
    console.error(`records test-send ${ref}:`, e);
    return NextResponse.json(
      { error: `Couldn't send it: ${(e as Error).message}` }, { status: 500 }
    );
  }
}
