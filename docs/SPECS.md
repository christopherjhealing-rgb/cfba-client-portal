# Feature specs

The permanent register of portal features beyond the v11 core. One section per
feature: what it does, how it works, where it stands. When a feature moves,
update its status line and keep the spec matching what actually shipped — this
file is the source of truth a future session starts from.

Two lines hold across everything below, same as CLAUDE.md: the portal never
becomes the system of record (Monday stays that), and no tool on the client
side ever renders a compliance verdict. Tools measure, list, fetch and explain;
assessment judges.

---

## 1. Site plan builder — status: v1 framework shipped

**What.** `/site-plan` — "Site plan tool" in the sidebar. Clients draw a
dimensioned site plan good enough to lodge with: set out the lot, drop the
structures on it, print to PDF at a stated scale. Most FIRs about site plans
are missing dimensions, not bad intent — the tool makes the dimensions
unavoidable.

**Lot.** Rectangular lots only in v1. Width and depth in metres (decimals,
e.g. 20.12 × 40.25), street frontage always the bottom edge, street name
labelled in the frontage band. Boundaries are always dimensioned.

**Structures.** Six presets — Dwelling 15 × 10, Patio 6 × 4, Shed 3 × 3,
Pool 8 × 4, Carport 6 × 3, Retaining wall 10 × 0.3 — added by a click, then
edited: label, width and depth in metres, dragged into place (pointer events,
works with a thumb on a phone), nudged with arrow keys (0.1 m, Shift for 1 m),
deleted. Every structure shows its dimensions; the selected one also shows
dashed setback lines to all four boundaries, distances to two decimal places.
Setbacks are measurements, nothing more — the tool never says whether one is
acceptable.

**Sheet furniture.** North arrow rotatable in 45° steps, scale bar, and on
print a title block: site address, lot dimensions, date, and the fixed footer
"Prepared by the applicant using the CFBA plan tool — boundaries and
dimensions as entered by the applicant. Not a certified document." No CFBA
logo on the sheet — the applicant prepared it, and it must not look certified.

**Scale.** Print / save as PDF goes through `window.print()` with a print
stylesheet that renders only the plan sheet. The drawing is sized in real
millimetres at the nearest standard scale (1:100, 1:200 or 1:500) that fits
A4 portrait with the title block; the chosen scale is stated on the sheet and
on screen. A lot too big for A4 at 1:500 prints reduced-to-fit and the sheet
says so instead of claiming a scale it doesn't have.

**Saving.** Designs autosave to `localStorage`, keyed per company and per
site address, with a last-used pointer so the plan you left is the plan you
come back to. Nothing is uploaded in v1.

**Where things live.** Pure geometry (metres↔paper scaling, setbacks,
fitting-scale selection, clamping, presets) is `lib/site-plan.mjs` +
`lib/site-plan.d.mts`, plain ESM on the `core.mjs` pattern, unit-tested in
`tests/site-plan.test.mjs`. The interactive canvas is
`components/SitePlanBuilder.tsx`; the gated page is `app/site-plan/page.tsx`.
The page is toggleable from /admin (`sitePlan` key) like the other sections,
so it can be hidden while it matures.

**v2 backlog, roughly in order:** resize handles on the canvas (today you
type the size), structure rotation, irregular and corner lots (second
frontage), marking existing structures vs proposed, easement/septic overlays,
a true-scale PDF export (jsPDF) so scale doesn't depend on the browser's
print dialog being left at 100%, and attaching the exported plan straight
into a lodgement.

---

## 2. Client document library — status: building

"My documents" on the My details page: a per-company store for the PDFs
builders lodge again and again — standard patio engineering, shed
certification. Upload once with a label; files sit in the private Supabase
bucket under `library/<companyId>/`, indexed in `portal_settings` (no new
table, no migration). At lodgement the Engineering bucket offers the saved
documents as tick-to-attach, and anything uploaded fresh can be ticked
"save for next time". Staff manage a client's library through impersonation —
no separate admin surface. Same rules as every upload: PDF-only, size caps,
private storage, streamed through an ownership check.

## 3. Site photos at lodgement — status: building

An optional photos bucket on the lodgement form. Builders have the site on
their phone camera roll; certifiers want to see it. Phone JPEG/PNG photos are
accepted client-side and compiled in the browser into a single PDF, one photo
per A4 page, which then rides the normal lodgement path — so the PDF-only
pipeline, both its checks and its plumbing, is untouched.

## 4. Address autocomplete — status: planned

Google Places autocomplete on address fields (lodgement first). Needs
`NEXT_PUBLIC_GOOGLE_MAPS_KEY`; restricted to country AU. Typed text stays
valid exactly as typed — new lots and unregistered addresses must never be
blocked by the suggester. Without the key the field silently stays a plain
input; the portal never degrades visibly for a missing optional key.

## 5. AI document checker — status: planned

After a Class 10 lodgement, a background job reads the lodged documents
against our requirements checklist using the Claude API and posts what it
found as a Monday update on the card — **unprefixed**, so it stays internal
(only `FIR:`/`CLIENT:` updates reach clients, see `lib/sync.ts`), including a
draft `FIR:` text staff can copy if they agree with it. It drafts, staff
decide; it never sends anything to a client on its own, and its output is
advice to us, never a verdict shown to anyone. Needs `ANTHROPIC_API_KEY`.
Absent key = feature off, silently.

## 6. Guidance assistant — status: planned

A chat that answers questions **only from the 14 published guidance notes**,
with citations to the note and section it drew from, and explains
dependencies between requirements ("the setback in note 3 depends on the wall
height in note 7"). It refuses to render compliance verdicts — "does my shed
comply" gets the relevant note passages and a handoff, not a yes or no — and
anything beyond the notes hands off to portal messages, where a person
answers. No browsing, no other sources, no memory of other clients.

### Site plan builder — v2 additions (agreed 2 Aug 2026)

**Underlay tracing.** Load an aerial screenshot or photo/scan of existing plans
as a semi-transparent layer under the drawing; calibrate once by ruling a line
over any known dimension and typing its true length; trace/place over it. The
underlay never uploads (browser-only) and is excluded from the printed sheet by
construction — which also keeps licensed aerial imagery out of lodged
documents. ~1 session.

**Generated elevations.** Structures gain wall height, roof type
(flat/gable/skillion) and pitch; the tool draws schematic front and side
elevations satisfying guidance note 05 by construction: overall height from
NGL, clearance under beam, pitch stated as a figure, post positions, ground
line and FFL. Parametric preset structures only — never traced dwellings or
complex designs. Same applicant-authored footer; measures, never judges.
~1-2 sessions.

**Underlay v2 upgrade — load the site by address (agreed).** Rather than
screenshots: geocode the entered address, then pull the underlay from mapping
services directly. Preferred source: Landgate/SLIP public services — the
cadastral lot boundary (auto-draws the true lot shape at scale, including
corner and irregular lots, replacing manual lot entry and calibration) with
SLIP aerial imagery as an optional reference layer beneath. Google satellite
only as fallback (licence-grey for tracing); Nearmap as premium underlay if
CFBA holds a subscription (ask owner). Underlay layers remain browser-only and
excluded from the printed sheet.
