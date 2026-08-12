# CFBA Client Portal — Product + UX + Design + Research Report

**Session 4 of the pre-pilot programme.** Date: 12 August 2026.
Inputs: DESIGN.md, PRE-PILOT MASTER AUDIT.md, PRE-PILOT QA + E2E REPORT.md,
DEDICATED SECURITY AUDIT.md (constraints only), the frontend-design skill
applied throughout, Session 3's ~45 execution screenshots, and targeted
external research (§7). The question asked was not "how do we tidy the
portal" but **"what should the best practical client portal for this
business become?"** — with a hard rule against feature bloat.

Companion document: **DESIGN.md was rewritten this session** as the
definitive design source of truth. This report argues and prioritises;
DESIGN.md specifies. Where detail lives there, this report doesn't repeat it.

---

## 1. Executive product conclusion

**The portal's product thesis is right, and it is already most of the way
to being the best version of itself.** Its architecture makes the correct
strategic choice twice over:

- **Monday stays the office's system of record; the portal is the client
  interface.** There is no parallel job manager to keep in sync, and no
  double handling was found anywhere in the admin workflow. The single
  biggest product risk going forward is *accidentally building one* — this
  is now recorded as a design principle.
- **The portal doesn't fight email on lodgement speed; it wins on
  everything that happens after the send button.** A one-line email will
  always be ~60 seconds. The portal's lodge is ~90 seconds — and buys:
  completeness enforced at the door (the #1 FIR cause eliminated before it
  happens), zero re-keying for the office, tidy renamed combined PDFs, a
  live answer to "where's my job?", a structured FIR round trip, and
  certificates that don't live in an inbox.

What stands between current and ideal is **not a redesign**. It is:
(a) four workflow gaps where email still beats the portal (§2), led by
post-retention certificate access and PDF-only intake; (b) a dashboard
hierarchy that answers the four client questions but doesn't yet *rank*
them under load (§3); (c) a repeat-lodgement accelerator the 80%-repeat
client base deserves (§8); and (d) a small set of admin queue views that
convert the published 3–4-day promise into a working SLA surface (§10).
Classification: **B — moderate redesign** (§6), on the existing visual
system, which after the August craft passes is genuinely good and should
not be churned.

## 2. Email vs portal assessment

Baseline honoured: a client can email *"Please certify attached patio at
12 Smith Street"* with attachments in about a minute. Assessment of each
workflow (time · actions · re-keying · cognitive effort · visibility ·
retrieval · comms · benefit to each side):

| Workflow | Email | Portal today | Verdict |
|---|---|---|---|
| **Lodge (first time)** | ~60s compose; zero structure; office re-keys (5–10 min staff touch); missing docs found a day later → FIR by email | ~90–120s; class rows derive the description; **drawings+engineering required at the door**; combined/renamed PDFs; instant My Jobs row; zero office re-key | **Portal**, decisively on total cost — the extra 30s buys back a day of FIR latency and the office's touch |
| **Lodge (repeat patio, same spec)** | ~60s | Lodge Similar prefills rows; ~60–75s + files | **Tie on time, portal on outcome** — §8 templates push this to a clear portal win |
| **"Where's my job?"** | "Just checking in" email → staff reply (two touches) | Dashboard/status, zero touches | **Portal** (its strongest single case) |
| **Answer an FIR** | Reply-all with files; office re-files; card moved by hand | Categorised buckets, dated renamed combine, board moves itself, office emailed with attachments | **Portal** — but QA-1 (banner never acknowledges the answer) leaks trust at the exact moment of victory; fix pre-pilot |
| **Collect certificate** | Attachment in a thread | One-click zip, receipt recorded, Downloads page | **Portal** |
| **Old certificate, 8 months later** | "Can you resend the cert for 5 Banksia?" — works forever | Hidden after 3 months; ring us | **EMAIL WINS — the #1 product gap** (§8.1) |
| **Non-PDF reality (phone scans, Word docs)** | Attach anything | PDF-only; conversion is the client's problem; QA-3 even drops em-dash names silently | **EMAIL WINS — #2 gap** (§8.2) |
| **"Here's everything" file dump** | One drag, six files, no sorting | Three buckets, three drags | **Email slightly** — §8.6 smart drop-zone closes it; buckets stay as the fallback |
| **CC the drafter/owner** | Free | Team logins exist; no per-job third-party notify | Email, marginally — consciously parked (bloat risk > benefit today) |
| **Rejected lodgement** | Reply tells you | Email is the only channel; portal shows nothing (QA-4) | **Email** — fix the comms gap pre-pilot |

**Product law recorded in DESIGN.md:** every new client-facing workflow
must pass this table's test before it ships. If it's slower than email
*and* buys nothing after the send, it doesn't go in.

## 3. Client UX (first-principles, frontend-design lens)

**Dashboard** (evidence: A3-dashboard.png, E-iphone-dashboard.png):
answers all four client questions on one screen — genuinely rare and
worth protecting. Refinements owed under load:

- **Ranking under pressure.** The stat row is static (Ready · In Progress ·
  Action Required · Past). "0 Ready to Download" holds the lead slot while
  "1 Action Required" — question #1 — sits third. On the phone, four
  stacked stat cards push the Action Required *section* nearly two screens
  down. Fix: dynamic stat order (non-zero attention states first), 2×2
  stat grid on phones.
- **The timeline tax.** Every in-progress row carries the full 5-stage
  timeline (~90px). Three jobs read beautifully; a real patio builder's
  25 active jobs would scroll for metres. Dashboard/list rows compress to
  a stage chip + "with you/with us since" line; the full timeline lives on
  the job page. (Recorded as a DESIGN.md list-pattern rule.)
- **Cancelled ≠ in progress.** Cancelled jobs currently sit in "Jobs in
  progress" with a live-looking timeline *and inflate the In Progress
  count* (double-evidenced desktop + phone). They move to Past.
- **Quick Actions duplicate the sidebar** (six tiles at the bottom
  repeating six nav destinations). At the end of a long page they mostly
  add length; either cut to the two genuinely action-like tiles or drop
  the band. Anti-bloat applies to layout too.

**Navigation** (12 items): parked for usage data in UX-REVIEW #6, but
product logic now suffices: Tools, Resources and Info Sheets are all
"reference material a client visits occasionally" and can group under one
**Guides & tools** entry; Amend a Job is an action on a job, not a place
(entry points already exist on job pages; keep a lodge-page cross-link),
and Downloads is a *filter of jobs*, kept only because "where's my
certificate" deserves a first-class answer. Target: **8 primary items**
(spec in DESIGN.md §3). Not a rebuild — a regroup.

**Lodge a Job**: the class-row builder + derived description + "We'll
record this as" echo + disabled-until-complete gate is excellent and
already beats email on total cost. Three earned improvements: file-type
tolerance (§8.2), a completeness meter naming the missing piece
("Engineering still needed — the button unlocks when it's attached" —
the *why*, not just a disabled button; QA-3's lesson generalised), and
templates (§8.5). The success card is the right pattern (fix "My Jobsnow").

**Job detail**: correct structure (status card → what you sent →
documents → thread). The FIR answered-state fix (QA-1) is the one
material change; secondly the thread should show *system events* (lodged,
FIR raised, answered, issued, downloaded) inline so "communication
history" and "job history" are one surface, not two.

**Find it later**: search + Past + Downloads are right; the retention
cliff undermines all three (§8.1).

**Mobile**: drawer nav + vertical timelines work; the fixes are the stat
grid, row compression, and the two P4s (hero overflow shimmy, sub-44px
touch targets on chips/quiet links).

## 4. Admin UX

The staff console's job is triage and exceptions, and it already behaves
that way (queue-first home, health banners, honest failure surfacing —
"the email did NOT send" is exemplary). Gaps, in **reduce-staff-touches**
order:

1. **No live ageing/SLA view.** The published 3–4-day turnaround exists as
   a report, not a working surface. Zendesk-style views apply directly:
   *At risk* (approaching day 3 unissued), *FIR quiet* (with-client ≥N
   days), *Uncollected* (issued, not downloaded — exists as a snapshot
   already). Sort by time-to-breach. Data already on hand (receivedAt,
   firSince, PORTAL column).
2. **Chasing quiet clients is manual.** The single best new automation:
   one-click (then scheduled) **nudge** from the FIR-quiet view using the
   FIR Library's voice — "still waiting on the engineering for 12 Smith
   St". Kills the most common staff chase email.
3. **Reports under-serve** (QA-11: Issued-30d shows 0 against issued seed
   data — verify the counter live). Worth adding one genuinely operational
   tally: *FIR causes* (which missing document category triggers FIRs) —
   it feeds directly back into lodgement checklist copy.
4. **No new double handling found** — FIR raise stays a board action, and
   should remain one (the portal mirroring it is the design, not a gap).
   Assignment stays on the board (Certified By). Batch queue actions are
   unnecessary while auto-accept is on.

## 5. Frontend-design assessment (visual system)

Post-impeccable, the system is coherent and honestly premium: one token
family (seal/brass/flag semantic triad), the tracked-caps house signature,
`.sectionhead` rhythm, single-elevation cards, drawn single-stroke icons,
warm specific microcopy. It does **not** read as template SaaS — the
recognised AI-default looks are absent, and density is respected.

Verdicts on the open visual questions (arguments in DESIGN.md):

- **Typography — keep Inter/Archivo/Plex Mono; self-host via `next/font`.**
  The identity lives in the tracked-caps treatment + the seal/brass world,
  not in a novelty body face; an Operate tool earns distinctiveness
  through behaviour. Self-hosting removes the measured 12.7s worst-case
  external stall (QA-6) — that's the actionable typography change.
- **Motion — keep feedback, retire spectacle on work pages.** Hover/press
  and the amber pulse stay. The per-route cascade-in delays content on
  every navigation of a 20-visits-a-day tool (Session 3 screenshots caught
  My Jobs blank at 500ms). Recommend: cascade on first landing only;
  instant on route change. (Owner sign-off noted as pending.)
- **Contrast**: the /60 floor is right; QA-5's stragglers (`ink/55` refs,
  ~3.3:1 muted greys, 8px micro-labels) are the finish line, not a rethink.
- Remaining visual debt is small and known: tint hexes → tokens; hero
  full-bleed margin math (P4 shimmy).

## 6. Final redesign classification

**B — MODERATE REDESIGN.** Justification against the alternatives:

- Not **A (polish)**: the nav regroup, dashboard re-ranking + row
  compression, FIR answered-state, and lodge-intake changes alter
  information architecture and workflow, not just pixels.
- Not **C/D (overhaul)**: the visual system is strong and recently
  unified; the IA already answers the four questions; workflows beat email
  in most rows of §2's table. Rebuilding would churn what works, reset the
  owner's hard-won consistency, and delay the pilot for negative value.
  Every C/D-scale idea examined (parallel admin job manager, multi-step
  wizard intake, client document vault) failed the bloat test.

B is the smallest level that produces a materially better portal.

## 7. Most useful external patterns (8 recorded; research stopped at saturation)

| # | Source | Pattern | Why it works | CFBA relevance | Adapt? | Value |
|---|---|---|---|---|---|---|
| 1 | **TaxDome** client portal | Home page *is* the to-do list (unpaid, unsigned, pending — everything needing the client) | One question answered before any browsing: "what do you need from me?" | Validates Needs-Attention-first; CFBA already has the section — adopt the *ranking* (attention states lead everything, incl. stat order) | **Adapt** | High |
| 2 | **TaxDome** | Automated friendly-but-firm reminders on pending client items | Removes the firm's manual chase | = the FIR-quiet nudge (§4.2), client-side tone already on brand | **Adapt** | High |
| 3 | **Cloudpermit** | Required-tasks progress bar; red→green per missing item; required attachments listed per application type | The applicant always knows *why* they can't proceed | Lodge gate is already enforced but silent in places (QA-3); add the named-missing-item meter | **Adapt** | High |
| 4 | **Cloudpermit** | Accept any document type, convert to archivable PDF on the platform's side | Moves format burden from applicant to system | Directly answers the portal's PDF-only friction (§8.2) | **Adapt** | High |
| 5 | **Procore RFIs** | **Ball-in-court** — every open item names whose move it is; flips automatically on response | Ends "I thought you had it" | CFBA's "with you / with us" language formalised as *the* status axis on rows, chips and the admin FIR view; auto-flip = QA-1 fix | **Adapt** | High |
| 6 | **Zendesk** ops views | Queue views by next-SLA-breach: at-risk, pending-too-long, unassigned intake | Triage becomes a glance, not a scan | Admin ageing views vs the 3–4-day promise; FIR-quiet view (§4.1) | **Adapt** | High |
| 7 | **NSW Planning Portal** (direct AU market) | Statewide mandated lodgement: fee per lodgement, document-heavy multi-step — an entire guide industry exists to survive it | Benchmark of *applicant burden*; certifiers differentiate on speed around it | WA has no equivalent for this work; CFBA's radical lightness IS the product. Use as the anti-pole | **Don't adapt** (deliberately) | High (as negative) |
| 8 | **Accela/OpenGov/Tyler** (incumbent permitting) | Guided intake, resubmittal tied to the specific deficiency, status transparency | Public-sector completeness | Only the *resubmittal-names-the-deficiency* idea carries over (FIR buckets already do this); the rest is heavyweight by CFBA standards | **Take one idea, skip the rest** | Medium |

(Two internal baselines complete the set: the email workflow itself — §2's
bar — and the Monday board, which caps what the admin portal should ever
try to be.)

## 8. Features / workflows to add (ranked by genuine value)

1. **Permanent certificate access** (the §2 email-wins gap). Options
   framed for the owner in DESIGN.md §10: (a) drop the client-side hiding
   and keep Past Jobs forever (storage is already never purged; simplest,
   recommended), or (b) an archive state with a "request this certificate"
   one-clicker that emails the office. Decide pre-pilot (pilot comms
   depend on it); build is small either way.
2. **Tolerant intake: accept images/Word and convert to PDF server-side;
   accept any filename** (fixes QA-3's silent em-dash drop as a side
   effect). Cloudpermit-validated. This is the single biggest remover of
   portal-vs-email friction at lodge and FIR time.
3. **Job templates** — promote Lodge Similar to named, saved templates
   ("Standard flat patio — Stratco 6×4") carrying class rows + default
   engineering from the existing library. The 80%-repeat client lodges in
   ~3 clicks + drag. (Library + subitems stash already store the parts.)
4. **FIR answered state** (QA-1) — optimistic clear + "Answer sent — we're
   reviewing" + ball-in-court flip. Pre-pilot.
5. **Dashboard re-ranking** — dynamic stats, cancelled→Past, compressed
   rows (§3). Pre-pilot-cheap.
6. **Single smart drop-zone** above the buckets: drop everything at once,
   auto-categorise by filename heuristics ("eng*", "S-*" → engineering),
   client confirms chips land in the right buckets. Post-pilot; validate
   against real usage first.
7. **Admin ageing views + FIR nudge** (§4.1–4.2). Post-pilot early.
8. **Rejection comms** client-side (QA-4). Pre-pilot decision.
9. **Lodge-form draft autosave** (localStorage; known P2). Post-pilot.
10. **FIR-cause tally** in Reports. Post-pilot.

## 9. Features / workflows to simplify or remove

- **Quick Actions band** on the dashboard → cut or halve (nav duplication).
- **Per-row 5-stage timelines** on dashboard/list rows → chip + since-line
  (timeline stays on job detail).
- **Route-change cascade animation** on work pages → first landing only.
- **Nav 12 → 8** via the Guides & tools group (§3).
- **Do not build** (bloat register, argued once so it stays settled):
  bulk/batch lodgement (jobs arrive as sold, not in batches); client-side
  document versioning (office supersede filing already handles it; clients
  should see current-only); favourites/saved searches (portfolio sizes
  don't warrant); a portal payment surface (arrives only with the one-off
  public flow, per SPECS); client-configurable dashboards; chat-style
  messaging (the job thread is the right shape); a parallel admin job
  manager (the standing risk — the board is the system of record).

## 10. Automation opportunities (beyond §8)

Confirmed keepers: auto-accept lodgements (queue as safety net), auto
combine/rename, FIR auto card-move + office email with attachments,
record-email once-per-job with honest retry, STUCK watchdog, evening
report. New, in value order: FIR-quiet client nudge (one-click → later
scheduled); auto-categorisation at the smart drop-zone; template-default
engineering attachment; rejection notice with reason (semi-automated from
the decision form). Explicitly not: auto-issuing anything, auto-replying
to messages, AI assessment — assessment stays human, visibly so; it's the
product's credibility.

## 11. Ideal client portal (practical ideal; constraints ignored, bloat not)

- **Nav (8):** Dashboard · My Jobs · Messages · Lodge a Job · Downloads ·
  Guides & tools · My Details · Help. Lodge stays the only accented CTA.
- **Dashboard:** Needs-you strip first (FIR asks + rejected lodgements +
  unread replies, oldest first, inline ask + CTA) → Active jobs
  (compressed rows: address · desc · **ball-in-court chip** · since-line)
  → Ready to collect → Recent past (with permanent archive link). Stats
  compress to a 2×2 count strip that reorders so attention leads. One
  glance answers all four questions *in priority order* at any volume.
- **Lodge:** templates row ("Standard patio ▸") → address (autocomplete
  post-pilot) → class rows → smart drop-zone + buckets with named-missing
  meter → tolerant intake (any format, converted) → same success card.
  Repeat lodgement ≈ 45–60 seconds honestly counted.
- **Job detail:** status card with full timeline + plain-English state
  ("With us — certificate being written") → what you sent (incl. FIR
  answers, dated) → documents (current only) → single thread carrying
  messages *and* system events. FIR ask pinned while open; flips to
  "Answered — with us" the moment the client sends.
- **Mobile:** same order, 2×2 stats, no row timelines, thumb-sized chips.

## 12. Ideal admin portal

Queue-first home as today, plus: **Today strip** (at-risk vs 3–4-day
promise · FIR-quiet list with nudge buttons · uncollected packages) above
the intake queue; job drill-in unchanged (the board is the workbench);
Reports = throughput (fixed counters), FIR causes, client activity;
everything else stays exceptions-only (banners). No assignment, no
statuses, no parallel workflow — the board owns those.

## 13. Current vs ideal gap

Small and enumerable: §8 items 1–5 close the client gap's substance; §4's
views close the admin gap; §9's removals pay for the additions in
complexity budget. Nothing in the ideal requires new architecture, new
data, or a visual reset — which is the strongest evidence for
classification B. The two structural decisions the ideal *does* require
are product decisions, not builds: certificate permanence (§8.1) and
rejection comms (§8.8).

## 14. Top 15 recommendations (by value)

| # | Recommendation | Client benefit | CFBA benefit | Complexity | When | Rationale |
|---|---|---|---|---|---|---|
| 1 | Permanent certificate access (or archive+request) | The one thing email still does better, forever fixed | Kills resend calls; pilot comms honest | S–M | **Decision pre-pilot**, build ≤ fortnight | §2's #1 gap; storage already keeps files |
| 2 | FIR answered state (optimistic clear + flip) | Trust at the workflow's key handoff; no double-sends | Fewer "did you get it?" calls | S | **Pre-pilot** | QA-1; ball-in-court integrity |
| 3 | Tolerant intake (images/Word→PDF, any filename) | Lodge/FIR from a phone with scans; no conversion homework | Fewer abandoned lodgements + FIRs land complete | M | Pre-pilot if it fits, else first fortnight | §2's #2 gap; Cloudpermit-proven; absorbs QA-3 |
| 4 | Filename-collision suffix | No silently wrong packages | No mis-packaged jobs to unwind | S | **Pre-pilot** | QA-2 data integrity |
| 5 | Dashboard re-rank + cancelled→Past + row compression | Question #1 always first; readable at 25 jobs | Fewer status calls at volume | S | **Pre-pilot** | §3; scales the strongest surface |
| 6 | Rejection comms (portal trace + reason) | Never left believing a dead job is live | One awkward call avoided per reject | S | **Pre-pilot** (decision) | QA-4 |
| 7 | Job templates | Repeat lodgement in ~3 clicks + drag | More lodgements through the portal, all complete | M | Post-pilot early | 80%-repeat client base; parts exist |
| 8 | Admin ageing/at-risk + FIR-quiet views | Faster answers when it matters | 3–4-day promise operationalised; triage at a glance | M | Post-pilot early | Zendesk pattern on data already held |
| 9 | One-click FIR nudge (then scheduled) | Gentle reminder instead of silence | Kills the most common manual chase | S–M | Post-pilot early | TaxDome pattern; FIR Library voice |
| 10 | Self-host fonts + first-load-only cascade | Instant pages on flaky site networks | Perceived speed = perceived competence | S | **Pre-pilot** | QA-6 + Operate posture |
| 11 | A11y finish (contrast stragglers, file-input labels, skip link) | Legible on site in sunlight; SR-usable uploads | Professional floor held | S | **Pre-pilot** | QA-5/7; floor already policy |
| 12 | Nav regroup 12→8 (Guides & tools) | Less scanning, clearer map | Cheaper onboarding | S–M | Post-pilot (validate w/ usage) | §3; product logic + pilot data |
| 13 | Smart drop-zone with auto-categorise | One drag like email, sorted for you | Combine/naming quality preserved | M | Post-pilot | Beats email's last intake edge; needs usage validation |
| 14 | Lodge draft autosave | A phone call doesn't cost the form | Fewer abandoned lodgements | S | Post-pilot | Known P2 |
| 15 | Reports: fix counters + FIR-cause tally | — | Turnaround truth + checklist copy that targets real causes | S | Post-pilot | QA-11 + feedback loop |

## 15. Quick wins

#2, #4, #5, #6, #10, #11 above, plus the copy fixes ("My Jobsnow", PO echo
on received-rows, duplicate Reports heading) and Quick-Actions trim — all
S-complexity, most already evidenced in QA.

## 16. Pre-pilot recommendations

Do: #1 (decision), #2, #4, #5, #6, #10, #11 (+#3 if the window allows) —
alongside the QA report's live-path smoke, which remains the gating
condition from Session 3. Everything here is deliberately small; the pilot
should start on the current system's strengths, not wait for §8's roadmap.

## 17. Post-pilot roadmap (ordered)

Fortnight 1–2: #3 (if deferred), #7 templates, #9 nudge, #14 autosave.
Month 1–2: #8 admin views, #12 nav regroup (with usage data), #13 smart
drop-zone, #15 reports. Then the SPECS.md queue (address autocomplete,
checker, assistant, one-off public lodgement) re-prioritised against pilot
learnings. Long-term differentiators: templates + tolerant intake + the
nudge loop compound into "the certifier that's easier than email" — the
moat the NSW-portal-shaped world cannot copy.

## 18. DESIGN.md updates and rationale

DESIGN.md was rewritten this session from a Session-1 field survey into
the **definitive spec**: the 22 mandated areas are covered (product
principles including the email-replacement law and board-is-truth rule;
IA + target nav; both dashboard hierarchies; the Needs-Attention and
ball-in-court patterns; job-list/detail/RFI/document/forms/status specs;
mobile, typography — settled: keep faces, self-host; colour principles;
spacing/density; components; states; accessibility; anti-patterns
including the newly-learned ones — silent file rejection, per-row
timelines at volume, nav-duplicating tiles; responsive rules; microcopy).
Deliberately **unresolved** items are labelled as such rather than
invented: certificate-permanence option choice, filename comma, amendment
naming, motion sign-off, trust-footer wording, template interaction
detail. Rationale throughout: record decisions once, at the level future
implementation sessions actually need, and keep CURRENT-state notes
separate from PRINCIPLES so evidence never masquerades as law.

---

*No application changes were made this session. Deliverables: this report
and the rewritten DESIGN.md.*

**Research sources:**
[TaxDome client experience](https://taxdome.com/en-ca/product-client-experience) · [TaxDome client portal](https://taxdome.com/client-portal) · [TaxDome client dashboard help](https://client-help.taxdome.com/article/10-client-dashboard) · [Cloudpermit required application data](https://support.cloudpermit.com/support/solutions/articles/67000648287-how-to-complete-the-required-application-data-in-the-draft-building-permit-application) · [Cloudpermit applicant guide](https://support.cloudpermit.com/support/solutions/67000379492) · [Cloudpermit plans resubmission](https://support.cloudpermit.com/support/solutions/articles/67000729664-building-101-plans-resubmission) · [Procore: create an RFI](https://support.procore.com/products/online/user-guide/project-level/rfi/tutorials/create-an-rfi) · [Procore: respond to an RFI](https://v2.support.procore.com/product-manuals/rfi-project/tutorials/respond-to-an-rfi) · [Zendesk views explained](https://www.getmacha.com/blog/zendesk-views-explained) · [Zendesk SLA targets in views](https://www.eesel.ai/blog/zendesk-sla-targets-in-ticket-views) · [NSW Planning Portal — complying development](https://www.planningportal.nsw.gov.au/onlinecdc) · [Service NSW — apply for a CDC](https://www.service.nsw.gov.au/transaction/apply-for-a-complying-development-certificate) · [Accela building solutions](https://www.accela.com/solutions/building/) · [OpenGov building permit software](https://opengov.com/products/permitting-and-licensing/building-permit-software/)
