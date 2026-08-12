import { NextResponse } from "next/server";
import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pilot metrics beacon — the few client-behaviour moments the server can't
// see on its own. Whitelisted actions only, audit-log backed (no schema, no
// third-party analytics), and never an error the client could notice: a lost
// metric must never disturb a lodgement.
const ACTIONS = new Set(["lodge.start"]);

export async function POST(req: Request) {
  const session = await getClientSession();
  // Signed out or staff-viewing: record nothing, upset nobody.
  if (!session || session.impersonated) return new Response(null, { status: 204 });

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || "");
  if (!ACTIONS.has(action)) return new Response(null, { status: 204 });

  await repo
    .logAudit(action, session.companyName, String(b.ua || "").slice(0, 40), session.username || "client")
    .catch(() => {});
  return new Response(null, { status: 204 });
}
