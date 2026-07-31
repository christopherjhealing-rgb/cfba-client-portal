# CFBA Client Portal

A logged-in area where CFBA clients see every job they have with you, follow its
progress in plain English, and download the finished package the moment you mark
it **Issued** on the Monday board.

It sits alongside Monday — it does not replace it. Monday stays the operational
board; the portal is the client-facing window onto it.

---

## Try it right now (no accounts, no credentials)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase configured the portal runs in
**demo mode** against a local JSON store seeded with realistic data.

**Test client — sign in:**

| | |
|---|---|
| Username | `cfba.test` |
| Password | `TestDryRun2026` |

That company has one job in every state, so you can walk the whole thing:

- `T-1001` — Issued with 3 files → **Ready to download**
- `T-1002` — To CDC → shows as *Being assessed*
- `T-1003` — FIR → *Waiting on further information from you*
- `T-1004` — To Check → *In final review*
- `T-1005` — downloaded a fortnight ago → sits in **Downloaded** with the
  retention countdown

**Rehearse what a brand-new client sees:** on the sign-in page choose
**First time**, then username `cfba.setup` with setup code `AAA-BBB-CCC`. You'll
be asked to choose your own password, exactly as a real client would be.

**Office side:** http://localhost:3000/admin — demo passcode `demo`.

To wipe the demo data and start again, delete the store:
`rm "$TMPDIR/cfba-portal-demo.json"` (usually `/tmp/cfba-portal-demo.json`).

---

## How it works

### Logins

One username per client company, issued by you from **Admin → Clients &
logins**. Issuing a username produces a **one-time setup code**; you pass the
username and code to the client, and they choose their own password. You never
see or hold their password (they're stored as salted scrypt hashes, and the
setup code is destroyed the moment it's used).

Because the login is per company, the client's identity is fixed by the login —
not by whatever got typed into the free-text Client column on Monday. That
column can stay exactly as it is.

Forgotten password: issue a fresh setup code from the same screen. The old
password stops working immediately.

### Matching Monday cards to companies

Monday's Client column is free text — "GVF", "GVF (Joe Furfaro)", "GVF Pty Ltd"
are all one company. Matching runs in two passes:

1. **Email** on the card against the company's registered addresses (exact, and
   the reliable one).
2. **Normalised client name** — brackets, trading suffixes, punctuation and
   spacing stripped — against the company's alias keys.

Anything that matches neither is reported as *unmatched* by the sync so you can
add an alias rather than silently losing a job.

### Files

Nothing is copied until a card reaches **Issued**. That matters: the CDC
autogen script writes its draft package to the job's `Issued` folder and sets
the card to *To Issue* for review, and you edit files after that. Waiting for
the **Issued** label means the portal always publishes the final reviewed
version.

On sync, the portal finds the job's folder in SharePoint by ref (folders are
named `<address> - <ref>`, so `56411` finds
`.../32 Elvira St, Palmyra - 56411/Issued/`), copies each file into private
Supabase Storage, and records it against the job. Clients download a single zip
named `CFBA <ref> - <address>.zip`. Files are streamed through the app after an
ownership check — never publicly addressable.

### Retention

A job is counted as downloaded on the **first** download. It then stays visible
in the **Downloaded** section for six months (`RETENTION_MONTHS`), with a
day-count shown, and can be downloaded again as many times as needed. After that
it drops out of the portal. Downloaded jobs are never removed by a later Monday
status change.

### New jobs

Portal submissions land in a **review queue**, not straight onto the board. You
accept (which creates the Monday card in the *New Jobs* group) or reject with a
note. Uploaded plans go to Supabase Storage under `submissions/<id>/`.

---

## Checking a client's folders

**Admin → Clients & logins → Check folders** gives you, per job:

- the ref, address, real Monday status, and the plain-English wording the client
  actually sees;
- the SharePoint path the files came from;
- side by side: **what the portal holds** vs **what's in SharePoint right now**
  (live via Graph, for issued jobs);
- a warning when the two disagree — files in SharePoint that haven't synced yet,
  or files the portal still has that have since been removed;
- a warning when no `Issued` folder can be found for that ref, which almost
  always means the folder name doesn't end in `- <ref>`.

**View as client** opens the client's own portal exactly as they see it, with a
gold banner across the top so it's unmistakable. Lodging new jobs is disabled
while you're in that view. "Stop viewing" returns you to the admin area.

---

## Going live

### 1. Supabase

1. Create a project.
2. SQL editor → run `supabase/schema.sql`.
3. Storage → **New bucket** named `issued`, **not public**.
4. Copy the project URL and the **service role** key into the env vars.

### 2. Microsoft Graph (reads the SharePoint Issued folders)

Needs someone with tenant admin (Entra ID → App registrations):

1. New registration, single tenant. Note the **Application (client) ID** and
   **Directory (tenant) ID**.
2. Certificates & secrets → new client secret → copy the **value**.
3. API permissions → Microsoft Graph → **Application permissions** →
   `Sites.Read.All` and `Files.Read.All` → **Grant admin consent**.

The library is already identified for you (the drive ID in `.env.example` is the
verified CFBuildingApprovals document library) — you shouldn't need to change it.

If you'd rather not grant tenant-wide read, `Sites.Selected` plus a grant on the
CFBuildingApprovals site alone also works and is tighter.

### 3. Monday

A personal API token (Monday → avatar → Developers → My access tokens). Board id
`7129862365` and the *New Jobs* group are already set.

### 4. Vercel

Add every variable from `.env.example`, then deploy. `vercel.json` already
schedules `/api/sync` every 15 minutes; set `CRON_SECRET` so only Vercel Cron
(or a signed-in staff member) can trigger it.

### 5. Onboard the first client

Admin → Clients & logins → **Issue a login** → hand over the username and setup
code. Then **Check folders** on that client and confirm what they'd see before
you tell them it's live.

---

## Environment variables

See `.env.example`. Two notes:

- **`AUTH_SECRET`** signs session cookies and hashes setup codes. Changing it
  signs everyone out and invalidates outstanding setup codes.
- With `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` unset the app runs in demo
  mode. Never deploy it that way.

---

## Tests

```bash
npm test     # domain logic: client matching, ref parsing, status wording,
             # bucketing, and the six-month retention window
npm run build
```

---

## Known issues to keep an eye on

- **Next.js version.** This is pinned to the newest 14.2.x, but npm still flags
  a security advisory across the whole 14.2 line. Upgrade to the current
  supported major (15.x/16.x) before this handles real client data. The app uses
  standard App Router APIs, so the upgrade should be small — run `npm run build`
  and check the two dynamic route handlers afterwards.
- **Sync is additive.** It never deletes a job. Cards deleted on Monday linger in
  the portal until removed manually.
- **Retention isn't self-purging yet.** Expired jobs are hidden from clients
  immediately, but the stored files aren't deleted. Add a scheduled purge before
  storage costs matter.
- **Large submissions** are capped at 40 MB per lodgement.

## Portal v2 (July 2026)

Sidebar shell, restyled login and dashboard, plus four new pages.

| Route | What it is |
|---|---|
| `/dashboard` | Landing page after sign-in: counters, ready to download, further information required, in-progress table |
| `/jobs` | Every job, filterable (All / Needs you / In progress / Ready / Past) |
| `/downloads` | Ready and already-downloaded, with the retention countdown |
| `/messages` | Per-job threads. A client reply is stored and posted onto the job's Monday card |
| `/amend` | Request a change to an existing job — always opens a new card |
| `/details` | Read-only company record (Monday stays the master) |
| `/help` | FAQ and contact details |

**Hero image:** `public/hero.jpg`. Replace it with any photo you own the rights to.

**Messages model:** CFBA messages originate as Monday updates prefixed `CLIENT:`;
client replies post back to the same card via `monday.postUpdate`, so the card
remains the single record of the conversation. The sidebar badge counts threads
whose latest CFBA message is newer than the company's last read marker.

**Amendments:** every amendment opens its own Monday card, described as
`AMENDMENT to {ref} — {change}`, with an update posted on both the new card and
the original. The original certificate is never altered.

Run `npm run build` after pulling this in; `npm test` covers the domain logic.

## July 2026 update

**Runtime:** upgraded to **Next 16.2.12 / React 19**. `npm audit` reports 0
vulnerabilities. Two `overrides` in `package.json` (`sharp`, `postcss`) pull
Next's own transitive copies up to patched releases — don't remove them without
re-running `npm audit`.

Next 15+ made `cookies()`, `params` and `searchParams` async; `lib/session.ts`,
the dynamic download route and the three pages that read query strings were
updated accordingly.

**Demo seed is now versioned.** `SEED_VERSION` in `lib/demo.ts` — bump it
whenever `seed()` changes and stale stores reseed instead of loading with fields
missing.

**Lodge a job** requires drawings *and* engineering, in labelled buckets
(drawings / engineering / other). Enforced client-side and again in
`/api/submit`; amendments are exempt.

**Amend a job** picks the original by type-to-search rather than a dropdown, and
accepts free text — an unmatched entry is passed through as `originalJobText`
for the office to link at review. No email field; the account address is used.

**Info sheets** at `/info-sheets`. PDFs live in `public/notes/`. Sheets without
a `file` render as "Soon" placeholders — add the PDF and the `file` path to
publish one.

### Message attachments

A client reply can carry files (25 MB per message). They are stored via
`repo.writeFile` under `messages/{ref}/{msgId}/{name}` and, where the job has a
Monday item id, uploaded onto the same Monday update as the message text using
`monday.addFileToUpdate` — Monday's multipart `/v2/file` endpoint, which is
separate from the GraphQL endpoint. So the engineering lands on the card the
office already works from.

If the Monday call fails the message and its files are still saved in the portal
and the send reports success: better a message that lands without its attachment
than a client told the send failed.

Attachments download through `/api/messages/[id]/[index]`, which resolves the
message against the signed-in company first, so a guessed id can't reach another
client's files.

### Pulling CFBA's side of the conversation

`runSync()` now mirrors Monday updates into message threads. An update is sent
to the client only if its text begins with `CLIENT:` — everything else on the
card stays internal, so the Updates section can still be used normally.

To keep the API cost sane, updates are read only for cards at a status where a
client conversation is plausible (`MESSAGE_STATUSES` in `lib/sync.ts`) plus any
card that already has a thread. Duplicates are prevented by storing the Monday
update id against each message.

`SyncResult` gained `messagesPulled`.

### Job progress stages

`STAGES` / `stageIndex()` / `stageStates()` in `lib/core.mjs`. Five client-facing
steps derived **purely from the current Monday status** — no transition history,
and deliberately no dates.

| Stage | Monday statuses |
|---|---|
| Received | anything unrecognised (never invents progress) |
| Under assessment | To Assess, New Info Received, To Check, Amendment |
| Further information | To FIR, FIR, FIR - ENG, SCL |
| Certificate being prepared | To CDC, Chris CDC, Chris CDC 2, To Issue, To Lodge, To Send, and the inspection statuses |
| Issued | Issued, To Invoice, Invoiced / Completed |

The further-information step renders as **not required** on a job that has moved
past it: without transition history we cannot know whether an FIR was ever
raised, so it must not be shown as completed. It shows amber "waiting on you"
only for `FIR` — never for `FIR - ENG` or `SCL`, which are waits on the engineer.
On Hold and Query pause on the current step rather than advancing.

Adding a status to the board without adding it to `STAGE_OF` shows the job at
Received. That is the safe failure, but it is a failure — keep the map current.

### Turnaround messaging

All wording lives in `components/Turnaround.tsx` so it can't drift between
pages. The figure itself is `env.turnaroundDays` (`TURNAROUND_DAYS`, default 3)
— **check it against the real turnaround data before changing it.** Publishing a
number you routinely miss creates exactly the pressure the wording exists to
remove.

Deliberately "most jobs … within about N business days", not an average: an
average is a number clients hold you to, and one slow job appears to break it.

FIR jobs show **"Waiting on you since {date} · N business days"**, taken from the
most recent CFBA message on that thread — so no new field is needed. It is an
elapsed count, never a forecast. Public holidays aren't accounted for, so the
number can understate a wait but never overstate it.

## Hardening pass (July 2026)

**Login throttling** — `lib/throttle.ts`. Three failed attempts per username,
then a 15-minute cooldown; a success clears the counter. Counted server-side
(Supabase `login_attempts`, in-memory in demo) so it holds across browsers and
IPs. **Trade-off:** one shared login per company means one person fat-fingering
it three times locks out the whole company for 15 minutes. Staff can't currently
clear a lock from `/admin` — worth adding if it becomes a nuisance.

**PDFs only** on lodgement and message attachments, enforced in the browser and
again in both API routes. Staff open these files; a browser guard isn't a
control.

**Prefetch fix** — thread links in `/messages` set `prefetch={false}`. Next
prefetches links on hover, which was running the page render and silently
marking threads read that the client never opened.

**Message sync N+1** — existing threads are loaded once and indexed, not queried
per card.

**Retention purge** — `purgeExpired()` in the sync deletes stored files once a
job is past its window. The job record stays so history is intact; only the
documents go. `SyncResult.filesPurged` reports it.

**Email notifications** — `lib/mail.ts`, Microsoft Graph `sendMail`. Every
`CLIENT:` update pulled from Monday emails the company with the message text in
the body and a deep link to that job's thread. Needs `MAIL_FROM` plus the
**Mail.Send** application permission on the Graph app registration.

**Stages** — inspection statuses moved under Under assessment.

## Patio engineering checker (July 2026)

The span-table checker from the `engineeringchecker` repo is embedded at
`/tools/checker`, listed in the sidebar under a separate **Tools** heading — a
convenience for clients, deliberately kept apart from the job workflow.

How it works: the checker's *encrypted* HTML payload is committed at
`lib/checker-payload.json` (safe — it's the same ciphertext the public GitHub
Pages copy serves). `/api/tools/checker` decrypts it server-side with
`CHECKER_PASSWORD` after checking the portal session, so signed-in clients get
the tool with no second password prompt and the password never reaches a
browser. With the variable unset the page shows a "not switched on" notice —
demo mode keeps working without it.

To ship a new build of the checker: update `index.html` in `engineeringchecker`
as usual, then

```bash
node scripts/import-checker.mjs ../engineeringchecker/index.html
```

and commit the changed JSON. If the checker was re-encrypted under a new
password, update `CHECKER_PASSWORD` on Vercel at the same time.

`tests/checker.test.mjs` round-trips the exact WebCrypto format, so `npm test`
catches a format drift before a deploy does.

**Turnaround** is now a range (`TURNAROUND_DAYS=3-4`).

**Lodged-not-yet-accepted** jobs moved off the dashboard into My jobs as
"Received — awaiting CFBA", so there is one place a client looks for a job.

**Admin** now uses `components/StaffShell.tsx` instead of the old Masthead.
