// Staff-only SharePoint diagnostic: what does the portal actually see when it
// goes looking for a job's certificate?
//
// Written because a job sat at "Being finalised" with its PDFs plainly sitting
// in the Issued folder, and every answer available from the outside — an empty
// file list, a raw Graph URL in a banner — was equally consistent with a wrong
// drive, a wrong root, an unindexed folder, a differently-named folder, or
// files being filtered out on purpose. This says which.
//
// Read-only. Takes a job ref and nothing else; every path is derived from the
// configured drive and root, never from the caller.

import { NextResponse } from "next/server";
import { isStaff } from "@/lib/session";
import { env, GRAPH_READY } from "@/lib/env";
import * as graph from "@/lib/graph";
import * as repo from "@/lib/repo";

/** What the portal has actually stored for this job, as opposed to what
 *  SharePoint holds. A row here with an unreadable blob is the difference
 *  between "the client sees a Download button" and "the client gets bytes". */
async function storedFor(ref: string) {
  const rows = await repo.jobFiles(ref).catch(() => []);
  return Promise.all(
    rows.map(async (f) => {
      try {
        const bytes = await repo.readFile(f.storagePath);
        return { filename: f.filename, recorded: f.size, readable: true, bytes: bytes.length };
      } catch (e) {
        return { filename: f.filename, recorded: f.size, readable: false, why: (e as Error).message };
      }
    })
  );
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isStaff())) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!GRAPH_READY) {
    return NextResponse.json({
      ok: false,
      step: "credentials",
      detail: "Graph credentials aren't configured (tenant, client id, secret).",
    });
  }

  const ref = (new URL(req.url).searchParams.get("ref") || "").trim();
  const out: Record<string, unknown> = {
    ref: ref || null,
    driveId: env.graphDriveId.slice(0, 12) + "…" + env.graphDriveId.slice(-6),
    clientFilesRoot: env.clientFilesRoot,
  };

  try {
    out.drive = await graph.describeDrive();
  } catch (e) {
    return NextResponse.json({
      ...out, ok: false, step: "drive",
      detail: (e as Error).message,
      hint: "The drive id is wrong or the app can't see that library. Check GRAPH_DRIVE_ID.",
    });
  }

  try {
    const clients = await graph.listClientFolders();
    out.clientFolders = clients.length;
    out.clientFolderSample = clients.slice(0, 8);
  } catch (e) {
    return NextResponse.json({
      ...out, ok: false, step: "root",
      detail: (e as Error).message,
      hint: `Couldn't list "${env.clientFilesRoot}". Check GRAPH_CLIENT_FILES_ROOT.`,
    });
  }

  if (!ref) return NextResponse.json({ ...out, ok: true, step: "root" });

  try {
    const found = await graph.locateJobFolder(ref);
    out.jobFolder = found;
    if (!found) {
      return NextResponse.json({
        ...out, ok: false, step: "job-folder",
        hint: `No folder ending in "- ${ref}" under any client folder. ` +
          `Check the folder is named "<address> - ${ref}".`,
      });
    }
    const inspected = await graph.inspectIssued(found.id);
    out.issued = inspected;
    out.stored = await storedFor(ref);
    return NextResponse.json({
      ...out,
      ok: inspected.usable.length > 0,
      step: "issued",
      hint: inspected.issuedFolderFound
        ? inspected.usable.length
          ? "These are the files the client would get."
          : inspected.skipped.length
            ? "Every file in Issued was skipped — see 'skipped' for why. Word documents are excluded on purpose."
            : "The Issued folder is empty."
        : `No folder named "Issued" inside the job folder.`,
    });
  } catch (e) {
    return NextResponse.json({
      ...out, ok: false, step: "issued", detail: (e as Error).message,
    });
  }
}
