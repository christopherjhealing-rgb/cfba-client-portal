# CFBA Client Portal — Go-Live Runbook

**Target: live by Sunday night.** Work through in order. Every step has a "you'll know it worked when" check — don't move on until you get it.

Rough timings: Phase 0–1 about an hour, Phase 2–4 about ninety minutes, Phase 5–6 about an hour, Phase 7–8 the rest.

---

## Phase 0 — Friday night prep (30 min)

Do this before anything else, because **Step 4 needs Rebecca** and if she's away all weekend you want to know now, not Sunday afternoon.

- [ ] Find the latest portal zip (v11 — Next 16.2.12 / React 19). Unzip it somewhere sensible, e.g. `C:\dev\cfba-client-portal`.
- [ ] Open `.env.example` from that zip. **That file is the authoritative variable list**, not this runbook — v11 added Graph mail variables. Print it or keep it open.
- [ ] Check Node is installed: open a terminal, `node --version`. Needs to be 20 or higher. If not, install the LTS from nodejs.org.
- [ ] Message Rebecca: you need 15 minutes of her time as Microsoft tenant admin to approve an app registration. Give her a window.
- [ ] Decide the public URL. Your env template says `portal.cfbuildingapprovals.com.au` but your business email is `@cfba.com.au` — **pick one and be consistent**, because it goes in `APP_URL`, in the Graph redirect, and in every email the portal sends. My suggestion: `portal.cfba.com.au`, since that's the domain clients already recognise.
- [ ] Create a secrets file on your machine (not in the project folder, not in chat, not in email). You'll be collecting eight or nine keys today and losing one mid-way is the classic time sink.

**Ground rule for the whole weekend:** never paste a service-role key, client secret, or API token into a chat window, a Monday card, or a text message. Type them straight into Supabase/Vercel.

---

## Phase 1 — Local dry run (30 min)

Prove the code works on your machine before you attach it to anything real.

```bash
cd cfba-client-portal
npm install
npm run build
npm test
npm run dev
```

Open http://localhost:3000. With `SUPABASE_URL` blank it runs in **demo mode** — seeded sample data, nothing written to Monday or SharePoint.

Click through every one of the eight sidebar destinations: Dashboard, My Jobs, Downloads, Messages, Amend a Job, Info Sheets, Help & Support, My Details. Then `/admin` with the staff passcode.

**Worked when:** `npm run build` completes with no errors, tests pass, and you can log in and see the job timeline.

If the build fails, stop. Don't push a broken build to Vercel — fix it locally first.

---

## Phase 2 — Supabase (20 min)

1. Go to supabase.com → **New project**.
2. Organisation: create one called CFBA. Project name: `cfba-client-portal`.
3. **Region: Southeast Asia (Singapore)** or **Sydney** if offered — closest to Perth, keeps the portal snappy.
4. Set a database password. **Save it to your secrets file now.** You cannot retrieve it later.
5. Wait for provisioning (~2 min).
6. Left sidebar → **SQL Editor** → New query → paste the entire contents of `supabase/schema.sql` from the project → **Run**.
7. Left sidebar → **Storage** → **New bucket** → name it exactly `issued` → **leave "Public bucket" OFF**. This matters: files are streamed through the app after an ownership check, never publicly addressable.
8. Left sidebar → **Settings → API**. Copy two things to your secrets file:
   - **Project URL** → this is `SUPABASE_URL`
   - **service_role** key (under Project API keys, click reveal) → this is `SUPABASE_SERVICE_ROLE_KEY`

**Worked when:** Table Editor shows the tables from the schema, and Storage shows an `issued` bucket with a padlock/private marker.

⚠️ The service_role key bypasses all row-level security. It is server-side only. If it ever leaks, rotate it immediately in Settings → API.

---

## Phase 3 — Monday API token (5 min)

1. Monday.com → your avatar (bottom left) → **Developers** → **My access tokens**.
2. Copy the personal API token → secrets file as `MONDAY_TOKEN`.

Note: the token carries *your* permissions. If your account is ever deactivated the portal stops syncing. Once you're past pilot, consider creating a dedicated "CFBA Portal" Monday user with access to board `7129862365` only, and using its token instead.

`MONDAY_BOARD_ID=7129862365` and `MONDAY_NEW_GROUP` are already set in the template — don't change them.

**Worked when:** you've got a long string starting `eyJ...`.

---

## Phase 4 — Microsoft Entra app registration (20 min, needs Rebecca)

This is what lets the portal read the SharePoint Issued folders and send email notifications. Sit with Rebecca for this — steps 1–3 you can do, **step 4 needs her admin account**.

1. **portal.azure.com** → Microsoft Entra ID → **App registrations** → **New registration**.
   - Name: `CFBA Client Portal`
   - Supported account types: **Single tenant** (accounts in this organisational directory only)
   - Redirect URI: leave blank
   - Register.
2. On the Overview page, copy to your secrets file:
   - **Application (client) ID** → `GRAPH_CLIENT_ID`
   - **Directory (tenant) ID** → `GRAPH_TENANT_ID`
3. **Certificates & secrets** → **New client secret**.
   - Description: `portal-prod`
   - Expiry: 24 months
   - **Copy the "Value" column immediately** → `GRAPH_CLIENT_SECRET`. It's only shown once; if you navigate away it's gone and you make a new one.
   - **Put a calendar reminder in now for 6 weeks before it expires.** An expired secret takes the portal down silently. This is the single most common way a setup like this breaks a year later.
4. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** (not Delegated):
   - `Sites.Read.All`
   - `Files.Read.All`
   - `Mail.Send` — only if you're using the Graph email notifications in `lib/mail.ts`
   
   Then **Grant admin consent for [tenant]** — this is Rebecca's click. Every permission must show a green tick.

**Tighter alternative if Rebecca is uneasy about tenant-wide read:** use `Sites.Selected` instead of `Sites.Read.All`, then grant the app read access to the CFBuildingApprovals site only. More fiddly, considerably safer. Same for `Mail.Send` — an application access policy can restrict it to a single mailbox instead of every mailbox in the tenant. If she asks, that's the right answer.

`GRAPH_DRIVE_ID` and `GRAPH_CLIENT_FILES_ROOT` are already filled in the template from the verified library — leave them alone.

**Worked when:** all permissions show "Granted for [tenant]" with a green tick.

---

## Phase 5 — GitHub (15 min)

The dashboard is already in a repo; the portal isn't yet.

1. github.com → **New repository** → name `cfba-client-portal` → **Private** → don't add a README/gitignore (the project has them).
2. In your project folder:

```bash
git init
git add .
git commit -m "Initial commit — portal v11"
git branch -M main
git remote add origin https://github.com/christopherjhealing-rgb/cfba-client-portal.git
git push -u origin main
```

3. **Before you push, confirm `.env` and `.env.local` are NOT in the commit.** Run `git status` and look. The `.gitignore` covers them, but check anyway — a leaked service-role key in a repo is a genuinely bad day.

**Worked when:** the repo shows your files on GitHub and there is no `.env` file in the listing (`.env.example` is fine and expected).

---

## Phase 6 — Vercel deploy (30 min)

1. vercel.com → **Add New → Project** → **Import Git Repository** → pick `cfba-client-portal`.
2. Framework preset should auto-detect **Next.js**. Leave build settings default.
3. **Before clicking Deploy**, expand **Environment Variables** and add every variable from `.env.example`, set to **Production, Preview and Development**:

| Variable | Value |
|---|---|
| `AUTH_SECRET` | run `openssl rand -base64 32` and paste the output |
| `STAFF_PASSCODE` | a strong passcode for `/admin` — not `demo` |
| `APP_URL` | `https://portal.cfba.com.au` (no trailing slash) |
| `SUPABASE_URL` | from Phase 2 |
| `SUPABASE_SERVICE_ROLE_KEY` | from Phase 2 |
| `SUPABASE_BUCKET` | `issued` |
| `MONDAY_TOKEN` | from Phase 3 |
| `MONDAY_BOARD_ID` | `7129862365` |
| `MONDAY_NEW_GROUP` | `topics` |
| `GRAPH_TENANT_ID` | from Phase 4 |
| `GRAPH_CLIENT_ID` | from Phase 4 |
| `GRAPH_CLIENT_SECRET` | from Phase 4 |
| `GRAPH_DRIVE_ID` | already in the template — copy as-is |
| `GRAPH_CLIENT_FILES_ROOT` | already in the template — copy as-is |
| `RETENTION_MONTHS` | `6` |
| `FROM_EMAIL` | `no-reply@cfba.com.au` |
| `CRON_SECRET` | run `openssl rand -base64 32` again — different value |
| `MAIL_FROM` | the real tenant mailbox notifications send as, e.g. `admin@cfba.com.au` |
| `OFFICE_EMAIL` | the inbox somebody actually watches — client replies, general enquiries and the evening report all land here |
| `DAILY_REPORT_ENABLED` | `1` to switch the 5pm weekday report on. Leave unset and it builds without sending; you can preview it from `/admin` either way |
| `PORTAL_COLUMN_ID` | the board's **PORTAL** column — `color_mm5w73hm`, already the default |
| `PORTAL_*_LABEL` | only if the board spells a label differently — confirmed `ISSUED` / `READY` / `DOWNLOADED` / `STUCK` on 3 Aug 2026, so normally leave unset |
| `PORTAL_STUCK_AFTER_MINUTES` | grace before a stalled job is flagged STUCK (default 45) |

Plus any Graph mail variables in your v11 `.env.example` that aren't listed here. **Work from the file, not this table.**

⚠️ **`APP_URL` matters more than it looks.** Every link a client is emailed
hangs off it — the login invitation, "your package is ready", the FIR prompt.
It falls back to the deployment's own address rather than to localhost, so an
*unset* value is safe. A **wrong** one is not: pointing it at a domain you
haven't bought yet breaks nothing visibly and sends every client to an address
that doesn't answer.

So while the portal lives on Vercel, `APP_URL` is
`https://cfba-client-portal-theta.vercel.app` — or simply left unset, which
resolves to the same thing. Change it the day a real domain goes live, and not
before. **Settings → Portal Address** in the admin area shows the value the
emails are actually using, so you can check it without opening Vercel.

4. **Deploy.** Takes 2–3 minutes.
5. Once green: **Settings → Cron Jobs** — confirm all three are registered:
   `/api/sync` every 5 minutes, `/api/digest` weekly, and `/api/report` at
   `0 9 * * 1-5` (that's 5pm Perth — cron runs in UTC).
6. **Settings → Domains** → add `portal.cfba.com.au`. Vercel gives you a CNAME to add at your DNS host. Add it, then wait — DNS can take anywhere from 5 minutes to a few hours, so **do this early Saturday, not Sunday night**.

**Worked when:** the `.vercel.app` URL loads the login page and does *not* show any demo-mode banner.

⚠️ If you see demo-mode content on the live site, `SUPABASE_URL` didn't take. Fix the variable and **redeploy** — env var changes don't apply to an existing deployment.

---

## Phase 7 — Live smoke test (45 min)

Now test against real data, but before any client has the URL.

- [ ] Go to `/admin`, sign in with `STAFF_PASSCODE`.
- [ ] **Clients & logins** — the registry starts empty by design: sync only
      attaches Monday jobs to clients that exist here, it never auto-creates
      them from the board's free-text Client column. Click **Add a client**
      for each client you want in the portal (name as it appears on Monday;
      other spellings as aliases; their email if the board carries it).
- [ ] Trigger a sync manually and confirm jobs appear with correct statuses
      under the clients you added. "N unmatched" in the sync result = cards
      whose Client spelling didn't match anyone — add aliases and re-run.
- [ ] Pick one real client → **Check folders** → confirm it resolves their SharePoint Issued folder. *This is the step most likely to fail* — if the folder path doesn't match, the Graph permissions or `GRAPH_CLIENT_FILES_ROOT` need a look.
- [ ] **Issue a login to yourself** using a personal email as if you were a client. Walk the whole first-time flow: setup code → set password → dashboard.
- [ ] As that test client: view a job timeline, download a package from a genuinely Issued job, open the zip and check the files are the right ones.
- [ ] Post a message from the client side. Confirm it lands on the Monday card as a `CLIENT:` update **and** that the notification email arrives.
- [ ] Reply from the Monday card. Confirm it reaches the client thread and emails out.
- [ ] Lodge a test job → the Monday card is created **immediately** (auto-accept
      is on by default), with the PDFs in its Files column. The review queue
      only holds lodgements when Monday couldn't be reached at the time — or
      every lodgement, if `AUTO_ACCEPT_LODGEMENTS=0` is set in Vercel.
      **Then delete that test card.**
- [ ] Try to upload a non-PDF and something over 25 MB — both should be refused.
- [ ] Get the login wrong four times — throttling should kick in.
- [ ] Open the site on your phone. Half your clients will.

**Rollback if anything's badly wrong:** Vercel → Deployments → previous deployment → **Promote to Production**. Instant. You are never stuck.

---

## Phase 8 — Pilot, then announce

Don't send it to all 73 clients on Sunday night. One bad first impression with a builder costs more than a week's delay.

1. **Pick one friendly, high-volume client** — someone who'll tell you honestly if it's confusing rather than just quietly going back to email.
2. Issue their login, send the guidance notes you've already produced (Note 06 Amending a job, Note 07 Lodging checklist) and the portal flyer.
3. **Run one full week.** Watch: do they actually log in? Do downloads work on their machines? Does anything land in the review queue looking wrong?
4. Then batch: shires first (most structured), then repeat builders, then everyone else.
5. Reuse the lodgement portal announcement email as the template for the broad send.

Brief Kacie and Rebecca before the wider rollout — Kacie will field the "I can't log in" calls, so she needs to know how to reissue a setup code from `/admin` before clients start ringing.

---

## Known issues — accept these going in

None are blockers, but know them now so they're not surprises:

- **Sync is additive.** It never deletes a job. Cards deleted on Monday linger in the portal until removed manually.
- **Retention isn't self-purging.** Expired jobs are hidden from clients at 6 months, but the stored files aren't deleted. Fine at pilot volume; add a scheduled purge before storage costs bite.
- **Lodgements capped at 40 MB**, messages at 25 MB per attachment.
- **Client secret expires in 24 months.** Reminder set? Set it now.

---

## Go / no-go checklist

Don't give a client the URL until every one of these is ticked:

- [ ] Live URL loads, no demo-mode banner
- [ ] `STAFF_PASSCODE` is not `demo`
- [ ] `AUTH_SECRET` and `CRON_SECRET` are freshly generated, different from each other
- [ ] Supabase `issued` bucket is **private**
- [ ] No `.env` file in the GitHub repo
- [ ] Cron job registered and a sync has genuinely run
- [ ] Custom domain resolving over HTTPS
- [ ] You have personally completed the full client journey end to end
- [ ] Real Issued job downloaded and the files verified correct
- [ ] Calendar reminder set for the Graph secret expiry
- [ ] Rebecca and Kacie know it's going live and what to do when a client rings

---

## If you get stuck

Note the **phase number and the exact error text**, and come back to me. Most likely sticking points, in order of probability: the SharePoint folder resolution in Phase 7, DNS propagation in Phase 6, and admin consent not fully granted in Phase 4.
