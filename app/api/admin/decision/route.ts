import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { acceptSubmission } from "@/lib/accept";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Accepting shuttles the lodged PDFs from storage onto the Monday card;
// a full 40 MB drawing set needs more than the default window.
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    // Staff-gated route, so the real reason is fine to show.
    console.error("decision failed:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function handle(req: Request) {
  if (!(await isStaff())) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { id, decision, note } = await req.json().catch(() => ({}));
  const sub = await repo.getSubmission(String(id || ""));
  if (!sub) return NextResponse.json({ error: "Submission not found." }, { status: 404 });
  if (sub.status !== "pending") {
    return NextResponse.json({ error: "That submission has already been reviewed." }, { status: 409 });
  }

  if (decision === "reject") {
    await repo.setSubmission(sub.id, { status: "rejected", reviewNote: String(note || "") });
    return NextResponse.json({ ok: true });
  }

  if (decision !== "accept") {
    return NextResponse.json({ error: "Unknown decision." }, { status: 400 });
  }

  const { mondayItemId, failedFiles } = await acceptSubmission(sub, String(note || ""));
  return NextResponse.json({
    ok: true,
    mondayItemId,
    warning: failedFiles.length
      ? `Card created, but ${failedFiles.length === 1 ? "one file" : `${failedFiles.length} files`} couldn't be attached on Monday (${failedFiles.join(", ")}). The portal still holds ${failedFiles.length === 1 ? "it" : "them"} in storage under submissions/${sub.id}.`
      : undefined,
  });
}
