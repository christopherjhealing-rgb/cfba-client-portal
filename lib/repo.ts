import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { DEMO_MODE, env } from "./env";
import { aliasKey, normEmail, CANCELLED_STATUS } from "./core.mjs";
import { normUsername } from "./auth";
import * as demo from "./demo";
import type { ClientPause, PortalJob } from "./core.mjs";

export interface Job {
  ref: string;
  companyId: string;
  mondayItemId: string | null;
  address: string;
  description: string;
  mondayStatus: string;
  fileCount: number;
  issuedAt: string | null;
  receivedAt: string | null;
  firstDownloadedAt: string | null;
  lastSyncedAt: string | null;
  storagePrefix: string;
  sourceFolder: string | null;
  /** First name shown to the client, e.g. "Chris"; null = being allocated. */
  surveyor?: string | null;
  /** The client's own PO/job number. Portal + emails only, never Monday. */
  clientRef?: string | null;
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
  clientRef?: string | null;
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
  displayName?: string | null;
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

/** Everything a client owns, for the confirm dialog. Counting BEFORE deleting
 *  is the whole point — "delete this client" means nothing until you can see
 *  it means three jobs and eleven files. */
export async function companyFootprint(id: string): Promise<{
  jobs: number; files: number; messages: number; logins: number; refs: string[];
}> {
  const jobs = (await listJobsForCompany(id)).map((j) => j.ref);
  const messages = (await listMessagesForCompany(id)).length;
  const logins = (await listLogins()).filter((l) => l.companyId === id).length;
  let files = 0;
  for (const ref of jobs) files += (await jobFiles(ref)).length;
  return { jobs: jobs.length, files, messages, logins, refs: jobs.slice(0, 12) };
}

/**
 * Remove a client and everything hanging off it: logins, emails, aliases,
 * their jobs and the stored files, their messages and read marks.
 *
 * Their Monday cards are NOT touched — this portal is not the system of
 * record and has no business deleting the firm's board. Which means any card
 * still on the board reappears on the next sync as an unmatched client, and
 * the caller is told so rather than finding out later.
 */
export async function deleteCompany(id: string): Promise<{ jobs: number; files: number }> {
  const before = await companyFootprint(id);

  for (const ref of (await listJobsForCompany(id)).map((j) => j.ref)) {
    const job = await getJob(ref);
    try {
      await purgeJobFiles(ref, job?.storagePrefix || `issued/${ref}`);
    } catch (e) {
      console.warn(`deleteCompany: couldn't purge files for ${ref}:`, (e as Error).message);
    }
  }

  if (DEMO_MODE) {
    const db = await demo.load();
    for (const [ref, j] of Object.entries(db.jobs)) if (j.companyId === id) delete db.jobs[ref];
    for (const u of Object.keys(db.logins)) if (db.logins[u].companyId === id) delete db.logins[u];
    db.messages = (db.messages || []).filter((m) => m.companyId !== id);
    if (db.reads) delete db.reads[id];
    db.companies = db.companies.filter((c) => c.id !== id);
    await demo.save(db);
    return { jobs: before.jobs, files: before.files };
  }

  const refs = (await listJobsForCompany(id)).map((j) => j.ref);
  if (refs.length) must(await sb().from("job_files").delete().in("ref", refs));
  must(await sb().from("jobs").delete().eq("company_id", id));
  must(await sb().from("messages").delete().eq("company_id", id));
  await sb().from("message_reads").delete().eq("company_id", id);
  await sb().from("submissions").delete().eq("company_id", id);
  must(await sb().from("client_logins").delete().eq("company_id", id));
  await sb().from("company_emails").delete().eq("company_id", id);
  await sb().from("company_aliases").delete().eq("company_id", id);
  must(await sb().from("companies").delete().eq("id", id));
  return { jobs: before.jobs, files: before.files };
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
  displayName?: string | null;
}): Promise<void> {
  const u = normUsername(l.username);
  const displayName = (l.displayName || "").trim() || null;
  if (DEMO_MODE) {
    const db = await demo.load();
    db.logins[u] = {
      username: u, companyId: l.companyId, displayName, passwordHash: null, mustSetPassword: true,
      setupCodeHash: l.setupCodeHash, setupExpiresAt: l.setupExpiresAt,
      disabled: false, lastLoginAt: null, createdAt: new Date().toISOString(),
    };
    await demo.save(db);
    return;
  }
  must(await sb().from("client_logins").insert({
    username: u, company_id: l.companyId, display_name: displayName,
    password_hash: null, must_set_password: true,
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
      // Password preserved — see the note in the Supabase branch below.
      await demo.save(db);
    }
    return;
  }
  // Issue a setup code WITHOUT destroying the existing password. The old
  // password keeps working until the code is actually redeemed in
  // set-password (which validates the code, not must_set_password), so a
  // self-service recovery or an admin reset can't lock a client out — and an
  // unauthenticated /api/auth/recover can no longer wipe a known user's
  // password. A brand-new login still starts password-less via createLogin.
  must(await sb().from("client_logins").update({
    setup_code_hash: setupCodeHash, setup_expires_at: setupExpiresAt,
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

/** Reflect a cancellation the board has already accepted, so the portal stops
 *  showing the job as live before the next sync runs. Monday stays the record:
 *  the sync re-asserts the status from the card on its next pass, and this only
 *  closes the fifteen-minute window in between. */
export async function markCancelled(ref: string) {
  if (DEMO_MODE) {
    const db = await demo.load();
    if (db.jobs[ref]) {
      db.jobs[ref].mondayStatus = CANCELLED_STATUS;
      await demo.save(db);
    }
    return;
  }
  must(await sb().from("jobs").update({ monday_status: CANCELLED_STATUS }).eq("ref", ref));
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
    file_count: files.length, issued_at: job.issuedAt, received_at: job.receivedAt,
    last_synced_at: job.lastSyncedAt,
    storage_prefix: job.storagePrefix, source_folder: job.sourceFolder,
    surveyor: job.surveyor ?? null, client_ref: job.clientRef ?? null,
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
    files: s.files, client_ref: s.clientRef ?? null, status: "pending",
    amendment_of: s.amendmentOf ?? null,
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

/** Stream a stored file, or null if absent. Streaming keeps large files
 *  clear of the serverless response-size cap. */
export async function readFileStream(storagePath: string): Promise<ReadableStream | null> {
  if (DEMO_MODE) {
    const db = await demo.load();
    const b64 = db.files[storagePath];
    if (b64 === undefined) return null;
    return new Blob([Buffer.from(b64 as string, "base64")]).stream();
  }
  const { data, error } = await sb().storage.from(env.supabaseBucket).download(storagePath);
  if (error || !data) return null;
  return data.stream();
}

export async function deleteFile(storagePath: string) {
  if (DEMO_MODE) {
    const db = await demo.load();
    delete db.files[storagePath];
    await demo.save(db);
    return;
  }
  const { error } = await sb().storage.from(env.supabaseBucket).remove([storagePath]);
  if (error) throw new Error(`Storage delete failed for ${storagePath}: ${error.message}`);
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
// Demo mode keeps these in the demo store FILE, not module memory: the dev
// server can hold separate module instances for routes and pages, and a
// switch held in one instance's memory never reaches the other.
// ---------------------------------------------------------------------------
export async function disabledPages(): Promise<Set<string>> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return new Set((db.disabledPages || []).map(String));
  }
  const { data } = await sb().from("portal_settings")
    .select("value").eq("key", "disabled_pages").maybeSingle();
  const list = Array.isArray(data?.value) ? (data.value as unknown[]) : [];
  return new Set(list.map(String));
}

export async function setPageDisabled(key: string, disabled: boolean) {
  if (DEMO_MODE) {
    const db = await demo.load();
    const current = new Set(db.disabledPages || []);
    if (disabled) current.add(key);
    else current.delete(key);
    db.disabledPages = [...current];
    await demo.save(db);
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

/** Append-only audit trail. Never throws — a logging failure must not break
 *  the action being logged. */
export async function logAudit(action: string, target?: string, detail?: string, actor = "staff") {
  if (DEMO_MODE) return;
  try {
    await sb().from("audit_log").insert({
      action, target: target || null, detail: detail || null, actor,
    });
  } catch (e) {
    console.warn("audit log failed:", (e as Error).message);
  }
}

export interface AuditEntry {
  id: number; at: string; actor: string; action: string;
  target: string | null; detail: string | null;
}

export async function listAudit(limit = 200): Promise<AuditEntry[]> {
  if (DEMO_MODE) return [];
  const { data } = await sb().from("audit_log")
    .select("*").order("at", { ascending: false }).limit(limit);
  return (data || []) as AuditEntry[];
}

/** Generic portal_settings read/write (JSON value). */
export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return ((db.settings || {})[key] as T) ?? null;
  }
  const { data } = await sb().from("portal_settings")
    .select("value").eq("key", key).maybeSingle();
  return (data?.value as T) ?? null;
}

export async function setSetting(key: string, value: unknown) {
  if (DEMO_MODE) {
    const db = await demo.load();
    (db.settings ||= {})[key] = value;
    await demo.save(db);
    return;
  }
  must(await sb().from("portal_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  ));
}

// ---------------------------------------------------------------------------
// The watch list.
//
// Everything else in the portal reacts to something happening. This is the one
// record of things that should have happened and didn't — a card issued whose
// files never arrived, a client never told their job was ready, a board write
// that bounced. Each lives here until it resolves itself, because a sync
// result lasts one run and the failure it describes can last a week.
//
// One settings row, not one per job: nothing here needs indexing, and a single
// document is a single read in the evening report.
// ---------------------------------------------------------------------------
export interface WatchNote { at: string; why: string }
export interface WatchState {
  /** ref -> when we first saw it issued with no files in the portal. */
  stuckSince: Record<string, string>;
  /** ref -> the client was never told it was ready. */
  emailFailed: Record<string, WatchNote>;
  /** ref -> a PORTAL write the board wouldn't take. */
  boardFailed: Record<string, WatchNote>;
}

const EMPTY_WATCH: WatchState = { stuckSince: {}, emailFailed: {}, boardFailed: {} };

export async function getWatch(): Promise<WatchState> {
  const raw = await getSetting<Partial<WatchState>>("watch").catch(() => null);
  return {
    stuckSince: raw?.stuckSince || {},
    emailFailed: raw?.emailFailed || {},
    boardFailed: raw?.boardFailed || {},
  };
}

export async function setWatch(state: WatchState) {
  await setSetting("watch", state);
}

/** Record a board write the portal couldn't make. Called from the download
 *  path, which has no sync result to file it under. */
export async function noteBoardWriteFail(ref: string, why: string) {
  const w = await getWatch();
  w.boardFailed[ref] = { at: new Date().toISOString(), why };
  await setWatch(w);
}

/** Everything we were worried about on this job is over. */
export function clearWatch(w: WatchState, ref: string) {
  delete w.stuckSince[ref];
  delete w.emailFailed[ref];
  delete w.boardFailed[ref];
}

export { EMPTY_WATCH };

// ---------------------------------------------------------------------------
// The with-the-client clock. One portal_settings row per job — deliberately,
// so the feature needs no migration and nobody has to paste SQL to get it.
// The record's shape is documented above clientPausedDays in core.mjs.
// ---------------------------------------------------------------------------
export const PAUSE_PREFIX = "firdays:";
export const pauseKey = (ref: string) => `${PAUSE_PREFIX}${ref}`;

/** Pause records for a set of refs, keyed by ref, in ONE query — a client with
 *  a hundred running jobs must not cost a hundred round trips. A ref with no
 *  record is simply absent, which the arithmetic reads as "never paused". */
export async function clientPauses(refs: string[]): Promise<Record<string, ClientPause>> {
  const out: Record<string, ClientPause> = {};
  const wanted = [...new Set(refs.filter(Boolean))];
  if (wanted.length === 0) return out;

  if (DEMO_MODE) {
    const db = await demo.load();
    const settings = db.settings || {};
    for (const ref of wanted) {
      const v = settings[pauseKey(ref)];
      if (v) out[ref] = v as ClientPause;
    }
    return out;
  }
  const { data } = await sb().from("portal_settings")
    .select("key,value").in("key", wanted.map(pauseKey));
  for (const row of data || []) {
    const ref = String(row.key).slice(PAUSE_PREFIX.length);
    if (row.value) out[ref] = row.value as ClientPause;
  }
  return out;
}

/** Add a Monday "Client" spelling as an alias of an existing company, so its
 *  cards match on the next sync. Idempotent. */
export async function addAlias(companyId: string, rawSpelling: string) {
  const key = aliasKey(rawSpelling);
  if (!key) return;
  if (DEMO_MODE) return;
  must(await sb().from("company_aliases")
    .upsert({ company_id: companyId, alias_key: key }, { onConflict: "company_id,alias_key" }));
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
  return { ...rest, receivedAt: (rest as { receivedAt?: string | null }).receivedAt ?? null };
}
function rowToJob(r: Record<string, unknown>): Job {
  return {
    ref: String(r.ref), companyId: String(r.company_id),
    mondayItemId: (r.monday_item_id as string) ?? null,
    address: (r.address as string) || "", description: (r.description as string) || "",
    mondayStatus: (r.monday_status as string) || "", fileCount: Number(r.file_count || 0),
    issuedAt: (r.issued_at as string) ?? null,
    receivedAt: (r.received_at as string) ?? null,
    firstDownloadedAt: (r.first_downloaded_at as string) ?? null,
    lastSyncedAt: (r.last_synced_at as string) ?? null,
    storagePrefix: (r.storage_prefix as string) || `issued/${r.ref}`,
    sourceFolder: (r.source_folder as string) ?? null,
    surveyor: (r.surveyor as string) ?? null,
    clientRef: (r.client_ref as string) ?? null,
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
    clientRef: (r.client_ref as string) ?? null,
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
    displayName: (r.display_name as string) ?? null,
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

/** Every message on one ref, across all companies. Staff-side: it's how the
 *  enquiry channel is read, since an enquiry has no job and so no client page
 *  to hang it off. Never reachable from a client context — it deliberately
 *  doesn't scope to a company. */
export async function listMessagesByRef(ref: string): Promise<Message[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return (db.messages || [])
      .filter((m) => m.ref === ref)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  const { data } = await sb().from("messages").select("*")
    .eq("ref", ref).order("created_at");
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

/**
 * Which of these Monday update ids the portal has already mirrored.
 *
 * Asked about a specific handful rather than "give me every id you have".
 * PostgREST caps a plain select at the project's max-rows (1000 by default),
 * silently — so the old version would, the day the messages table crossed
 * that line, start reporting old updates as unseen. The sync would re-import
 * them and re-email the client every five minutes. Bounded by the number of
 * updates in this cycle, this can't drift with the size of the table.
 */
export async function knownMondayUpdateIds(ids: string[] = []): Promise<Set<string>> {
  const wanted = ids.filter(Boolean);
  if (DEMO_MODE) {
    const db = await demo.load();
    const all = new Set((db.messages || []).map((m) => m.mondayUpdateId).filter(Boolean) as string[]);
    return wanted.length ? new Set(wanted.filter((id) => all.has(id))) : all;
  }
  if (!wanted.length) return new Set();
  const out = new Set<string>();
  // Chunked: a URL with a few thousand ids in it is a request no gateway wants.
  for (let i = 0; i < wanted.length; i += 200) {
    const { data } = await sb().from("messages").select("monday_update_id")
      .in("monday_update_id", wanted.slice(i, i + 200));
    for (const r of data || []) out.add(String(r.monday_update_id));
  }
  return out;
}

/**
 * Every job, for retention sweeps and the evening report.
 *
 * Paged explicitly. A plain select stops at the project's max-rows without
 * saying so, and the two things that read this — the retention purge and the
 * report that exists to notice what's gone wrong — would both quietly go
 * blind past that line, which is the worst possible pair to lose.
 */
export async function listAllJobs(): Promise<Job[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.values(db.jobs).map(stripFiles);
  }
  const PAGE = 1000;
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await sb().from("jobs").select("*")
      .order("ref").range(from, from + PAGE - 1);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows.map(rowToJob);
}

/** Remove a job's stored files once its retention window has passed. The job
 *  record stays so the client still sees it in their history; only the
 *  documents go. */
// Delete the stored certificate files for a job. `prefix` is the job's actual
// storagePrefix ("issued/<ref>"); earlier this function hardcoded "jobs/<ref>",
// a path nothing ever writes to, so the blobs were never removed and the
// retention promise held only at the database layer.
export async function purgeJobFiles(ref: string, prefix: string): Promise<void> {
  if (DEMO_MODE) {
    const db = await demo.load();
    const j = db.jobs[ref];
    if (j) { j.files = []; j.fileCount = 0; }
    for (const k of Object.keys(db.files)) {
      if (k.startsWith(`${prefix}/`)) delete db.files[k];
    }
    await demo.save(db);
    return;
  }
  const { data } = await sb().storage.from(env.supabaseBucket).list(prefix);
  if (data?.length) {
    await sb().storage.from(env.supabaseBucket)
      .remove(data.map((f) => `${prefix}/${f.name}`));
  }
  await sb().from("job_files").delete().eq("ref", ref);
  await sb().from("jobs").update({ file_count: 0 }).eq("ref", ref);
}

/** Names of the blobs actually sitting under a job's storage prefix, with
 *  their sizes. The job_files rows say what SHOULD be there; this says what
 *  is. A row whose blob is missing or empty is worse than no row at all —
 *  the client gets a Download button that yields nothing. */
export async function listStored(prefix: string): Promise<{ name: string; size: number }[]> {
  if (DEMO_MODE) {
    const db = await demo.load();
    return Object.keys(db.files)
      .filter((k) => k.startsWith(`${prefix}/`))
      .map((k) => ({
        name: k.slice(prefix.length + 1),
        size: Buffer.from(db.files[k] as string, "base64").length,
      }));
  }
  const { data, error } = await sb().storage.from(env.supabaseBucket).list(prefix);
  if (error) throw new Error(`Storage list failed for ${prefix}: ${error.message}`);
  return (data || []).map((f) => ({
    name: f.name,
    size: Number((f.metadata as { size?: number } | null)?.size ?? 0),
  }));
}
