# CFBA Client Portal

Client-facing portal for CF Building Approvals (CFBA), a private building certification
firm in Perth, Western Australia, trading as Creighan Holdings Pty Ltd.

Clients log in, see every job they have with us, follow progress in plain English, and
download the finished certificate package once we mark the job **Issued** on Monday.

**This sits alongside Monday.com — it does not replace it.** Monday stays the
operational board. The portal is the client-facing window onto it. Never propose
changes that make the portal the system of record.

Current version: v11. Status: built and tested, **not yet deployed**. The immediate
goal is first production deployment.

## Stack

Next.js 16.2.12 (App Router) / React 19 / TypeScript / Tailwind.
Supabase (Postgres + private Storage bucket `issued`), Monday.com GraphQL API,
Microsoft Graph (SharePoint file reads + outbound mail). Deploys to Vercel.

`package.json` carries `overrides` for `sharp` and `postcss` to clear security
advisories. Don't remove them without checking the advisories are actually resolved
upstream.

## Domain language — use these terms

- **CDC** — Certificate of Design Compliance (form BA3). The main deliverable.
- **BP / BA4** — Building Permit application, lodged with a local government.
- **FIR** — Further Information Request. We raise these when an application is
  incomplete. **FIR - ENG** is a separate status for awaiting engineering documents
  and is tracked as its own family, never merged with plain FIR.
- **Certifier** — the registered building surveyor who signs. Two of them: Rebecca
  Creighan (Reg 2137) and Chris Healing (registration pending).
- **Shire** — WA local government. Nine of them are clients, alongside ~73 builders.
- **Ref** — job reference number. Monday column `text__1`.

Client-facing copy must be plain English for builders and homeowners. Never expose
internal status labels, assessor names, or invoicing detail to the client side.

## Monday board

Board ID `7129862365`, ~3,700 items. Confirmed column IDs:

| Purpose | Column |
|---|---|
| Reference number | `text__1` |
| Main workflow status | `status` |
| Received date | `date4` |
| Job sent date | `date__1` |
| Client | `client__1` |
| BCA class | `status_1__1` |
| BAL | `status_10__1` |

Client-visible progress collapses ~26 internal statuses into five stages:
Application received → Under assessment → Awaiting further information →
Certificate in preparation → Certificate issued & sent. Unmapped labels fall back to
"Under assessment". Cancelled and On Hold bypass the timeline entirely and show a
plain explanatory card.

## Hard rules

- **Never commit secrets.** `.env` and `.env.local` are gitignored. Don't echo the
  contents of either into terminal output or into chat.
- **The Supabase `issued` bucket must stay private.** Files are streamed through the
  app after an ownership check, never publicly addressable. Don't "simplify" this
  into public URLs or signed public links.
- **Never widen what the client API returns.** Responses are hard-whitelisted. If a
  feature seems to need a new field, say so explicitly rather than adding it quietly.
- **Uploads are PDF-only**, enforced on both client and server. 25 MB per message
  attachment, 40 MB per lodgement. Both checks must stay.
- **Don't write to real Monday cards during testing.** Demo mode (blank
  `SUPABASE_URL`) writes nothing to Monday or SharePoint — use it.
- Australian English throughout: organisation, authorised, colour, licence (noun).
- Brand colour is royal blue `#4169E1`.

## Known issues — do not treat as bugs unless asked

- Sync is additive; it never deletes a job. Cards deleted on Monday linger until
  removed manually.
- Retention hides expired jobs from clients at 6 months but does not purge the
  stored files. A scheduled purge is wanted eventually, not urgently.
- The Graph client secret expires 24 months after creation and takes the portal down
  silently when it does.

## Commands

```bash
npm install
npm run dev      # demo mode if SUPABASE_URL is blank
npm run build    # must pass before any push
npm test         # client matching, ref parsing, status wording, bucketing, retention
```

## Deploy ritual

1. `npm run build` and `npm test` locally — both must be clean.
2. Commit and push to `main` on `christopherjhealing-rgb/cfba-client-portal` (private).
3. Vercel auto-deploys from `main`.
4. **Env var changes do not apply to an existing deployment** — always redeploy after
   changing one.
5. Rollback is Vercel → Deployments → previous → Promote to Production.

Git commits must set `user.name` and `user.email` explicitly rather than relying on
global config, using the GitHub noreply format
`{numeric-id}+christopherjhealing-rgb@users.noreply.github.com`. Commits authored any
other way have been blocked by Vercel on this account before.

`vercel.json` schedules `/api/sync` every 15 minutes. `CRON_SECRET` gates it.

## Environment

`.env.example` in the repo root is the authoritative variable list. Groups:
core (`AUTH_SECRET`, `STAFF_PASSCODE`, `APP_URL`), Supabase, Monday, Microsoft Graph,
retention, mail, cron.

`AUTH_SECRET` signs session cookies, hashes setup codes, and signs one-off upload
links. Changing it signs everyone out and invalidates outstanding setup codes.

Graph app permissions are application-type: `Sites.Read.All`, `Files.Read.All`, and
`Mail.Send`. `GRAPH_DRIVE_ID` points at the verified CFBuildingApprovals document
library and should not be changed.

## Working style

Explain what you're about to change and why before changing it. For anything touching
auth, file access, or the client-visible API surface, plan first and wait for
confirmation. I'm a building surveyor who codes, not a developer — say when something
is a genuine risk rather than a preference.
