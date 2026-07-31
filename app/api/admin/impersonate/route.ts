import { NextResponse } from "next/server";
import { isStaff, setClientSession, clearClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.redirect(new URL("/admin/login", req.url), { status: 303 });
  }
  const form = await req.formData();

  if (form.get("stop")) {
    await clearClientSession();
    return NextResponse.redirect(new URL("/admin/clients", req.url), { status: 303 });
  }

  const company = await repo.companyById(String(form.get("companyId") || ""));
  if (!company) {
    return NextResponse.redirect(new URL("/admin/clients", req.url), { status: 303 });
  }
  // Short-lived, clearly flagged read-only view of the client's own portal.
  await setClientSession(
    { companyId: company.id, companyName: company.name, username: "(staff)", impersonated: true },
    2
  );
  return NextResponse.redirect(new URL("/jobs", req.url), { status: 303 });
}
