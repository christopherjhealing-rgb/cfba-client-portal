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
  const dl = it["@microsoft.graph.downloadUrl"] as string | undefined;
  if (!dl) return null;
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

export async function downloadFile(f: RemoteFile): Promise<Buffer> {
  const r = await fetch(f.downloadUrl);
  if (!r.ok) throw new Error(`Download ${f.name} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
