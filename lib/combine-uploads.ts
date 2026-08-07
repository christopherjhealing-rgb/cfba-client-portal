import * as repo from "./repo";
import { mergePdfs } from "./pdf-merge";
import { combinable, combinedName } from "./uploads.mjs";

export interface UploadEntry {
  name: string;
  category?: string;
}

/**
 * Standardise a lodgement's stored files: the drawings become one
 * "Site Plan and Elevations - <address>.pdf", the engineering one
 * "Engineering - <address>.pdf", each named for the site. Everything else is
 * left exactly as the client sent it.
 *
 * Runs after the files are in the submission's own storage folder, in BOTH
 * lodgement paths, so a merged file is what lands on the Monday card, what the
 * client sees against their job, and what the correspondence record keeps.
 *
 * Nothing here may cost a lodgement. A category whose merge fails — a locked or
 * corrupt PDF pdf-lib can't read — is left as the separate files that came in,
 * with a warning in the log, rather than throwing. The originals are only
 * deleted once the combined file is safely written.
 */
export async function combineUploads(
  submissionId: string,
  address: string,
  files: UploadEntry[]
): Promise<UploadEntry[]> {
  // Group by category, preserving the order categories first appear so the
  // list still reads drawings, engineering, then the rest.
  const groups = new Map<string, UploadEntry[]>();
  for (const f of files) {
    const cat = f.category || "";
    const g = groups.get(cat);
    if (g) g.push(f);
    else groups.set(cat, [f]);
  }

  const out: UploadEntry[] = [];
  for (const [cat, entries] of groups) {
    if (!combinable(cat) || entries.length === 0) {
      out.push(...entries);
      continue;
    }
    try {
      const target = combinedName(cat, address);
      if (!target) { out.push(...entries); continue; }
      const name = await combineGroup(submissionId, entries, target);
      out.push({ name, category: cat });
    } catch (e) {
      console.warn(
        `combine ${submissionId}/${cat}: left as separate files —`,
        (e as Error).message
      );
      out.push(...entries);
    }
  }
  return out;
}

/** Combine one category's files into a single stored PDF named `target`, and
 *  return that name. One file is renamed (lossless, cheap); several are merged.
 *  Originals are removed only after the combined file is written. */
async function combineGroup(
  submissionId: string,
  entries: UploadEntry[],
  target: string
): Promise<string> {
  const dir = `submissions/${submissionId}`;

  if (entries.length === 1) {
    if (entries[0].name === target) return target; // already the right name
    await repo.moveFile(`${dir}/${entries[0].name}`, `${dir}/${target}`);
    return target;
  }

  const parts: Buffer[] = [];
  for (const e of entries) parts.push(await repo.readFile(`${dir}/${e.name}`));
  const merged = await mergePdfs(parts);
  await repo.writeFile(`${dir}/${target}`, merged, "application/pdf");

  // Remove the pieces now the merged file exists. Skip one that already carries
  // the target name — that key was just overwritten with the merged bytes.
  for (const e of entries) {
    if (e.name === target) continue;
    await repo.deleteFile(`${dir}/${e.name}`).catch(() => {});
  }
  return target;
}
