import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Resolve an unmatched Monday "Client" spelling: either attach it as an alias
 *  of an existing company, or create a new company from it. Its cards then
 *  match on the next sync. */
export async function POST(req: Request) {
  try {
    if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const spelling = String(body.spelling || "").trim();
    if (!spelling) return NextResponse.json({ error: "Missing client spelling." }, { status: 400 });

    if (body.companyId) {
      const company = await repo.companyById(String(body.companyId));
      if (!company) return NextResponse.json({ error: "Unknown company." }, { status: 404 });
      await repo.addAlias(company.id, spelling);
      return NextResponse.json({ ok: true, companyId: company.id });
    }

    if (body.createNew) {
      const existing = await repo.listCompanies();
      if (existing.some((c) => c.name.trim().toLowerCase() === spelling.toLowerCase())) {
        return NextResponse.json({ error: "A client with that name already exists." }, { status: 409 });
      }
      const company = await repo.createCompany({ name: spelling });
      return NextResponse.json({ ok: true, companyId: company.id });
    }

    return NextResponse.json({ error: "Choose a company or create a new one." }, { status: 400 });
  } catch (e) {
    console.error("match failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
