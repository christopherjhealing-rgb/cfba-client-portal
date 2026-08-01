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

/** Find every file in the job's Issued folder, matched by ref. */
export async function findIssuedFiles(ref: string): Promise<RemoteFile[]> {
  const q = encodeURIComponent(`'${ref}'`);
  const url =
    `/drives/${env.graphDriveId}/root/search(q=${q})` +
    `?$top=200&$select=id,name,size,file,parentReference,lastModifiedDateTime,@microsoft.graph.downloadUrl`;
  const out: RemoteFile[] = [];
  let next: string | null = url;
  while (next) {
    const page: Record<string, unknown> = await gget(next.replace(GRAPH, ""));
    for (const it of (page.value as Record<string, unknown>[]) || []) {
      const file = it.file as { mimeType?: string } | undefined;
      if (!file) continue; // folders
      if (EXCLUDED_FILE.test((it.name as string) || "")) continue; // templates / temp files
      const parent = (it.parentReference as { path?: string })?.path || "";
      if (!parentEndsWithIssued(parent, ref)) continue;
      const dl = it["@microsoft.graph.downloadUrl"] as string | undefined;
      if (!dl) continue;
      const decoded = decodeURIComponent(parent).replace(/^\/drive(s)?\/[^/]+\/root:?/, "");
      const rel = decoded.replace(new RegExp("^/?" + env.clientFilesRoot + "/?"), "");
      out.push({
        name: it.name as string,
        size: Number(it.size || 0),
        contentType: file.mimeType || "application/octet-stream",
        downloadUrl: dl,
        itemId: it.id as string,
        folderPath: rel || null,
        lastModified: (it.lastModifiedDateTime as string) || null,
      });
    }
    const nl = page["@odata.nextLink"] as string | undefined;
    next = nl ? nl : null;
  }
  return out;
}

export async function downloadFile(f: RemoteFile): Promise<Buffer> {
  const r = await fetch(f.downloadUrl);
  if (!r.ok) throw new Error(`Download ${f.name} -> ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
