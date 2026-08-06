# Site Plan Studio — handoff

A standalone site-plan drawing tool that lives in this repo but is a **separate
product** from the CF Building Approvals client portal. Continue studio work in
its own chat/session; point it at this file first.

## The one rule that must never be broken

A registered building surveyor must not be involved in the **design** of the
projects they certify. So the studio is kept independent of CFBA in name and
mechanism, and must stay that way:

- **No CFBA name, contact, or branding** anywhere the user can see it — page
  copy, header, footer, tab title, add-to-home-screen name, social preview,
  cookie name. (`app/studio/*`, `components/Studio*`, and the metadata
  override in `app/studio/layout.tsx` all exist to hold this line.)
- **No shared identity.** `studioIdentity()` in `lib/studio.ts` must never
  consult the portal session (`getClientSession`). Studio accounts only.
- Do not re-add a "sign in with your CFBA portal login" shortcut. It was
  removed on purpose.

The printed A4 sheet from the builder already carries no CFBA branding — keep
it that way for the studio.

## Where it lives

| Piece | File |
|---|---|
| Accounts, sessions, saved designs | `lib/studio.ts` |
| Front door (signup / signin) | `app/studio/page.tsx`, `components/StudioAuth.tsx` |
| Chrome (header/footer/metadata) | `app/studio/layout.tsx` |
| Saved-plans home | `app/studio/designs/page.tsx`, `components/StudioDesigns.tsx` |
| Editor wrapper | `app/studio/designs/[id]/page.tsx`, `components/StudioEditor.tsx` |
| The drawing tool itself (shared with the portal) | `components/SitePlanBuilder.tsx` |
| API | `app/api/studio/**` |
| Own-domain routing | `proxy.ts` (behind `STUDIO_HOST`) |

Storage is the `portal_settings` k/v store (no migration): `studio_user:<email>`,
`studio_designs:<owner>`, `studio_design:<owner>:<id>`. Owner is always
`u:<email>`.

The builder takes an optional `store: DesignStore` prop. The studio passes its
API-backed store (`StudioEditor`); the portal passes nothing and keeps its
localStorage behaviour. **Don't change the builder in a way that only suits one
surface** — both use it.

## Done

- Stage A: standalone shell, open signup, saved designs (list / open /
  duplicate / rename / delete), server-side per account.
- Full CoI separation (portal-login door removed, all CFBA branding stripped).
- Own-domain support via `STUDIO_HOST` + `proxy.ts` (serves the studio at
  clean paths on its own host).
- **Stage C — parametric patio.** A patio takes a roof (flat / skillion /
  gable) with a pitch and a fall direction, posts per side at a set height,
  downpipes (with a one-per-12 m-of-gutter guide), and a soakwell sized off
  its roof area (`lib/soakwell.mjs`, City of Bayswater figures). All drawn on
  the plan and the sheet. Geometry is pure and tested in `lib/site-plan.mjs`
  (`sanitisePatio`, `patioColumns`, `patioGutter`, `downpipesNeeded`,
  `patioRoofHeights`).
- **Stage D — generated elevations.** Each configured patio prints an extra
  A4 sheet after the plan: front + side elevations, dimensioned, the slope
  shown as a rake in the view it runs across and the dwelling wall drawn where
  it attaches (`patioElevationProfile`, tested). The print set is now a
  `#site-plan-print` wrapper of `.cfba-sheet` pages.

### The CoI gate on C/D (important)

The patio tooling and its elevations are **studio only**, behind a new
`patioTools` prop on `SitePlanBuilder` that **only `StudioEditor` passes**. The
certifier's client portal (`app/site-plan/page.tsx`) must never turn it on —
that page's own rule is "no compliance wording in the builder", and soakwell
sizing / a downpipe rule is design help a surveyor must not be seen to give for
what they certify. The tool still only measures and offers; it never judges.

## Next (stage B, agreed with Chris)

- **B — house-plan trace underlay.** Let the user upload a PDF or image of
  their house plans and place/scale/rotate/pin it as a second trace-over
  underlay beside the aerial. Render PDFs with `pdfjs-dist`. The aerial
  underlay plumbing in `SitePlanBuilder` (`Underlay`, `underlay*` helpers) is
  the pattern to extend. Two decisions still open: the render approach (draw
  the PDF page to a bitmap client-side so no PDF is stored), and where the
  bitmap lives — a design is capped at 512 KB (`MAX_DESIGN_BYTES`), so either a
  downscaled bitmap in a separate k/v key (`studio_underlay:<owner>:<id>`) or a
  private Supabase bucket + streamed upload API. A house plan has no inherent
  scale, so it also needs a "set scale" gesture (draw a line, type its length).

## Open follow-ups

- **Password reset for studio accounts** — portal accounts have it; studio
  accounts don't yet. Add reset-by-email (the mail plumbing exists). Do this
  before any public launch.
- **Indexing.** The studio inherits the portal's `robots: noindex`. It's a
  public lead-gen tool, so it probably *wants* to be indexed — a deliberate
  decision once the real domain is live.
- **`manifest.json`** still names CFBA; a studio-specific manifest would
  finish the metadata separation (minor).
- **Shared backend.** Accounts/designs sit in the portal's Supabase settings
  store. Invisible to users and fine for now; only matters if the studio ever
  becomes a genuinely separate business.

## Run / test

```
AUTH_SECRET=... npx next start -p 3112     # /studio is the front door
# own-domain mode: add STUDIO_HOST=<host> and send that Host header
```
