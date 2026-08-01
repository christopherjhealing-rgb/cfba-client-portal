import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { hashSetupCode, newSetupCode, normUsername } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP_DAYS = 30;

export async function POST(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { action, companyId, username } = await req.json().catch(() => ({}));
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
    await repo.createLogin({ username: u, companyId: company.id, setupCodeHash, setupExpiresAt });
    await repo.logAudit("login.create", u, company.name);
    return NextResponse.json({ ok: true, username: u, setupCode });
  }

  if (action === "reset") {
    const login = await repo.getLogin(u);
    if (!login) return NextResponse.json({ error: "Unknown username." }, { status: 404 });
    await repo.issueSetupCode(u, setupCodeHash, setupExpiresAt);
    await repo.logAudit("login.reset", u);
    return NextResponse.json({ ok: true, username: u, setupCode });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
