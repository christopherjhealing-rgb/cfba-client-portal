import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import {
  hashPassword, normUsername, passwordProblem, setupCodeMatches,
} from "@/lib/auth";
import { setClientSession } from "@/lib/session";
import { checkLock, recordFailure, clearFailures } from "@/lib/throttle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const username = normUsername(body.username);
  const setupCode = (body.setupCode || "").toString();
  const password = (body.password || "").toString();
  const confirm = (body.confirm || "").toString();

  if (!username || !setupCode || !password) {
    return NextResponse.json({ error: "Fill in every field." }, { status: 400 });
  }

  // Setup-code redemption shares the login lockout, so guessing codes is
  // throttled and counts toward locking the account (recoverable by email).
  const locked = await checkLock(username);
  if (locked) {
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${locked} minute${locked === 1 ? "" : "s"}.` },
      { status: 429 }
    );
  }
  if (password !== confirm) {
    return NextResponse.json({ error: "The two passwords don't match." }, { status: 400 });
  }
  const problem = passwordProblem(password);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const login = await repo.getLogin(username);
  if (!login || login.disabled) {
    return NextResponse.json({ error: "That username or setup code isn't right." }, { status: 401 });
  }
  if (!login.setupCodeHash || !setupCodeMatches(username, setupCode, login.setupCodeHash)) {
    await recordFailure(username);
    return NextResponse.json({ error: "That username or setup code isn't right." }, { status: 401 });
  }
  if (login.setupExpiresAt && new Date(login.setupExpiresAt).getTime() < Date.now()) {
    return NextResponse.json(
      { error: "That setup code has expired. Ask CFBA for a new one." }, { status: 401 }
    );
  }

  const company = await repo.companyById(login.companyId);
  if (!company) {
    return NextResponse.json({ error: "This login isn't linked to a company." }, { status: 403 });
  }

  await repo.setPassword(username, hashPassword(password));
  await repo.touchLogin(username);
  await clearFailures(username);
  await setClientSession({ companyId: company.id, companyName: company.name, username, displayName: login.displayName || undefined });
  return NextResponse.json({ ok: true });
}
