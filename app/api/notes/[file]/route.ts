import { NextResponse } from "next/server";
import * as repo from "@/lib/repo";
import { isPublishedSheet, sheetStoragePath } from "@/lib/info-sheets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve a guidance note: the staff-uploaded replacement from storage when one
 *  exists, otherwise redirect to the original shipped with the app. Public,
 *  exactly like the /notes originals — these are guidance documents, not
 *  client data. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const file = decodeURIComponent((await params).file);
  // The registry check keeps this route from reading arbitrary storage paths.
  if (!isPublishedSheet(file)) return new Response("Not found", { status: 404 });

  const stream = await repo.readFileStream(sheetStoragePath(file));
  if (!stream) return NextResponse.redirect(new URL(`/notes/${file}`, req.url), 302);

  // Streamed, so a hefty replacement PDF stays clear of the response-size cap.
  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
