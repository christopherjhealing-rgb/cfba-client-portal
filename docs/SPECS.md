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

## 1. Site plan builder — status: v2 shipped 2 Aug 2026

**What.** `/site-plan` — "Site plan tool" in the sidebar. Clients draw a
dimensioned site plan good enough to lodge with: set out the lot, drop the
structures on it, print to PDF at a stated scale. Most FIRs about site plans
are missing dimensions, not bad intent — the tool makes the dimensions
unavoidable.

**Lot.** Width and depth in metres (decimals, e.g. 20.12 × 40.25), street
frontage the bottom edge, street name labelled in the frontage band.
Boundaries are always dimensioned. A rectangle is still the default and every
design saved before the cadastre existed loads as one — but the lot can now
also be the real parcel outline, fetched from Landgate: see § 7.

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

## 2. Client document library — status: shipped

"My documents" on the My details page: a per-company store for the PDFs
builders lodge again and again — standard patio engineering, shed
certification. Upload once with a label; files sit in the private Supabase
bucket under `library/<companyId>/`, indexed in `portal_settings` (no new
table, no migration). At lodgement the Engineering bucket offers the saved
documents as tick-to-attach, and anything uploaded fresh can be ticked
"save for next time". Staff manage a client's library through impersonation —
no separate admin surface. Same rules as every upload: PDF-only, size caps,
private storage, streamed through an ownership check.

## 3. Site photos at lodgement — status: shipped

An optional photos bucket on the lodgement form. Builders have the site on
their phone camera roll; certifiers want to see it. Phone JPEG/PNG photos are
accepted client-side and compiled in the browser into a single PDF, one photo
per A4 page, which then rides the normal lodgement path — so the PDF-only
pipeline, both its checks and its plumbing, is untouched.

## 4. Address autocomplete — status: shipped on lodgement 2 Aug 2026

Google Places suggestions on the lodgement form's site address
(`components/AddressField.tsx`), using the **new** Places API —
`AutocompleteSuggestion.fetchAutocompleteSuggestions` with a session token
via the dynamic bootstrap, because the legacy Autocomplete widget is closed
to Google projects created after March 2025. Restricted to country AU and
biased to Perth/WA, drawn in a portal-styled dropdown (keyboard, touch and
combobox ARIA), loaded lazily on first focus. Pure autocomplete only — no
Place Details call, no per-pick billing. Typed text stays valid exactly as
typed — new lots and unregistered addresses must never be blocked by the
suggester; picking merely fills the field, and `/api/submit` still receives
the same plain string. Needs `NEXT_PUBLIC_GOOGLE_MAPS_KEY` with **Places API
(New)** enabled on the Google project. Without the key the field silently
stays a plain input; the portal never degrades visibly for a missing
optional key. The amend form keeps its job picker (it selects an existing
job, not a fresh address) and the site plan tool's address stays a plain
label until v2 cadastre. Pure helpers in `lib/address.mjs` (+ `.d.mts`),
tested in `tests/address.test.mjs`.

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

**Underlay v2 upgrade — load the site by address.** Shipped as § 7 below: the
address is geocoded, the cadastral lot boundary comes from Landgate/SLIP and
auto-draws the true lot shape at scale (corner, battleaxe and irregular lots
included, replacing manual lot entry and calibration), and Google satellite
imagery sits beneath it as the tracing reference. Still outstanding from the
original note: SLIP aerial imagery as an alternative reference layer, and
Nearmap as a premium underlay if CFBA holds a subscription (ask owner).
Underlay layers remain browser-only and excluded from the printed sheet.

---

## 7. Automatic lot boundaries from the WA cadastre — status: built; endpoint reachable, LICENCE BLOCKED

**What.** On the site plan tool, **Find my lot** geocodes the typed address and
asks Landgate's cadastre for the parcel that contains it. The real lot outline
replaces the typed rectangle: correct shape, correct dimensions, correct
orientation, with setbacks measured to the real boundaries and the aerial photo
already lined up behind it. Corner lots, battleaxes and six-sided infill blocks
stop being squashed into a rectangle.

The rectangle is still the default and every design saved before this loads and
behaves identically — the lot record simply isn't there and `sanitiseLot`
returns the rectangle, the same pattern `sanitiseUnderlay` uses.

### ⚠ The endpoint has never been called

The session that built this had **no outbound access** to
`services.slip.wa.gov.au` or `catalogue.data.wa.gov.au` (the environment proxy
refused the CONNECT tunnel). Everything that can be proven offline is proven
offline — parsing, projection, area, north, frontage inference, edge labelling,
setbacks, caching, every failure path — over synthetic GeoJSON fixtures in
`tests/fixtures/cadastre.mjs`. **The one thing that is unproven is whether the
URL below answers.** Assume it needs correcting.

**The default endpoint:**

```
https://services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/Property_and_Planning/MapServer/6
```

**The query it builds** (ArcGIS REST layer query — `lib/cadastre-source.ts`,
`parcelQueryUrl`):

```
{CADASTRE_URL}/query
  ?geometry=<lng>,<lat>          ← ArcGIS wants x,y, so longitude first
  &geometryType=esriGeometryPoint
  &inSR=4326 &outSR=4326
  &spatialRel=esriSpatialRelIntersects
  &outFields=* &returnGeometry=true
  &returnCountOnly=false &resultRecordCount=1
  &f=geojson
  [&token=<CADASTRE_TOKEN>]      ← only for an authenticated service
```

**A good answer** is a GeoJSON `FeatureCollection` whose one feature has a
`Polygon` (or `MultiPolygon`) geometry in WGS84 and properties carrying the lot
and plan numbers. The parser also accepts **Esri JSON** (`features[].geometry.
rings` + `features[].attributes`), so a service that ignores `f=geojson` still
works — that path is tested.

**How to correct it in minutes.** Open Landgate's service directory in a
browser and find the cadastre layer, then set `CADASTRE_URL` to the layer URL
(the one ending in a number) in Vercel and redeploy:

1. Browse `https://services.slip.wa.gov.au/public/rest/services` and look
   under the Property/Planning or Cadastre folders for a layer named along the
   lines of "Cadastre — Land Parcels" / "Property Boundaries".
2. Confirm it by pasting the built query into a browser with a known Perth
   point — e.g. `geometry=115.8613,-31.9505` — and checking a polygon comes
   back.
3. If the service is WFS rather than ArcGIS REST, or needs a different query
   shape, `parcelQueryUrl` in `lib/cadastre-source.ts` is the only function
   that has to change; nothing downstream of it knows or cares.
4. Then `CADASTRE_ENABLED=1` and redeploy. Env changes never apply to an
   existing deployment.

Symptoms of a wrong URL: the client always sees the "couldn't find this lot"
message, and the server log shows `cadastre upstream 404` or
`cadastre upstream returned non-JSON — check CADASTRE_URL`.

**Attribute names.** `parseParcel` reads the lot and plan numbers from a
candidate list of spellings (`lot_number`, `survey_lot_no`, `cad_lot_number`,
…) case-insensitively. If the live service uses another spelling, add it to
`LOT_KEYS` / `PLAN_KEYS` / `ADDRESS_KEYS` in `lib/cadastre.mjs`. Getting this
wrong costs the "Lot 214 on Plan 78123" line on the sheet and nothing else —
never the boundary itself.

### The route

`app/api/cadastre/route.ts`, GET, `?lat=&lng=`. Signed-in clients only
(`getClientSession`, 401 otherwise), same as every other client API. It takes
**only two numbers**, both validated against Western Australia's bounding box —
never a URL, never a host, never a query — and the upstream host is pinned in
`lib/cadastre-source.ts`, so the route can never become an SSRF relay. The
response is hard-whitelisted: `{ found, cached, lot: { ring, lotId, address,
source, fetched } }` and nothing else. None of the service's other attributes
leave the server.

Only 401 (signed out) and 400 (not a WA coordinate) are errors. Every upstream
outcome is a 200 with `found: false` and a reason — `unconfigured`,
`not-found`, `timeout`, `upstream`, `network` — because not finding a lot is an
ordinary thing, not a fault.

### Caching

Every result goes into `portal_settings` (no table, no migration) under
`cadastre:<lat>,<lng>` rounded to five decimal places — about a metre, so one
address is one lookup forever, whoever asks. The cache is checked before the
upstream call, always. A found lot is kept indefinitely: boundaries don't move.
A miss is kept for **14 days** and then re-tried, because a new estate does
eventually reach the cadastre. A failed cache write costs another lookup later
and never costs the client the boundary just found.

### Frontage, north and the aerial

The cadastre records parcels, not frontages, so the street boundary is
inferred, in this order (`inferFrontage`):

1. **An access leg.** A battleaxe meets the road across the end of its
   driveway and nowhere else, and a driveway is unmistakable: a short edge
   (≤ 8 m) closing a neck whose two sides run antiparallel and are ≥ 4× longer.
   A splayed corner truncation looks similar and is excluded — its neighbours
   meet at a right angle, not head on.
2. **Which way the address point lies** from the middle of the lot, matched
   against each boundary's outward normal. Direction, not distance: on a
   12.5 m wide block a roof point 8 m back from the front is *nearer the side
   fence* than the front boundary, so "nearest edge" gets the commonest lot in
   Perth wrong.
3. **The shortest boundary**, when the address point is missing or sits on the
   middle of the lot.

**Tapping any boundary on the plan overrules it**, and the whole sheet
re-derives: the parcel is laid out again from its own ground ring so the new
frontage runs along the bottom, north follows, and the labels change with it.

**North is derived, not set.** Putting the frontage along the bottom of the
sheet fixes the sheet's bearing exactly, so the north arrow is a real bearing
rather than a 45° step. The hand rotation is hidden while a cadastre lot is
loaded — turning it by hand could only put it out.

**The aerial then lines itself up.** The parcel gives one point whose latitude
and longitude are known exactly and whose position on the drawing is known
exactly (`ringToPlan` returns it as `anchor`), and north comes from the same
parcel. The photo lands on the lot with no dragging. The nudge controls stay
for the cases where the cadastre itself is the thing that's out.

**Edge labelling.** Four-sided lots get Front / Side / Rear / Side reckoned
from the frontage. Anything else is numbered round from the front — "rear" on a
six-sided block means nothing and guessing would be worse than counting. Every
boundary carries its length on the plan and in the sidebar.

### Accuracy — the part that isn't negotiable

Cadastral boundaries are **indicative**. In parts of Perth they sit a metre or
more off the surveyed pegs, and this plan feeds building permit applications
where 900 mm decides the answer. Therefore:

- The printed sheet carries a **Lot boundary** row naming the source and the
  date it was retrieved, and the footer becomes: *"Prepared by the applicant
  using the CFBA plan tool. The lot boundary is taken from {source} on {date}:
  cadastral boundaries are indicative and can sit a metre or more from the
  surveyed pegs. Structures, dimensions and the nominated frontage are as
  entered by the applicant. Not a certified document and not a survey."* The
  old wording is unchanged when no cadastre lot is loaded.
- On screen, in the portal's voice: *"Boundaries from the State's cadastre are
  indicative — the shape is right, but they can sit a metre or so off the pegs.
  Check anything tight against your survey."*
- **The tool still only measures.** No setback derived from the cadastre is
  ever presented as a compliance verdict, here or anywhere else.
- The aerial underlay still never reaches printed output. Both existing
  guards stay: it is off the printed sheet's ancestor path, and
  `.cfba-underlay` is struck out explicitly in the print stylesheet.

### The fallback is a main path

New subdivisions are a large share of CFBA's work and are routinely missing
from the cadastre. Every failure — not found, timeout, service down, no
credentials configured, geocode miss — lands in the same place: the aerial
photo is already down and unlocked for tracing, the dimension fields are still
there, and the message is *"We couldn't find this lot on the State's records
yet — you can trace it over the aerial photo, or type the dimensions in."*
Nothing about the tool is worse than it was before this feature existed.

### Where things live

| | |
|---|---|
| Pure geometry, parsing, projection, frontage | `lib/cadastre.mjs` + `.d.mts` |
| Lot model, edges, labels, polygon setbacks | `lib/site-plan.mjs` + `.d.mts` |
| **The only module that opens a socket** | `lib/cadastre-source.ts` |
| Route, auth, validation, cache | `app/api/cadastre/route.ts` |
| Canvas, tapping, sidebar, sheet | `components/SitePlanBuilder.tsx` |
| Fixtures (suburban, corner, battleaxe, 6-sided, Esri, multipart) | `tests/fixtures/cadastre.mjs` |
| Tests | `tests/cadastre.test.mjs`, `tests/site-plan.test.mjs` |

`CADASTRE_FIXTURE` points `fetchParcel` at a local JSON file instead of
Landgate, **demo mode only** (it is unreachable once Supabase is configured).
That is the seam the success path was driven through in a browser without
network access to the State.

**Backlog:** a "trace the boundary yourself" mode that produces the same
polygon lot without the cadastre (the model already supports it — a lot with
no ground ring keeps its shape and only re-labels); easements and sewer
alignments as a second overlay; a true-scale PDF export so the stated scale
doesn't depend on the print dialog being left at 100%.

---

## One-off public lodgement (planned)

A no-login flow for private/homeowner jobs, reusing the existing pipeline.
Access via signed magic links emailed at each touchpoint (lodged / FIR /
issued) — no accounts, no passwords. Abuse controls are the new work: email
verification before the form unlocks, captcha, per-IP throttles, and one-offs
land in the REVIEW QUEUE (not auto-accept) so nothing anonymous reaches the
Monday board unreviewed. Optional upfront payment via Stripe for homeowner
jobs (builders remain invoiced). Decisions for the owner: which job classes to
accept, pricing display, pay-at-lodgement or invoice. ~2 sessions; +1-2 with
payment.

---

## 8. The board's PORTAL column — status: shipped 3 Aug 2026

**What.** Monday column `color_mm5w73hm` ("PORTAL") answers one question —
where is this job up to in the client portal? — and that is a question only the
portal can answer, so **the portal writes all of it**. Nothing is a manual
step: a column somebody has to remember to update is a column that goes stale
and then gets ignored.

It replaced the earlier `Send?` / `Job Sent` pair, which mixed the office's own
pre-flight flag in with the portal's progress and needed a human to move the
first rung. Neither of those columns is written to any more.

**The rungs.**

| Label | Written when | Written by |
|---|---|---|
| `ISSUED` | the sync sees the card at Status = Issued and picks it up | `lib/sync.ts` |
| `READY` | the portal HAS the files **and** the client has been emailed | `lib/sync.ts` |
| `DOWNLOADED` | the client actually downloads it | `app/api/jobs/[ref]/download` |
| `STUCK` | see below | `lib/sync.ts` |

The gap between ISSUED and READY is the point. It is exactly where job 56733
sat for a night: the card said issued, the files were in the folder, and
nothing anywhere said the client still couldn't get them.

**STUCK is not a rung.** It is a flag that replaces whatever rung a job had
reached, and — alone among these labels — it is **reversible**: when the
problem clears, the portal writes the rung the job should be at, which is why
`portalColumnWrite` allows STUCK → anything. Three things set it:

- **immediately** when the ready email fails (the files are downloadable and
  the client has no idea, and that email never retries);
- **immediately** when the sync can't read a card at all — a locked or
  unreadable file in the Issued folder;
- **after `PORTAL_STUCK_AFTER_MINUTES`** (default 45) when a card is issued and
  the portal still has no files. The threshold has to clear BOTH ordinary waits
  — `ISSUE_HOLD_MINUTES` and the 5-minute OneDrive settle window — or normal
  jobs get flagged on their way through.

It is never written over `DOWNLOADED`: nothing is stuck once the client has it.

**Rules.** Forward only otherwise — never rewrites a rung reached, never drags
a card back, and leaves a label that isn't on the ladder alone (somebody put it
there on purpose). `create_labels_if_missing` stays off, so a label the board
doesn't carry fails loudly in the admin banner and the evening report rather
than appearing on a 3,800-item board unasked.

**Where.** `lib/core.mjs` (`portalLadder`, `portalRank`, `portalColumnWrite`),
`lib/monday.ts` (`markIssued`, `markReady`, `markDownloaded`, `markStuck`),
`lib/env.ts` for the column id and the four overridable label spellings.

## 9. General enquiry channel — status: shipped 2 Aug 2026

**What.** A client with a question that isn't about a job — a quote, a fee,
"do I even need a CDC for this?" — had nowhere in the portal to put it. It
came by phone, as an interruption, and left no record.

**How.** Every message hangs off a job reference, so the enquiry thread gets a
reserved one: `GENERAL` (`lib/core.mjs`). Board references are one optional
letter and 3–6 digits, so nothing a client owns can collide with it, and no
schema changed to make room. There is a test that fails if that ref shape ever
widens far enough to matter.

**Client side.** An Enquiry thread pinned to the bottom of My Messages,
present whether or not it has anything in it, plus a way in from Help. Asks
for a one-line subject as well as the message — "something else" arriving with
no subject is what makes a shared inbox unusable — and takes the same PDF
attachments as a job reply.

**Office side.** `/admin/enquiries` lists every conversation, unanswered
first. Replying writes into the client's thread and emails them. Nothing
touches the board, because there is no card to touch; if an enquiry turns out
to be real work, the answer is "lodge it".

**Backstops.** An enquiry has no card and no sync, so the notification email
is the only thing that says one arrived. It is saved and listed regardless of
whether that email sends, the admin dashboard carries a count of what's
waiting, and the evening report names it. A staff reply that saves but doesn't
email says so instead of showing a tick.

---

## 10. The evening report — status: shipped 2 Aug 2026, OFF until switched on

**What.** Everything else in this portal reacts to something happening. This
is the one thing that looks for something that should have happened and
didn't — the job that never reaches the client, which is the only failure here
that costs somebody a week and never announces itself.

**When.** 5pm Perth on weekdays (`0 9 * * 1-5` UTC, in `vercel.json`), to
`OFFICE_EMAIL`. Off until `DAILY_REPORT_ENABLED=1`.

**What it says**, worst first:

1. The sync itself, if it isn't running — before anything else, because
   everything below is only as current as the last run.
2. Lodged, but not on the board — auto-accept couldn't reach Monday, so the
   job is in the review queue while the client believes it's with us.
3. Issued on the board, no files in the portal.
4. In the portal, but the ready email never sent (it doesn't retry).
5. Ready for a few days and still not opened — how a dead email address shows
   up.
6. Board writes Monday wouldn't take.
7. Enquiries waiting on an answer.

A clean day still sends, two lines: a quiet day has to look quiet rather than
look like the report stopped working.

**Memory.** A sync result lives for one run and the failure it describes can
last a week, so the things that should have happened and didn't persist in one
`portal_settings` row (`watch`), clearing themselves when the client
downloads. Anything older than three weeks is counted rather than named, and
the report says how many — a short report must never be a quiet lie.

**Where.** `lib/watchdog.ts` builds it, `lib/mail.ts` renders it,
`app/api/report/route.ts` sends it. GET previews (`?html=1` renders the actual
email), POST sends — a staff member refreshing a page must never put email in
somebody's inbox. `components/DailyReportCard.tsx` puts all of it on `/admin`.
