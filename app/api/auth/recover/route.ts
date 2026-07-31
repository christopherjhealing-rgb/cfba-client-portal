import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { hashSetupCode, newSetupCode, normUsername } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_DAYS = 7;

/** Self-service recovery. A new setup code is emailed to the addresses already
 *  held against the company — never to an address typed into this form — so a
 *  locked-out client can get themselves back in without ringing the office.
 *  The response is identical whether or not the username exists, so this can't
 *  be used to discover valid usernames. */
export async function POST(req: Request) {
  const { username } = await req.json().catch(() => ({}));
  const u = normUsername(username);
  const generic = NextResponse.json({
    ok: true,
    message:
      "If that username exists, we've emailed a setup code to the address we hold " +
      "for your company. It's valid for 7 days.",
  });
  if (!u) return generic;

  try {
    const login = await repo.getLogin(u);
    if (!login || login.disabled) return generic;
    const company = await repo.companyById(login.companyId);
    if (!company?.emails?.length) return generic;

    const setupCode = newSetupCode();
    await repo.issueSetupCode(
      u, hashSetupCode(u, setupCode),
      new Date(Date.now() + SETUP_DAYS * 86400000).toISOString()
    );

    await sendMail(
      company.emails,
      "Your CF Building Approvals portal setup code",
      `<div style="font-family:Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1B2420;max-width:600px">
        <p>A setup code was requested for the portal login <strong>${u}</strong>.</p>
        <p>Use it with the <strong>First time</strong> tab on the sign-in screen to choose a new password:</p>
        <p style="font-family:monospace;font-size:22px;letter-spacing:3px;background:#F4F8F4;border-left:3px solid #1E5B3C;padding:14px 18px;margin:18px 0">${setupCode}</p>
        <p>It expires in ${SETUP_DAYS} days. If you didn't ask for this, you can ignore this email — your current password still works.</p>
        <p style="margin-top:22px"><a href="${env.appUrl}" style="background:#1E5B3C;color:#fff;text-decoration:none;padding:11px 20px;border-radius:6px;display:inline-block;font-weight:600">Open the portal</a></p>
        <p style="color:#5B6660;font-size:13px;margin-top:22px">CF Building Approvals · 1300 029 074 · admin@cfba.com.au</p>
      </div>`
    );
  } catch {
    // Never leak the reason — the caller always sees the same message.
  }
  return generic;
}
