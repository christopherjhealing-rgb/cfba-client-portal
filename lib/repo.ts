import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DEMO_MODE, env } from "./env";
import { aliasKey, normEmail } from "./core.mjs";
import { normUsername } from "./auth";
import * as demo from "./demo";
import type { PortalJob } from "./core.mjs";

export interface Job {
  ref: string;
  companyId: string;
  mondayItemId: string | null;
  address: string;
  description: string;
  mondayStatus: string;
  fileCount: number;
  issuedAt: string | null;
  firstDownloadedAt: string | null;
  lastSyncedAt: string | null;
  storagePrefix: string;
  sourceFolder: string | null;
  /** What we've asked the client for, when the job is at FIR. */
  firRequest?: string | null;
}
export interface JobFile {
  filename: string;
  size: number;
  storagePath: string;
  contentType: string;
}
export interface Submission {
  id: string;
  companyId: string;
  email: string;
  address: string;
  jobClass: string;
  description: string;
  notes: string;
  files: { name: string; category?: string }[];
  status: "pending" | "accepted" | "rejected";
  mondayItemId: string | null;
  reviewNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
  /** Set when this is an amendment to an existing job — the parent job ref.
      An amendment always opens its own card; the link is for context. */
  amendmentOf?: string | null;
}
export interface Message {
  id: string;
  ref: string;
  companyId: string;
  from: "client" | "cfba";
  body: string;
  createdAt: string;
  mondayUpdateId?: string | null;
  files?: MessageFile[];
}
export interface MessageFile {
  name: string;
  size: number;
  storagePath: string;
  contentType: string;
}
export interface Company { id: string; name: string; emails: string[]; isTest?: boolean; }
export interface CompanyLite { id: string; name: string; }
export interface CompanyMatch { id: string; aliasKeys: string[]; emails: string[]; }
export interface Login {
  username: string;
  companyId: string;
  passwordHash: string | null;
  mustSetPassword: boolean;
  setupCodeHash: string | null;
  setupExpiresAt: string | null;
  disabled: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

let _sb: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!_sb) _sb = createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { persistSession: false },
  });
  return _sb;
}

/** Throw when a write fails. Without this, a schema mismatch or outage makes
 *  the portal report success while storing nothing — the worst failure mode
 *  a lodgement system can have. */
function must<T extends { error: { message: string } | null }>(res: T): T {
  if (res.error) throw new Error(`Database write failed: ${res.error.message}`);
  return res;
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
export async function listCompanies(): Promise<Company[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.companies.slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  const { data } = await sb().from("companies").select("id, name, is_test").order("name");
  const { data: emails } = await sb().from("company_emails").select("company_id, email");
  const byId: Record<string, string[]> = {};
  for (const e of emails || []) (byId[e.company_id] ||= []).push(e.email);
  return (data || []).map((c) => ({
    id: c.id, name: c.name, emails: byId[c.id] || [], isTest: !!c.is_test,
  }));
}

export async function companyById(id: string): Promise<Company | null> {
  const all = await listCompanies();
  return all.find((c) => c.id === id) || null;
}

/** Create a company in the portal's registry, with optional contact emails and
 *  extra Monday-spelling aliases. Alias keys are normalised here so callers
 *  can pass the raw spellings staff see on the board. */
export async function createCompany(input: {
  name: string; emails?: string[]; aliases?: string[]; isTest?: boolean;
}): Promise<Company> {
  if (DEMO_MODE) throw new Error("Demo mode — connect Supabase to add real clients.");

  const id = crypto.randomUUID();
  const { error } = await sb().from("companies").insert({
    id, name: input.name, is_test: !!input.isTest,
  });
  if (error) throw new Error(error.message);

  const emails = [...new Set((input.emails || []).map(normEmail).filter(Boolean))];
  if (emails.length) {
    const { error: e } = await sb().from("company_emails")
      .insert(emails.map((email) => ({ company_id: id, email })));
    if (e) {
      await sb().from("companies").delete().eq("id", id);
      throw new Error(
        e.code === "23505"
          ? "One of those emails is already attached to another client."
          : e.message
      );
    }
  }

  const aliasKeys = [...new Set((input.aliases || []).map(aliasKey).filter(Boolean))]
    .filter((k) => k !== aliasKey(input.name)); // the name itself always matches
  if (aliasKeys.length) {
    const { error: e } = await sb().from("company_aliases")
      .insert(aliasKeys.map((alias_key) => ({ company_id: id, alias_key })));
    if (e) {
      await sb().from("company_emails").delete().eq("company_id", id);
      await sb().from("companies").delete().eq("id", id);
      throw new Error(e.message);
    }
  }

  return { id, name: input.name, emails, isTest: !!input.isTest };
}

export async function companiesForMatch(): Promise<CompanyMatch[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.companies.map((c) => ({
      id: c.id, emails: c.emails, aliasKeys: [aliasKey(c.name)],
    }));
  }
  const { data: companies } = await sb().from("companies").select("id, name");
  const { data: emails } = await sb().from("company_emails").select("company_id, email");
  const { data: aliases } = await sb().from("company_aliases").select("company_id, alias_key");
  const byId: Record<string, CompanyMatch> = {};
  for (const c of companies || []) byId[c.id] = { id: c.id, emails: [], aliasKeys: [aliasKey(c.name)] };
  for (const e of emails || []) byId[e.company_id]?.emails.push(e.email);
  for (const a of aliases || []) byId[a.company_id]?.aliasKeys.push(a.alias_key);
  return Object.values(byId);
}

// ---------------------------------------------------------------------------
// Logins (username + client-chosen password)
// ---------------------------------------------------------------------------
export async function getLogin(username: string): Promise<Login | null> {
  const u = normUsername(username);
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.logins[u] || null;
  }
  const { data } = await sb().from("client_logins").select("*").eq("username", u).maybeSingle();
  return data ? rowToLogin(data) : null;
}

export async function listLogins(): Promise<Login[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.values(db.logins);
  }
  const { data } = await sb().from("client_logins").select("*").order("username");
  return (data || []).map(rowToLogin);
}

export async function createLogin(l: {
  username: string; companyId: string; setupCodeHash: string; setupExpiresAt: string;
}): Promise<void> {
  const u = normUsername(l.username);
  if (DEMO_MODE) {
    const db = await demo.load();
    db.logins[u] = {
      username: u, companyId: l.companyId, passwordHash: null, mustSetPassword: true,
      setupCodeHash: l.setupCodeHash, setupExpiresAt: l.setupExpiresAt,
      disabled: false, lastLoginAt: null, createdAt: new Date().toISOString(),
    };
    await demo.save(db);
    return;
  }
  must(await sb().from("client_logins").insert({
    username: u, company_id: l.companyId, password_hash: null, must_set_password: true,
    setup_code_hash: l.setupCodeHash, setup_expires_at: l.setupExpiresAt, disabled: false,
  }));
}

export async function issueSetupCode(username: string, setupCodeHash: string, setupExpiresAt: string) {
  const u = normUsername(username);
  if (DEMO_MODE) {
    const db = await demo.load();
    const l = db.logins[u];
    if (l) {
      l.setupCodeHash = setupCodeHash;
      l.setupExpiresAt = setupExpiresAt;
      l.mustSetPassword = true;
      l.passwordHash = null;
      await demo.save(db);
    }
    return;
  }
  must(await sb().from("client_logins").update({
    setup_code_hash: setupCodeHash, setup_expires_at: setupExpiresAt,
    must_set_password: true, password_hash: null,
  }).eq("username", u));
}

export async function setPassword(username: string, passwordHash: string) {
  const u = normUsername(username);
  if (DEMO_MODE) {
    const db = await demo.load();
    const l = db.logins[u];
    if (l) {
      l.passwordHash = passwordHash;
      l.mustSetPassword = false;
      l.setupCodeHash = null;
      l.setupExpiresAt = null;
      await demo.save(db);
    }
    return;
  }
  must(await sb().from("client_logins").update({
    password_hash: passwordHash, must_set_password: false,
    setup_code_hash: null, setup_expires_at: null,
  }).eq("username", u));
}

export async function touchLogin(username: string) {
  const u = normUsername(username);
  const at = new Date().toISOString();
  if (DEMO_MODE) {
    const db = await demo.load();
    if (db.logins[u]) { db.logins[u].lastLoginAt = at; await demo.save(db); }
    return;
  }
  await sb().from("client_logins").update({ last_login_at: at }).eq("username", u);
}

export async function setLoginDisabled(username: string, disabled: boolean) {
  const u = normUsername(username);
  if (DEMO_MODE) {
    const db = await demo.load();
    if (db.logins[u]) { db.logins[u].disabled = disabled; await demo.save(db); }
    return;
  }
  must(await sb().from("client_logins").update({ disabled }).eq("username", u));
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export async function listJobsForCompany(companyId: string): Promise<Job[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.values(db.jobs)
      .filter((j) => j.companyId === companyId)
      .map(stripFiles)
      .sort((a, b) => (b.issuedAt || "").localeCompare(a.issuedAt || ""));
  }
  const { data } = await sb().from("jobs").select("*").eq("company_id", companyId);
  return (data || []).map(rowToJob);
}

export async function getJob(ref: string): Promise<Job | null> {
  if (DEMO_MODE) {
    const db = await demo.load();
    const j = db.jobs[ref];
    return j ? stripFiles(j) : null;
  }
  const { data } = await sb().from("jobs").select("*").eq("ref", ref).maybeSingle();
  return data ? rowToJob(data) : null;
}

export async function jobFiles(ref: string): Promise<JobFile[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.jobs[ref]?.files || [];
  }
  const { data } = await sb().from("job_files")
    .select("filename, size, storage_path, content_type").eq("ref", ref);
  return (data || []).map((f) => ({
    filename: f.filename, size: f.size, storagePath: f.storage_path, contentType: f.content_type,
  }));
}

export async function markDownloaded(ref: string, at: string) {
  if (DEMO_MODE) {
    const db = await demo.load();
    if (db.jobs[ref] && !db.jobs[ref].firstDownloadedAt) {
      db.jobs[ref].firstDownloadedAt = at;
      await demo.save(db);
    }
    return;
  }
  // The retention clock starts here; a silent failure would mean files never
  // purge and the six-month promise to clients quietly stops being true.
  must(await sb().from("jobs").update({ first_downloaded_at: at })
    .eq("ref", ref).is("first_downloaded_at", null));
}

export async function upsertJob(job: Job, files: JobFile[]) {
  if (DEMO_MODE) {
    const db = await demo.load();
    const existing = db.jobs[job.ref];
    db.jobs[job.ref] = {
      ...job, files, fileCount: files.length,
      firstDownloadedAt: existing?.firstDownloadedAt ?? job.firstDownloadedAt,
    };
    await demo.save(db);
    return;
  }
  must(await sb().from("jobs").upsert({
    ref: job.ref, company_id: job.companyId, monday_item_id: job.mondayItemId,
    address: job.address, description: job.description, monday_status: job.mondayStatus,
    file_count: files.length, issued_at: job.issuedAt, last_synced_at: job.lastSyncedAt,
    storage_prefix: job.storagePrefix, source_folder: job.sourceFolder,
  }, { onConflict: "ref" }));
  if (files.length) {
    must(await sb().from("job_files").delete().eq("ref", job.ref));
    must(await sb().from("job_files").insert(files.map((f) => ({
      ref: job.ref, filename: f.filename, size: f.size,
      storage_path: f.storagePath, content_type: f.contentType,
    }))));
  }
}

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------
export async function addSubmission(
  s: Omit<Submission, "id" | "status" | "mondayItemId" | "reviewNote" | "reviewedAt">,
  preId?: string
): Promise<string> {
  const id = preId || "sub_" + Math.random().toString(36).slice(2, 10);
  if (DEMO_MODE) {
    const db = await demo.load();
    db.submissions.unshift({
      ...s, id, status: "pending", mondayItemId: null, reviewNote: null, reviewedAt: null,
    });
    await demo.save(db);
    return id;
  }
  must(await sb().from("submissions").insert({
    id, company_id: s.companyId, email: s.email, address: s.address,
    job_class: s.jobClass, description: s.description, notes: s.notes,
    files: s.files, status: "pending", amendment_of: s.amendmentOf ?? null,
  }));
  return id;
}

export async function listSubmissions(status = "pending"): Promise<Submission[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.submissions.filter((x) => x.status === status);
  }
  const { data } = await sb().from("submissions").select("*").eq("status", status).order("created_at");
  return (data || []).map(rowToSub);
}

export async function listSubmissionsForCompany(companyId: string): Promise<Submission[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.submissions.filter((x) => x.companyId === companyId);
  }
  const { data } = await sb().from("submissions").select("*")
    .eq("company_id", companyId).order("created_at", { ascending: false });
  return (data || []).map(rowToSub);
}

export async function getSubmission(id: string): Promise<Submission | null> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return db.submissions.find((x) => x.id === id) || null;
  }
  const { data } = await sb().from("submissions").select("*").eq("id", id).maybeSingle();
  return data ? rowToSub(data) : null;
}

export async function setSubmission(
  id: string,
  patch: Partial<Pick<Submission, "status" | "mondayItemId" | "reviewNote">>
) {
  if (DEMO_MODE) {
    const db = await demo.load();
    const s = db.submissions.find((x) => x.id === id);
    if (s) { Object.assign(s, patch, { reviewedAt: new Date().toISOString() }); await demo.save(db); }
    return;
  }
  must(await sb().from("submissions").update({
    status: patch.status, monday_item_id: patch.mondayItemId,
    review_note: patch.reviewNote, reviewed_at: new Date().toISOString(),
  }).eq("id", id));
}

// ---------------------------------------------------------------------------
// File bytes
// ---------------------------------------------------------------------------
export async function readFile(storagePath: string): Promise<Buffer> {
  if (DEMO_MODE) {
    const db = await demo.load();
    const b64 = db.files[storagePath];
    if (!b64) throw new Error("file not found: " + storagePath);
    return Buffer.from(b64, "base64");
  }
  const { data, error } = await sb().storage.from(env.supabaseBucket).download(storagePath);
  if (error || !data) throw new Error("storage download failed: " + (error?.message || storagePath));
  return Buffer.from(await data.arrayBuffer());
}

export async function writeFile(storagePath: string, bytes: Buffer, contentType: string) {
  if (DEMO_MODE) {
    const db = await demo.load();
    db.files[storagePath] = bytes.toString("base64");
    await demo.save(db);
    return;
  }
  const { error } = await sb().storage.from(env.supabaseBucket)
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed for ${storagePath}: ${error.message}`);
}

export interface StoredListing { name: string; size: number; }

/** Files sitting directly under a storage prefix, with sizes as the server
 *  sees them — the source of truth when verifying a direct upload. */
export async function listFiles(prefix: string): Promise<StoredListing[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.entries(db.files)
      .filter(([p]) => p.startsWith(prefix + "/"))
      .map(([p, b64]) => ({
        name: p.slice(prefix.length + 1),
        size: Buffer.from(b64 as string, "base64").length,
      }))
      .filter((f) => !f.name.includes("/"));
  }
  const { data, error } = await sb().storage.from(env.supabaseBucket)
    .list(prefix, { limit: 100 });
  if (error) throw new Error(`Storage list failed for ${prefix}: ${error.message}`);
  return (data || [])
    .filter((o) => o.name && (o as { id?: string | null }).id) // folders list with a null id
    .map((o) => ({
      name: o.name,
      size: Number((o.metadata as { size?: number } | null)?.size || 0),
    }));
}

export async function moveFile(from: string, to: string) {
  if (DEMO_MODE) {
    const db = await demo.load();
    if (db.files[from] === undefined) throw new Error(`No stored file at ${from}`);
    db.files[to] = db.files[from];
    delete db.files[from];
    await demo.save(db);
    return;
  }
  const { error } = await sb().storage.from(env.supabaseBucket).move(from, to);
  if (error) throw new Error(`Storage move ${from} -> ${to} failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Portal settings — staff-controlled switches (e.g. hiding a page for updates)
// ---------------------------------------------------------------------------
const demoDisabledPages = new Set<string>();

export async function disabledPages(): Promise<Set<string>> {
  if (DEMO_MODE) return new Set(demoDisabledPages);
  const { data } = await sb().from("portal_settings")
    .select("value").eq("key", "disabled_pages").maybeSingle();
  const list = Array.isArray(data?.value) ? (data.value as unknown[]) : [];
  return new Set(list.map(String));
}

export async function setPageDisabled(key: string, disabled: boolean) {
  if (DEMO_MODE) {
    if (disabled) demoDisabledPages.add(key);
    else demoDisabledPages.delete(key);
    return;
  }
  const current = await disabledPages();
  if (disabled) current.add(key);
  else current.delete(key);
  must(await sb().from("portal_settings").upsert(
    { key: "disabled_pages", value: [...current], updated_at: new Date().toISOString() },
    { onConflict: "key" }
  ));
}

/** Short-lived signed URL permitting one browser PUT to one exact path.
 *  Grants no read access; the bucket stays private. */
export async function signUploadUrl(path: string): Promise<string> {
  if (DEMO_MODE) throw new Error("Direct uploads are not available in demo mode.");
  const { data, error } = await sb().storage.from(env.supabaseBucket)
    .createSignedUploadUrl(path);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign upload for ${path}: ${error?.message || "no URL returned"}`);
  }
  return data.signedUrl;
}

// ---------------------------------------------------------------------------
function stripFiles(j: demo.DemoJob): Job {
  const { files, ...rest } = j;
  void files;
  return rest;
}
function rowToJob(r: Record<string, unknown>): Job {
  return {
    ref: String(r.ref), companyId: String(r.company_id),
    mondayItemId: (r.monday_item_id as string) ?? null,
    address: (r.address as string) || "", description: (r.description as string) || "",
    mondayStatus: (r.monday_status as string) || "", fileCount: Number(r.file_count || 0),
    issuedAt: (r.issued_at as string) ?? null,
    firstDownloadedAt: (r.first_downloaded_at as string) ?? null,
    lastSyncedAt: (r.last_synced_at as string) ?? null,
    storagePrefix: (r.storage_prefix as string) || `issued/${r.ref}`,
    sourceFolder: (r.source_folder as string) ?? null,
    firRequest: (r.fir_request as string) ?? null,
  };
}
function rowToSub(r: Record<string, unknown>): Submission {
  return {
    id: String(r.id), companyId: String(r.company_id), email: (r.email as string) || "",
    address: (r.address as string) || "",
    jobClass: (r.job_class as string) || "",
    description: (r.description as string) || "",
    notes: (r.notes as string) || "",
    files: (r.files as { name: string; category?: string }[]) || [],
    amendmentOf: (r.amendment_of as string) ?? null,
    status: (r.status as Submission["status"]) || "pending",
    mondayItemId: (r.monday_item_id as string) ?? null,
    reviewNote: (r.review_note as string) ?? null,
    createdAt: (r.created_at as string) || "", reviewedAt: (r.reviewed_at as string) ?? null,
  };
}
function rowToLogin(r: Record<string, unknown>): Login {
  return {
    username: String(r.username), companyId: String(r.company_id),
    passwordHash: (r.password_hash as string) ?? null,
    mustSetPassword: !!r.must_set_password,
    setupCodeHash: (r.setup_code_hash as string) ?? null,
    setupExpiresAt: (r.setup_expires_at as string) ?? null,
    disabled: !!r.disabled,
    lastLoginAt: (r.last_login_at as string) ?? null,
    createdAt: (r.created_at as string) || "",
  };
}

export function toPortalJob(j: Job): PortalJob & Job {
  return { ...j };
}

// ---------------------------------------------------------------------------
// Messages. A thread hangs off a job ref. In production a message from CFBA is
// a Monday update prefixed "CLIENT:" picked up by the sync; a client reply is
// posted straight back onto the same card, so the card stays the single record
// of the conversation and nobody has a second inbox to watch.
// ---------------------------------------------------------------------------
export async function listMessagesForCompany(companyId: string): Promise<Message[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return (db.messages || [])
      .filter((m) => m.companyId === companyId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { data } = await sb().from("messages").select("*")
    .eq("company_id", companyId).order("created_at");
  return (data || []).map(rowToMessage);
}

export async function addMessage(m: Omit<Message, "id">, preId?: string): Promise<Message> {
  const rec: Message = { ...m, id: preId || "msg_" + Math.random().toString(36).slice(2, 10) };
  if (DEMO_MODE) {
    const db = await demo.load();
    (db.messages ||= []).push(rec);
    await demo.save(db);
    return rec;
  }
  must(await sb().from("messages").insert({
    id: rec.id, ref: rec.ref, company_id: rec.companyId, from_side: rec.from,
    body: rec.body, created_at: rec.createdAt, monday_update_id: rec.mondayUpdateId ?? null,
    files: rec.files ?? [],
  }));
  return rec;
}

/** When this company last opened each thread. */
export async function getReadMarks(companyId: string): Promise<Record<string, string>> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return (db.reads || {})[companyId] || {};
  }
  const { data } = await sb().from("message_reads")
    .select("ref, read_at").eq("company_id", companyId);
  const out: Record<string, string> = {};
  for (const r of data || []) out[r.ref] = r.read_at;
  return out;
}

export async function markThreadRead(companyId: string, ref: string) {
  const at = new Date().toISOString();
  if (DEMO_MODE) {
    const db = await demo.load();
    ((db.reads ||= {})[companyId] ||= {})[ref] = at;
    await demo.save(db);
    return;
  }
  await sb().from("message_reads")
    .upsert({ company_id: companyId, ref, read_at: at }, { onConflict: "company_id,ref" });
}

function rowToMessage(r: Record<string, unknown>): Message {
  return {
    id: String(r.id), ref: String(r.ref), companyId: String(r.company_id),
    from: (r.from_side as "client" | "cfba") || "cfba",
    body: (r.body as string) || "",
    createdAt: (r.created_at as string) || "",
    mondayUpdateId: (r.monday_update_id as string) ?? null,
    files: (r.files as MessageFile[]) || [],
  };
}

/** Monday update ids already mirrored into the portal, so a sync never
 *  duplicates a message it has seen before. */
export async function knownMondayUpdateIds(): Promise<Set<string>> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return new Set((db.messages || []).map((m) => m.mondayUpdateId).filter(Boolean) as string[]);
  }
  const { data } = await sb().from("messages").select("monday_update_id")
    .not("monday_update_id", "is", null);
  return new Set((data || []).map((r) => String(r.monday_update_id)));
}

/** Every job, for retention sweeps. */
export async function listAllJobs(): Promise<Job[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.values(db.jobs).map(stripFiles);
  }
  const { data } = await sb().from("jobs").select("*");
  return (data || []).map(rowToJob);
}

/** Remove a job's stored files once its retention window has passed. The job
 *  record stays so the client still sees it in their history; only the
 *  documents go. */
export async function purgeJobFiles(ref: string): Promise<void> {
  if (DEMO_MODE) {
    const db = await demo.load();
    const j = db.jobs[ref];
    if (j) { j.files = []; j.fileCount = 0; }
    for (const k of Object.keys(db.files)) {
      if (k.startsWith(`jobs/${ref}/`)) delete db.files[k];
    }
    await demo.save(db);
    return;
  }
  const { data } = await sb().storage.from(env.supabaseBucket).list(`jobs/${ref}`);
  if (data?.length) {
    await sb().storage.from(env.supabaseBucket)
      .remove(data.map((f) => `jobs/${ref}/${f.name}`));
  }
  await sb().from("job_files").delete().eq("ref", ref);
  await sb().from("jobs").update({ file_count: 0 }).eq("ref", ref);
}
