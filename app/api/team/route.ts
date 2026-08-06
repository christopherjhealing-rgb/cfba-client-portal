// The client's own team screen: the logins on their company, and the one
// action that can't wait for office hours — disabling the login of someone
// who has left.
//
// Deliberately asymmetric: a client can DISABLE a login on their own company,
// only the office can re-enable one. A wrongly disabled teammate is a phone
// call; a wrongly re-enabled departed employee is every document the company
// has with us. Disabling bites within a minute (see lib/session's liveness
// check), not at the next sign-in a month out.
//
// What leaves the server is whitelisted, like every client API here: username,
// display name, last sign-in, disabled. A Login row also carries password and
// setup-code hashes, and those must never ride along.

import { NextResponse } from "next/server";
import { getClientSession, forgetLoginLiveness } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNED_OUT = {
  error: "Your session has ended — sign in again and you can pick up where you left off.",
};

function safe(l: repo.Login, you: string) {
  return {
    username: l.username,
    displayName: l.displayName || "",
    lastLoginAt: l.lastLoginAt,
    disabled: l.disabled,
    you: l.username === you,
  };
}

export async function GET() {
  const session = await getClientSession();
  if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
  const logins = await repo.listLoginsForCompany(session.companyId).catch(() => []);
  return NextResponse.json({
    logins: logins.map((l) => safe(l, session.username)),
  });
}

export async function POST(req: Request) {
  const session = await getClientSession();
  if (!session) return NextResponse.json(SIGNED_OUT, { status: 401 });
  if (session.impersonated) {
    return NextResponse.json(
      { error: "You're viewing this portal as staff — manage logins from Admin instead." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  if (!username) {
    return NextResponse.json({ error: "Which login should be disabled?" }, { status: 400 });
  }

  const target = await repo.getLogin(username);
  // The same answer whether the login doesn't exist or belongs to someone
  // else — this route must not confirm which usernames exist elsewhere.
  if (!target || target.companyId !== session.companyId) {
    return NextResponse.json({ error: "That login isn't on your account." }, { status: 404 });
  }
  if (target.username === session.username) {
    return NextResponse.json(
      { error: "You can't disable the login you're signed in with." },
      { status: 400 }
    );
  }

  if (!target.disabled) {
    await repo.setLoginDisabled(target.username, true);
    forgetLoginLiveness(target.username);
    await repo.logAudit(
      "login.disabled", target.username,
      `disabled by ${session.username} from the team screen`, "client"
    );
  }
  return NextResponse.json({ ok: true });
}
