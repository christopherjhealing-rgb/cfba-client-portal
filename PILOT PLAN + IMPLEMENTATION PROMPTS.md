# CFBA Client Portal — Final Consolidation, Pilot Plan & Implementation Prompts

**Session 5 of the pre-pilot programme — decision and planning only.**
Date: 12 August 2026. Role: lead product owner. Evidence base: the Master
Audit (S1), Security Audit (S2), QA + E2E Report (S3), Product + UX +
Design + Research Report (S4), DESIGN.md (definitive, S4), and
`docs/GO-LIVE-RUNBOOK.md`. No application changes were made this session.

**Business goal honoured throughout:** a controlled pilot with ONE trusted
high-volume client in ~1–2 weeks. Safe, reliable, clear, fast,
professional, useful, measurable — not theoretically perfect.

---

## 0. Consolidation decisions (what was challenged, merged, or removed)

- **Deduplicated:** the four reports raise ~60 distinct items; the
  authoritative backlog below carries **31**. Everything else was merged
  (e.g. S3's QA-6 fonts + S4's typography decision = one item), already
  shipped, or removed.
- **Removed as weak/bloat** (argued in S4 §9; register carried into
  DESIGN.md §1.5 so it stays settled): bulk/batch lodgement · client-side
  document versioning · favourites/saved searches · chat-style messaging ·
  configurable dashboards · client API/webhooks (pre-demand) · parallel
  admin job manager · third-party analytics SDK · session recording ·
  notification centre (parked) · status share links (parked).
- **Conflicts resolved:**
  1. *S1 said "A — polish"; S4 said "B — moderate redesign."* Resolved:
     **B**, but split — only the small P1 design subset ships pre-pilot;
     the IA changes (nav regroup, admin Today strip) are post-pilot. S1's
     "A" was a UI-only call made before the product analysis; DESIGN.md
     reflects B. No aesthetic completeness is required for the trial.
  2. *Motion:* S4 recommended first-landing-only cascade; owner sign-off
     was pending. **Product-owner call: approved** (evidence: work pages
     render blank mid-animation on every navigation) — owner may veto at
     review; it ships in Batch 4 behind a one-line revert.
  3. *Security H1 (HTTP headers):* the security audit itself rated it
     non-blocking hardening. It stays **P2** — this is not downgrading a
     blocker; it is agreeing with the audit's own severity.
  4. *Tolerant intake:* S4 ranked full image/Word→PDF conversion top-3.
     Split: the **filename acceptance + visible-rejection fix is P1**
     (small, kills a real dead-end); the **conversion pipeline is P2**
     (medium, new dependency surface — wrong risk profile for the pilot
     window).
- **Not downgraded:** every P0 below is a genuine access/reliability gate;
  none was moved to hit the date.

**Owner decision log (12 Aug 2026):**
- **P1-5 DECIDED — retention stays at 3 months.** Certificates remain
  available in the portal for 3 months from first download, exactly as
  built; CFBA always holds the archive copy on its own server, and a
  client needing an older certificate rings/emails the office. Option A
  is rejected; no portal behaviour change. Residual work is wording only:
  portal copy and onboarding material must state the window and the
  ring-us path plainly (the Downloads page already does). The
  "email-wins" row in the S4 report §2 table stands as an accepted
  business trade-off, not a gap to close.
- **Everything else approved as planned** — including the Batch 1–6
  structure, the P1-4 rejection-notice approach (final copy still shown
  for a nod in the Batch 1 report), and the P1-11 motion change.

---

## 1. Authoritative backlog

IDs are stable — implementation prompts reference them. "DB" = database/
schema change required.

### P0 — MUST FIX BEFORE ANY CLIENT ACCESS (all verification/ops; no code)

**P0-1 · Production configuration pre-flight**
- Problem: fail-closed design means misconfig breaks loudly — but it must
  be *proven* before a client can be locked out by it.
- Evidence: Security Audit §16 checklist. Affected: everyone.
- Client benefit: portal that works. CFBA benefit: no day-one fire.
- Solution: confirm `AUTH_SECRET`, `STAFF_PASSCODE` (strong, non-default),
  `SUPABASE_URL` + service key (not demo mode), private `issued` bucket +
  RLS enabled, `CRON_SECRET` matching Vercel cron, Maps key
  referrer-restricted, `APP_URL` correct.
- Dependencies: production access (owner). DB: NO. Complexity: S.
- Risk if postponed: total — a client could hit a 500 wall or an insecure
  default.

**P0-2 · Live-path smoke (runbook Phase 7)**
- Problem: the board/email/SharePoint legs are structurally unprovable in
  demo (QA §1.3): Monday card create + status moves, FIR raise→sync,
  every email + send-log population, record filing, BAL stamp,
  issued→download round trip on production.
- Evidence: QA §1.3 + §12; Master Audit P1-1; runbook Phase 7.
- Solution: owner walks the documented 45-min smoke on the live deploy;
  any failure becomes a new P0.
- Dependencies: P0-1. DB: NO. Complexity: S (execution).
- Risk: pilot invites a client onto unverified delivery pipes.

**P0-3 · Production data hygiene + pilot account prep**
- Problem: test/demo artifacts in the live store would surface to a real
  client; the pilot client needs a clean company + logins with their
  historical jobs matched.
- Evidence: Master Audit §19; S3 (test artifacts exist in *demo* store —
  verify none went live).
- Solution: sweep live tables for test companies/jobs (§9 SQL); create
  pilot company, aliases, logins + setup codes via /admin; confirm their
  board history syncs.
- Dependencies: P0-1. DB: NO (data rows only, via admin UI where
  possible). Complexity: S.
- Risk: unprofessional first impression; wrong-company matches.

### P1 — SHOULD FIX BEFORE PILOT (one to two weeks of small, coherent work)

**P1-1 · FIR answered-flip (ball-in-court integrity)**
- Problem: after a client answers a FIR, the banner still demands action
  until the next board sync (demo: forever). Trust leak at the flagship
  moment; invites double-sends and calls.
- Evidence: QA-1 (P2, screenshot-proven); S4 #2; DESIGN.md §6.
- Users: client. Client benefit: certainty the answer landed. CFBA:
  fewer "did you get it?" calls.
- Solution: clear `firRequest` portal-side on successful FIR-category
  reply; show "Answer sent — with us"; sync re-asserts if re-raised.
- Deps: none. DB: NO. Complexity: S. Risk: the pilot's key workflow ends
  on doubt.

**P1-2 · Filename-collision suffix at write time**
- Problem: same basename in two buckets overwrites; combined drawings can
  carry engineering bytes + a dangling reference. Silent mis-package.
- Evidence: QA-2 (store-verified). Users: client + office.
- Solution: suffix on collision (`plan-2.pdf`) in both submit paths —
  same guard `storeLibraryDocs` already uses.
- Deps: none. DB: NO. Complexity: S. Risk: a real mis-packaged job during
  pilot, discovered by the office late.

**P1-3 · Accept any PDF filename + never-silent rejection**
- Problem: em-dash (non-ASCII) filenames are dropped with no message;
  Lodge stays disabled unexplained. Word/macOS create such names
  routinely.
- Evidence: QA-3 (isolated to the character); DESIGN.md §18 "nothing fails
  silently".
- Solution: accept any `*.pdf` client-side (server sanitiser already
  copes); when any picked file is not added, say why inline; add the
  named-missing line next to the disabled Lodge button.
- Deps: none. DB: NO. Complexity: S. Risk: blocked lodgements the client
  can't diagnose = portal abandoned for email.

**P1-4 · Rejection comms (client-visible trace + reason)**
- Problem: a rejected lodgement vanishes from the portal; email is the
  only channel; reason isn't persisted.
- Evidence: QA-4; S4 #6. Users: client.
- Solution: persist decision reason; show a quiet "returned to you" row
  with the reason (+ existing email). Copy per DESIGN.md §6.
- Deps: owner approves copy. DB: NO (reason fits submissions row /
  settings k/v). Complexity: S. Risk: client believes a dead job is live.

**P1-5 · Certificate retention — DECIDED (owner, 12 Aug 2026): keep 3 months**
- Decision: retention stays exactly as built — 3 months from first
  download, then the office (which always holds the archive copy) sends
  it on request. Option A rejected. **No portal behaviour change.**
- Evidence: S4 #1 raised it; owner resolved it as a deliberate business
  trade-off (the office touchpoint is acceptable, the archive is theirs).
- Residual work (wording only, folded into Batch 2/onboarding): portal
  and guide copy state the window + ring-us path plainly; marketing never
  promises "anytime".
- Deps: none. DB: NO. Complexity: XS (copy). Risk: none — decided.

**P1-6 · Dashboard re-rank + row compression**
- Problem: static stat order ("0 Ready" leads while "1 Action Required"
  sits third); cancelled jobs inflate In Progress with live-looking
  timelines; per-row 5-stage timelines don't scale to a high-volume
  client's 25 active jobs (the pilot client is exactly that).
- Evidence: S3 screenshots (desktop + phone); S4 §3; DESIGN.md §4/§7.
- Solution: dynamic stat order; cancelled→Past everywhere; compressed
  rows (chip + since-line); 2×2 stat grid on phones; trim Quick Actions.
- Deps: DESIGN.md §4/§7 (spec ready). DB: NO. Complexity: S. Risk: the
  flagship surface degrades at exactly the pilot client's volume.

**P1-7 · Performance/a11y floor bundle**
- Problem: runtime Google Fonts dependency (12.7s worst-case stall);
  contrast stragglers below the house floor; unlabelled file inputs; no
  skip link; login lacks autocomplete attrs.
- Evidence: QA-5/6/7/8; DESIGN.md §14/§19.
- Solution: `next/font` self-host; sweep `ink/55` + muted greys + 8px
  labels; `aria-labelledby` on buckets; skip link; autocomplete attrs.
- Deps: none. DB: NO. Complexity: S. Risk: sunlight illegibility on site;
  a flaky network stalls every page; SR users can't upload.

**P1-8 · Copy + counter fixes**
- Problem: "My Jobsnow" (missing space); PO ref missing on received-rows;
  duplicate "Reports" heading; Reports "Issued (30 days) = 0" needs live
  verification (counter may read a field the sync sets).
- Evidence: QA-9/10/11. Solution: fix copy; echo clientRef on
  received-rows; verify counter live then fix if wrong.
- Deps: P0-2 (counter check). DB: NO. Complexity: XS–S. Risk: small trust
  papercuts in front of the one client we must impress.

**P1-9 · Send-feedback widget (pilot instrument)**
- Problem: no feedback-specific channel; the pilot's core question must be
  askable in-product.
- Evidence: this brief; §5 design below.
- Solution: §5. Deps: none. DB: NO (rides `audit_log`/settings — §9).
- Complexity: S–M. Risk: pilot learnings arrive anecdotally or not at all.

**P1-10 · Minimal pilot metrics**
- Problem: measurement plan (§4) needs events the store doesn't record
  (lodge-start, upload-fail, device class).
- Solution: extend existing audit/event logging with ~6 event types +
  a tiny /admin rollup (counts by week). No third-party SDK.
- Deps: P1-9 shares plumbing. DB: NO. Complexity: S. Risk: "did the pilot
  work?" answered by vibes.

**P1-11 · Motion: first-landing-only cascade** *(approved, owner may veto)*
- Evidence: S3 blank-rows screenshot; S4 §5; DESIGN.md §17.
- Solution: run entrance cascade once per session, instant on route
  change. Deps: none. DB: NO. Complexity: S. Risk: daily-use tool feels
  slower than it is.

### P2 — IDEAL BEFORE GENERAL RELEASE (post-pilot start, pre-announce)

| ID | Item | Evidence | Solution sketch | DB | Cx | Risk if postponed |
|---|---|---|---|---|---|---|
| P2-1 | Tolerant intake: images/Word→PDF server conversion | S4 #3 | convert at upload, archivable PDF | NO | M | intake friction stays vs email |
| P2-2 | Automated regression suite (10 Playwright specs, demo-mode fixture) | QA §11 | as specified | NO | M | regressions ship blind |
| P2-3 | HTTP security headers (CSP, XFO, nosniff, referrer) | Sec H1 | `headers()` in next.config | NO | S | hardening gap |
| P2-4 | Admin Today strip: at-risk vs 3–4-day promise + FIR-quiet + uncollected | S4 #8 | Zendesk-pattern views on existing data | NO | M | triage stays manual |
| P2-5 | One-click FIR nudge (then scheduled) | S4 #9 | FIR-Library-voiced email from quiet view | NO | S–M | staff keep chasing by hand |
| P2-6 | Job templates (named, class rows + default engineering) | S4 #7 | promote Lodge Similar + library | NO | M | repeat clients type more than needed |
| P2-7 | Nav regroup 12→8 (Guides & tools) | S4 #12, DESIGN §3 | with pilot usage data | NO | S–M | scanning cost persists |
| P2-8 | Lodge draft autosave (localStorage) | S1 P2-1 | field-level persist | NO | S | phone call costs the form |
| P2-9 | Orphaned-draft cleanup + retention-purge cron (one task) | S1 P2-2 | scheduled cleanup | NO | S–M | storage growth only |
| P2-10 | Hero overflow math + sub-44px touch targets | QA-12 | clamp + size pass | NO | S | mobile papercuts |
| P2-11 | Smart drop-zone with auto-categorise | S4 #13 | heuristics + confirmable chips | NO | M | buckets remain 3 drags |

### P3 — POST-PILOT

| ID | Item | Notes | DB | Cx |
|---|---|---|---|---|
| P3-1 | FIR-cause tally in Reports | feeds checklist copy | NO | S |
| P3-2 | Notification preferences per login | defer until email volume justifies | NO | S |
| P3-3 | Address autocomplete on lodge | SPECS queue | NO | M |
| P3-4 | Error monitoring (Sentry or Vercel) | before general release ideally | NO | S |
| P3-5 | Demo/Supabase repo contract test | S1 P3-6 | NO | S |
| P3-6 | Tint hexes → tokens + ESLint | debt register | NO | S |
| P3-7 | Lodgement receipt email (client copy) | S1 P3-4; owner call | NO | S |
| P3-8 | System events in job thread (lodged/issued/downloaded) | DESIGN §8 target | NO | S–M |
| P3-9 | Per-staff admin identities | S2 noted; when team grows | MAYBE | M |
| P3-10 | Feedback table graduation (if volume outgrows k/v) | §9 SQL ready | YES | S |

### P4 — LONG TERM
AI plan checker · lodgement assistant · one-off public lodgement +
payment surface · plan-tool v2 (cadastre licence) · client API/webhooks ·
invoicing integration · multi-entity logins — all per SPECS.md, re-ranked
after pilot data.

---

## 2. Final design decision

**B — MODERATE REDESIGN, confirmed.** DESIGN.md (rewritten S4) reflects
exactly this: targeted IA/hierarchy changes on the existing visual
system; no visual overhaul; anti-bloat register binding.

- **BEFORE PILOT (design work):** P1-6 dashboard re-rank + compression ·
  P1-7 floor bundle · P1-11 motion · P1-8 copy. That is *all* — nothing
  else aesthetic gates the trial.
- **POST-PILOT (design work):** P2-4 admin strip · P2-6 templates UI ·
  P2-7 nav regroup (with usage data) · P2-10 mobile papercuts · P2-11
  drop-zone · P3-6 tokens.

---

## 3. Pilot plan

**Shape:** one trusted high-volume client (a Perth patio builder with
regular lodgements), 4 weeks, portal offered as the *preferred* channel
with email explicitly still open (we want a fair comparison, not a
captive). Success = they choose the portal unprompted for job #2+.

### Pre-pilot (week 0)

1. **Client account prep (P0-3):** company + aliases created; 2–3 named
   logins with setup codes; historical jobs matched and syncing; test
   login `cfba.test` retained *internally only*.
2. **Data cleanup:** live-store sweep for test artifacts (§9.1); demo data
   confirmed absent from production.
3. **Readiness checks:** P0-1 config pre-flight → P0-2 live smoke →
   runbook go/no-go checklist all green → Batches 1–3 (at minimum 1–2)
   deployed and re-smoked.
4. **Security requirements:** P0-1 is the security gate (S2 audit: GO once
   confirmed). No new requirements invented.
5. **Backup/recovery:** confirm Supabase daily backups/PITR on the plan in
   use; note the architecture's built-in floor — **Monday remains the
   system of record and SharePoint holds issued documents**, so worst-case
   portal-store loss loses portal history, not jobs or certificates.
   Document the re-sync path (sync rebuilds jobs from the board).
6. **Support process:** office phone (1300 029 074) as first line —
   answered by people who can see /admin; feedback widget for non-urgent;
   during weeks 1–2 the owner checks /admin banners + email log
   **daily**; a "pilot log" note (issues, calls, praise) kept by whoever
   answers.
7. **Onboarding:** invitation email (§7.3) → accounts issued → welcome
   email on first login path (§7.4) → offer one 15-minute phone
   walkthrough for their office admin (optional, not required — the
   portal must survive without training).
8. **Measurement setup:** P1-9 widget + P1-10 events deployed; baseline
   recorded first: their last month of *emailed* jobs (count, typical
   back-and-forth per job) so the comparison is honest.

### Pilot measurement (practical set — nothing more)

| Metric | Source |
|---|---|
| Jobs lodged (portal vs email, weekly) | audit events + office tally |
| Submission completion rate | lodge-start vs lodge-success events |
| Approx. submission time | start→success delta (event timestamps) |
| Abandoned submissions | starts without success ≤24h |
| Upload failures | 413/415/refused-file events |
| System errors | 5xx in Vercel logs + admin banners |
| FIRs raised / FIR response time | board + firSince→reply delta |
| Downloads (+ time issued→collected) | existing audit + PORTAL column |
| Logins, active users | lastLoginAt + login events |
| Mobile vs desktop | UA class on login event |
| Support requests | pilot log (manual) |
| Feature usage (search, similar, amend, export) | event counts |
| **The question** (§5) | feedback widget + week-4 email |

Explicitly not measured: heatmaps, scroll depth, session recordings,
third-party funnels — excessive for one client and contrary to the
product's privacy posture.

### Weekly rhythm
Week 1: daily owner check-in on admin; fix-fast anything small. Week 2:
first feedback prompt (in-portal). Week 3: nothing new — let habits form.
Week 4: feedback email (§7.5) + numbers vs baseline → GA decision +
P2 re-prioritisation.

---

## 4. Feedback mechanism (design — build as P1-9)

**Current state:** messages/enquiries exist but are job-communication
channels; there is no feedback instrument. Verdict: build the lightweight
widget.

**Design (keep-simple):**
- A quiet **"Send feedback"** entry: footer of the sidebar (desktop) and
  drawer (mobile) — always present, never a popup.
- Panel: one category select (`Something's confusing · Something's slow ·
  Something's broken · Idea · Praise`), one textarea, optional "okay to
  ring me about this" tick. Two fields visible. Send.
- **Auto-captured** (shown to the user as a quiet line, nothing hidden):
  login + company, current page, job ref when on a job page, timestamp,
  browser/device class. No screenshots, no session data.
- Storage: `audit_log` action `feedback` (zero schema — §9); surfaced at
  `/admin/feedback` newest-first with page/job context. Graduate to its
  own table only if volume demands (P3-10).
- **After a successful download or lodgement** (max once per fortnight per
  login): one inline line — *"Would you rather lodge your next job here or
  by email? [Portal] [Email] [Depends — tell us]"* — the pilot question,
  asked at the moment of truth, one tap, dismissible forever.

**The question set (week-4 email + walkthrough call):**
1. **"Would you prefer to lodge your next job through the portal or by
   email — and what's the honest reason?"** (the core)
2. What was confusing, if anything?
3. What took longer than it should?
4. What was *easier* than email?
5. Was there anything you expected to find and couldn't?
6. What one change would make the portal your default?

Six questions, no scales, no matrices.

---

## 5. Pilot readiness score

| Area | Score | Basis (one line) |
|---|---|---|
| Security | **92** | S2: no P0/P1/P2 findings; fail-closed design; −8 until P0-1 config confirmed live |
| Reliability | **84** | graceful failure everywhere (S3); −16 for unproven live legs (P0-2) and no error monitoring |
| Client UX | **88** | full E2E passed; four questions answered; −12 for QA-1 flip + dashboard rank pending |
| Admin UX | **84** | queue/health/logs strong, honest failures; −16 no ageing views (board compensates) |
| Mobile | **82** | all flows work at 360/390; −18 density, touch targets, hero shimmy |
| Performance | **88** | 10–35ms TTFB, lean pages; −12 font dependency until P1-7 |
| Accessibility | **78** | keyboard + focus + labels largely solid; one violation type (contrast) + file inputs + skip link pending |
| Functionality | **90** | every mainline workflow executed and passed; −10 for the four P1 functional fixes |
| Visual quality | **90** | coherent post-impeccable system, no template look; small stragglers |
| Communication/notifications | **75** | map complete and honest; −25 delivery legs unverified live + rejection gap |
| Onboarding | **80** | guide + setup-code flow exist; materials drafted (§7); −20 until sent/tested with a real client |
| Maintainability | **86** | 478 logic tests, typed, documented, zero TODO debt; −14 no web regression suite (P2-2) |

**OVERALL PILOT READINESS: 84 / 100**

### Verdict: **CONDITIONAL GO**

Exact conditions (all P0 + two P1s):
1. **P0-1** production config pre-flight confirmed.
2. **P0-2** live-path smoke green (any failure = new P0).
3. **P0-3** pilot account prepped, production store clean.
4. **P1-1** FIR answered-flip and **P1-2** collision suffix deployed
   (the two findings that touch trust and data integrity on mainline
   pilot paths).
5. ~~P1-5 decision made~~ — **✔ satisfied 12 Aug 2026**: retention stays
   at 3 months (owner decision, §0 log); pilot comms written to match.

Everything else in P1 is strongly recommended inside the window but does
not block first access.

---

## 6. Client onboarding material

### 6.1 Quick Start guide (one page; copy ready)

**CFBA Client Portal — Quick Start**

- **Signing in.** Go to [portal address]. First time: choose **First
  Time**, enter your username and the setup code from your email, pick
  your own password. Tick "remember me" on your own device — you'll stay
  signed in for 30 days.
- **Your dashboard.** One screen: anything that **needs you** is at the
  top in amber; then jobs in progress; then certificates ready to
  collect. If it's not asking, we're on it.
- **Lodging a job.** **Lodge a Job** → site address → what's being built
  (pick from the list, we write the description) → attach your drawings
  and engineering → Lodge. We combine and name your files properly, and
  the job lands straight on our board — you'll see it in My Jobs
  immediately.
- **Uploading documents.** PDFs, drag-and-drop, up to 40 MB a job. The
  form shows exactly what's still needed before the button unlocks.
- **Tracking progress.** Every job shows where it's up to in five steps —
  no need to ring or email to ask.
- **If we need something (an information request).** The job turns amber
  and tells you exactly what we need. Reply on the job — attach the
  documents there, not by email — and it goes straight to your surveyor,
  with the board updated the moment you send.
- **Collecting your certificate.** When it's issued we email you; the
  whole package is one click in **Downloads**, and stays there for three
  months after you first download it. Need one later than that? Ring us —
  we keep every certificate on file.
- **Finding an old job.** Search by your PO number, our reference, or the
  address — top of the sidebar. Past jobs live under **My Jobs → Past**.
- **Help.** Anything at all: **1300 029 074**, or Send Feedback in the
  sidebar. A person answers.

### 6.2 Full client guide — structure (future PDF)

1. Welcome + what the portal is (and isn't) · 2. Signing in, passwords,
your team's logins (adding/disabling) · 3. The dashboard, read in ten
seconds · 4. Lodging: address, structures, documents, what "complete"
means and why it speeds you up · 5. Repeat work: Lodge Similar (+
templates when shipped) · 6. Following progress: the five stages, what
each means, our 3–4 day guidance · 7. Information requests: what they
are, answering well, what happens next · 8. Certificates: collecting,
re-downloading, retention promise · 9. Amendments: when and how ·
10. Messages + enquiries · 11. Your details + saved documents ·
12. Troubleshooting + FAQ · 13. Contact + support hours.

### 6.3 Pilot invitation email (finished copy)

> **Subject: An easier way to lodge with CFBA — we'd like your help
> trying it**
>
> Hi [Name],
>
> You lodge more jobs with us than almost anyone, which is exactly why
> we're asking you first.
>
> We've built a client portal, and before we offer it widely we want it
> tested by the people it has to be good enough for. For the next month,
> we'd like [Company] to try lodging through it — and to tell us bluntly
> where it beats email and where it doesn't.
>
> What it already does:
> - **Lodge in about a minute** — address, what's being built, attach
>   drawings and engineering. It lands straight on our board, no
>   re-typing at our end, and you see it in your job list immediately.
> - **See every job at a glance** — what's with us, what needs you, and
>   what's ready, without a single "just checking in" email.
> - **Answer requests on the job** — if we need engineering, the job
>   tells you exactly what and you attach it right there.
> - **Certificates in one click** — the full package, named properly,
>   the moment it's issued (and in Downloads for three months after —
>   we keep a copy on file beyond that).
>
> Email isn't going anywhere — if the portal isn't genuinely easier,
> we want to know that too. That's the point of the pilot.
>
> If you're in, we'll set up logins for you[, and anyone else at
> [Company] who lodges,] this week — and I'll walk whoever you like
> through it in 15 minutes on the phone, though honestly it shouldn't
> need it.
>
> Chris Healing
> CF Building Approvals · 1300 029 074

### 6.4 Welcome / first-login email (finished copy)

> **Subject: Your CFBA portal login — two minutes to set up**
>
> Hi [Name],
>
> Your portal login is ready.
>
> 1. Go to **[portal address]**
> 2. Choose **First Time**
> 3. Username: **[username]** · Setup code: **[code]** (valid 7 days)
> 4. Pick your own password — and tick *remember me* on your own device.
>
> You'll land on your dashboard: anything that needs you is at the top,
> your jobs in progress under that, and certificates in **Downloads**.
> Your recent jobs with us are already in there.
>
> Attached is a one-page quick start. If anything's unclear, that's
> useful information for us — ring **1300 029 074** or use **Send
> Feedback** in the sidebar.
>
> Chris Healing
> CF Building Approvals

### 6.5 Pilot feedback email (finished copy — send week 4)

> **Subject: The honest verdict — portal or email?**
>
> Hi [Name],
>
> A month in, [N] jobs lodged — thank you. Now the only question that
> matters:
>
> **Would you rather lodge your next job through the portal, or by
> email — and what's the honest reason?**
>
> And if you've got two more minutes:
> - What was confusing, if anything?
> - What took longer than it should have?
> - What was actually *easier* than email?
> - Anything you expected to find and couldn't?
> - What one change would make the portal your default?
>
> Reply to this email or ring me — blunt is better. What you tell us
> decides what we build next.
>
> Chris Healing
> CF Building Approvals · 1300 029 074

---

## 7. Adoption marketing (post-pilot, email-led; sells only what's shipped)

**Core value proposition:**
*Every job with CFBA in one place — see what needs you, watch progress
without asking, and collect your certificate the moment it's ready.*

**Strongest headline:**
**"Know where every job is — without sending a single 'just checking in'
email."**

**Alternates:**
- "Your certificates, one click away. Every job, one glance."
- "Lodge in a minute. Watch it move. Collect it the moment it's done."
- "The fastest way to get a patio certified in Perth just got clearer."
- "Stop chasing. Start seeing."

**Key benefits (feature-truthful):** every job in one place · amber tells
you the moment something needs you · live five-stage progress · answer
information requests right on the job (files filed properly,
automatically) · certificates one click the moment they're issued · find
any past job by your PO, our ref, or the address · lodge repeat work with
Lodge Similar · your whole team, their own logins.

**Launch email (to existing clients):**

> **Subject: Every CFBA job, one glance — your portal login is ready**
>
> Hi [Name],
>
> You can now see every job you have with us — live — in the CFBA client
> portal. [Pilot Company] has spent the last month lodging through it;
> jobs land on our board instantly, requests get answered on the job, and
> certificates are one click.
>
> What changes for you:
> - **No more wondering.** Every job shows exactly where it's up to.
> - **No more chasing attachments.** If we need something, the job tells
>   you and you attach it there.
> - **No more digging through email** for a certificate — it's one click
>   in Downloads the moment it's issued.
>
> Email still works. But the portal is faster for you and faster for us —
> and faster is the whole point.
>
> Your login is attached — two minutes to set up.
>
> Chris Healing · CF Building Approvals · 1300 029 074

**Follow-up (2 weeks later, non-activated only):**

> **Subject: Your next job, without the follow-up emails**
>
> Hi [Name] — quick one. Next time you'd email us a job, try the portal
> instead: address, what's being built, attach the drawings, done. Same
> minute it takes to write the email — except you'll watch it move
> through assessment and collect the certificate yourself, without a
> single follow-up. Login attached; ring 1300 029 074 and we'll walk you
> through it in five minutes if you'd like.

**FAQ / objections:**
- *"Email's easier."* — It's the same minute to lodge. The difference is
  everything after: no follow-up emails, no digging for certificates, no
  wondering.
- *"Another password."* — Tick remember-me: 30 days on your own device.
  Your office can share visibility with individual logins, so nothing
  lives in one person's inbox.
- *"What if I get stuck?"* — Ring 1300 029 074. A person answers, and can
  see exactly what you see.
- *"Where do my files go?"* — Straight onto your job on our system, named
  properly — better filed than an inbox.
- *"Can I still email?"* — Yes. We think you'll stop wanting to.

**One-page feature overview (structure):** headline + 3-benefit strip →
dashboard screenshot annotated (needs-you / in-progress / ready) → lodge
flow in 3 steps → FIR answer panel → Downloads panel → "your team"
logins note → CTA strip.

**CTA:** **"Set up your login — two minutes."** (secondary: "Ring
1300 029 074 and we'll do it with you.")

---

## 8. Implementation plan — six batches

> Common to every batch: read `DESIGN.md` first for any UI work; no
> unrelated refactoring; preserve unrelated functionality; `tsc --noEmit`,
> `node --test` (478), `next build` all green; browser-verify affected
> workflows in demo mode; **no Supabase schema/RLS changes ever applied by
> the agent** (§9); report changed files, tests run, remaining issues.

> **BATCH 1: DONE — 12 Aug 2026** (browser-verified in demo, 486 tests
> green, build green). P1-1 flip (job page + dashboard "Answer sent — with
> us", text-only and file replies both flip, new ask re-arms), P1-2 suffix
> (two same-named files → distinct blobs, combine bytes correct), P1-3
> delivered as visible-refusal + named-missing lines — **and the em-dash
> "bug" is corrected on the record: F3 instrumentation showed Playwright
> itself never delivered the file (`input.files.length = 0`); the app's
> filters pass such names fine. QA-3's silent-drop finding was a harness
> artifact.** P1-4 returned-row with reason + "Lodge It Again" verified.
>
> **Owner additions delivered in the same batch (12 Aug requests):**
> cancel becomes **request + office confirmation** (no status write; card
> note + office email + "Cancellation requested" state; duplicate ask →
> 409); login-email copy fixes ("no phone call, no chasing" removed;
> client name out of the footer; guide attachment confirmed already
> wired); admin "Email It To" prefilled from the company's email; **My
> Documents** page + nav entry (library moved out of My Details, pointer
> left behind); "From Your Documents" and the save-engineering prompt
> restyled to be unmissable in the Engineering bucket; lodging
> progress panel ("Lodging your job… leave this page open"); **BAL
> compulsory upload** when the verdict demands it (shed near = its own new
> report; post-2016 patio/carport = evidence; exempt/far/unsure = never
> forced) with verdict tones pinned by unit test; **strata self-declared**
> checkbox making the Strata Plan a required upload (Landgate
> auto-detection recorded as post-pilot P2 — public SLIP layers don't
> reliably expose strata tenure and cadastre remains licence-gated).

**BATCH 1 — Pilot gate: functional + data-integrity blockers**
- Goal: the two GO conditions that are code, plus the silent dead-ends.
- Items: P1-1, P1-2, P1-3, P1-4.
- Deps: P1-4 copy nod from owner (proposed text included in prompt).
- Areas: `app/api/messages/route.ts` (+`moveOffFir` call-site state),
  `app/jobs/[ref]` page state, `app/api/submit/route.ts` (both paths),
  upload bucket component, `app/api/admin/decision`, jobs list.
- DB: none. Browser tests: FIR reply→banner flips; same-name two-bucket
  lodge → suffixed files in store; em-dash file accepted; reject →
  client-visible trace. Automated: extend logic tests for suffix + flip
  helpers. DoD: all four QA findings closed with screenshot evidence.

> **BATCH 2: DONE — 12 Aug 2026** (browser-verified at desktop + 390px
> with a 17-active-job store; 486 tests green; build green). Dynamic stat
> order (Action Required leads when non-zero, amber; sections reordered so
> the needs-you strip renders first); cancelled jobs are a Past state
> everywhere (new `cancelled` bucket in core.mjs — out of In Progress
> counts/sections, into Past with a CANCELLED chip on dashboard + My Jobs
> filter counts); per-row timelines removed from dashboard rows (full
> timeline stays on job detail — 17 jobs now scan in one column); 2×2
> stat grid on phones; Quick Actions trimmed to the two action-shaped
> tiles; "My Jobs now" spacing fixed; client's own ref echoed on
> received-rows; Reports duplicate heading removed and the Issued 30/90-day
> counters fixed (they required receivedAt for a plain issued count —
> now 5/6 against the seed, matching hand-count); Downloads wording adds
> the ring-us path. **Retention behaviour untouched** (T-1005 countdown
> verified unchanged).

**BATCH 2 — Dashboard hierarchy + copy (retention wording confirmed)**
- Goal: the flagship surface at pilot volume; retention stays as built
  (P1-5 decided — wording pass only).
- Items: P1-6, P1-8 copy fixes, P1-5 residual wording check.
- Deps: DESIGN.md §4/§7/§10 (updated for the retention decision).
- Areas: dashboard page + stat components, jobs rows, success card copy,
  reports heading; Downloads/job-page retention lines (verify, adjust
  only if unclear).
- DB: none. Browser: stat order with attention non-zero; cancelled absent
  from In Progress; 25-row legibility (seed extra rows in demo store);
  390px 2×2 stats; retention wording present and plain ("3 months from
  first download · we keep a copy — ring us after that"). DoD: DESIGN.md
  §4/§7 spec matched, evidenced; **retention behaviour untouched**.

> **BATCH 3: DONE — 12 Aug 2026** (browser-verified; 486 tests green;
> build green). Fonts self-hosted via @fontsource (zero requests to
> fonts.googleapis.com, Archivo confirmed loading — the 12.7s worst-case
> external stall is gone); contrast swept to the DESIGN.md floor across
> 48 files including the dark sidebar rail — **axe color-contrast now
> reports 0 serious nodes on dashboard AND submit at desktop AND 390px**;
> 8px micro-labels raised to the 10px floor; file inputs carry aria
> labels; skip-link is the first tab stop on both shells; login inputs
> carry name + autocomplete (username / current-password / one-time-code /
> new-password); entrance cascade now runs on the FIRST landing of a
> session only (route changes render instantly — animationName none
> confirmed; one-script revert); the hero full-bleed overflow is clipped
> (scrollWidth = viewport at 390px); filter chips and quiet link-buttons
> hit ≥40px touch height on phones (chips measured 40px, Reply-now 40px).

**BATCH 3 — Performance, accessibility, motion floor**
- Goal: P1-7 + P1-11 (+P2-10 pulled in — same files).
- Areas: `globals.css`/layout (next/font), tokens/classes for contrast
  stragglers, `FileBucket` labels, `AppShell` skip link + hero margin,
  login inputs, cascade animation gating.
- DB: none. Browser: axe color-contrast = 0 serious on dashboard +
  submit; keyboard walk; fonts load with no external request; route
  change renders instantly (cascade only on first landing). DoD: QA-5/6/7/
  8/12 closed; axe clean on the two gate pages.

> **BATCH 4: DONE — 12 Aug 2026** (browser-verified; 486 tests green;
> build green). The measurement instrument is in: **Send feedback** sits
> in both shells' chrome (client sidebar footer + staff footer) — five
> plain categories, everything auto-captured (page, job ref, device
> class) is *shown* before Send, optional "okay to ring me"; the panel
> portals to `<body>` so the sidebar's drawer transform can't pin it
> inside the rail (found and fixed in verification — panel now measures
> against the viewport at desktop and 390px). **The pilot question**
> ("Would you rather lodge your next job here, or by email?") renders
> one-tap on the lodgement success card and Downloads, at most once a
> fortnight, dismissible forever — verified: answered "Portal", thanked,
> did not reappear on /downloads. **Events**: lodge.start beacon (first
> address keystroke), lodge.success, upload.reject (with reason),
> auth.login (device class), certificate.download — all ride the existing
> audit log, zero schema drift; the demo store now persists audit entries
> (capped 500) so metrics are demo-verifiable. **/admin/feedback** shows
> the weekly rollup (started / completed / refused / downloaded /
> sign-ins / feedback) + newest-first feedback with category chips and
> context lines — verified row matched the store's tallies exactly.
> Impersonation guard verified: a staff member sending feedback while
> viewing a client is recorded as **staff**, never as the client's voice.

**BATCH 4 — Feedback + pilot metrics**
- Goal: P1-9, P1-10 — the measurement instrument.
- Areas: new `FeedbackWidget` (both shells' chrome), `/api/feedback`
  (client-session-gated, rides audit/settings store), `/admin/feedback`,
  event helpers on lodge/download/login/upload-fail, `/admin` rollup card.
- DB: none (audit_log reuse; P3-10 SQL prepared but NOT applied).
- Browser: submit feedback from a job page → appears in /admin/feedback
  with page+job context; post-download one-tap question renders once.
  DoD: events visible in rollup; widget on every page; zero schema drift.

**BATCH 5 — Live verification support + P0 execution aids** *(small)*
- Goal: make P0-1/2/3 mechanical for the owner.
- Items: pre-flight checklist surfaced on /admin (read-only env presence
  checks — never values), Phase-7 smoke checklist doc updated with the
  new P1 behaviours, production test-data sweep queries documented (§9.1).
- DB: none applied. DoD: owner can run P0 end-to-end from one page + one
  doc.

**BATCH 6 — Automated regression + final QA sweep**
- Goal: P2-2 pulled to the pilot boundary — the 10-spec Playwright suite
  from QA §11 (smoke, auth, lodgement incl. collision + em-dash
  regressions, FIR flip, download, cancel, amendment, queue, permissions,
  admin) + one full manual browser pass of every changed workflow.
- Deps: Batches 1–4 merged. DB: none. DoD: suite green in <5 min against
  `next start` demo; wired as `npm run test:e2e`; final report of any
  residual issues.

**Recommended order: 1 → 2 → 3 → 4 → 5 → 6.** Batches 1–2 are the GO
conditions; 3–4 complete the pilot posture; 5 unblocks the owner's P0
work in parallel; 6 locks it. P2 items not pulled forward start
post-pilot per §1.

---

## 9. Manual production / Supabase changes (owner-applied only — NOTHING here is applied by agents)

**Headline: no schema or RLS changes are required for the pilot.** The
service-role-only posture (S2) stays exactly as is.

**9.1 Production data hygiene (P0-3)** — *data rows, not schema.*
- Purpose: no test artifacts visible to the pilot client.
- Change: verify-then-delete any test companies/jobs/logins in the LIVE
  database. Verification first:
  `select id,name from companies order by created_at;`
  `select username,company_id from client_logins;`
  Then, for a confirmed test company only, prefer the admin UI's company
  delete (it cascades correctly); raw SQL only as fallback.
- Tables: companies, client_logins, jobs, job_files, submissions,
  messages, message_reads, company_emails/aliases.
- Order: after P0-1, before invitations. Testing: client login as pilot
  sees only their jobs. Rollback: none needed if verify-first is honoured
  (deletes are of confirmed test rows only).

**9.2 Config pre-flight (P0-1)** — *Vercel env, not database.*
- `AUTH_SECRET`, `STAFF_PASSCODE`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`,
  `CRON_SECRET`, `APP_URL`, Maps key referrer restriction; bucket
  `issued` private + RLS enabled (confirm in dashboard, change nothing).
- Effect: fail-closed guards satisfied. Testing: staff + client login on
  prod; a cron fire. Rollback: n/a (verification).

**9.3 Graph write consent (optional, for RECORD_TO_FOLDER)** — grant
`Sites.ReadWrite.All` + set `RECORD_TO_FOLDER=1` only when the owner
wants SharePoint filing on during pilot; the Records test button verifies.
Rollback: unset the env var.

**9.4 P3-10 feedback table (FUTURE, only if k/v outgrown)** — prepared,
not for pilot:
```sql
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  username text not null,
  company_id text not null,
  page text, job_ref text, category text,
  body text not null, contact_ok boolean default false,
  ua text
);
alter table feedback enable row level security; -- zero policies: service-role-only, same posture as every other table
```
- Order: post-pilot, with a migration file committed first. Testing:
  widget writes + /admin/feedback reads. Rollback: `drop table feedback;`
  (after exporting rows).

---

## 10. Claude Code implementation prompts (DO NOT EXECUTE IN THIS SESSION)

Each prompt is standalone. All use Fable; none may use Opus.

---

### PROMPT — BATCH 1: Pilot-gate functional fixes

```
BATCH 1 — PILOT GATE: FUNCTIONAL + DATA-INTEGRITY FIXES
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: DESIGN.md (whole file — §6, §7, §11, §18 govern this work),
then the backlog items in "PILOT PLAN + IMPLEMENTATION PROMPTS.md" §1:
P1-1, P1-2, P1-3, P1-4. Evidence lives in PRE-PILOT QA + E2E REPORT.md
(QA-1..4). Do not re-audit the repository.

Implement exactly these four items:
1. P1-1 FIR answered-flip: on a successful FIR-category client reply,
   clear the job's firRequest portal-side and render "Answer sent — with
   us" (ball-in-court flip per DESIGN.md §6); the board sync may re-assert.
2. P1-2 filename-collision suffix: in BOTH submit paths (multipart and
   direct), a file whose name already exists in the submission gets a
   -2/-3 suffix before write — mirror the storeLibraryDocs guard. Same for
   message/FIR uploads if the same collision exists there.
3. P1-3 tolerant filenames + never-silent rejection: accept any *.pdf
   filename client-side (non-ASCII included); whenever a picked file is
   not added to a bucket, show the reason inline; add the named-missing
   line next to a disabled Lodge button (DESIGN.md §11).
4. P1-4 rejection comms: persist the reject reason; client sees a quiet
   "returned to you" row/notice with that reason (copy per DESIGN.md §6
   and §22 voice; propose copy in your report for owner sign-off).

Constraints: use the frontend-design skill for any UI; no unrelated
refactoring; preserve unrelated functionality; NO Supabase schema/RLS
changes (these items need none — flag loudly if you disagree and stop).

Verification (all required):
- npm test (478 logic tests) + tsc --noEmit + next build green; add/extend
  logic tests for the suffix helper and the flip.
- Browser (Playwright, demo mode, next start): (a) T-1003 FIR reply →
  banner flips without sync; (b) lodge plan.pdf in both buckets → two
  distinct stored files, correct combined bytes; (c) attach "eng — dash.pdf"
  → accepted; (d) reject a queued lodgement (AUTO_ACCEPT_LODGEMENTS=0) →
  client sees the returned notice with reason. Screenshot each.

Report: changed files, tests performed (with results), proposed P1-4 copy,
any remaining issues. Commit to the designated branch and push.
STOP after completing this batch.
```

---

### PROMPT — BATCH 2: Dashboard hierarchy + copy

```
BATCH 2 — DASHBOARD HIERARCHY + COPY
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: DESIGN.md §2, §4, §7, §10, §12 (the specs this batch
implements), then backlog items P1-6, P1-8 (and the decided P1-5) in
"PILOT PLAN + IMPLEMENTATION PROMPTS.md" §1.

OWNER DECISION (12 Aug 2026), binding: certificate retention stays at
3 months from first download. Do NOT change retention behaviour, the
grouping logic, or file visibility windows in any way. The only P1-5 work
is wording: confirm the Downloads/job-page retention lines state the
window and the ring-us path plainly ("we keep a copy on file — ring
1300 029 074 and we'll send it over"), adjusting copy only if unclear.

Implement:
1. P1-6 per DESIGN.md §4 + §7 exactly: dynamic stat order (attention
   first, zeros never lead), cancelled jobs out of In Progress counts and
   sections (they are Past), compressed job rows (ball-in-court chip +
   since-line; NO per-row 5-stage timeline — full timeline stays on job
   detail), 2×2 stat grid on phones, Quick Actions trimmed per §4.5.
2. P1-8: fix "My Jobsnow" spacing; echo the client's own ref on pre-sync
   received-rows; remove the duplicate Reports heading; check the Reports
   Issued-30-days counter logic against seeded issued jobs and fix if it
   reads the wrong field.
3. P1-5 residual: the retention wording check described above.

Constraints: frontend-design skill for UI; DESIGN.md wins over any
generic heuristic; no unrelated refactoring; NO schema changes.

Verification: npm test / tsc / next build green; browser in demo —
(a) with 1 Action Required, that stat leads; (b) cancelled T-1006 absent
from In Progress, counted in Past; (c) seed ~20 extra in-progress jobs in
the demo store and screenshot the compressed list at desktop + 390px;
(d) reports heading single, counter correct; (e) retention wording
present and plain, retention BEHAVIOUR unchanged (T-1005 still ages out
on schedule). Screenshots for each.

Report changed files, tests, screenshots taken, remaining issues. Commit
and push. STOP after this batch.
```

---

### PROMPT — BATCH 3: Performance, accessibility & motion floor

```
BATCH 3 — PERFORMANCE / ACCESSIBILITY / MOTION FLOOR
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: DESIGN.md §13, §14, §17, §19, §20, §21; backlog P1-7, P1-11,
P2-10 in "PILOT PLAN + IMPLEMENTATION PROMPTS.md" §1. Evidence: QA-5/6/7/
8/12 in PRE-PILOT QA + E2E REPORT.md.

Implement:
1. Self-host Inter, Archivo, IBM Plex Mono via next/font (same weights as
   currently loaded); remove the Google Fonts runtime link. No visual
   change beyond font delivery.
2. Contrast sweep to the DESIGN.md floor: no text lighter than ink/60 on
   light surfaces; eliminate the QA-5 stragglers (ink/55 mono refs,
   ~3.3:1 muted greys, 8px micro-labels — nothing informational below
   10px, §14).
3. File inputs programmatically labelled (aria-labelledby to bucket
   headings); add the skip-link; login inputs get name + autocomplete
   (username / current-password).
4. P1-11 motion: entrance cascade runs on first landing only, never on
   route change; hover/press/pulse unchanged; reduced-motion behaviour
   unchanged. Keep the change one-line revertible.
5. P2-10: fix the hero full-bleed margin overflow (page must never pan
   horizontally, §21); raise action-carrying chips/link-buttons to ≥40px
   touch targets on mobile (§13).

Constraints: frontend-design skill; no unrelated refactors; no schema.

Verification: npm test / tsc / next build; browser — axe-core
color-contrast serious = 0 on dashboard AND submit (390px + desktop);
zero requests to fonts.googleapis.com; keyboard tab walk incl. skip-link;
route change renders content immediately (screenshot at 300ms);
document.documentElement.scrollWidth <= innerWidth on dashboard at 390px.

Report changed files, before/after axe counts, tests, remaining issues.
Commit and push. STOP after this batch.
```

---

### PROMPT — BATCH 4: Feedback widget + pilot metrics

```
BATCH 4 — FEEDBACK + PILOT METRICS
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: DESIGN.md (§16 components, §18 states, §22 voice); "PILOT
PLAN + IMPLEMENTATION PROMPTS.md" §4 (the feedback design — implement it
as specified, not a variant) and backlog P1-9, P1-10.

Implement:
1. Send-feedback entry in both client sidebar/drawer and staff shell
   footer → panel with category select (Confusing / Slow / Broken / Idea /
   Praise), textarea, optional contact-ok tick; auto-capture (shown to the
   user): login, company, current page, job ref when present, timestamp,
   UA class. POST to a client-session-gated /api/feedback.
2. Storage: audit_log action "feedback" (or the settings k/v store) — NO
   new tables, NO schema changes (the future table in §9.4 is explicitly
   not for now).
3. /admin/feedback: newest-first list with context; entry link from the
   admin nav area per StaffShell conventions.
4. Post-success pilot question: after a download or lodgement success (max
   once per fortnight per login, dismiss-forever), the one-tap line:
   "Would you rather lodge your next job here or by email? [Portal]
   [Email] [Depends — tell us]" recorded as feedback category "pilot-question".
5. P1-10 events: record lodge-start, lodge-success, upload-reject,
   download, login (with UA class) via the same store; a small /admin
   rollup card (counts by week). No third-party analytics.

Constraints: frontend-design for UI; impersonated staff sessions must NOT
be able to submit client feedback (mirror existing write-blocks); no
unrelated refactors.

Verification: npm test / tsc / next build; browser — submit feedback from
a job page and see it in /admin/feedback with context; pilot question
appears once after a download and records; events visible in the rollup;
impersonation blocked (403 path). Screenshots.

Report changed files, tests, remaining issues. Commit and push.
STOP after this batch.
```

---

### PROMPT — BATCH 5: Pilot-gate execution aids

```
BATCH 5 — PILOT-GATE EXECUTION AIDS (small batch)
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: "PILOT PLAN + IMPLEMENTATION PROMPTS.md" §3 (pre-pilot), §9
(manual changes — you APPLY NONE of them), and docs/GO-LIVE-RUNBOOK.md
Phase 7 + go/no-go.

Implement:
1. A read-only pre-flight card on /admin (staff-gated): presence/health of
   AUTH_SECRET (non-default), STAFF_PASSCODE (non-default), Supabase
   configured (not demo mode), CRON_SECRET set, Graph ready, Monday ready,
   APP_URL value. NEVER display secret values — presence and pass/fail
   only. Reuse the existing env module and health patterns.
2. Update docs/GO-LIVE-RUNBOOK.md Phase 7 to cover the new Batch 1–4
   behaviours (FIR flip, collision suffix, rejection notice, permanence
   wording, feedback widget) so the owner's live smoke tests current
   behaviour.
3. Add §9.1's verify-first data-hygiene queries to the runbook as a
   documented step (owner-executed; the agent never runs them).

Constraints: no schema changes; no destructive tooling; docs +
one read-only admin card only.

Verification: tsc / next build; browser — pre-flight card renders in demo
mode showing demo-appropriate states; no secret values anywhere in the
DOM or payloads.

Report changed files, tests, remaining issues. Commit and push.
STOP after this batch.
```

---

### PROMPT — BATCH 6: Automated regression suite + final QA

```
BATCH 6 — AUTOMATED REGRESSION + FINAL QA SWEEP
Use FABLE for this entire session. Do NOT use Opus. Do NOT spawn Opus subagents.

Read first: PRE-PILOT QA + E2E REPORT.md §11 (the 10-spec suite this
batch implements) and "PILOT PLAN + IMPLEMENTATION PROMPTS.md" §8 Batch 6.
Batches 1–4 must already be merged; verify with git log and stop if not.

Implement P2-2: a Playwright regression suite running against `next
start` in demo mode (zero credentials; the demo seed is the fixture;
store assertions via the demo JSON file). Specs: (1) smoke — both logins,
dashboard, notifications 200; (2) auth — bad password, lockout message,
staff passcode, session-expiry message; (3) lodgement — combine preview +
store names, disabled-until-complete with named-missing line,
double-click = exactly 1, oversize 413, txt refused visibly, collision
suffixed, em-dash accepted (Batch 1 regressions); (4) FIR — reply →
thread + dated rename + banner flip; (5) download — zip bytes, Downloads
regroup, permanence (T-1005 visible); (6) cancel — happy + both 409s +
stale-tab message; (7) amendment — lodge → admin WAITING; (8) queue —
pending/accept/reject + client rejection notice; (9) permissions —
foreign-ref 404s, impersonation banner + write-block 403s incl. feedback;
(10) admin — enquiry round trip, email/activity/feedback pages render.
Wire as `npm run test:e2e` (<5 min); use the preinstalled Chromium
executablePath — never download browsers.

Then a manual browser sweep of every workflow the batches touched, at
desktop + 390px, screenshotting each.

Constraints: test code and package scripts only — do not modify
application behaviour; if a spec finds a regression, report it (fix only
if it is unambiguously a Batch 1–4 defect, and say so).

Verification: full suite green twice consecutively; tsc / next build /
npm test green.

Report: spec list with pass/fail, runtime, changed files, any residual
issues for the pilot log. Commit and push. STOP after this batch.
```

---

## 11. Final output

### TOP 10 NEXT ACTIONS
1. ~~Owner: decide P1-5 + nod P1-4~~ — **✔ done 12 Aug 2026** (retention
   stays 3 months; batches approved; P1-4 final copy still shown for a
   nod in the Batch 1 report).
2. Owner: execute **P0-1** config pre-flight (5 minutes, §9.2).
3. Run **Batch 1** (pilot-gate fixes) — the two GO-condition code items.
4. Run **Batch 2** (permanence + dashboard).
5. Owner: **P0-2** live smoke on production (45 min, runbook Phase 7 —
   after Batch 5 updates it, or with the current doc + delta list).
6. Run **Batch 3** (perf/a11y/motion) and **Batch 4** (feedback/metrics).
7. Owner: **P0-3** production data hygiene + pilot accounts (§9.1).
8. Run **Batch 5** then **Batch 6** (regression suite green).
9. Record the email baseline (§3.8) and send the **pilot invitation**
   (§6.3), then logins + welcome email (§6.4).
10. Start the 4-week pilot rhythm (§3) — daily admin check week 1, the
    question in week 4 (§6.5), then the GA decision.

### PILOT LAUNCH CHECKLIST
- [x] P1-5 decided (retention stays 3 months) + batches approved — 12 Aug
      (P1-4 final copy nod comes with the Batch 1 report)
- [ ] P0-1 config pre-flight green
- [ ] Batches 1–4 merged; Batch 6 suite green twice
- [ ] P0-2 live smoke green (incl. FIR flip + collision + rejection paths)
- [ ] P0-3 store clean; pilot company, aliases, logins + setup codes ready;
      history syncing
- [ ] Backup/PITR confirmed; re-sync path documented
- [ ] Support line briefed; pilot log open; admin banners checked daily
- [ ] Baseline (email jobs/month) recorded
- [ ] Quick Start PDF attached to welcome email; invitation sent
- [ ] Feedback widget live; week-4 email scheduled

### PILOT READINESS SCORE
**84 / 100** (per-area table in §5).

### VERDICT: **CONDITIONAL GO**
Conditions: P0-1 · P0-2 · P0-3 · P1-1 + P1-2 deployed · P1-5 decided.
(Full reasoning §5.)

### RECOMMENDED IMPLEMENTATION ORDER
Batch 1 → Batch 2 → Batch 3 → Batch 4 → Batch 5 → Batch 6, with owner
P0/decision actions interleaved per the Top 10. P2 starts post-pilot,
re-ranked by pilot data; P3/P4 follow per §1.

### CLAUDE CODE IMPLEMENTATION PROMPTS
Six prompts, §10 — copy-paste ready, one per batch. Not executed in this
session.

---

*End of Session 5. No application changes were made. The pre-pilot
programme's five deliverables are complete: Master Audit · Security
Audit · QA + E2E Report · Product + UX + Design + Research Report (with
definitive DESIGN.md) · this consolidation.*
