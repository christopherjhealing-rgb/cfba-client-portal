// A company's saved documents — the engineering PDFs clients lodge again and
// again (standard patio details, shed certification). Saved once, then ticked
// on at lodgement instead of hunted down every time. Files live in PRIVATE
// storage at library/<companyId>/<docId>/<file>; this module is just the
// per-company index, kept in portal_settings. No table, no migration.
import * as repo from "./repo";

export interface LibraryDoc {
  id: string;
  label: string;
  /** Sanitised original filename — the name it lodges under. */
  file: string;
  size: number;
  uploadedAt: string;
}

const settingKey = (companyId: string) => `library:${companyId}`;

export const libraryPath = (companyId: string, doc: Pick<LibraryDoc, "id" | "file">) =>
  `library/${companyId}/${doc.id}/${doc.file}`;

export async function listLibrary(companyId: string): Promise<LibraryDoc[]> {
  return (await repo.getSetting<LibraryDoc[]>(settingKey(companyId))) || [];
}

export async function saveLibrary(companyId: string, docs: LibraryDoc[]): Promise<void> {
  await repo.setSetting(settingKey(companyId), docs);
}
