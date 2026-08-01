import { NextResponse } from "next/server";
import { getClientSession, isStaff } from "@/lib/session";
import * as repo from "@/lib/repo";
import { listEngSets, canAccessSet, setStoragePath } from "@/lib/engineering";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve a checker app to a signed-in client (or staff). The page renders
 *  inside a sandboxed iframe on /engineering/<set>, so its scripts run with
 *  an opaque origin — no access to portal cookies or the parent page. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ set: string }> }
) {
  const key = decodeURIComponent((await params).set);

  const [session, staff] = await Promise.all([getClientSession(), isStaff()]);
  if (!session && !staff) return new Response("Not found", { status: 404 });

  const eng = await repo.getSetting<{ enabled?: boolean }>("engineering");
  if (!eng?.enabled && !staff) return new Response("Not found", { status: 404 });

  const set = (await listEngSets()).find((s) => s.key === key);
  // Same 404 for missing and not-allowed — no probing which sets exist.
  if (!set) return new Response("Not found", { status: 404 });
  if (!canAccessSet(set, session?.companyName || "", staff || !!session?.impersonated)) {
    return new Response("Not found", { status: 404 });
  }

  const stream = await repo.readFileStream(setStoragePath(key));
  if (!stream) return new Response("Not found", { status: 404 });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
