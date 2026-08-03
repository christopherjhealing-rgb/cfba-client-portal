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

/** What deleting this client would destroy. Read-only: the confirm step. */
export async function GET(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id") || "";
  const company = await repo.companyById(id);
  if (!company) return NextResponse.json({ error: "Unknown client." }, { status: 404 });
  return NextResponse.json({ name: company.name, ...(await repo.companyFootprint(id)) });
}

/**
 * Delete a client and everything of theirs the portal holds.
 *
 * Two-step by design: the caller has to have asked GET what it costs and send
 * the job count back. A stale count means the client gained a job while the
 * dialog was open, and the delete is refused rather than taking something
 * nobody was shown.
 */
export async function DELETE(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  try {
    const { id, confirmJobs } = await req.json().catch(() => ({}));
    const company = await repo.companyById(String(id || ""));
    if (!company) return NextResponse.json({ error: "Unknown client." }, { status: 404 });

    const now = await repo.companyFootprint(company.id);
    if (typeof confirmJobs !== "number" || confirmJobs !== now.jobs) {
      return NextResponse.json(
        { error: `This client now has ${now.jobs} job${now.jobs === 1 ? "" : "s"}, not ${confirmJobs}. Nothing deleted — open it again and re-check.` },
        { status: 409 }
      );
    }

    const gone = await repo.deleteCompany(company.id);
    await repo.logAudit(
      "client.delete", company.id,
      `${company.name} — ${gone.jobs} job(s), ${gone.files} file(s)`
    );
    return NextResponse.json({ ok: true, name: company.name, ...gone });
  } catch (e) {
    console.error("client delete failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
