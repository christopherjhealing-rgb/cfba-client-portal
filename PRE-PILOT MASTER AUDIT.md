# PRE-PILOT MASTER AUDIT — CFBA Client Portal

**Session 1 of 3 · August 2026 · model: claude-fable-5 (Fable), no subagents**
Scope: capability setup, discovery, architecture/functional/workflow audit,
initial UI/UX review, pre-pilot recommendations. **No code was changed.**
Security investigation is deferred to Session 2; findings here flag only.

Companion docs created this session: `DESIGN.md` (design source of truth).
Existing docs this audit builds on (read them, don't re-derive):
`docs/UX-REVIEW.md` (prior 20-finding review, ~all shipped 2026-08-02),
`docs/SPECS.md` (feature statuses), `docs/GO-LIVE-RUNBOOK.md` (8-phase
go-live + go/no-go checklist + accepted known issues), `supabase/schema.sql`.

Severity: **P0** blocker · **P1** high · **P2** medium · **P3** enhancement ·
**P4** future.

---

## 0. Capability summary

| Capability | Status |
|---|---|
| Active model | claude-fable-5 (Fable) confirmed |
| frontend-design skill | **Installed** from official `anthropics/skills` → `.claude/skills/frontend-design/` (read and applied this session; hot-loads in future sessions once committed). `impeccable` (owner-chosen) already vendored; both defer to DESIGN.md |
| DESIGN.md | Did not exist → **created** (current state vs principles separated; final direction reserved for Session 4) |
| Browser testing | **Proven**: Playwright + preinstalled Chromium; app runs fully offline in demo mode (`next start`); login, cookies, screenshots, mobile/desktop viewports all exercised this session. Console/network inspection available via Playwright. No Cypress. |
| Supabase | No credentials/MCP in this environment (runs DEMO_MODE). Schema fully documented in `supabase/schema.sql` (+ 1 migration). Posture: 13 tables, **RLS enabled with zero policies — service-role-only, server-side access exclusively**, private `issued` bucket. Live verification → Session 2. DB changes are applied manually by the owner → any proposal must be a documented SQL snippet, never applied by an agent |
| Test framework | `node --test`: **478 passing** pure-logic tests · lint = `tsc --noEmit` (clean) · `next build` green at HEAD `82389ae` |
| Accessibility tooling | None installed. Recommend `@axe-core/playwright` in Session 3 (this container is ephemeral — install then, not now) |
| Performance tooling | None (no Lighthouse). Recommend one Lighthouse pass in Session 3 |
| Limitations | Ephemeral filesystem (docs must be committed to persist); egress allowlist (npm/GitHub reachable; arbitrary hosts not); no production credentials — anything live-only (Supabase policies, Graph consent, real board writes) is verified in Sessions 2–3 or by the owner |

---

## 1. Executive assessment

This portal is in **strong pre-pilot shape** — materially better than the
"believed" brief suggests. The brief's assumptions need three corrections:

1. **Stack verified:** Next.js 16 (App Router) + React 19 + TypeScript +
   Tailwind on Vercel; Supabase (Postgres + private storage) via
   service-role from the server only; **monday.com is the operational
   source of truth** (board 7129862365, ~3,985 items) with a two-way sync;
   Microsoft Graph for email + SharePoint; a JWT session layer of its own
   (no Supabase Auth). Any audit assuming Supabase Auth/organisations/RLS
   policies is auditing the wrong architecture.
2. **"No real production data" is out of date** — the live board is the
   production work system and trial jobs have run end-to-end through the
   production deployment.
3. **A 20-item UX review already happened** (docs/UX-REVIEW.md) and nearly
   all of it shipped, including several things a fresh audit would
   otherwise raise (global search, FIR reply proximity, mobile heroes,
   skeletons, PWA).

Code health is unusually good: ~0 TODO/FIXME debt, 478 passing tests over
the pure logic, comments that explain *why*, a deliberate demo mode that
runs the whole product with zero credentials, and defensive design
throughout (watchdogs, send log, audit trail, fail-safe fallbacks).

**Preliminary UI classification: A — polish existing** (§7).
**No functional P0s were found.** The pre-pilot risk is concentrated in
(a) unverified-in-production paths (Session 2/3 close these), (b) four
product decisions only the owner can make, and (c) operational env-var
hygiene already listed in the runbook's go/no-go checklist.

## 2. Architecture

- **Surfaces:** 33 pages, 51 API route handlers. Client shell (sidebar),
  staff shell (top nav), Site Plan Studio (own theme + optional dedicated
  domain via `proxy.ts` — rewrite-only middleware, no security headers: see §18).
- **Data:** `lib/repo.ts` is a single seam over two backends — Supabase
  (production) and a JSON demo store — so every feature is testable
  offline. Tables: companies/emails/aliases, client_logins, jobs,
  job_files, submissions, messages, message_reads, login_attempts,
  portal_settings (k/v: send log, watch list, caches, stashes), audit_log.
- **Job lifecycle:** portal lodgement → (auto-)accept creates the Monday
  card (files, class, BAL, PORTAL=LODGED) → office works the board → cron
  sync mirrors status/files back (issue-hold + OneDrive settle windows,
  certificate check) → client notified → download (zip streamed through an
  ownership-checked route; 7-year correspondence record emailed once per
  job) → PORTAL=DOWNLOADED.
- **Auth:** per-company client logins (username + password, staff-issued
  setup codes, per-username throttle + liveness kill switch) as HS256 JWT
  cookies (30d/12h); staff = one shared passcode (IP + global throttles,
  fails closed on the default in production) + impersonation with writes
  disabled. Flagged, not investigated: §18.
- **Config:** everything in `lib/env.ts` with demo fallbacks; board column
  IDs and label spellings are env-overridable (a renamed Monday label is a
  Vercel setting, not a deploy). Sensible.
- **Observability:** append-only audit_log, email send log (ring buffer)
  surfaced in admin with failure banner, board-write-fail watch list,
  evening report, sync health banner. No external error tracker (§11).

## 3. Client workflow (mapped end-to-end)

Login → Dashboard → Lodge (address autocomplete · structure rows derive
class+description server-side · drawings/engineering/other buckets ·
combine-and-rename with filed-as preview · bushfire/BAL assessment when
prone + Class 10a · saved-engineering library · direct-to-storage uploads)
→ instant confirmation (job visible in My Jobs immediately; board card
created post-response) → monitor (timeline, day counter, messages with
delivery receipts) → FIR (amber banner → categorised reply → combined,
dated files → board moves off FIR) → issued (email) → download (instant
zip) → history (3 months post-download) → amend (portal jobs *and*
pre-portal jobs via board lookup).

**Better-than-email test: passes at every step except one** — retrieving a
certificate after the retention window (P1-2 below). Residual friction is
minor: no draft persistence on the lodge form (abandoning loses the form),
and the client never sees a list of what they lodged on the job page
(P3-4).

## 4. Admin workflow (mapped)

Queue (banners → Ready/FIR/Recently-downloaded snapshots → review queue;
auto-accept on by default so the queue is exception-only) → board work
stays in Monday (correct: no double-entry) → `FIR:` shortcut on the card
writes/sends/records the request (24-shortcut library, editable) → client
answer lands on the card + office email + moves status → sync delivers
issued files (holds, settle, certificate gate) → client emailed → download
receipt on card → records page (per-job correspondence record, test-send)
→ clients/logins/team management → content/forms → settings/toggles →
reports/audit/email log.

**No meaningful double-handling found.** The office's day starts and ends
on two surfaces it already uses (board + Queue page). Missed-work risk is
defended in depth (watchdog STUCK label, evening report, failure banners).

## 5. Functional issues found

After sweep + this session's live exercising (demo): **no reproducible
functional bugs currently known.** Two behaviours to *verify live* rather
than trust: BAL column stamping on a real prone lodgement (owner has not
yet confirmed on the live board), and SharePoint record filing/supersede
(dormant until `RECORD_TO_FOLDER=1` + Graph write consent — code-complete,
gracefully degrading, never exercised against the live tenant).

## 6. Prioritised findings

**P0 — none.**

**P1**
1. **Production-path verification gap.** BAL stamp, record-to-folder,
   FIR supersede, evening report cadence have not all been proven on the
   live tenant/board. *Action:* owner's live smoke (runbook Phase 7) +
   Session 3 E2E.
2. **Historical-certificate access ends at retention.** Files hide 3
   months after download and are never purged (accepted known issue) —
   but a high-volume pilot client *will* ask for an old certificate.
   *Decide before pilot messaging:* what the client is told, and whether
   staff re-issue via Records is the official path.
3. **No automated regression suite for the web layer** (478 logic tests,
   zero E2E). Session 3 defines the minimum suite; adopt before general
   release, smoke subset before pilot.

**P2**
1. Lodge-form draft loss — no persistence of a part-completed form
   (uploads survive as orphaned drafts; the form fields don't).
2. Orphaned direct-upload drafts (`uploads/<company>/<draftId>`) are never
   cleaned up — storage growth, not correctness. Pair with the known
   missing retention purge as one scheduled-cleanup task.
3. Four pending owner decisions gate small finishes: garage→shed-or-patio
   BAL rule; filename comma; record-email once-vs-every-download;
   amendment uploads joining combine-and-rename.
4. `.env` hygiene + secret expiry are checklist items, not code — runbook
   already covers; keep them in MUST.

**P3**
1. Inline tint hexes → Tailwind tokens (DESIGN.md §8 debt).
2. Centralise office phone/email string literals (~15 occurrences).
3. Client-visible "documents you lodged" list on the job page.
4. Lodgement receipt email (portal-only confirmation today; email lands
   only when the job is issued or FIR'd).
5. Add ESLint (lint is type-check only) + a skip-link; run axe in S3.
6. Demo/Supabase dual-backend drift risk — add a small contract test that
   runs the repo API against both.
7. External error monitoring (Sentry or Vercel equivalent) before general
   release.

**P4** — notification centre, bulk download, status share links,
multi-entity builders (all consciously parked in UX-REVIEW); client API;
invoicing surface; AI checker + assistant (SPECS planned).

## 7. UX/UI findings — with frontend-design + impeccable lenses

The portal has a genuine, subject-grounded identity: surveyor's seal
green + brass + paper neutrals, tracked-caps labels, mono refs, drawn
single-stroke icons, restrained Operate-mode density. It does **not** read
as templated AI SaaS. Copy is a real strength — active, specific,
recovery-oriented, consistently voiced (frontend-design's "words are
design material" bar is genuinely met).

This session also *shipped* the residual craft debt found by the
detectors before this audit (PRs #31–34): contrast floor (`ink/60` rule),
branded selection/caret, tabular numerals, section-head + empty-state
consolidation across client *and* admin, timeline label legibility.
Remaining items are recorded as DESIGN.md §19 open decisions (typeface
identity, motion quantity, tint tokens, nav regrouping) rather than
defects.

**Preliminary classification: A — polish existing.** No information-
architecture overhaul is warranted: the four primary client questions are
answered above the fold on the dashboard, and the prior review already
fixed the launch-week friction list. Session 4 should focus on the §19
open decisions, not structure.

## 8. Mobile & accessibility

Mobile: `lg` pivot (drawer nav, vertical timeline, relaxed button
tracking), slim heroes with 900px crops, PWA manifest (no SW by design).
Verified by screenshot at 390px this session for dashboard/submit/FIR.
Accessibility: themed focus-visible, sr-only stage states, reduced-motion
kill switch, contrast floor now enforced. Gaps → S3: axe pass, skip-link,
keyboard walk of lodge + FIR flows, iOS Safari file-input behaviour.

## 9. Performance

Fine at pilot scale by inspection: sync-cached board reads (no Monday
call in client request paths), parallelised page queries, capped list
renders, optimised hero images, `maxDuration` tuned on heavy routes.
Watch items for S3/live: full-board sync cadence at 3,985 items, 40 MB
zip assembly in memory, cold-start on the first morning request. No
metrics today — add timing to sync + download if pilot feels slow.

## 10. Notifications map

| Event | Client | Office |
|---|---|---|
| Lodged | portal confirmation (no email — P3-4) | Teams + queue/board card |
| FIR raised | email + portal banner | board group |
| FIR answered | receipt tick in thread | email w/ attachments + Teams + card moves |
| Issued/ready | email | evening report if uncollected |
| Downloaded | — | card receipt + Teams (off by default) + correspondence record email (once/job) |
| Amendment | — | email to certifier + note on original card |
| Enquiry | — | email + Teams + /admin/enquiries backstop |
| Failures | — | admin banners: email-fail, sync stale, STUCK watchdog, evening report |

Coverage is good; verification of each live channel = Session 3.

## 11. Technical debt register

Consolidated (each already sized above): tint-hex tokens (P3-1), contact
constants (P3-2), ESLint (P3-5), dual-backend contract tests (P3-6),
scheduled cleanup job — retention purge + orphaned drafts (P2-2), error
monitoring (P3-7), superseded collateral drafts in repo (noted in
UX-REVIEW, archive when convenient). Notably *absent*: TODO comments,
dead routes, duplicated logic — the codebase is clean.

## 12. Client efficiency vs email — see §4 table in DESIGN.md

Verdict: better on every active flow; the one regression risk is
post-retention retrieval (P1-2). Pilot messaging should set that
expectation explicitly.

## 13. Admin efficiency

The portal *removes* office work rather than relocating it: no re-keying
(card auto-created with files), FIR wording automated, chase lists
auto-generated, records filed without memory. Residual manual steps that
are *correctly* manual: accepting edge-case lodgements, issuing on the
board, exporting the CDC PDF (Word→PDF is human today; `REQUIRE_CDC_FILE`
gate exists when ready).

## 14. Automation opportunities

1. Switch on `RECORD_TO_FOLDER` (consent pending) — records + FIR
   supersede filing both activate. *(Owner checklist item.)*
2. Scheduled cleanup cron: retention purge + orphaned drafts (P2-2).
3. Client-facing gentle nudge for uncollected certificates after N days
   (office already sees it in the evening report; the client email exists
   only once — a single reminder would close most "not collected" lines).
4. FIR auto-reminder to the client after N business days with you.
5. Later: auto-convert CDC Word→PDF to retire the manual export.

## 15. Quick wins (small, safe, high value)

Lodgement receipt email (P3-4) · "documents you lodged" list (P3-3) ·
cleanup cron (P2-2) · contact constants (P3-2) · skip-link (P3-5) ·
retention wording on Downloads/job pages (supports P1-2).

## 16. Significant opportunities

AI document checker + guidance assistant (SPECS 5–6) — the two features
most likely to *reduce FIR volume*, the office's dominant friction ·
one-off public lodgement (new revenue channel, SPECS) · cadastre lot
boundaries (built, licence-blocked — a licensing conversation, not code).

## 17. Preliminary redesign classification

**A — polish existing.** Rationale in §7. Revisit only if Session 4's
decisions (typeface/motion) grow into a brand refresh by choice.

## 18. SECURITY REVIEW REQUIRED — questions for Session 2

Flags only; no investigation was performed this session.

1. **AUTH_SECRET default fallback** — `env.ts` ships a known dev secret;
   staff login fails closed on the default *passcode*, but confirm nothing
   can run production with the default *JWT secret* (forgeable sessions if
   so). Severity if misconfigured: critical; runbook checklist mitigates.
2. Staff access = one shared passcode; no per-staff identity or audit
   attribution; assess for pilot (single office) and for multi-staff future.
3. Tenant isolation: verify every job/file/message route checks
   `companyId` server-side (spot-checked good: download route 404s
   cross-company; sweep all 51 routes, esp. `messages/[id]/[index]`,
   `amendments/[id]/[file]`, `uploads/sign` draft scoping).
4. Supabase live check: RLS actually enabled + policy-free on all 13
   tables; `issued` bucket actually private; anon key unused.
5. Signed upload URLs: expiry, size/type enforcement server-side, draft
   area unreachable cross-company.
6. Storage path handling: filename sanitisation is regex-based — confirm
   no traversal/collision path in submissions/messages/records/library.
7. `proxy.ts` adds no security headers — assess CSP/HSTS/frame options
   (Vercel defaults cover some).
8. Rate limiting exists on logins + global staff; assess messages,
   enquiries, uploads, bushfire/cadastre proxies for abuse headroom.
9. PDF validation is extension/MIME, no content sniffing — accept or harden.
10. Impersonation: writes disabled — verify coverage is complete
    (submit/messages checked; sweep the rest).
11. Cron routes (`sync`, `report`, `digest`) — CRON_SECRET enforcement.
12. Graph/Monday token blast radius: scopes, storage, logging hygiene
    (tokens never in responses/logs).

## 19. Pilot priorities

**MUST BEFORE PILOT**
- Runbook go/no-go checklist complete (secrets rotated + non-default,
  private bucket, cron proven, no demo banner, full journey walked live)
- Session 2 security audit returns GO (or conditions met), esp. §18-1/3/4
- Session 3 smoke E2E passes on the live deployment
- Verify live: BAL stamp on a prone lodgement; issued→download round trip
- Pilot client onboarded: company + login + setup code; their historical
  jobs matched (aliases) and syncing
- Retention expectation set in pilot comms (P1-2 decision made)

**SHOULD BEFORE PILOT**
- Graph `Sites.ReadWrite.All` consent + `RECORD_TO_FOLDER=1` + one-click
  Records test ("Also filed…")
- Owner's four pending decisions (P2-3)
- Lodgement receipt email + retention wording (quick wins)
- Evening report + digest switches confirmed as intended states

**GENERAL RELEASE**
- Regression suite in CI (S3 spec) · error monitoring · ESLint · axe pass
  fixes · per-staff identities (pending S2 verdict) · cleanup cron live

**POST-PILOT**
- Measure: lodgements/FIR round-trips/downloads per week vs email
  baseline; nav usage (settle UX-REVIEW #6) · client nudge automations
  (§14-3/4) · "documents you lodged" + draft persistence · multi-entity
  logins on demand

**LONG TERM**
- AI checker + assistant · one-off public lodgement · cadastre licence ·
  Word→PDF automation · client API/webhooks · invoicing integration

---

*End of Session 1. Session 2 (new session, security-only, Opus permitted)
reads §18. Session 3 (new session, Fable) executes E2E per its brief and
the §19 MUST list.*
