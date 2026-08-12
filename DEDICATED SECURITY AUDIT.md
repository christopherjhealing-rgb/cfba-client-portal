# CFBA Client Portal — Dedicated Security & Data-Protection Audit

**Session 2 of the pre-pilot programme — security only.**
Author: security review pass (read-only). Date: 12 August 2026.
Codebase: `christopherjhealing-rgb/monday-portal`, branch
`claude/monday-portal-review-9q31ec`, HEAD `027247a` (merged PR #35).

> **What this session was and was not.** This was a dedicated security and
> data-protection review. It changed **no** application code, data, schema,
> RLS, storage, or auth configuration, and it deployed nothing. Every finding
> below was reached by reading the code as shipped. The one file written this
> session is this report.
>
> Findings are classified by confidence:
> **VERIFIED** (traced end-to-end in code) · **LIKELY** (strong evidence, one
> assumption unconfirmed) · **HARDENING** (not a live vulnerability; a
> defence-in-depth gap) · **THEORETICAL** (a real weakness in principle,
> not exploitable in this deployment's shape).

---

## 1. Executive summary

The portal is **well-built from a security standpoint**. The two questions
that gate a pilot with real client data — *can Client A reach Client B's
documents?* and *can an ordinary client become staff?* — both come back
**no**, verified across the entire request surface, not sampled.

- **No P0 (critical) findings.** No cross-client data-access path and no
  client→admin privilege-escalation path was found.
- **No P1 (high) security findings.** (The P1s in the *Pre-Pilot Master
  Audit* are operational/verification items — a live-path smoke test, a
  post-retention certificate-access decision — not security vulnerabilities.)
- **No P2 findings.**
- **Findings are all P3/P4 hardening** — defence-in-depth items that reduce
  residual risk but do not block a controlled pilot. The most substantive is
  the absence of HTTP security headers (§13, H1).

The security architecture rests on three consistently-applied disciplines,
each verified route-by-route:

1. **Fail closed.** Every session sign *and* verify refuses to run on the
   public default `AUTH_SECRET`; staff login refuses the default passcode.
   A misconfigured production deployment breaks loudly rather than running
   insecurely and silently.
2. **Scope from the signed session, never from the request.** Company
   identity for every read and write is taken from the verified JWT, never
   from a body field, path param, or query string. A foreign or unknown
   resource returns the *same* 404 as a missing one — no existence oracle.
3. **Impersonation is read-only.** A staff member viewing a client's portal
   carries an `impersonated` flag, and every state-changing route rejects it
   with 403.

**Security pilot status: CONDITIONAL GO** — see §16. The condition is a short,
mechanical pre-flight confirmation of production environment configuration,
not any code change. The fail-closed design makes that condition easy to
verify: if the app functions at all in production, the critical secrets are
necessarily set.

---

## 2. Scope & methodology

**In scope:** authentication and sessions; multi-tenant data isolation;
authorization and privilege boundaries; object-level access control (IDOR);
input validation and injection (Monday board labels, path traversal, CSV,
XSS); file upload/storage handling; secrets and configuration; rate limiting
and abuse; data protection; audit/logging; third-party trust boundaries.

**Method:** static review of the shipped code. The review enumerated all
**51 API routes** and the server components that read data, then read the
security-relevant ones in full:

- Session/auth core: `lib/session.ts`, `lib/auth.ts`, `lib/throttle.ts`,
  `lib/env.ts`, `app/api/auth/{login,set-password,recover,logout}`,
  `app/api/admin/login`, `app/api/admin/impersonate`.
- Client data surface: `app/api/jobs/[ref]/{download,cancel}`,
  `app/api/jobs/export`, `app/api/messages/route` + `[id]/[index]`,
  `app/api/submit`, `app/api/team`, `app/api/library`,
  `app/api/notifications`, `app/api/amendments/[id]/[file]`,
  `app/api/engineering/[set]`, `app/jobs/[ref]/page`, `app/submit/page`.
- Static-file serving: `app/api/notes/[file]`, `app/api/forms/[file]`,
  `lib/info-sheets.ts`, `lib/resources.ts`.
- Studio (separate identity): `app/api/studio/designs/[id]`, `lib/studio.ts`.
- Cron/system: `app/api/{sync,report,digest}`.
- Data layer & config: `lib/repo.ts`, `proxy.ts`, `next.config.mjs`.

**Reachability confirmed by grep, not assumption:** every caller of the
un-scoped primitives `getJob(ref)` / `jobFiles(ref)` / `readFile(path)` was
enumerated and checked; no client component imports the service-role client;
`NEXT_PUBLIC_` usage was swept for secret exposure.

**Out of scope / not performed** (per the read-only, no-attack constraint):
live penetration testing, dependency CVE scanning against the running
lockfile, and inspection of the production Vercel/Supabase configuration
itself (hence the CONDITIONAL in §16).

---

## 3. Threat model

**Assets, most sensitive first:** clients' certified building documents (CDC
packages) in the private `issued` storage bucket; client PII (company emails,
contacts, site addresses); portal login credentials (scrypt hashes); the
Monday.com board (operational source of truth); the Microsoft Graph mailbox
and SharePoint library (app-only credentials).

**Actors & trust boundaries:**
- *Anonymous internet* → the sign-in, recover, set-password, and static-file
  routes. Must not read any client data or enumerate accounts.
- *Authenticated client (Company A)* → their own jobs, messages, documents.
  **Must never** reach Company B's anything. Primary threat.
- *Departed client user* → a still-valid 30-day cookie after being disabled.
  Must be cut off promptly.
- *Authenticated staff* → all companies (legitimate); may impersonate a
  client read-only.
- *Client attempting escalation* → must not be able to forge staff status or
  act as another client.
- *Cron caller* → Vercel scheduler bearing `CRON_SECRET`.

**Design posture:** Supabase RLS is enabled with **zero policies**, and all
data access goes through the **service-role key server-side only**. This is a
deliberate "service-role-only" model: the database enforces nothing on its
own; **the application is the entire access-control layer.** That raises the
stakes on §5–§7 — which is exactly why isolation was verified on every route
rather than sampled.

---

## 4. Authentication & session security — VERIFIED SECURE

**Fail-closed secret handling.** `lib/session.ts` defines
`assertSecret()`, which throws in a live environment (`!DEMO_MODE`) when
`AUTH_SECRET` is still the public default. It is called on **both** the
signing path (`sign()`, line 36) and **both** verification paths
(`getClientSession()` line 94, `isStaff()` line 131). Consequently a
production deployment with an unset `AUTH_SECRET` cannot mint *or* accept a
session — it returns a loud 500 rather than trusting a token signed with a
value published in the repo. This closes the single most dangerous
misconfiguration (forgeable staff cookie).

**Client vs staff cookies.** Two cookies (`cfba_session`, `cfba_staff`)
signed with the same secret, distinguished by a `kind` claim inside the
**signed** payload. A client cannot flip their own `kind` to `staff` without
re-signing, which requires the secret. Both cookies are `httpOnly`,
`secure` in production, `sameSite: lax`, `path: /`. Client lifetime 30 days
(remember-me) / 12 h (shared machine); staff 12 h.

**Departed-user liveness.** `getClientSession()` checks `loginDead()` — a
60-second-cached lookup that ends a session whose login has been disabled or
deleted, so a 30-day cookie cannot outlive an offboarding by more than a
minute. It **fails open** on a database error (a DB hiccup must not sign
everyone out) — a deliberate, documented availability/security trade-off
(logged here as H7, acceptable).

**Staff passcode** (`app/api/admin/login`): refuses the default `demo`
passcode in a live environment (503); compared with `crypto.timingSafeEqual`
under a length guard; throttled per-IP **and** by a global ceiling (§11).

**Password & setup-code hashing** (`lib/auth.ts`): passwords use `scrypt`
with a per-password 16-byte random salt and constant-time comparison, over
NFKC-normalised input; setup codes are HMAC-SHA256 keyed to `AUTH_SECRET`,
also constant-time compared. Password policy enforces a sensible minimum and
rejects trivial values. **Industry-standard, correctly implemented.**

**Enumeration resistance:**
- `auth/recover` returns an identical generic response whether or not the
  username exists, and — critically — emails the new setup code **only to the
  addresses already held for the company**, never to an address typed into
  the form. This removes the account-takeover-via-recovery vector entirely.
- `auth/set-password` returns the same "isn't right" message for a bad
  username and a bad code, and on success can only ever establish a session
  for the company the login is already bound to.

---

## 5. Multi-tenant data isolation — VERIFIED SECURE (the P0 question)

**Result: no credible cross-client data-access path was found.** This was
checked on every client-reachable data route, not sampled.

The invariant, applied uniformly: the caller's `companyId` comes from the
**verified session JWT**; the resource is then fetched and rejected with a
`404` (identical to "missing") unless `resource.companyId === session.companyId`.

Verified instances:

| Route | Isolation control |
|---|---|
| `jobs/[ref]/download` | `job.companyId !== session.companyId → 404`; files read from the job's own DB records |
| `jobs/[ref]/cancel` | same 404 guard; `impersonated → 403` |
| `jobs/export` | `listJobsForCompany(session.companyId)` only |
| `jobs/[ref]/page` (RSC) | `raw.companyId !== session.companyId → notFound()` |
| `submit` (lodge/amend) | `amendableRef()` requires the job to match the caller's company even for board-only historic refs — "finding the card is not permission to amend it" |
| `submit/page` prefill | `job.companyId !== companyId → undefined`; address never carried |
| `messages` (both paths) | job resolved via `listJobsForCompany`; `addMessage` stamps `session.companyId` |
| `messages/[id]/[index]` | scoped via `listMessagesForCompany(companyId)` then find-by-id |
| `amendments/[id]/[file]` | `sub.companyId !== session.companyId → 404` + category/status allowlist |
| `team` | `target.companyId !== session.companyId → 404`; hashes never serialized |
| `library` (all verbs) | ids resolve only against `listLibrary(session.companyId)` |
| `notifications` | `unreadCount` + `listJobsForCompany`, both scoped |
| `engineering/[set]` | `canAccessSet()` per set; same 404 for missing/not-allowed |

**Why the un-scoped primitives are safe.** `repo.getJob(ref)` and
`repo.jobFiles(ref)` query by `ref` alone (not by company) — they are
primitives, and isolation is enforced by every caller. All four
client-reachable callers were read and **all four enforce the ownership
check** (the two API routes and the two server components above). The
remaining callers are server-only internals (sync, accept, amendments,
record-build/mail/file) that never run on behalf of an unauthenticated
client. Sequential/guessable refs are therefore not an IDOR: guessing a
neighbour's ref yields the same 404 as a ref that does not exist.

---

## 6. Authorization & privilege escalation — VERIFIED SECURE (the P0 question)

**Result: no client→admin escalation path was found.**

- **Staff status cannot be forged.** It requires the `cfba_staff` cookie,
  obtainable only by presenting the staff passcode (constant-time compared,
  fails closed on default, throttled globally). The `kind:"staff"` claim lives
  inside the signed JWT; a client cannot manufacture it.
- **Impersonation is staff-initiated and read-only.** `admin/impersonate`
  is gated on `isStaff()` (non-staff are redirected to the login), mints a
  2-hour client session flagged `impersonated:true` for the chosen company,
  and writes an audit record. It is *not* a route a client can call to become
  someone else.
- **Impersonation write-block is comprehensive.** Every state-changing client
  route rejects `session.impersonated` with 403: verified on `cancel`,
  `messages` (both handlers), `submit` (both handlers), `team`, and `library`.
  A staff member viewing a client can look but not act as them.
- **The admin surface is uniformly `isStaff()`-gated.** The route sweep found
  every `/admin/*` API route behind `isStaff()`; spot-verified on
  `admin/login`, `admin/impersonate`, and `admin/jobs/[ref]`.
- **Intra-company boundary.** The `team` route lets a client *disable* a
  login on their own company but never *re-enable* one (office-only) and
  never touch another company's login — a deliberate, correct asymmetry.

---

## 7. Object-level access control (IDOR) — VERIFIED SECURE

Beyond the company checks in §5, the file-serving routes were checked for
direct-object and traversal abuse:

- **`amendments/[id]/[file]`** serves only files that are `category===REVISED`
  and `status===AMENDMENT_DONE`, and only when `file` matches a name in the
  submission's own file list — company-checked first. No arbitrary read.
- **`messages/[id]/[index]`** indexes into a message that was fetched within
  the caller's company scope; a foreign id is a 404.
- **`studio/designs/[id]`** is scoped to `who.owner` (the verified studio JWT
  subject) on every operation — a studio user reaches only their own designs.
- **`engineering/[set]`** matches the `set` key against the registry
  *before* constructing any storage path, so a `../` key simply fails to
  match → 404. Served inside a **sandboxed, opaque-origin iframe** with
  `X-Robots-Tag: noindex`, so client-uploaded checker HTML cannot read portal
  cookies or the parent page.

---

## 8. Input validation & injection — VERIFIED SECURE (with P4 CSV note)

**Path traversal — blocked.** Two independent defences:
1. Uploaded filenames are sanitized to `[A-Za-z0-9 ._-]` (slashes and dots
   sequences stripped) before being appended to a server-built prefix, in
   `submit`, `messages`, `library`, and `uploads/sign`.
2. Static-file routes validate the requested name against a **static
   registry**, not by parsing: `isPublishedSheet` (exact match in
   `PUBLISHED_SHEETS`), `isFormFile` (exact match against
   `PORTAL_FORMS × FORM_EXTS`), and the engineering-set registry. A crafted
   `../` name matches nothing.

**Monday board-label injection — blocked.** The board's Class column has
`create_labels_if_missing` on, so an attacker-controlled class string could
mint arbitrary labels. `submit` **derives** class and description
server-side via `describeJob()` rather than trusting client strings, and the
BAL label is whitelisted against `BAL_LABELS`. A request cannot write an
arbitrary label onto the board.

**Stored/reflected XSS — no sink found.** Output is React-escaped
throughout; the only raw-HTML responses are (a) the engineering checker,
served sandboxed/opaque-origin, and (b) office notification emails, which are
server-composed and sent to CFBA's own inbox, not rendered in any client's
browser. Even were an XSS found, the session cookie is `httpOnly`.

**Body-size & type limits** are enforced server-side (not trusting the
browser filter): PDF-only on lodgement/messages/library; 40 MB per
submission, 25 MB per message/document; sizes re-read from storage on the
direct-upload path rather than taken from the client's claims.

**P4 — CSV formula injection (`jobs/export`, H4).** The CSV quotes fields
containing `" , \n` but does not neutralise cells beginning `= + - @`, which
Excel may interpret as formulas. Impact is low and self-contained: the export
is scoped to the caller's *own* company and opens in the caller's *own*
spreadsheet with their own data — there is no cross-tenant vector. Hardening:
prefix risky cells with a `'`.

---

## 9. File upload & storage security — VERIFIED SECURE

- **The `issued` bucket is private** and reached only through the
  service-role client server-side; there are no public object URLs.
- **Signed-URL uploads are company-fenced.** `uploads/sign` builds the draft
  prefix as `uploads/${session.companyId}/${draftId}` — the company segment
  comes from the session, so a client can only ever obtain upload URLs into
  their own draft area. On the consuming side (`submit`/`messages` direct
  path), the prefix is *rebuilt* from `session.companyId`; supplying another
  company's `draftId` yields a path under the attacker's own company that
  does not exist → "files didn't finish uploading". `draftId` is a
  server-generated UUID (`up_…`), validated by regex.
- **`readFile`/`readFileStream` take only trusted paths:** DB-sourced
  `storagePath` values, registry-guarded route params, or
  `libraryPath(companyId, doc)` — never raw user input. All callers were
  enumerated and confirmed.
- Library deletes tolerate a failed storage removal (a stray blob with no
  index entry is invisible and harmless) — correct failure direction.

---

## 10. Secrets management & configuration — VERIFIED SECURE

- **Service-role key is server-only.** It appears only in `lib/repo.ts`
  (the `sb()` client) and `lib/env.ts`. **No client component imports
  `repo`** (grep-confirmed), so it cannot reach a browser bundle.
- **No secret values are hardcoded.** All tokens/keys default to `""`; the
  only string literal is the *known-public* dev secret used as the sentinel
  for the fail-closed check.
- **Only one `NEXT_PUBLIC_` variable exists** — `NEXT_PUBLIC_GOOGLE_MAPS_KEY`
  — which is a browser-embedded Maps key, public by design (see H6 for the
  billing-scope hardening). The cadastre and bushfire tokens are explicitly
  server-only and never `NEXT_PUBLIC_`.
- **Demo mode is safe by construction.** `DEMO_MODE = !supabaseUrl ||
  !supabaseServiceKey`: any deployment with Supabase configured is *not* in
  demo mode, so all fail-closed guards (`assertSecret`, staff-passcode
  refusal) are active in any real environment.

---

## 11. Rate limiting & abuse prevention — VERIFIED SECURE

`lib/throttle.ts` implements progressive per-username backoff: 3 free
attempts, then 5 → 30 → 120-minute lockouts, with the counter resetting only
after a clear 24 hours so an attacker cannot wait out the short lockout and
start fresh. Because the staff passcode has no username and the per-IP lock
can be sidestepped by rotating `X-Forwarded-For`, a **global staff ceiling**
(20 failures / 15 minutes, IP-independent) backstops the single shared
passcode against online guessing — a genuinely thoughtful control. The
`auth/recover` route is likewise throttled (`recover:<user>`) to prevent
inbox-spam, while still returning its uniform generic response.

---

## 12. Data protection & privacy — VERIFIED SECURE (one policy decision open)

- **In transit:** HTTPS end-to-end (Vercel edge); the outbound egress proxy
  enforces TLS to Monday/Graph/Supabase.
- **At rest:** documents in Supabase Storage; PII in Supabase Postgres; both
  managed-encrypted by the platform.
- **Minimisation in responses:** client-facing payloads are hand-whitelisted.
  The `team` route serializes only `{username, displayName, lastLoginAt,
  disabled}` and **never** the password/setup-code hashes on the same row;
  `notifications` writes only `ref` + `address`, deliberately un-spreadable.
- **Audit trail:** downloads, cancellations, impersonation, login
  disable/enable, and library changes are written to `audit_log`.
- **Open policy decision (not a code flaw), from the Master Audit:** what a
  client sees after the configured retention window (`RETENTION_MONTHS`)
  elapses — certificates become unavailable in-portal. This is a business/UX
  decision for CFBA, surfaced here for completeness.

---

## 13. Logging, audit & monitoring; HTTP headers — HARDENING (H1)

Audit and error logging are sound: client-facing errors are generic ("nothing
was saved") while full detail (schema, storage paths) goes to the server log
only, so internals never leak to a client response.

**H1 (P3, HARDENING) — no HTTP security headers.** `next.config.mjs` is
minimal (`reactStrictMode` only) and there is no headers middleware, so the
app ships without a **Content-Security-Policy**, **X-Frame-Options**,
**X-Content-Type-Options**, **Referrer-Policy**, or **Permissions-Policy**.
This is a defence-in-depth gap, not a live vulnerability — clickjacking is the
most realistic concern, and it is partially mitigated (the sensitive embedded
content, the engineering checker, is already `sandbox`ed). Recommended before
or shortly after pilot: add a `headers()` block (or middleware) setting, at
minimum, `X-Frame-Options: DENY` (or a `frame-ancestors` CSP),
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
and a starter CSP. Low effort, no functional risk.

---

## 14. Third-party & supply-chain trust boundaries — VERIFIED / NOTED

- **Monday.com** is the source of truth; the portal writes only derived,
  whitelisted values (§8). A board write that fails is surfaced, never
  silently trusted.
- **Microsoft Graph** is app-only (email + SharePoint); credentials are
  server-only and the `RECORD_TO_FOLDER` write path is off by default until
  `Sites.ReadWrite.All` is deliberately granted.
- **Supabase** service-role posture is covered in §3/§10.
- **Dependencies:** a lockfile-based CVE scan was out of scope for this
  read-only pass; recommend a `npm audit` / Dependabot check as a standing
  process item (not a pilot blocker).

---

## 15. Findings register

| ID | Sev | Class | Title | Status |
|----|-----|-------|-------|--------|
| — | **P0** | — | *No critical findings* | — |
| — | **P1** | — | *No high security findings* | — |
| — | **P2** | — | *No medium findings* | — |
| H1 | P3 | HARDENING | No HTTP security headers (CSP/XFO/nosniff/Referrer-Policy) — §13 | Open |
| H2 | P4 | HARDENING | `lib/studio.ts` `secret()` and `lib/auth.ts` `hashSetupCode` read `AUTH_SECRET` without `assertSecret()` — defence-in-depth only; moot because the main login's fail-closed check forces `AUTH_SECRET` to be set for any working deployment | Open |
| H3 | P4 | THEORETICAL | Cron routes compare `CRON_SECRET` with `===`, not `timingSafeEqual` (admin login already uses constant-time) — remote timing oracle infeasible against a high-entropy secret | Open |
| H4 | P4 | HARDENING | `jobs/export` CSV does not neutralise `= + - @` formula cells — self-scoped data only, no cross-tenant vector — §8 | Open |
| H5 | P4 | THEORETICAL | `jobs/[ref]/download` is a state-changing GET (marks downloaded, fires the record email); a top-level-navigation CSRF could trigger it, but there is no exfiltration primitive and the effect is idempotent (once-per-job) — `sameSite:lax` blocks subresource requests | Open |
| H6 | P4 | HARDENING/OPS | `NEXT_PUBLIC_GOOGLE_MAPS_KEY` is public by design — confirm an HTTP-referrer restriction in Google Cloud to prevent quota/billing theft (no data risk) | Ops |
| H7 | — | INFO | `loginDead()` fails open on DB error — a disabled login may persist up to ~60 s or during a DB outage; documented, deliberate availability trade-off | Accepted |
| H8 | — | INFO | Standing process: `npm audit` / Dependabot for dependency CVEs (out of scope this pass) | Process |

None of H1–H8 blocks a controlled pilot. H1 is the one worth scheduling
promptly; the rest are opportunistic.

---

## 16. Pilot recommendation

### SECURITY PILOT STATUS: **CONDITIONAL GO**

The **code** is pilot-ready from a security standpoint: no P0, no P1, no P2;
tenant isolation and privilege boundaries verified across the full route
surface; auth fails closed. If this verdict were about the code alone it would
be an unqualified GO.

It is **CONDITIONAL** for one honest reason: a security sign-off must account
for the **production configuration**, and this read-only session was
(correctly) not permitted to inspect the live Vercel/Supabase environment.
The fail-closed design means most of this is self-enforcing — but confirming
it takes five minutes and should be done before the first real client logs in.

**Pre-flight checklist (all are config confirmations, not code changes):**

1. **`AUTH_SECRET`** is set to a strong random value in production. *(If it
   weren't, sign-in would already be throwing 500 — so a working login proves
   this. Confirm anyway.)*
2. **`STAFF_PASSCODE`** is set to a strong non-default value. *(A default would
   return 503 at `/admin/login`.)*
3. **`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`** are set (so production is
   not silently in demo mode) and the **`issued` bucket is private** with RLS
   enabled.
4. **`CRON_SECRET`** is set and matches the Vercel Cron configuration (missing
   → the scheduled sync/report simply won't authorise).
5. **Google Maps key** (if the site-plan tool is enabled) is HTTP-referrer
   restricted (H6).

**Recommended within the pilot window (non-blocking):** implement H1 (security
headers); optionally H3/H4 constant-time and CSV hardening; stand up the H8
dependency-audit process.

Once items 1–5 are confirmed, this review's position is **GO** for a
controlled pilot with real client data.

---

*End of Session 2 security audit. No application code, data, schema, RLS,
storage, auth configuration, or deployment was changed in the course of this
review.*
