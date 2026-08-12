# CFBA Client Portal — Pre-Pilot QA + End-to-End Test Report

**Session 3 of the pre-pilot programme — QA/E2E only.**
Date: 12 August 2026. Codebase: branch `claude/monday-portal-review-9q31ec`,
built fresh from HEAD `027247a` + the Session 2 report commit; production
build (`next build` + `next start`) driven with Playwright/Chromium.

> **How this session tested.** Workflows were **executed in a real browser**
> against the local production build running in demo mode (the file-backed
> store that ships with the app — no credentials, no live services). Nothing
> was marked PASS from reading source. **No application code was changed**;
> the only environment variation was one test run with
> `AUTO_ACCEPT_LODGEMENTS=0` to exercise the review queue, then defaults
> restored. Evidence (≈45 screenshots + per-phase JSON result files + the
> demo store) was captured in the session workspace; key screenshots are
> referenced by name below.
>
> **What demo mode cannot prove** is called out explicitly in §1.3 — those
> legs map 1:1 onto the Master Audit's P1-1 "live-path verification" item
> and the owner's runbook Phase 7 smoke.

---

## 1. E2E overview

### 1.1 Client journey — EXECUTED end-to-end

| Step | Result | Evidence |
|---|---|---|
| Sign-in (bad password) | PASS — "That username and password combination isn't right.", stays on page | A1 |
| Sign-in (good) → Dashboard | PASS — company header, ready-to-download + FIR surfaced, 6 job cards | A3-dashboard.png |
| Lodge a job (patio, drawings ×2 + engineering) | PASS — combine preview live on the form: "These will be combined and filed as **Site Plan and Elevations - 14 Verde Loop Wanneroo.pdf**" / "Filed as **Engineering - 14 Verde Loop Wanneroo.pdf**" | A6-submit-filled.png |
| Server-side combine | PASS — store shows the accepted submission carrying exactly the two combined, renamed PDFs (2 uploads merged into 1 drawings PDF) | demo store |
| Success screen | PASS — "Job Lodged", echoes "Your ref QA-PO-001", links View My Jobs / Lodge Another (one copy bug — §2, QA-9) | A6-success.png |
| New job appears in My Jobs | PASS — received-row at top | A7 |
| Job detail (issued job) | PASS — status chip, 5-step timeline, surveyor, documents list, reply box | B10-client-revised.png |
| Receive FIR (seeded T-1003) | PASS — amber "We need something from you" banner + "Reply now →" jump link + full ask in thread | A5 |
| Respond to FIR (text + engineering PDF via categorised box) | PASS — dated rename shown at upload ("Filed as **Engineering - 3 Test Street Greenwood - 12 Aug 2026.pdf**"), reply lands in thread with the renamed attachment | A5-fir-filled.png |
| Post-reply state | **FAIL (QA-1, P2)** — banner + ACTION REQUIRED persist after answering | §2 |
| Download CDC package | PASS — zip `CFBA T-1001 - 1 Test Street Greenwood.zip` with all 3 documents, correct bytes | results/T-1001.zip |
| Downloads page state transition | PASS — job moved READY→ALREADY DOWNLOADED, retention countdown "available 92 more days", Download again works (re-download exercised) | A14-downloads.png |
| Cancel a job (with reason) | PASS — confirm dialog with can't-undo warning + phone number; job flips to CANCELLED | A9 |
| Cancelled job | PASS — cancel control gone; "already cancelled" guarded | A10 |
| Amend a job (from job page, prefilled) | PASS — amendment lodged, appears in My Jobs "Amendments you've sent" with WITH YOUR SURVEYOR chip | B8, B13-client-jobs.png |
| Duplicate a job ("Lodge similar") | PASS — items prefilled, **address deliberately not carried** (correct per design) | A8 |
| General enquiry (subject + body) | PASS — sent; appears on staff /admin/enquiries | B7 |
| CSV export | PASS — BOM + properly quoted, whitelisted columns | A12 |
| Search | PASS — scoped to own jobs, no cross-company noise | A13 |
| Find job later / past jobs | PASS — PAST filter (2), ALL (10) counts correct | B13-client-jobs.png |
| Sign out | PASS — returns to sign-in | A15 |

Job types: the class builder was exercised with Steel Patio and Steel
Carport rows (plus the "We'll record this as" derived-description panel).
Shed / pool / retaining wall use the same single code path (a `type`
select feeding the same derive-and-stamp logic verified above), so they
were deliberately not repeated per the brief's efficiency instruction.

### 1.2 Admin journey — EXECUTED

| Step | Result | Evidence |
|---|---|---|
| Staff sign-in (wrong passcode) | PASS — "That passcode isn't right." | B1 |
| Staff sign-in → /admin | PASS — Submission Queue + health banners ("Evening report — switched off", "Sync is stale — last ran never") + READY—NOT COLLECTED list | B1-admin-home.png |
| Review queue (`AUTO_ACCEPT_LODGEMENTS=0` run) | PASS — two lodgements land **pending**, queue shows both with **Accept → Monday** / **Reject** | B13-queue.png |
| Accept | PASS — status → accepted | B13 |
| Reject (with reason) | PASS — status → rejected; **but see QA-4**: no client-visible trace remains | B13 |
| Inspect enquiry | PASS — client's enquiry on /admin/enquiries | B7-admin-enquiries.png |
| Amendment received | PASS — WAITING entry with client's reason, notes, file chip; **honest failure surfacing**: "Amendments have nowhere to go… Set it up in Settings →" and "The email did NOT send." | B9-admin-amendments-before.png |
| Send revised CDC to client | **NOT EXERCISABLE IN DEMO** — button explicitly "Not available in demo mode." | same |
| Impersonate a client ("view as") | PASS — amber "STAFF VIEW — you are seeing this portal exactly as <client> sees it" banner, "Stop Viewing" replaces Sign Out; opening a *different* company's job while impersonating → 404 | B11-impersonating.png |
| Email Send Log page | PASS (renders; honest empty state — nothing sends in demo) | /admin/emails |
| Activity Log page | PASS (renders with correct framing; demo drops entries — QA-13) | /admin/audit |
| Reports | Renders; **QA-11**: "Issued (30 days) = 0" despite seeded issued jobs — verify against live data | B12-reports.png |
| FIR raise | **NOT A PORTAL ACTION** — /admin/fir is the FIR *text library*; FIRs are raised on the Monday board (status + update) and mirrored by sync. Client-side round trip was fully executed against the seeded FIR. | B4 |

**Both sides stayed synchronised** wherever the portal is the actor
(lodge→queue→accept/reject, enquiry→admin, amendment→admin, cancel→both
views, impersonation). Board-mediated transitions (issue, FIR raise,
status moves) are sync-driven and not provable in demo — §1.3.

### 1.3 Not exercisable in demo — the live-smoke list

These code paths were *triggered* but their external legs cannot complete
offline. Each degraded gracefully and loudly (correct behaviour); none
could be verified end-to-end here. They are exactly the Master Audit's
P1-1 scope for the owner's live smoke (runbook Phase 7):

1. Monday card creation on accept, status moves (LODGED/ISSUED/READY/
   DOWNLOADED), moveOffFir "New Info Received", cancel status write.
2. FIR raised on the board appearing in the portal via sync.
3. Every email (client login/FIR/issued mails, office reply/enquiry/cancel
   mails, evening report, digest) + Email Send Log population.
4. Teams notifications.
5. SharePoint: correspondence record filing, FIR new-info replace +
   SS supersede folder.
6. Amendment revised-CDC return leg (demo-blocked by design).
7. Real signed-URL PUT uploads (demo negotiates its own path) — including
   the interrupted-upload recovery message.
8. BAL bushfire flag at lodgement (needs SLIP services or fixture).

---

## 2. Client workflow failures

### QA-1 (P2) — FIR banner and ACTION REQUIRED persist after the client answers

- **Scenario:** Client answers a Further Information Request with text + the
  requested engineering PDF.
- **Steps:** /jobs/T-1003 → Reply now → type answer, attach engineering →
  Send to CFBA → reload.
- **Expected:** The job acknowledges the handoff — e.g. "Thanks, we've got
  it — nothing more needed from you," banner cleared or restyled.
- **Actual:** Reply and renamed attachment appear in the thread, but the
  amber "**We need something from you** before this can continue" banner,
  the "Reply now →" link, and the ACTION REQUIRED — SEE THE REQUEST chip
  all remain. Timeline still sits at "Further information".
- **Evidence:** A5-fir-after-reply.png.
- **Severity/affected:** P2 — client, at the single most important handoff
  in the workflow. Risk: double-sends, "did you get it?" phone calls — the
  calls this portal exists to kill. In production the state clears only
  after the Monday status write **and** the next sync cycle; in demo, never.
- **Area:** `app/jobs/[ref]` page state + messages route (`moveOffFir`
  already runs — the portal *knows* the reply happened).
- **Recommended solution:** Optimistically clear `firRequest` portal-side on
  a successful FIR-category reply (sync re-asserts if the office re-raises);
  or an interim "Answer sent — we're reviewing it" state on the banner.
- **Complexity:** S.

### QA-4 (P3) — A rejected lodgement vanishes from the client portal without a trace

- **Scenario:** Staff reject a pending lodgement from the queue (reason
  collected in the reject flow).
- **Steps:** AUTO_ACCEPT off → client lodges → staff Reject with reason →
  client refreshes My Jobs.
- **Expected:** Client sees "we couldn't take this one — <reason>" somewhere.
- **Actual:** The row disappears from My Jobs; no message-thread entry; the
  store's rejected submission retains **no reason field**. The rejection
  email is the only client-facing channel — if it fails (or in demo), the
  client believes the job is still with CFBA.
- **Evidence:** B13 store diff + B13-client-jobs.png.
- **Severity/affected:** P3 — client comms; low frequency (rejects are rare)
  but high confusion when it happens.
- **Area:** admin decision route + client jobs list.
- **Recommendation:** Persist the reason and show a dismissible "returned to
  you" row or thread message.  **Decide before the first real reject.**
- **Complexity:** S–M.

### QA-9 (P4) — Success-card copy: "showing at the top of My Jobsnow"

Missing space ("My Jobs" + "now"). Evidence: A6-success.png. Area: lodge
success component. Complexity: XS.

### QA-10 (P4) — Client's PO/ref not echoed on the just-lodged row

`clientRef` appears on the success card and on board-synced jobs ("your ref
PO 7583"), but the pre-sync received-row in My Jobs doesn't show it.
Evidence: A7 (`hasPo:false`). Complexity: XS–S.

---

## 3. Admin workflow failures

No functional admin failures beyond the shared items above. Two notes:

- **QA-11 (P4, verify live):** Reports shows **Issued (30 days) = 0** and
  "median turnaround — over 0 jobs" while the demo seed contains jobs
  issued 1–34 days ago. Either the counter reads a field the sync sets that
  the seed lacks, or the counter is wrong — cheap to confirm against live
  data on day one. Cosmetic: "Reports" heading rendered twice.
  Evidence: B12-reports.png.
- The amendments screen's honest failure surfacing ("Amendments have
  nowhere to go", "The email did NOT send") is a **strength** — nothing
  fails silently on the admin side.

---

## 4. Edge cases (executed)

| Test | Result |
|---|---|
| Empty lodge / address-only / no files | PASS — Lodge button stays **disabled** until the form is complete (can't even click); guidance text explains what's needed |
| 5,000-char notes | PASS — stored truncated to exactly 4,000 |
| Special-char address `12 O'Brien & <b>Bold</b> "St", Görlitz Heights` | PASS — lodged; stored verbatim; rendered as text everywhere (no `<b>` reaches the DOM — XSS-safe); combined filename sanitised (note: tag letters leak into the site-name slug "O Brien b Bold b St" — cosmetic only) |
| **Double-click / triple-click Lodge** | PASS — **exactly 1 submission** created |
| Submit twice (same data, new form) | Allowed — two jobs (no dedupe by design; office catches duplicates on the board) |
| Refresh mid-form | Confirmed known P2 — fields lost (uploads become orphaned drafts) |
| Browser Back after success, Forward | PASS — clean renders, no resubmission dialog, no duplicate |
| Two tabs, same job: cancel in tab 1, stale tab 2 cancels again | PASS — tab 2 gets inline red "**This job is already cancelled.**" (C8-tab2.png) |
| Session expiry mid-flow (cookies cleared, then send) | PASS — "Your session has ended — sign in again and you can pick up where you left off." shown in place |
| Logout in one tab, act in another | Same 401 path as above |
| /jobs/NOPE-1 · another company's real ref · `%2e%2e%2f` traversal · unknown route | PASS — identical 404 page for all (no oracle) |
| Cancel an issued job (API) | PASS — 409 "This job has been certified, so it can't be cancelled from the portal…" |
| Cancel a cancelled job (API) | PASS — 409 "This job is already cancelled." |
| Download a job with no files (API) | PASS — 409 "This job has no files to download yet." |
| First-time setup login (`cfba.setup` + code) | Present in demo seed; setup path smoke-checked in Session 1; not re-run |

---

## 5. File handling

| Test | Result |
|---|---|
| Expected PDFs (single + multiple per bucket) | PASS — chips, live "Filed as …" combine preview, server-side merge verified byte-level in store |
| Unsupported type (.txt) | Blocked — file never becomes a chip (bucket hint states "PDF only"); server 415 also verified as backstop. **No explicit "we ignored that file" message** — folded into QA-3 |
| Oversize (2×21 MB) | PASS — refused **server-side at the signing step** (413 on /api/uploads/sign) before any bytes move; nothing created; UI shows sizes |
| Duplicate file selected twice | Bucket "Change" replaces the selection (no duplicate state) |
| **Same filename in two buckets (`plan.pdf` as drawings AND engineering)** | **FAIL — QA-2 (P2), see below** |
| 140-char filename | Accepted as a chip; lodge of the pair blocked by QA-3's companion file — long name itself handled (server truncates to 120) |
| **Filename with em-dash "—"** | **FAIL — QA-3 (P3), see below** — `( ) % ~` all fine; the non-ASCII dash is the trigger |
| Remove/replace before lodging | PASS — "Change" swaps the file |
| Repeated upload after fix | PASS |
| Interrupted upload | NOT EXERCISABLE IN DEMO (no real PUT leg) — live smoke item |
| Download issued document | PASS — zip contents byte-verified |

### QA-2 (P2) — Same filename in two buckets silently loses the engineering document

- **Scenario:** Builder uploads `plan.pdf` as Drawings and a *different*
  `plan.pdf` (e.g. re-scanned from the same phone app) as Engineering.
- **Steps:** /submit → drawings=`plan.pdf` (siteplan bytes) →
  engineering=`plan.pdf` (engineering bytes) → Lodge.
- **Expected:** Both stored (collision suffixed), combined into
  "Site Plan and Elevations - …" + "Engineering - …".
- **Actual (verified in store):** Both buckets write to the same storage
  path `submissions/<id>/plan.pdf` — the engineering upload **overwrites**
  the drawings bytes. The drawings combine then consumes the surviving blob
  (the *engineering* content) and deletes it. Final package:
  `Site Plan and Elevations - 3 Collision Ct Perth.pdf` (containing the
  **engineering** file's pages) + a raw `plan.pdf` entry whose blob **no
  longer exists**. The lodgement passes validation and reads as complete.
- **Evidence:** demo store, submission `sub_wgzcam3d` — one stored blob,
  files list `[combined-drawings, plan.pdf]`.
- **Severity/affected:** P2 — data integrity; office receives a wrong-content
  drawings PDF and a dangling file reference. Prevalence: low-moderate
  (same-named files across buckets — scanner apps make this plausible).
- **Area:** `app/api/submit` upload loop (both paths) — per-file writes
  don't dedupe names across categories; `lib/combine-uploads` then compounds
  it. (`storeLibraryDocs` already dedupes names — the same guard is needed
  for fresh uploads.)
- **Recommended solution:** Suffix on collision at write time
  (`plan-2.pdf`), exactly as the library-doc merge already does.
- **Complexity:** S.

### QA-3 (P3) — Filename with an em-dash is dropped silently; Lodge dead-ends

- **Scenario:** File named `engineering (final) — v2 ~ 100%.pdf` (Word and
  macOS auto-convert hyphens to en/em-dashes routinely).
- **Steps:** /submit → attach to Engineering bucket.
- **Expected:** Accepted (it's a PDF), or a message saying why not.
- **Actual:** No chip, no message, nothing happens; the form still counts
  engineering as missing so **Lodge stays disabled with no explanation**.
  Isolation probe: `eng (final).pdf` ✓, `eng 100%.pdf` ✓, `eng ~ tilde.pdf`
  ✓, `eng — dash.pdf` ✗ — the non-ASCII character is the trigger.
- **Evidence:** D2/r5 probes, D2-full.png.
- **Severity/affected:** P3 — blocked lodgement with a silent UI; workaround
  (rename) obvious only if the client guesses the cause.
- **Area:** client-side file-accept filter in the upload bucket component
  (server-side sanitisation already handles these names fine).
- **Recommended solution:** Accept any `*.pdf` name client-side and let the
  existing server sanitiser do its job; always render a visible reason when
  a picked file is not added.
- **Complexity:** S.

---

## 6. Mobile / responsive (390×844 iPhone, 360×800 Android, 1440×900 desktop)

- **PASS:** No horizontal overflow on jobs / job-detail / submit / messages
  at any width; drawer nav present and opens on phone; forms, buckets, FIR
  reply, filters and modals all usable at 360px; long/odd addresses wrap.
- **QA-12 (P4):** the full-bleed hero band's negative-margin math makes
  `scrollWidth` exceed the viewport by ~4–8px on the dashboard at **all**
  widths (culprit: `-mx-5` hero container, 398px in a 390px viewport) —
  risk of right-edge shimmy when swiping on real devices. Fix: clamp
  overflow-x at the shell or correct the margin math.
- **Touch targets (P4):** filter chips are 31px tall; quiet link-buttons
  ("Reply now →", "Cancel it", "View all …", footer links) are ~20px —
  below the 44px guidance. Primary actions (Lodge, Send, Download) are
  fine. Worth a pass on the chips and the FIR "Reply now" specifically.
- Screenshots: `E-iphone-*` / `E-android-*` / `E-desktop-*` (15 pages).

## 7. Accessibility

- **axe-core (7 pages: login, dashboard, jobs, FIR job, submit, messages,
  admin):** exactly **one violation type portal-wide — color-contrast
  (serious)**, 5–35 nodes/page. Concrete examples (dashboard, 390px):
  - `text-ink/55` 12px mono job refs — 3.96:1 (below the 4.5:1 AA line and
    below DESIGN.md's own /60 floor);
  - muted list/meta text `#868981`/`#888d8a` on cream/white — ~3.3:1 at 13.5px;
  - 8px micro-labels `#92948b` on cream — 2.87:1 (and 8px is itself too
    small). **QA-5 (P3):** finish the contrast sweep — the /60 floor from
    PR #31/#33 has surviving stragglers, mostly non-ink muted greys.
- **Keyboard:** full tab walk of sign-in works, **focus rings visible on
  every stop**; FIR reply reachable; Enter submits. **No skip-link**
  (confirmed; known P3-5).
- **Labels:** all text inputs/selects/textareas on /submit are labelled;
  the **three file inputs are not programmatically labelled** (visible
  bucket headings aren't associated) — screen-reader users hear
  "file upload" ×3 (**QA-7**, P3, pairs with QA-3's silent rejection).
- **Login autocomplete (QA-8, P4):** username/password inputs carry no
  `name`/`autocomplete` attributes — password managers and WCAG 1.3.5.
- Status indicators carry text (chips are words, not colour alone) — PASS.
- Reduced-motion kill switch verified present in Session 1; not re-tested.

## 8. Performance (local prod build — relative numbers, not Vercel numbers)

- **Server work is not the problem:** TTFB 10–35ms warm across dashboard /
  jobs / job detail / submit / messages; per-route JS ≤18KB; 11–13 requests
  per page; hero JPGs 199–234KB (the optimised "-m" crops working); total
  page weight 1–264KB.
- **QA-6 (P3): `load` is gated on Google Fonts.** With fonts.googleapis.com
  unreachable (this sandbox), every page's DCL/load stalls ~12.7s waiting
  on the render-blocking stylesheet, then falls back. In normal conditions
  it resolves in ms — but a client on a filtered site network inherits a
  visible stall, and font rendering depends on a third party at runtime.
  Fix: self-host via `next/font` (also removes a external request).
- **Notification poll: 2 calls in a 70s dwell** — the by-design ~1/min
  heartbeat, no runaway polling, stops on 401.
- Zip assembly (3-file package) completed in ~1s in demo; the 40MB
  in-memory ceiling stays a watch item for live (Master Audit §9).
- No duplicate requests observed; `_rsc` prefetch aborts on navigation are
  normal App Router behaviour.

## 9. Notifications map (portal surfaces executed; delivery legs = live smoke)

| Event | Portal (client) | Client email | Office |
|---|---|---|---|
| Lodged | ✅ success card + My Jobs row (executed) | — by design (P3-4 receipt email parked) | Queue/board card ✅ (queue executed); Teams ⏳ live |
| Lodgement rejected | ❌ **nothing — QA-4** | ⏳ live (only channel) | Queue state ✅ |
| FIR raised | ✅ banner + thread (seeded, executed) | ⏳ live | Board-side action |
| FIR answered | ✅ thread + attachment (executed); banner bug QA-1 | — | ⏳ email w/ attachments + Teams + card move (code path fired, logged fallback in demo) |
| Issued / ready | ✅ Downloads + dashboard (seeded, executed) | ⏳ live | Evening report if uncollected ⏳ |
| Downloaded | ✅ Downloads regrouped (executed) | — | ⏳ card receipt + record email (once-per-job retry semantics verified in demo store: marker only set on a confirmed send/file) |
| Amendment | ✅ My Jobs chip (executed) | ⏳ live | ✅ WAITING entry + honest "email did NOT send" surfacing (executed) |
| Enquiry | ✅ thread (executed) | — | ✅ /admin/enquiries (executed); email ⏳ (fallback log line verified: "saved but not emailed… waiting on /admin/enquiries") |
| Failures | — | — | ✅ health banners (evening-report off, sync stale) + Email Send Log page (renders; populates live) |

No duplicate or excessive communication observed. The one **missing**
communication is the rejection (QA-4); the one **unclear** state is the
post-FIR-answer banner (QA-1).

## 10. Error handling

Uniformly strong — every failure surfaced during testing produced a
specific, warm, actionable message (wrong password, wrong passcode, session
ended, already cancelled, can't cancel certified, no files yet, over-25MB /
over-40MB with the email-us fallback, upload didn't finish). Server errors
never leak internals. The two exceptions are the silent cases already
filed: QA-3 (dropped file) and QA-4 (silent rejection).

## 11. Recommended minimum regression suite (before wider release — not yet implemented)

Playwright against `next start` in **demo mode** — zero credentials, the
demo seed is the fixture, store assertions via the demo JSON. This
session's scripts prove the approach end-to-end (~10 specs, <5 min):

1. **Smoke** (every deploy): client + staff sign-in, dashboard renders seed
   jobs, /api/notifications 200.
2. **Auth:** bad password message; lockout after 3 fails; staff passcode
   wrong/right; disabled-login cutoff; session-expiry message.
3. **Lodgement:** full lodge → combine preview text → store contains the
   two combined names; disabled-until-complete; **double-click creates
   exactly 1**; oversize 413 at sign; txt refused; **same-name two-bucket
   collision** (regression for QA-2); **em-dash filename accepted**
   (regression for QA-3).
4. **FIR:** seeded FIR → categorised reply → thread + dated rename →
   **banner clears** (regression for QA-1 once fixed).
5. **Download:** zip contents byte-assert; Downloads regroups; record
   marker only set on confirmed keep.
6. **Cancel:** happy path; 409s (issued / already-cancelled); stale-tab
   duplicate shows inline error.
7. **Amendment:** lodge → admin WAITING with reason + file.
8. **Queue:** AUTO_ACCEPT=0 → pending → accept/reject; client-visible
   rejection trace (once QA-4 designed).
9. **Permissions:** foreign-ref 404s (jobs/messages/amendments);
   impersonation banner + write-blocks (403 on reply/lodge/cancel/team).
10. **Admin:** enquiry round trip; email-log + activity-log render.

Add axe (color-contrast gate) to CI on dashboard + submit once QA-5 lands.
The 478 existing logic tests stay as-is; this is the missing web layer.

## 12. Pilot blockers

**Hard blockers: none.** The portal did not lose data, corrupt state, or
dead-end on any mainline path; every mainline client and admin journey
completed in a real browser.

**Conditions attached to GO (the CONDITIONAL):**
1. **Owner's live-path smoke** (§1.3 list — pre-existing Master Audit P1-1,
   runbook Phase 7). Demo cannot prove the board/email/SharePoint legs, and
   several notification channels exist only there.
2. **Fix QA-1** (FIR banner after answer) — small change, sits at the exact
   moment the pilot is meant to shine — and **QA-3** (em-dash filenames) —
   silent dead-end on realistic files. Both S-complexity.
3. **Decide QA-4** (rejection comms) before the first real reject; fix
   QA-2 (filename collision) as a fast-follow or pre-pilot — S-complexity
   with a known trigger to avoid meanwhile.

Recommended same-week but non-blocking: QA-5 contrast stragglers, QA-6
self-hosted fonts, QA-7 file-input labels + skip link, copy/polish P4s
(QA-8…QA-12), and the QA-13 demo-fidelity notes for anyone rehearsing
in demo mode (no audit entries, no send log, no Delivered tick, amendment
return leg disabled).

## 13. SECURITY FOLLOW-UP REQUIRED

**None.** Nothing surfaced in testing contradicted the Session 2 security
audit. Incidental confirmations while testing: foreign-ref and traversal
URLs return the identical 404; impersonation is clearly bannered and an
impersonated session 404s on other companies' jobs; expired sessions fail
politely; oversize is refused server-side at signing. QA-2 is a
data-integrity bug within one company's own submission — no cross-tenant
dimension.

---

## QA PILOT STATUS: **CONDITIONAL GO**

**Why.** Every mainline client and admin workflow was executed in a real
browser and passed: lodge (with combine-and-rename verified to the stored
bytes), FIR receive/answer, download (zip verified), cancel, amend,
duplicate, enquiry, queue accept/reject, impersonation, exports, search.
Error handling and abuse-edges (double-click, two tabs, expiry, bad URLs,
oversize) are consistently graceful. Nothing rose to a P0/P1.

It is **conditional** rather than clean for three specific reasons:
(1) the board/email/SharePoint legs are structurally unprovable in demo —
the owner's live smoke (already the plan's P1-1) must close that gap;
(2) two P2 functional findings from this session — the FIR banner that
keeps demanding action after the client has answered (QA-1) and the
same-filename collision that silently mis-packages a lodgement (QA-2) —
should be fixed (both small) or explicitly accepted with mitigations
before real builders are invited; and (3) the silent-rejection and
em-dash findings (QA-3/QA-4) are small but sit directly on realistic
pilot paths. With the live smoke green and QA-1/QA-2/QA-3 addressed,
this becomes an unqualified GO from the QA side.

*End of Session 3 QA report. No application code was fixed or changed in
this session; all findings are documented for the owner to schedule.*
