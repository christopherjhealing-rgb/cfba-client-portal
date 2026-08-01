import * as repo from "@/lib/repo";
import { PORTAL_FORMS } from "@/lib/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isForm = (file: string) => PORTAL_FORMS.some((f) => `${f.key}.pdf` === file);

/** Serve a staff-uploaded council form PDF from storage (forms/<key>.pdf). The
 *  registry check keeps this from reading arbitrary storage paths. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const file = decodeURIComponent((await params).file);
  if (!isForm(file)) return new Response("Not found", { status: 404 });

  const stream = await repo.readFileStream(`forms/${file}`);
  if (!stream) return new Response("Not found", { status: 404 });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "no-store",
    },
  });
}
