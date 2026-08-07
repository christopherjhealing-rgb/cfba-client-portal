import * as repo from "./repo";
import { mergePdfs } from "./pdf-merge";
import { combinable, combinedName } from "./uploads.mjs";

export interface UploadEntry {
  name: string;
  category?: string;
}

/**
 * Standardise a set of stored uploads: the drawings become one
 * "Site Plan and Elevations - <address>.pdf", the engineering one
 * "Engineering - <address>.pdf", each named for the site. Everything else is
 * left exactly as the client sent it.
 *
 * `dir` is the storage folder the files already sit in (a submission's own
 * folder for a lodgement, a message's folder for an FIR response). `date`, when
 * given, stamps the day onto each combined name so a re-sent document is told
 * apart from the one it replaces.
 *
 * Runs after the files are in that folder, so a merged file is what lands on
 * the Monday card, what the client sees against their job, and what the
 * correspondence record keeps.
 *
 * Nothing here may cost a lodgement or a reply. A category whose merge fails —
 * a locked or corrupt PDF pdf-lib can't read — is left as the separate files
 * that came in, with a warning in the log, rather than throwing. The originals
 * are only deleted once the combined file is safely written.
 */
export async function combineUploads(
  dir: string,
  address: string,
  files: UploadEntry[],
  opts: { date?: Date | string | null } = {}
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
      const target = combinedName(cat, address, opts.date ?? null);
      if (!target) { out.push(...entries); continue; }
      const name = await combineGroup(dir, entries, target);
      out.push({ name, category: cat });
    } catch (e) {
      console.warn(
        `combine ${dir}/${cat}: left as separate files —`,
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
  dir: string,
  entries: UploadEntry[],
  target: string
): Promise<string> {
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
