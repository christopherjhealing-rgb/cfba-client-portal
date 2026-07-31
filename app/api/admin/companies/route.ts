import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const splitList = (v: unknown): string[] =>
  String(v || "")
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);

export async function POST(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name || "").trim();
  if (name.length < 2 || name.length > 80) {
    return NextResponse.json({ error: "Client name should be 2–80 characters." }, { status: 400 });
  }

  const emails = splitList(body.emails).slice(0, 10);
  const bad = emails.find((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (bad) {
    return NextResponse.json({ error: `"${bad}" doesn't look like an email address.` }, { status: 400 });
  }
  const aliases = splitList(body.aliases).slice(0, 10);

  const existing = await repo.listCompanies();
  if (existing.some((c) => c.name.trim().toLowerCase() === name.toLowerCase())) {
    return NextResponse.json({ error: "A client with that name already exists." }, { status: 409 });
  }

  try {
    const company = await repo.createCompany({
      name, emails, aliases, isTest: !!body.isTest,
    });
    return NextResponse.json({ ok: true, company });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
