import { env } from "./env";
import * as graph from "./graph";
import * as repo from "./repo";
import { combinable, nameStem, supersededBy } from "./uploads.mjs";

const SS_FOLDER = "SS (Superseded)";

export interface NewInfoDoc {
  name: string;
  category?: string;
}

/**
 * File a client's answer to an FIR into the job's own SharePoint folder,
 * replacing the current version of each document and moving the one it replaces
 * into an "SS (Superseded)" subfolder — so the office keeps the history without
 * old drawings piling up at the top of the folder.
 *
 * Only the combined documents (drawings, engineering) are filed; an "Other"
 * attachment stays on the card and the email. Superseding matches on the
 * portal's own naming stem, so it only ever moves a version the portal itself
 * wrote — never a certificate or an office working file it can't account for.
 * On the first answer, with nothing prior to replace, the document simply lands.
 *
 * Best effort throughout, and gated on the same switch as the correspondence
 * record (RECORD_TO_FOLDER): a message is already saved, on the card and in the
 * office inbox before this runs, so a SharePoint hiccup is logged, never fatal.
 */
export async function fileNewInfo(
  ref: string,
  address: string,
  dir: string,
  docs: NewInfoDoc[]
): Promise<"filed" | "off" | "no-folder" | "nothing" | "failed"> {
  if (!env.recordToFolderEnabled) return "off";

  const filing = docs.filter((d) => d.category && combinable(d.category));
  if (!filing.length) return "nothing";

  let found: Awaited<ReturnType<typeof graph.locateJobFolder>>;
  try {
    found = await graph.locateJobFolder(ref);
  } catch (e) {
    console.warn(`new-info ${ref}: couldn't search for the job folder —`, (e as Error).message);
    return "failed";
  }
  if (!found) {
    console.warn(`new-info ${ref}: no job folder found in SharePoint — nothing filed`);
    return "no-folder";
  }

  let existing: { id: string; name: string }[];
  try {
    existing = await graph.folderFiles(found.id);
  } catch (e) {
    console.warn(`new-info ${ref}: couldn't read the job folder —`, (e as Error).message);
    return "failed";
  }
  const existingNames = existing.map((f) => f.name);
  let ssId: string | null = null;
  let filedAny = false;

  for (const doc of filing) {
    try {
      // Move the versions this one replaces into Superseded first, so a failure
      // partway never leaves two "current" versions at the top of the folder.
      const priors = supersededBy(existingNames, nameStem(doc.category!, address), doc.name);
      for (const priorName of priors) {
        const item = existing.find((f) => f.name === priorName);
        if (!item) continue;
        if (!ssId) ssId = await graph.ensureSubfolder(found.id, SS_FOLDER);
        await graph.moveItem(item.id, ssId);
      }
      const bytes = await repo.readFile(`${dir}/${doc.name}`);
      await graph.uploadIntoFolder(found.id, doc.name, bytes);
      filedAny = true;
    } catch (e) {
      console.warn(`new-info ${ref}: "${doc.name}" not filed —`, (e as Error).message);
    }
  }
  return filedAny ? "filed" : "failed";
}
