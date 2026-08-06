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

## Next (stages B–D, agreed with Chris)

- **B — house-plan trace underlay.** Let the user upload a PDF or image of
  their house plans and place/scale/rotate/pin it as a second trace-over
  underlay beside the aerial. Render PDFs with `pdfjs-dist`. The aerial
  underlay plumbing in `SitePlanBuilder` (`Underlay`, `underlay*` helpers) is
  the pattern to extend.
- **C — parametric patio.** Type the patio dimensions and the footprint
  resizes; a **flat vs attached** switch; **columns per side** and **column
  height** captured on the plan.
- **D — generated elevations.** Produce patio elevation views (columns at
  their spacing and height, flat roof profile, the attached side drawn as a
  dwelling outline, dimensioned) as extra A4 sheets.

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
