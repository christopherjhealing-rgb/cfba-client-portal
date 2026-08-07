// Microsoft Graph (application permissions) — reads the finished Issued folder
// straight from the CFBuildingApprovals SharePoint library. Site + drive were
// confirmed against the live tenant.
//
// Locating a job's files without knowing the (messy) client folder name: search
// the drive for the ref, then keep only files whose parent path ends in
// "- <ref>/Issued". That mirrors how the folders are actually named
// (".../32 Elvira St, Palmyra - 56411/Issued/CDC - 32 Elvira Street.docx").
import { env, GRAPH_READY } from "./env";
import { folderMatchesRef } from "./core.mjs";

const GRAPH = "https://graph.microsoft.com/v1.0";

let _token: { value: string; exp: number } | null = null;

export async function token(): Promise<string> {
  if (!GRAPH_READY) throw new Error("Graph credentials not configured");
  if (_token && _token.exp > Date.now() + 60_000) return _token.value;
  const body = new URLSearchParams({
    client_id: env.graphClientId,
    client_secret: env.graphClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const r = await fetch(
    `https://login.microsoftonline.com/${env.graphTenantId}/oauth2/v2.0/token`,
    { method: "POST", body }
  );
  if (!r.ok) throw new Error(`Graph token failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  _token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return _token.value;
}

async function gget(path: string): Promise<Record<string, unknown>> {
  const r = await fetch(GRAPH + path, {
    headers: { Authorization: `Bearer ${await token()}` },
  });
  if (!r.ok) throw new Error(`Graph GET ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

async function gsend(
  method: "POST" | "PATCH", path: string, body: unknown
): Promise<Record<string, unknown>> {
  const r = await fetch(GRAPH + path, {
    method,
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Graph ${method} ${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}

export interface RemoteFile {
  name: string;
  size: number;
  contentType: string;
  downloadUrl: string;
  itemId: string;
  /** Folder path relative to the client-files root, for staff folder checks. */
  folderPath: string | null;
  /** SharePoint last-modified — used to wait out an in-flight OneDrive sync. */
  lastModified: string | null;
}

// Staff working files that must never reach a client: Word-family templates
// and the ~$/.tmp lock files OneDrive leaves while a folder is mid-sync.
const EXCLUDED_FILE = /^~\$|\.(docx?|docm|dotx?|dotm|tmp)$/i;

function parentEndsWithIssued(pathStr: string, ref: string): boolean {
  // parentReference.path looks like "/drive/root:/CF Building Approvals/CFBA
  // Client Files/<client>/<address> - <ref>/Issued"
  const decoded = decodeURIComponent(pathStr || "");
  const parts = decoded.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "";
  const parent = parts[parts.length - 2] || "";
  return last.toLowerCase() === "issued" && folderMatchesRef(parent, ref);
}

const SELECT =
  "$top=200&$select=id,name,size,folder,file,parentReference,lastModifiedDateTime," +
  "@microsoft.graph.downloadUrl";

/** Children of a drive item by id. */
async function childrenOf(itemId: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  let next: string | null =
    `/drives/${env.graphDriveId}/items/${itemId}/children?${SELECT}`;
  while (next) {
    const page: Record<string, unknown> = await gget(next.replace(GRAPH, ""));
    out.push(...((page.value as Record<string, unknown>[]) || []));
    const nl = page["@odata.nextLink"] as string | undefined;
    next = nl || null;
  }
  return out;
}

/** Children of a path relative to the drive root. Null when the path is
 *  missing, so a caller can tell "not there" from "couldn't ask". */
async function childrenAt(relPath: string): Promise<Record<string, unknown>[] | null> {
  const encoded = relPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  try {
    const page = await gget(
      `/drives/${env.graphDriveId}/root:/${encoded}:/children?${SELECT}`
    );
    return (page.value as Record<string, unknown>[]) || [];
  } catch (e) {
    if (/-> 404/.test((e as Error).message)) return null;
    throw e;
  }
}

function toRemote(it: Record<string, unknown>): RemoteFile | null {
  const file = it.file as { mimeType?: string } | undefined;
  if (!file) return null;
  if (EXCLUDED_FILE.test((it.name as string) || "")) return null; // templates / temp
  // No download link is NOT a reason to drop the file. SharePoint omits the
  // annotation for plenty of healthy items; downloadFile falls back to
  // /content, which always works. Dropping them here is what left a job's
  // certificate package empty with the PDFs sitting in the folder.
  const dl = (it["@microsoft.graph.downloadUrl"] as string | undefined) || "";
  const parent = (it.parentReference as { path?: string })?.path || "";
  const decoded = decodeURIComponent(parent).replace(/^\/drive(s)?\/[^/]+\/root:?/, "");
  const rel = decoded.replace(new RegExp("^/?" + env.clientFilesRoot + "/?"), "");
  return {
    name: it.name as string,
    size: Number(it.size || 0),
    contentType: file.mimeType || "application/octet-stream",
    downloadUrl: dl,
    itemId: it.id as string,
    folderPath: rel || null,
    lastModified: (it.lastModifiedDateTime as string) || null,
  };
}

/** The Issued files inside an already-located job folder. */
async function issuedInsideJobFolder(jobFolderId: string): Promise<RemoteFile[]> {
  const kids = await childrenOf(jobFolderId);
  const issued = kids.find(
    (k) => k.folder && String(k.name || "").trim().toLowerCase() === "issued"
  );
  if (!issued) return []; // certificate not filed yet — not an error
  const files = await childrenOf(issued.id as string);
  return files.map(toRemote).filter((f): f is RemoteFile => f !== null);
}

/** Find every file in the job's Issued folder.
 *
 *  Locating the folder matters more than it looks. The old approach searched
 *  the drive for the ref and kept matching *files* — but the certificates are
 *  named for the address, not the job number (".../24 Narranbee Ridge, Tapping
 *  WA - 56733/Issued/CDC - 24 Narranbee Ridge.pdf"). The ref lives on the
 *  FOLDER. So the search matched the folder, the folder was discarded for not
 *  being a file, and the job sat at "Being finalised" with its certificate
 *  sitting right there.
 *
 *  Now: find the job FOLDER (by search, which its name does match), then read
 *  its Issued child directly. If search hasn't indexed it yet — new folders can
 *  take a while — walk the client-files tree instead, which no index can lie
 *  about. */
export async function findIssuedFiles(ref: string): Promise<RemoteFile[]> {
  const q = encodeURIComponent(`'${ref}'`);
  const hits: Record<string, unknown>[] = [];
  let next: string | null =
    `/drives/${env.graphDriveId}/root/search(q=${q})?${SELECT}`;
  while (next) {
    const page: Record<string, unknown> = await gget(next.replace(GRAPH, ""));
    hits.push(...((page.value as Record<string, unknown>[]) || []));
    const nl = page["@odata.nextLink"] as string | undefined;
    next = nl || null;
  }

  // A job folder named "<address> - <ref>".
  const jobFolder = hits.find(
    (h) => h.folder && folderMatchesRef(String(h.name || ""), ref)
  );
  if (jobFolder) return issuedInsideJobFolder(jobFolder.id as string);

  // Search also returns the Issued folder itself when its path is indexed.
  const issuedFolder = hits.find(
    (h) =>
      h.folder &&
      String(h.name || "").trim().toLowerCase() === "issued" &&
      parentEndsWithIssued(
        ((h.parentReference as { path?: string })?.path || "") + "/issued",
        ref
      )
  );
  if (issuedFolder) {
    const files = await childrenOf(issuedFolder.id as string);
    return files.map(toRemote).filter((f): f is RemoteFile => f !== null);
  }

  // Nothing indexed yet — walk the tree. One listing of the client folders,
  // then one per client until the ref turns up.
  const root = env.clientFilesRoot;
  const clients = await childrenAt(root);
  if (clients === null) {
    throw new Error(
      `Can't open the client files folder "${root}" in SharePoint — ` +
      `check GRAPH_CLIENT_FILES_ROOT and GRAPH_DRIVE_ID.`
    );
  }
  for (const c of clients) {
    if (!c.folder) continue;
    const jobs = await childrenOf(c.id as string);
    const job = jobs.find(
      (j) => j.folder && folderMatchesRef(String(j.name || ""), ref)
    );
    if (job) return issuedInsideJobFolder(job.id as string);
  }
  return [];
}

/** Fetch a file's bytes.
 *
 *  Prefers the pre-signed link when SharePoint hands one out, but never
 *  depends on it: on this tenant `@microsoft.graph.downloadUrl` comes back
 *  absent for perfectly good PDFs, which silently emptied a job's certificate
 *  package. /content always works — it answers with a redirect to storage,
 *  which we follow ourselves so the bearer token is never forwarded to a
 *  pre-authenticated URL that doesn't want it. */
export async function downloadFile(f: RemoteFile): Promise<Buffer> {
  if (f.downloadUrl) {
    const direct = await fetch(f.downloadUrl);
    if (direct.ok) return Buffer.from(await direct.arrayBuffer());
  }
  const r = await fetch(
    `${GRAPH}/drives/${env.graphDriveId}/items/${f.itemId}/content`,
    { headers: { Authorization: `Bearer ${await token()}` }, redirect: "manual" }
  );
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get("location");
    if (!loc) throw new Error(`Download ${f.name} -> ${r.status} with no location`);
    const followed = await fetch(loc);
    if (!followed.ok) throw new Error(`Download ${f.name} -> ${followed.status}`);
    return Buffer.from(await followed.arrayBuffer());
  }
  if (!r.ok) throw new Error(`Download ${f.name} -> ${r.status} ${await r.text()}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Upload a file into a folder, addressed by its path relative to the
 *  client-files root (the shape job.sourceFolder holds).
 *
 *  Always an upload session, never the simple PUT: the simple route caps at
 *  4 MB and a correspondence record carrying the client's drawings routinely
 *  exceeds it. Chunks must be multiples of 320 KiB — 10 MiB is 32 of them.
 *  Same-name uploads replace, so a re-run files the fresher snapshot rather
 *  than littering the folder with copies.
 *
 *  Needs write permission (Sites.ReadWrite.All or Files.ReadWrite.All) on the
 *  Graph app — a 403 here means the registration only has read. */
export async function uploadFile(
  relFolder: string,
  filename: string,
  bytes: Buffer
): Promise<void> {
  const parts = [env.clientFilesRoot, ...relFolder.split("/"), filename]
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
  await uploadSession(`/drives/${env.graphDriveId}/root:/${parts}:`, filename, bytes);
}

/** Upload a file into a folder addressed by its item id — robust to however the
 *  client folders are nested, since no path is reconstructed. Same replace-on-
 *  conflict, same chunked session as uploadFile. */
export async function uploadIntoFolder(
  folderId: string,
  filename: string,
  bytes: Buffer
): Promise<void> {
  const enc = encodeURIComponent(filename);
  await uploadSession(`/drives/${env.graphDriveId}/items/${folderId}:/${enc}:`, filename, bytes);
}

/** The chunked upload both routes share: open a session on `itemPath`
 *  (…without the trailing "/createUploadSession"), then PUT the bytes in
 *  320-KiB-aligned pieces. */
async function uploadSession(itemPath: string, filename: string, bytes: Buffer): Promise<void> {
  const r = await fetch(`${GRAPH}${itemPath}/createUploadSession`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ item: { "@microsoft.graph.conflictBehavior": "replace" } }),
  });
  if (!r.ok) throw new Error(`Upload session ${filename} -> ${r.status} ${await r.text()}`);
  const uploadUrl = String((await r.json()).uploadUrl || "");
  if (!uploadUrl) throw new Error(`Upload session ${filename} -> no uploadUrl`);

  const CHUNK = 32 * 320 * 1024; // 10 MiB, a legal multiple of 320 KiB
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(start + CHUNK, bytes.length);
    const piece = bytes.subarray(start, end);
    // The session URL is pre-authenticated — no bearer header, same as the
    // pre-signed download links above.
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(piece.length),
        "Content-Range": `bytes ${start}-${end - 1}/${bytes.length}`,
      },
      body: new Uint8Array(piece),
    });
    if (!put.ok) throw new Error(`Upload ${filename} chunk @${start} -> ${put.status} ${await put.text()}`);
  }
}

// --- Filing new info into a job folder (replace + supersede) ----------------
// The client's answer to an FIR goes into the job's own folder, and the version
// it replaces is moved aside into a "Superseded" subfolder rather than
// overwritten — so the office keeps the history without the top of the folder
// filling with old drawings. These are the three moves that takes.

/** The files (not subfolders) sitting directly in a folder, by its item id. */
export async function folderFiles(
  folderId: string
): Promise<{ id: string; name: string }[]> {
  const kids = await childrenOf(folderId);
  return kids
    .filter((k) => !k.folder)
    .map((k) => ({ id: String(k.id), name: String(k.name || "") }));
}

/** A subfolder by name, created if it isn't there yet; returns its item id. */
export async function ensureSubfolder(parentId: string, name: string): Promise<string> {
  const find = (kids: Record<string, unknown>[]) =>
    kids.find(
      (k) => k.folder && String(k.name || "").trim().toLowerCase() === name.toLowerCase()
    );
  const here = find(await childrenOf(parentId));
  if (here) return String(here.id);
  try {
    const made = await gsend("POST", `/drives/${env.graphDriveId}/items/${parentId}/children`, {
      name, folder: {}, "@microsoft.graph.conflictBehavior": "fail",
    });
    return String(made.id);
  } catch (e) {
    // Lost a race to create it — read it back rather than fail.
    if (/-> 409/.test((e as Error).message)) {
      const again = find(await childrenOf(parentId));
      if (again) return String(again.id);
    }
    throw e;
  }
}

/** Move an item into another folder in the same drive, keeping its name. */
export async function moveItem(itemId: string, destFolderId: string): Promise<void> {
  await gsend("PATCH", `/drives/${env.graphDriveId}/items/${itemId}`, {
    parentReference: { id: destFolderId },
  });
}

// --- Diagnostics -----------------------------------------------------------
// Used only by the staff SharePoint check in /admin. These answer "what can
// the portal actually see", which an empty file list never could.

export async function describeDrive(): Promise<{ name: string; webUrl: string }> {
  const d = await gget(`/drives/${env.graphDriveId}?$select=name,webUrl`);
  return { name: String(d.name || ""), webUrl: String(d.webUrl || "") };
}

export async function listClientFolders(): Promise<string[]> {
  const kids = await childrenAt(env.clientFilesRoot);
  if (kids === null) throw new Error(`"${env.clientFilesRoot}" not found in this drive`);
  return kids.filter((k) => k.folder).map((k) => String(k.name || ""));
}

export async function locateJobFolder(
  ref: string
): Promise<{ id: string; name: string; client: string; via: string } | null> {
  const q = encodeURIComponent(`'${ref}'`);
  const page = await gget(`/drives/${env.graphDriveId}/root/search(q=${q})?${SELECT}`);
  const hit = ((page.value as Record<string, unknown>[]) || []).find(
    (h) => h.folder && folderMatchesRef(String(h.name || ""), ref)
  );
  if (hit) {
    const path = decodeURIComponent(
      (hit.parentReference as { path?: string })?.path || ""
    );
    return {
      id: String(hit.id), name: String(hit.name || ""),
      client: path.split("/").filter(Boolean).pop() || "",
      via: "search",
    };
  }
  const clients = await childrenAt(env.clientFilesRoot);
  if (clients === null) throw new Error(`"${env.clientFilesRoot}" not found in this drive`);
  for (const c of clients) {
    if (!c.folder) continue;
    const jobs = await childrenOf(String(c.id));
    const job = jobs.find((j) => j.folder && folderMatchesRef(String(j.name || ""), ref));
    if (job) {
      return {
        id: String(job.id), name: String(job.name || ""),
        client: String(c.name || ""), via: "folder walk",
      };
    }
  }
  return null;
}

export async function inspectIssued(jobFolderId: string): Promise<{
  issuedFolderFound: boolean;
  childFolders: string[];
  usable: { name: string; size: number }[];
  skipped: { name: string; why: string }[];
}> {
  const kids = await childrenOf(jobFolderId);
  const childFolders = kids.filter((k) => k.folder).map((k) => String(k.name || ""));
  const issued = kids.find(
    (k) => k.folder && String(k.name || "").trim().toLowerCase() === "issued"
  );
  if (!issued) return { issuedFolderFound: false, childFolders, usable: [], skipped: [] };

  const files = await childrenOf(String(issued.id));
  const usable: { name: string; size: number }[] = [];
  const skipped: { name: string; why: string }[] = [];
  for (const f of files) {
    const name = String(f.name || "");
    if (f.folder) { skipped.push({ name, why: "a folder, not a file" }); continue; }
    if (EXCLUDED_FILE.test(name)) {
      skipped.push({ name, why: "Word document or temp file — excluded on purpose" });
      continue;
    }
    usable.push({ name, size: Number(f.size || 0) });
  }
  return { issuedFolderFound: true, childFolders, usable, skipped };
}
