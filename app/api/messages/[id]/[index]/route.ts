import { getClientSession } from "@/lib/session";
import * as repo from "@/lib/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Download one attachment. Scoped to the signed-in company so a message id
 *  guessed from elsewhere can't be used to pull another client's file. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; index: string }> }
) {
  const session = await getClientSession();
  if (!session) return new Response("Not signed in.", { status: 401 });

  const { id, index } = await params;
  const msgs = await repo.listMessagesForCompany(session.companyId);
  const msg = msgs.find((m) => m.id === id);
  const file = msg?.files?.[Number(index)];
  if (!msg || !file) return new Response("Not found.", { status: 404 });

  const bytes = await repo.readFile(file.storagePath);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": file.contentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.name.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
