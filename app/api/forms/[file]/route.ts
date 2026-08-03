import * as repo from "@/lib/repo";
import { FORM_MIME, formExtOf, isFormFile } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serve a staff-uploaded council form from storage (forms/<key>.<ext>). The
 *  registry check keeps this from reading arbitrary storage paths. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const file = decodeURIComponent((await params).file);
  if (!isFormFile(file)) return new Response("Not found", { status: 404 });

  const ext = formExtOf(file);
  if (!ext) return new Response("Not found", { status: 404 });

  const stream = await repo.readFileStream(`forms/${file}`);
  if (!stream) return new Response("Not found", { status: 404 });

  // A PDF opens in the browser; a Word file can't, so asking for it inline
  // just produces a download with a worse filename.
  const how = ext === "pdf" ? "inline" : "attachment";

  return new Response(stream, {
    headers: {
      "Content-Type": FORM_MIME[ext],
      "Content-Disposition": `${how}; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
