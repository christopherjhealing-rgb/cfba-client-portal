import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { hashSetupCode, newSetupCode, normUsername } from "@/lib/auth";
import { sendMail, loginEmail, fitAttachments, type MailAttachment } from "@/lib/mail";
import { env } from "@/lib/env";

/** The getting-started guide, if there is one. Storage first so it can be
 *  swapped from /admin without a deploy; the copy shipped in public/ is the
 *  fallback. Missing is fine — the email says nothing about a guide then. */
async function guideAttachment(): Promise<MailAttachment | null> {
  try {
    const bytes = await repo.readFile("collateral/welcome-guide.pdf");
    if (bytes.length) {
      return { name: "CFBA Client Portal — Getting Started.pdf", contentType: "application/pdf", bytes };
    }
  } catch { /* not uploaded; fall through to the shipped copy */ }
  try {
    const r = await fetch(`${env.appUrl}/guides/getting-started.pdf`);
    if (!r.ok) return null;
    const bytes = Buffer.from(await r.arrayBuffer());
    return bytes.length
      ? { name: "CFBA Client Portal — Getting Started.pdf", contentType: "application/pdf", bytes }
      : null;
  } catch { return null; }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_DAYS = 30;

export async function POST(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { action, companyId, username, displayName, email } = await req.json().catch(() => ({}));
  const u = normUsername(username);
  if (!u || !/^[a-z0-9._-]{3,40}$/.test(u)) {
    return NextResponse.json(
      { error: "Usernames are 3–40 characters: letters, numbers, dot, dash or underscore." },
      { status: 400 }
    );
  }

  const setupCode = newSetupCode();
  const setupCodeHash = hashSetupCode(u, setupCode);
  const setupExpiresAt = new Date(Date.now() + SETUP_DAYS * 86400000).toISOString();

  if (action === "create") {
    const company = await repo.companyById(String(companyId || ""));
    if (!company) return NextResponse.json({ error: "Unknown company." }, { status: 404 });
    if (await repo.getLogin(u)) {
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    await repo.createLogin({
      username: u, companyId: company.id, setupCodeHash, setupExpiresAt,
      displayName: typeof displayName === "string" ? displayName.slice(0, 60) : null,
    });
    await repo.logAudit("login.create", u, company.name);

    // Email it if we were given somewhere to send it. Never fatal: the code is
    // on screen either way, and a login that exists but wasn't emailed is a
    // copy-and-paste, not a lost client.
    let emailed = false;
    let emailError: string | undefined;
    const to = String(email || "").trim() || company.emails?.[0] || "";
    if (to) {
      try {
        const guide = await guideAttachment();
        const { attach } = fitAttachments(guide ? [guide] : []);
        const mail = loginEmail({
          companyName: company.name, username: u, setupCode,
          displayName: typeof displayName === "string" ? displayName : undefined,
          guideAttached: attach.length > 0,
        });
        emailed = await sendMail([to], mail.subject, mail.html, attach);
        if (!emailed) emailError = "mail isn't configured (MAIL_FROM / Graph Mail.Send)";
      } catch (e) {
        emailError = (e as Error).message;
        console.warn(`logins: couldn't email ${u} to ${to}:`, emailError);
      }
    } else {
      emailError = "no email address on this client — read the code out instead";
    }

    return NextResponse.json({ ok: true, username: u, setupCode, emailedTo: emailed ? to : null, emailed, emailError });
  }

  if (action === "reset") {
    const login = await repo.getLogin(u);
    if (!login) return NextResponse.json({ error: "Unknown username." }, { status: 404 });
    await repo.issueSetupCode(u, setupCodeHash, setupExpiresAt);
    await repo.logAudit("login.reset", u);

    // A reset is useless until the client has the new code, so send it the
    // same way a new login goes out. The username never changes.
    const company = await repo.companyById(login.companyId);
    let emailed = false;
    let emailError: string | undefined;
    const to = String(email || "").trim() || company?.emails?.[0] || "";
    if (to && company) {
      try {
        const guide = await guideAttachment();
        const { attach } = fitAttachments(guide ? [guide] : []);
        const mail = loginEmail({
          companyName: company.name, username: u, setupCode,
          displayName: login.displayName || undefined,
          guideAttached: attach.length > 0,
        });
        emailed = await sendMail([to], mail.subject, mail.html, attach);
        if (!emailed) emailError = "mail isn't configured (MAIL_FROM / Graph Mail.Send)";
      } catch (e) {
        emailError = (e as Error).message;
        console.warn(`logins: couldn't email the reset for ${u}:`, emailError);
      }
    } else {
      emailError = "no email address on this client — read the code out instead";
    }
    return NextResponse.json({ ok: true, username: u, setupCode, emailed, emailError });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
