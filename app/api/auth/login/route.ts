import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { checkLock, recordFailure, clearFailures } from "@/lib/throttle";
import { verifyPassword, normUsername } from "@/lib/auth";
import { setClientSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Same message for every failure so the form can't be used to work out which
// usernames exist.
const GENERIC = "That username and password combination isn't right.";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = normUsername(body.username);
  const password = (body.password || "").toString();
  // "Remember me" keeps the session for 30 days; without it the cookie
  // lasts a working day, which suits a shared site office machine.
  const remember = body.remember !== false;

  // Three failed attempts then a cooldown. One shared password per company
  // means an unthrottled login is a password list away from every document
  // that company has with us.
  const locked = await checkLock(username);
  if (locked) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}, use "Forgot password?" to have a new setup code emailed to you, or call the office on 1300 029 074.` },
      { status: 429 }
    );
  }

  if (!username || !password) {
    return NextResponse.json({ error: "Enter your username and password." }, { status: 400 });
  }

  const login = await repo.getLogin(username);
  if (!login || login.disabled) {
    await recordFailure(username);
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  // Issued but never activated — send them to the set-password step.
  if (login.mustSetPassword || !login.passwordHash) {
    return NextResponse.json(
      {
        error: "This login hasn't been set up yet. Use the setup code from CFBA to choose a password.",
        needsSetup: true,
      },
      { status: 409 }
    );
  }

  if (!verifyPassword(password, login.passwordHash)) {
    await recordFailure(username);
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const company = await repo.companyById(login.companyId);
  if (!company) {
    return NextResponse.json({ error: "This login isn't linked to a company. Contact CFBA." }, { status: 403 });
  }

  await repo.touchLogin(username);
  await clearFailures(username);
  await setClientSession(
    { companyId: company.id, companyName: company.name, username, displayName: login.displayName || undefined },
    remember ? 24 * 30 : 12
  );
  return NextResponse.json({ ok: true });
}
