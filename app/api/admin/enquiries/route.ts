import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { sendMail, enquiryReplyEmail } from "@/lib/mail";
import { GENERAL_REF } from "@/lib/core.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 4000;

/** Answer a general enquiry. There is no Monday card to post it on — an
 *  enquiry isn't a job — so this writes the reply into the client's thread and
 *  emails it to them. The email is the part that matters: somebody who asked a
 *  question shouldn't have to keep checking a portal for the answer. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) {
      return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    }
    const { companyId, body } = await req.json().catch(() => ({}));
    const id = String(companyId || "").trim();
    const text = String(body || "").trim().slice(0, MAX_TEXT);
    if (!id) return NextResponse.json({ error: "Which client?" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "Write a reply first." }, { status: 400 });

    const company = await repo.companyById(id);
    if (!company) return NextResponse.json({ error: "No such client." }, { status: 404 });

    await repo.addMessage({
      ref: GENERAL_REF,
      companyId: id,
      from: "cfba",
      body: text,
      createdAt: new Date().toISOString(),
      mondayUpdateId: null,
      files: [],
    });

    // The reply is saved either way — a mail outage must not swallow an answer
    // the client can still read in the portal. Say which happened.
    let emailed = false;
    try {
      const mail = enquiryReplyEmail({ companyName: company.name, body: text });
      emailed = await sendMail(company.emails || [], mail.subject, mail.html);
    } catch (e) {
      console.warn(`enquiry reply to ${company.name}: email failed:`, (e as Error).message);
    }

    await repo.logAudit("enquiry.reply", GENERAL_REF, company.name, "staff");
    return NextResponse.json({ ok: true, emailed });
  } catch (e) {
    console.error("enquiry reply failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
