# DESIGN.md — CFBA Client Portal design source of truth

**Read this file before doing any design or UI work on this repository.**
It is the persistent design authority across Claude Code sessions. The
`frontend-design` and `impeccable` skills vendored in `.claude/skills/` and
`.agents/skills/` should both be applied *through* this document: where a
generic skill heuristic conflicts with a principle recorded here, this file
wins; where this file is silent, the skills fill the gap.

This document deliberately separates two kinds of content:

- **PRINCIPLE** — enduring requirements. Changing these needs the owner's
  agreement (final design direction is to be settled in "Session 4" of the
  pre-pilot plan).
- **CURRENT** — what the implementation does today, recorded so sessions
  don't re-derive it. Current state is *evidence, not law*: it may be
  improved, but improvements must not contradict a PRINCIPLE.

Status: created during the Session 1 pre-pilot audit (Aug 2026). A prior
product review lives at `docs/UX-REVIEW.md` (20 findings, nearly all shipped
2026-08-02); read it before re-raising anything it already settled or parked.

---

## 1. Product character — PRINCIPLE

The portal must read as:

- professional · calm · competent · clear · efficient · trustworthy
- **quietly premium** — craft in details, never showiness
- appropriate for Australian builders, designers and construction
  professionals (patio/shed/carport/pool trades in Perth, WA)
- practical rather than decorative

This is an **Operate-mode** product (a tool people work in), not a marketing
surface. Familiarity is a feature; the tool should disappear into the task.
Density is welcome when it improves clarity.

## 2. Avoid — PRINCIPLE

- generic AI-generated SaaS appearance (cream + serif + terracotta; black +
  acid accent; hairline broadsheet — the recognised template looks)
- gratuitous gradients; decorative glass/blur
- excessive cards, nested cards, excessive rounded containers
- decorative clutter; gimmicky animation; consumer-app playfulness
- design choices that reduce information density without improving clarity
- kickers/eyebrows that merely decorate a heading; numbered section markers
  where order carries no information
- emoji standing in for icons (icons are drawn, one stroke style — see
  `components/Icon.tsx`)
- **muted text below the contrast floor** — see §16; this was systematically
  fixed in Aug 2026 and must not regress

## 3. Primary client questions — PRINCIPLE

A client must rapidly answer, in this order:

1. **What needs my attention?** → dashboard: amber "Action Required" stat +
   section with the FIR request text inline, oldest-first
2. **What is happening with my jobs?** → dashboard sections + 5-stage
   timeline on every job; My Jobs with filter chips, sort, `?q=` search
3. **How do I lodge another job?** → "Lodge a Job" is the sidebar's only
   accented CTA and repeats in the hero and Quick Actions
4. **How do I find a previous job/certificate?** → Past Jobs section,
   Downloads page, sidebar search (see the retention caveat in §12)

Any redesign must keep these four answers at most one glance / one click
from landing.

## 4. Core UX principle — PRINCIPLE

**The portal must not merely transfer CFBA's administration burden to the
client.** For every major workflow the test is: *"Is this faster, easier or
more useful than emailing CFBA?"* Current verdicts (Session 1 audit):

| Flow | vs email | Why |
|---|---|---|
| Lodge | **Better** | instant confirmation, lands on board unaided, tidy combined PDFs, no re-keying |
| Follow progress | **Better** | live status + timeline vs "just checking in" emails |
| Answer an FIR | **Better** | categorised buckets, combined+dated files, board moves off FIR automatically |
| Collect certificate | **Better** | instant zip, one click, receipt recorded |
| Old certificate (>3 months) | **Worse — known gap** | files hidden after retention; client must ring/email (§12, audit P1) |

## 5. Stack & surfaces — CURRENT

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind · Vercel.
Three visual surfaces, one token family:

- **Client portal** — sidebar shell (`components/AppShell.tsx`), photo heroes
- **Staff console** — top-nav shell (`components/StaffShell.tsx`), denser, no heroes
- **Site Plan Studio** — separately themed under `.studio-chrome`
  (`app/globals.css`); deliberately carries no CFBA identity. See `docs/STUDIO.md`.

## 6. Navigation — CURRENT

- Client: dark seal sidebar; 12 items + search field (`/jobs?q=`) + collapse.
  Item count was reviewed and **deliberately parked** until real usage data
  (UX-REVIEW #6). Unread badge on My Messages. No header bar exists.
- Staff: 8-item uppercase top nav (Queue, Clients, Enquiries, Amendments,
  FIR Library, Records, Content, Settings); occasional pages (Reports, Audit,
  Email Log) hang off Queue as ghost buttons.

## 7. Typography — CURRENT (faces are an OPEN DECISION, §17)

- **Archivo** (display): headings, buttons, labels, chips — weight 500–700
- **Inter** (body): everything else
- **IBM Plex Mono**: refs (`T-1003`), counts, codes, dates-in-tables
- Loaded from Google Fonts in `globals.css`.
- Scale in use (px): 30/26 page titles · 21 card titles · 15–17 row titles ·
  13–14 body/meta · 10–12 caps-labels & chips. Tight tracked-caps labels
  (`.label`, `.sectionhead`, buttons) are the house signature; button
  tracking relaxes below `lg` to fit phones.
- Numerals: `tabular-nums` on stats and table cells — keep.

## 8. Colour — CURRENT tokens (tailwind.config.ts)

| Token | Hex | Role |
|---|---|---|
| `seal` / `seal-2` / `seal-deep` | `#1E5B3C` / `#2E7D5B` / `#123A26` | brand green: primary actions, done-states, sidebar |
| `brass` / `brass-deep` | `#B07A18` / `#8A5E10` | action-required / waiting-on-client; deep = readable text step |
| `flag` | `#A6222E` | errors, failures only |
| `ink` | `#101A15` | text |
| `paper` / `wash` | `#EEF0EA` / `#F5F7F3` | page ground / panel tint |
| `rule` | `#D3D8D1` | borders |

Semantic meanings are stable: **seal = good/ready, brass = needs a human,
flag = wrong**. Amber pulse (`chippulse`) is reserved for action-required
chips — the one element allowed to tug the eye.

**Known debt:** ~a dozen soft-tint hexes live inline (`#FCF7EC`, `#E4C98A`,
`#F6EEDA`, `#FBECEC`, `#EDF3EE`, `#FBF4E6`, `#E9D7AC`, `#0D211A`…). They are
consistent in use but should graduate to named tokens (audit P3).

## 9. Spacing & layout — CURRENT

- Content max-widths: staff 1100px; client shell content region with
  9-unit gutters at `lg`. Cards: `rounded-xl` (12–16px), single elevation
  declaration (border + very soft shadow — do not stack heavy borders and
  shadows). Chips/pills only on small controls.
- Lists are cards with `divide-y divide-rule`, not per-row cards.
- Section rhythm: `.sectionhead` (tracked caps title · hairline · count or
  action link) separates every section on both shells. This is **the** house
  section pattern — never hand-roll a variant (drift was consolidated Aug 2026).

## 10. Components — CURRENT (globals.css + components/)

`\.btn` (seal, tracked caps) · `.btn-ghost` · `.field` (+ seal caret, ink/60
placeholder) · `.label` · `.card` · `.chip` (+`-seal`/`-brass`/`-flag`) ·
`.stat`/`.stat-num` · `.sectionhead` · `.th`/`.td` · `.panel-amber` ·
`.empty` (dashed, shared by both shells) · `.eyebrow` · `.hero-photo`.

Key React components: `AppShell`/`StaffShell`, `SectionHead` (+`action`),
`JobDesc`, `LodgedLine`, `JobTimeline` (5 stages, horizontal ≥lg / vertical
below), `JobArt`, `FileBucket` (+`combinedAs` filed-as preview),
`FirResponseBox`, `AdminSnapshot`, `EmptyState`, `Icon` (single stroke
family). Reuse these before inventing anything.

## 11. Status vocabulary — CURRENT (lib/core.mjs is authoritative)

- **Monday Status** (assessment truth): To Assess → To Check → To CDC →
  Issued; FIR (client's move); FIR-ENG / SCL (in-house waits — never shown
  as the client's fault); Cancelled; paused states.
- **Client timeline** (5 stages): Received → Under assessment → Further
  information → Certificate being prepared → Issued. "Issued" is only
  ticked when files are actually downloadable (`effectiveStageIndex`).
- **PORTAL column** (board, portal-written): LODGED → ISSUED → READY →
  DOWNLOADED (+ STUCK watchdog).
- Client-facing FIR language is **"Action required — see the request"** —
  one name per state (UX-REVIEW #8); never reintroduce synonyms.

## 12. Files, uploads & retention — CURRENT

- PDF-only, validated server-side; lodgement 40 MB, message 25 MB.
- Drawings/engineering are **combined and renamed** at lodgement:
  `Site Plan and Elevations - <street suburb>.pdf`, `Engineering - …`;
  FIR responses add ` - <d Mon yyyy>` (Perth date). Naming lives in
  `lib/uploads.mjs` — UI preview and server share it so the preview can
  never lie. "Other" documents keep client names.
- Certificate-of-title / BA1 uploads are silently filtered (`UNNEEDED`).
- Retention: jobs hide from clients 3 months after first download
  (`RETENTION_MONTHS`); stored files are **not** purged (runbook known
  issue). Long-term certificate access is an unresolved product decision
  (§17 / audit P1).

## 13. RFI (FIR) experience — CURRENT

Amber banner + "Reply now →" anchor; the request text shown in full on
dashboard and job page; categorised reply buckets with filed-as preview;
send moves the card off FIR before the office email goes; office email
carries the attachments. SharePoint "replace & supersede" filing exists
behind `RECORD_TO_FOLDER`.

## 14. Responsive & mobile — CURRENT

Pivot at `lg` (sidebar → drawer, timeline → vertical, button tracking
relaxes). Heroes: shorter bands + 900px `-m` crops below `md` via CSS custom
properties. PWA manifest, no service worker **on purpose** (status must
never be stale). Test at 390px + desktop minimum.

## 15. Motion — CURRENT (quantity is an OPEN DECISION, §17)

Three CSS-only layers in `globals.css`: page/section cascade-in, hover
lifts/nudges, press feedback; amber chip pulse. All fully disabled under
`prefers-reduced-motion`. 150–250ms, ease-out. Never add motion that only
decorates; state feedback only.

## 16. Accessibility — PRINCIPLE + CURRENT

- **Contrast floor:** body/muted text ≥ 4.5:1. House rule: **never set text
  lighter than `ink/60` on light surfaces** (swept portal-wide Aug 2026).
- Themed `:focus-visible` (seal outline), `::selection`, caret.
- `sr-only` state text on the timeline; labelled controls; keyboard-visible
  focus everywhere.
- Gaps (audit): no skip-link; no automated axe pass yet (Session 3).

## 17. Voice & copy — PRINCIPLE (observed and to be preserved)

Plain Australian English, first person plural, calm and specific. Controls
name their action; errors name the problem *and the recovery*, and never
apologise vaguely ("Those files come to more than 40 MB all up — email the
biggest ones…"). Office phone 1300 029 074 appears as the human fallback in
dead ends. States speak from the client's side ("With you since…", "We need
something from you"). Keep this voice in every new string. (Debt: phone /
office email are string literals scattered ~15 places — centralise, audit P3.)

## 18. Admin interface — CURRENT

Same tokens, denser, no heroes. Parity rules: shared `.sectionhead`-style
headers, shared `.empty`, same contrast floor (swept Aug 2026). The Queue
page is the morning surface: banners (email failures, evening report, sync
health, enquiries) → Ready/FIR/Downloaded snapshots → review queue.

## 19. Unresolved design decisions — OPEN (settle in Session 4)

1. **Typeface identity** — Inter is flagged "common" by detectors; owner has
   not chosen between keeping (familiarity-as-feature) or a more distinctive
   body face.
2. **Motion quantity** — current "portal breathes" layers vs a quieter
   Operate posture. Owner leaning keep; not confirmed.
3. **File-name comma** — `32 Elvira Street Palmyra` (storage-safe) vs
   restoring the comma; owner review pending.
4. **Amendment uploads** — keep client's own filenames (current, on purpose)
   or extend combine-and-rename.
5. **Inline tint hexes → tokens** (§8 debt).
6. **Nav regrouping** (12 items) — parked for usage data.
7. **Long-term certificate access** after retention (§12).
8. **Trust footer** — parked on approved privacy wording (UX-REVIEW #17).

## 20. Change log

- **2026-08 (Session 1 audit):** file created. Recorded current system and
  the Aug-2026 craft passes (contrast floor sweep, section-head/empty
  consolidation, dashboard polish, admin parity sweep — PRs #31–#34).
