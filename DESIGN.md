# DESIGN.md — CFBA Client Portal design source of truth

**Read this file before doing any design or UI work on this repository.**
It is the persistent design authority across sessions. The
`frontend-design` and `impeccable` skills vendored in `.claude/skills/` and
`.agents/skills/` are applied *through* this document: where a generic
skill heuristic conflicts with a principle recorded here, this file wins;
where this file is silent, the skills fill the gap.

Two kinds of content, kept separate on purpose:

- **PRINCIPLE / SPEC** — enduring requirements and agreed target designs.
  Changing these needs the owner's agreement.
- **CURRENT** — what the implementation does today, recorded so sessions
  don't re-derive it. Evidence, not law: it may be improved, but never in
  contradiction of a PRINCIPLE.

Status: created Session 1 (field survey); **rewritten Session 4 (Aug 2026)
as the definitive spec**, incorporating QA/E2E findings (Session 3), the
product/UX/research analysis (see `PRODUCT + UX + DESIGN + RESEARCH
REPORT.md` — "the S4 report" — for the arguments), and the external
patterns recorded there. Prior product review: `docs/UX-REVIEW.md` —
read before re-raising anything it settled or parked.

---

## 1. Product & design principles — PRINCIPLE

1. **Product character:** professional · calm · competent · fast · clear ·
   trustworthy · **quietly premium** — craft in details, never showiness.
   For Australian building trades (patio/shed/carport/pool builders,
   designers, drafters — Perth WA). An **Operate-mode** tool people work
   *in*, not a marketing surface: familiarity is a feature, density is
   welcome when it clarifies, the tool should disappear into the task.
2. **The email-replacement law.** Email lodgement takes ~a minute; the
   portal never wins by forcing a different submission method. Every
   client-facing workflow must be *faster than email* or must buy
   something email can't (visibility, completeness, retrieval, zero
   re-keying) — and we must be able to say which. New workflows are tested
   against the S4 report §2 table before they ship.
3. **The board is the system of record.** Monday.com holds assessment
   truth; the portal is the client interface plus the office's
   client-facing exception surface. **Never build a parallel job manager**
   — no portal-side statuses, assignment, or workflow that duplicates the
   board. This is the standing bloat risk; every admin feature is checked
   against it.
4. **Ball-in-court is the status axis.** Every open item answers "whose
   move is it?" — *with you* (brass) or *with us* (seal) — and flips the
   moment the other side acts. A client answering an FIR sees the flip
   immediately (never "still waiting on you" after they've sent).
5. **No feature bloat.** Additions solve a named user or business problem.
   The rejected-ideas register (S4 report §9) is part of this spec: bulk
   lodgement, client-side versioning, favourites/saved searches, chat-style
   messaging, configurable dashboards, parallel admin workflow — argued
   once, stays settled unless the facts change.
6. **Assessment stays visibly human.** Automation moves files, statuses
   and reminders; it never assesses, never auto-replies as a person, and
   the voice never pretends a robot is a surveyor.

## 2. The four client questions — PRINCIPLE

A client must answer, **in this priority order**, one glance/click from
landing:

1. **What needs my attention?** — attention states lead every surface.
2. **What is happening with my jobs?** — live status, plain English.
3. **How quickly can I lodge another job?** — the one accented CTA.
4. **Where is the previous job/certificate I need?** — search, Past,
   Downloads within the 3-month retention window; beyond it, CFBA holds
   the archive copy and the portal says so plainly with the ring-us path
   (§10 — owner-decided, Aug 2026).

Priority order matters under load: when attention items exist they
outrank everything, including on phones (see §5, §14).

## 3. Information architecture & navigation — SPEC (target) + CURRENT

**Client target nav — 8 primary items:**
Dashboard · My Jobs · My Messages · **Lodge a Job** (sole accented CTA) ·
Downloads · Guides & tools (absorbs Info Sheets + Tools + Resources) ·
My Details · Help & Support. "Amend a Job" leaves the nav: amending is an
action *on a job* (entry points on job pages + a lodge-page cross-link),
not a place. Sidebar search stays. Unread badge on My Messages stays.

**CURRENT:** 13-item dark seal sidebar — My Documents added 12 Aug 2026 at
the owner's direction (the saved-engineering library, surfaced out of My
Details); regroup to 8 stays post-pilot, validated against pilot usage,
and absorbs this too; staff = 8-item uppercase top nav (Queue, Clients,
Enquiries, Amendments, FIR Library, Records, Content, Settings) with
Reports/Audit/Email Log hanging off Queue as ghost buttons — staff nav is
fine as-is.

**Shells:** client `AppShell` (sidebar, photo heroes), staff `StaffShell`
(top nav, denser, no heroes), Studio separately themed (`.studio-chrome`,
no CFBA identity — see `docs/STUDIO.md`). One token family across all.

## 4. Client dashboard hierarchy — SPEC

Order, top to bottom (S4 report §3/§11):

1. **Needs-you strip** (§6 pattern) — when non-empty, nothing sits above
   it but the greeting hero.
2. **Stat counts** — compress to one row (2×2 grid on phones), **dynamic
   order: non-zero attention states first** (Action Required ▸ Ready ▸ In
   Progress ▸ Past). A zero never holds the lead slot while an attention
   count is non-zero.
3. **Jobs in progress** — compressed rows (§7), *excluding cancelled*
   (cancelled jobs live in Past and never inflate the In Progress count).
4. **Ready to collect / Past jobs** — with retention/archive line per §10.
5. Quick-action tiles: cut to at most the two genuinely action-shaped
   entries, or drop the band — nav duplication is an anti-pattern (§20).

**CURRENT (matches SPEC as of 12 Aug 2026, Batch 2):** dynamic stat order
with the needs-you section rendered first; cancelled → Past everywhere
(core.mjs `cancelled` bucket); compressed rows without per-row timelines,
verified legible at 17 active jobs; 2×2 phone stat grid; two-tile quick
actions.

## 5. Admin dashboard hierarchy — SPEC + CURRENT

Queue-first home, in order: health banners (failures/stale/off — honest,
loud, exceptions only) → **Today strip** (target: at-risk vs the 3–4-day
promise · FIR-quiet with one-click nudge · uncollected packages) → intake
queue (Accept → Monday / Reject with reason) → snapshots. Zendesk-pattern
views sorted by time-to-breach, built on data already held (receivedAt,
firSince, PORTAL column). **CURRENT:** banners + queue + Ready/FIR/
Downloaded snapshots exist; Today strip and nudge are post-pilot builds.

## 6. Needs-Your-Attention pattern — SPEC

One pattern everywhere (dashboard strip, My Jobs "Needs you" filter,
job-detail banner):

- Amber (brass) family; the **full ask inline** (never "you have a
  request" teasers), oldest first; one primary CTA ("Send information")
  jumping to the categorised reply.
- Contents: FIR asks · rejected lodgements (with reason — the client is
  never left believing a dead job is live) · anything else that blocks us
  on them. Unread replies badge on Messages, not here.
- **Answered flip (ball-in-court):** the moment the client sends, the item
  leaves the strip and the job shows "Answer sent — with us" without
  waiting for the board sync; a NEW ask (changed request text) re-arms the
  amber state. **SHIPPED 12 Aug 2026** (Batch 1): marker
  `firanswered:<ref>` written by the messages route on any reply to an
  FIR-state job; `firAnswered()` in core.mjs is the guard; job page and
  dashboard both honour it. Rejected lodgements render in the strip with
  their reason and a "Lodge It Again" CTA (also shipped).

## 7. Job list / table pattern — SPEC

- Rows in a single card with `divide-y divide-rule` — never per-row cards.
- **Compressed row anatomy:** structure icon · `T-1234` (mono) · address
  (the primary key builders think in) · description · client's own ref
  ("· your ref PO 7583" — including on pre-sync received-rows) ·
  **ball-in-court chip** · since-line ("With you since 5 Aug · 6 business
  days" / "Day 2 · most jobs 3–4 business days"). **No 5-stage timeline in
  rows** — that's job-detail's job; rows must stay readable at 25+ active
  jobs and on phones.
- Filters as count chips (Current · Needs you · Ready · Past · All), sort,
  `?q=` search (ref, address, description), CSV export. Empty filter
  states say what the filter means, not just "nothing here".

## 8. Job-detail structure — SPEC + CURRENT

Order: status card (chip + **full 5-stage timeline** + surveyor + issued/
since line + actions: Download / Amend this job / Lodge similar) →
needs-you banner when open (§6) → "What you've sent us" (lodgement +
amendments + FIR answers, dated, with the WITH US / WITH YOUR SURVEYOR
chips) → Documents (current versions only; superseding is office-side) →
**one thread** = messages *and* system events (lodged, FIR raised,
answered, issued, downloaded) so communication history and job history
are a single surface (system events are the target; messages CURRENT) →
reply box → quiet **request-to-cancel** affordance on cancellable jobs
only. Cancelling is a REQUEST the office confirms (owner, 12 Aug 2026):
the ask lands on the card + office email, the job shows "Cancellation
requested — with us to confirm", the affordance disappears, a duplicate
ask 409s, and the job only reads Cancelled when the office cancels the
card (sync wins). No portal-side status write.

Timeline stages (CURRENT, keep): Received → Under assessment → Further
information → Certificate being prepared → Issued; "Issued" ticks only
when files are actually downloadable (`effectiveStageIndex`).

## 9. RFI (FIR) interaction — SPEC (largely CURRENT)

The portal's flagship flow. Anatomy: amber banner + "Reply now →" anchor;
the ask in full on dashboard and job page; **categorised reply buckets**
(Updated drawings / Engineering / Other) with live "Filed as …" preview
(dated combine names — the resubmittal names its deficiency); send →
thread entry + attachments to the office email + board card moves off FIR
+ **answered flip per §6**; delivered tick when the board holds the update.
Office side: FIR Library supplies the standard asks (voice-matched);
raising an FIR stays a **board** action (never a portal duplicate); the
FIR-quiet nudge (§5) reuses Library voice. SharePoint replace + SS
supersede filing behind `RECORD_TO_FOLDER` (CURRENT, live-smoke pending).

## 10. Documents & files — SPEC + CURRENT + one OPEN decision

- Combine-and-rename at lodgement (CURRENT, keep):
  `Site Plan and Elevations - <street suburb>.pdf`, `Engineering - …`;
  FIR responses append ` - <d Mon yyyy>` (Perth). Naming lives in
  `lib/uploads.mjs`, shared by preview and server so the preview can't lie.
  "Other" documents keep client names. Amendments keep client filenames
  (which drawing changed is the point) — **owner confirmation pending**.
- **Tolerant intake — SPEC (target):** accept images and Word alongside
  PDF and convert server-side to archivable PDF (Cloudpermit-validated);
  accept **any filename** (QA-3: non-ASCII names are currently dropped
  silently — never reject a file without saying so, §18). Collision rule:
  same name in two buckets gets a suffix at write time (QA-2 fix — a
  second file must never overwrite a first).
- Limits (CURRENT): lodgement 40 MB, message 25 MB, server-enforced (413
  at signing). Certificate-of-title / BA1 uploads silently filtered
  (`UNNEEDED`) — keep.
- **Certificate retention — DECIDED (owner, 12 Aug 2026): 3 months
  stands.** Certificates stay downloadable for 3 months from first
  download, exactly as built; CFBA always holds the archive copy on its
  own server, and older certificates are supplied on request (ring/email
  the office). Design obligation: the window and the ring-us path are
  stated plainly wherever retention bites (Downloads header does this;
  keep it true in guides and emails), and marketing never promises
  "anytime". Server-side files are never purged (unchanged).

## 11. Submission / forms pattern — SPEC (largely CURRENT)

- Class-row builder (class · what is it · qty), server-derived description
  + "We'll record this as" echo; the browser preview is a courtesy, the
  server derivation is the truth (board-label injection stays impossible).
- **Disabled-until-complete, always with the why:** the primary button may
  disable, but the form must name the missing piece next to it
  ("Engineering still needed — attach it and this unlocks"). A
  Cloudpermit-style named-missing meter satisfies this. Silent
  disablement is an anti-pattern (§20) — QA-3's lesson generalised.
- Buckets with drag-and-drop + "Filed as" previews (CURRENT). Target
  additions: **templates row** (named saved templates carrying class rows
  + default engineering from the client's library — interaction detail
  OPEN, design when built) and a **single smart drop-zone** that
  auto-categorises by filename heuristics with client-confirmable chips
  (post-pilot, validate against usage).
- **Conditional required documents** (pattern, shipped 12 Aug 2026):
  when circumstances demand a document, it appears as its own required
  bucket with the reason in its label, and the named-missing line under
  the disabled button says exactly what unlocks it. Shipped instances:
  BAL (verdict-driven — a shed within 6 m requires its OWN new report; a
  post-2016 patio/carport requires rating evidence; exempt/far/unsure
  never force an upload) and Strata (self-declared checkbox → Strata Plan
  required; Landgate auto-detection is post-pilot, licence-gated). These
  ride as "other"-category files — never combined, their own record.
- Success card: "Job Lodged" + their-ref echo + View My Jobs / Lodge
  Another (CURRENT — fix the "My Jobsnow" spacing). Draft autosave:
  post-pilot (localStorage).
- The multipart and direct-upload paths re-verify everything server-side
  (sizes from storage, never browser claims) — security posture per the
  Session 2 audit; keep.

## 12. Status presentation — PRINCIPLE + CURRENT

- Vocabulary (`lib/core.mjs` authoritative): board statuses (To Assess →
  To Check → To CDC → Issued; FIR; FIR-ENG/SCL as in-house waits — never
  shown as the client's fault; Cancelled; paused) → client timeline (§8)
  → PORTAL column (LODGED → ISSUED → READY → DOWNLOADED + STUCK).
- One name per state, client-facing FIR = **"Action required — see the
  request"** — never reintroduce synonyms (UX-REVIEW #8).
- Status colours = the semantic triad only (§15): seal good/ready · brass
  needs-a-human · flag wrong. Chips are words, never colour alone.
- Cancelled is a terminal Past state everywhere (list, counts, stats).

## 13. Mobile behaviour — SPEC + CURRENT

Pivot at `lg` (sidebar → drawer; timeline → vertical *on job detail
only*; button tracking relaxes). SPEC deltas: 2×2 stat grid; compressed
rows (no per-row timelines); touch targets ≥ 40px for chips and
link-buttons that carry actions ("Reply now →", filter chips — currently
20–31px); hero full-bleed margin math must not exceed viewport width
(current ~4–8px overshoot = shimmy risk). Heroes: shorter bands + 900px
`-m` crops below `md` (CURRENT, keep). PWA manifest, **no service worker
on purpose** — status must never be stale. Test at 390px + desktop
minimum; 360px in QA suites.

## 14. Typography — SETTLED (Session 4)

- **Keep Inter (body) · Archivo (display) · IBM Plex Mono (refs/counts).**
  The identity lives in the tracked-caps treatment and the seal/brass
  world, not in a novelty face; an Operate tool earns distinctiveness
  through behaviour. Revisit only with owner-driven brand work.
- **Self-host via `next/font`** (replaces the Google Fonts runtime link —
  QA-6 measured a 12.7s worst-case stall when unreachable). Pre-pilot.
- Scale in use (px): 30/26 page titles · 21 card titles · 15–17 row
  titles · 13–14 body/meta · 10–12 caps-labels & chips — **nothing
  interactive or informational below 10px** (8px micro-labels found in QA
  are out of spec). Tracked-caps `.label`/`.sectionhead`/buttons are the
  house signature; tracking relaxes below `lg`. `tabular-nums` on stats
  and table cells.

## 15. Colour principles — PRINCIPLE + CURRENT tokens

Semantics first: **seal = good/ready/ours · brass = needs a human (client
attention lives here) · flag = wrong/failed — flag is never decoration.**
Amber pulse (`chippulse`) is reserved for action-required chips: the one
element allowed to tug the eye.

| Token | Hex | Role |
|---|---|---|
| `seal` / `seal-2` / `seal-deep` | `#1E5B3C` / `#2E7D5B` / `#123A26` | brand green: primary actions, done, sidebar |
| `brass` / `brass-deep` | `#B07A18` / `#8A5E10` | action-required / waiting-on-client; deep = readable text step |
| `flag` | `#A6222E` | errors and failures only |
| `ink` | `#101A15` | text |
| `paper` / `wash` | `#EEF0EA` / `#F5F7F3` | page ground / panel tint |
| `rule` | `#D3D8D1` | borders |

Debt (standing): ~a dozen soft-tint hexes inline (`#FCF7EC`, `#E4C98A`,
`#F6EEDA`, `#FBECEC`, `#EDF3EE`, `#FBF4E6`, `#E9D7AC`, `#0D211A`…) —
consistent in use; graduate to named tokens when touched.

## 16. Spacing, density & components — CURRENT (keep)

- Max-widths: staff 1100px; client shell content region, 9-unit gutters at
  `lg`. Cards `rounded-xl`, **single elevation declaration** (border + very
  soft shadow — never stacked). Chips/pills only on small controls.
- Lists = one card + `divide-y divide-rule`. Section rhythm = `.sectionhead`
  (tracked caps · hairline · count/action) on both shells — **the** house
  section pattern; never hand-roll a variant.
- Component inventory (globals.css + components/): `.btn` · `.btn-ghost` ·
  `.field` · `.label` · `.card` · `.chip(-seal/-brass/-flag)` · `.stat` ·
  `.sectionhead` · `.th`/`.td` · `.panel-amber` · `.empty` · `.eyebrow` ·
  `.hero-photo`; React: `AppShell`/`StaffShell`, `SectionHead`, `JobDesc`,
  `LodgedLine`, `JobTimeline`, `JobArt`, `FileBucket` (+`combinedAs`),
  `FirResponseBox`, `AdminSnapshot`, `EmptyState`, `Icon` (single stroke
  family). **Reuse before inventing.** Admin parity: same tokens, denser,
  no heroes, shared section/empty patterns, same contrast floor.

## 17. Motion — RECOMMENDED (owner sign-off pending)

Keep: hover lifts/nudges, press feedback, amber chip pulse — state
feedback only, 150–250ms ease-out, all dead under
`prefers-reduced-motion`. **Change:** the page/section cascade-in runs on
**first landing only, never on route change** — work pages must render
instantly for the 20-visits-a-day user (Session 3 caught My Jobs blank at
500ms mid-cascade). Never add motion that only decorates.

## 18. Empty, loading, error states — PRINCIPLE

- Empty states direct ("An empty screen is an invitation to act") — the
  library's save-for-next-time line is the model; `.empty` shared both
  shells. Filter empties explain the filter.
- Loading: branded skeletons matching real layout (dashboard/jobs —
  CURRENT), off under reduced-motion; no spinners where a skeleton fits.
- Errors name the problem *and the recovery*, never apologise vaguely,
  never leak internals; office phone 1300 029 074 is the human fallback in
  dead ends. **Nothing fails silently:** every refused file, disabled
  button, or skipped action states its reason inline (QA-3's silent drop
  is the canonical violation). Honest failure surfacing extends to admin
  ("The email did NOT send." is the exemplar — keep that spirit).

## 19. Accessibility — PRINCIPLE

- **Contrast floor: ≥ 4.5:1 for text; never lighter than `ink/60` on light
  surfaces.** QA-5 stragglers (`ink/55` refs, ~3.3:1 muted greys, 8px
  labels) are out of spec — sweep pre-pilot, then axe (color-contrast) in
  CI on dashboard + submit.
- Keyboard: full-tab operability with themed `:focus-visible` (verified);
  add the **skip-link**; Enter submits forms.
- Labels: every control programmatically labelled — **including file
  inputs** (bucket headings associated via `aria-labelledby`; QA-7).
- Login inputs carry `name` + `autocomplete` (username / current-password).
- `sr-only` stage text on timelines (CURRENT, keep); status never colour
  alone (§12); reduced-motion kills all animation (CURRENT, keep).

## 20. Design anti-patterns — PRINCIPLE (avoid list)

The generic-AI trio (cream+serif+terracotta · black+acid · hairline
broadsheet) · gratuitous gradients, glass/blur · nested/excessive rounded
cards · decorative clutter, gimmicks, consumer-app playfulness · density
reduction without clarity gain · eyebrows/numbering that don't encode
information · emoji as icons (icons are drawn, one stroke family) · text
below the contrast floor · **silent rejection or disablement** (§18) ·
**per-row stage timelines in lists** (§7) · **nav-duplicating tile bands**
(§4) · route-change entrance animation on work pages (§17) · teaser
notifications that withhold the ask (§6) · portal-side duplication of
board workflow (§1.3).

## 21. Responsive rules — SPEC

One breakpoint philosophy: `lg` is the pivot; below it — drawer nav,
vertical detail-timeline, relaxed tracking, 2×2 stats, compressed rows;
above it — sidebar, horizontal timeline on detail, full stat row. Wide
content scrolls inside its container; the page never pans horizontally
(hero margin bug in scope). Images: max-width 100%; hero crops per §13.
Test gates: 390px + desktop always; 360px in QA.

## 22. Voice & microcopy — PRINCIPLE

Plain Australian English, first-person plural, calm and specific. Controls
name their action ("Lodge This Job", "Send to CFBA"); an action keeps its
name through the flow. Errors: problem + recovery ("Those files come to
more than 40 MB all up — email the biggest ones…"). States speak from the
client's side ("With you since…", "We need something from you"). Numbers
over adjectives ("most jobs 3–4 business days"). Reminders are friendly
but firm (TaxDome register, CFBA accent). The voice never pretends
automation is a person (§1.6). Debt: centralise the ~15 scattered
phone/email literals when touched.

## 23. Unresolved design decisions — OPEN

1. **File-name comma** — `32 Elvira Street Palmyra` vs restoring the
   comma; owner review pending.
2. **Amendment uploads** — keep client filenames (current, deliberate) vs
   extend combine-and-rename; owner confirmation pending.
3. **Template interaction detail** (§11) — design when built, post-pilot.
4. **Trust footer** — parked on approved privacy wording (UX-REVIEW #17).
5. **Inline tint hexes → tokens** — fold into the next visual-debt pass.

Settled in Session 4: typeface identity (§14 — keep faces, self-host);
nav direction (§3 — regroup to 8, post-pilot with usage data); dashboard
hierarchy (§4); FIR answered-state (§6).

Settled by the owner, 12 Aug 2026: **certificate retention stays at
3 months** (§10 — Option A rejected; office archive + on-request supply
is the path); **motion change approved** (§17 — first-landing-only
cascade); the Session 5 batch plan approved as written.

## 24. Change log

- **2026-08 (Session 1 audit):** file created — current system + Aug-2026
  craft passes recorded (contrast sweep, section-head/empty consolidation,
  dashboard polish, admin parity — PRs #31–#34).
- **2026-08 (Session 4):** rewritten as the definitive spec. Added:
  product principles (email-replacement law, board-is-truth, ball-in-court,
  bloat register, human-assessment), dashboard hierarchies, Needs-Attention
  pattern with answered-flip, job-list compression rule, job-detail +
  thread-with-events structure, tolerant-intake and collision rules,
  certificate-permanence principle, settled typography (self-host) and
  motion recommendation, expanded anti-patterns (silent rejection, row
  timelines, nav-duplicating tiles), a11y additions (file-input labels,
  autocomplete, 10px floor), responsive rules, microcopy register.
  Sources: Session 3 QA evidence + S4 product report (external patterns:
  TaxDome, Cloudpermit, Procore ball-in-court, Zendesk views, NSW
  Planning Portal as anti-pole, Accela/OpenGov).
- **2026-08-12 (info-sheet craft pass):** frontend-design + impeccable
  run over the 14 guidance notes. Detector: all sheets on the A4 floor,
  no title/mark collisions, no orphaned heads. Eyes: suite floor already
  high; two content-currency defects fixed — note 03 (BAL) gained "How
  the Portal Handles It at Lodgement" (map check as you type, pre-2016
  exemption for patios/carports AND sheds, 2016+ split, 6 m rule) and a
  current callout; note 02 (engineering) gained the My-Documents
  save-and-reuse line. Both re-fitted to one sheet via per-note fit
  blocks (house precedent: h1.fit/.long). OPEN QUESTION for the owner:
  the suite contradicts itself on whether CFBA prepares BAL reports
  (services/tools/lodging-card say yes; the lodgement verdict copy says
  "We don't prepare BAL reports", test-pinned) — SETTLED by the owner,
  12 Aug 2026: CFBA does NOT prepare BAL reports. All five contrary
  claims aligned (Tools bushfire checker, FIR-library BAL shortcut
  default, client guide, lodging card, services one-pager — heading now
  Bushfire-prone lots, hero sub no longer lists bushfire as a service).
- **2026-08-12 (owner rule fix):** the pre-2016 exemption now covers
  sheds too — the shed path asks "Was the house built before 2016?";
  before 2016 = exempt (exemption code stamped), 2016 or later = the
  shed's own new BAL report stays compulsory, unsure = office confirms
  on assessment. Both structure kinds share the one age question.
- **2026-08-12 (owner tweaks, post-merge):** strata is now a compulsory
  Yes/No asked BEFORE Supporting Documents (null until answered; the lodge
  button names the hold); a Yes adds the required Strata Plan slot directly
  after Engineering. From Your Documents merged INTO the Engineering card
  (one box, divided sections — FileBucket gained `children` + `satisfied`),
  so ticked saved engineering also clears the card's "missing" styling.
- **2026-08-12 (Batch 6 shipped):** the regression net. `npm run
  test:e2e` — ten real-browser specs (smoke, auth incl. lockout and
  session-expiry copy, lodgement incl. the Batch-1 tolerant-intake and
  collision regressions, FIR flip, download + permanence + retention
  wording, cancel request 409s, amendment, queue accept/reject-with-
  reason, permissions incl. impersonation attribution, admin round
  trips) on zero new dependencies, fresh demo seed per run, green twice
  consecutively at ~45 s. Final sweep: 11 screenshots desktop + 390 px,
  zero horizontal overflow. Test code and scripts only — no application
  behaviour changed.
- **2026-08-12 (Batch 5 shipped):** P0 execution aids. Go-live pre-flight
  card on /admin — presence/pass-fail only, no value ever rendered
  (leak-tested with live-looking secrets: zero appeared in the HTML);
  quiet-when-healthy (one collapsed line, amber chip only when something
  needs a human — same register as the evening-report line). Runbook
  Phase 7 extended to smoke every Batch 1–4 behaviour; P0-3 verify-first
  data-hygiene SQL documented in the runbook, matching the app's own
  cascade order. Docs + one read-only card; no schema, no new writes.
- **2026-08-12 (Batch 4 shipped):** the pilot's measurement instrument.
  "Send feedback" in both shells' chrome (five plain categories; captured
  context — page, job, device class — is shown before Send, §18 spirit:
  nothing rides silently); the panel portals to `<body>` because the
  drawer's transform would otherwise contain `fixed` and pin it inside
  the rail. The core pilot question renders one-tap on lodgement success
  + Downloads, max once a fortnight, dismissible forever. Events
  (lodge.start/success, upload.reject, certificate.download, auth.login,
  feedback) ride the audit log — zero schema drift; demo store persists
  audit so the dials are demo-verifiable. `/admin/feedback` = weekly
  rollup + newest-first feedback with context. Impersonated staff
  feedback is attributed to staff, never the client's voice.
- **2026-08-12 (Batch 3 shipped):** typography §14 delivered (self-hosted
  @fontsource, Google runtime link removed); contrast floor §19 verified
  by axe at 0 serious nodes on the gate pages, both viewports (sweep
  included the dark rail; 8px labels → 10px floor); file-input aria
  labels + skip-link + login autocomplete shipped; motion §17 delivered
  (first-landing-only cascade, inline-script gate, one-line revert);
  §13/§21 touch targets ≥40px on chips and quiet links; horizontal
  overflow clipped.
- **2026-08-12 (Batch 2 shipped):** dashboard hierarchy now matches §4
  (dynamic stats, needs-you first, cancelled→Past bucket portal-wide, row
  compression at volume, 2×2 phone stats, quick-action trim); Reports
  issued-counters fixed and heading deduped; success-card spacing;
  received-row ref echo; Downloads retention wording carries the ring-us
  path (§10 obligation).
- **2026-08-12 (Batch 1 shipped):** FIR answered-flip (§6) live on job
  page + dashboard; collision suffix everywhere names are written;
  visible-refusal + named-missing lines (§18) live; rejected lodgements
  render in Action Required with the reason; cancel became
  request-and-confirm (§8); My Documents nav entry + page; From Your
  Documents / save-engineering restyled prominent; lodging progress
  panel; BAL + strata conditional required documents (§11). QA-3's
  em-dash finding corrected: harness artifact, not an app bug.
- **2026-08-12 (owner decisions, Session 5 follow-up):** certificate
  retention confirmed at 3 months (§2.4, §10 rewritten — Option A
  rejected; CFBA's server archive + on-request supply is the path);
  first-landing-only motion approved (§17); Session 5 batch plan approved.
