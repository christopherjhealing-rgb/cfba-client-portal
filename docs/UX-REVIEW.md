# Product review — August 2026

Honest audit of the portal against a premium-SaaS bar, by the product team
persona: UX, UI, PM, front-end architecture, CX, and building-surveying
practice. Nothing here is sacred because we built it; several findings are
self-corrections.

## The 20 biggest opportunities

1. **Sign-in page is design debt.** Every page got the photo-hero premium
   treatment except the first screen a client ever sees. Restyle with hero,
   trust markers (registered building surveyors, Perth WA, phone), and the
   same warm voice.
2. **Lodgement success is a dead end.** After lodging, the success card says
   "back to my jobs" — but the builder wants to SEE the job they just lodged.
   Link straight to the new job page (the accept flow knows the ref).
3. **FIR reply is too far from the FIR.** On a job page with a long thread,
   the amber "we need something" banner is at top but the reply box is at the
   bottom. Add "Reply now" jump in the banner; consider pinning the ask.
4. **Builders think in THEIR reference.** clientRef shows on the job page and
   emails but not on dashboard cards or jobs-list rows. Surface it (small,
   muted) everywhere a job is listed.
5. **Hero weight on mobile.** 200–260KB hero on every page over site 4G, and
   on phones the dashboard hero pushes jobs below the fold. Serve smaller
   mobile crops via next/image (priority on dashboard only), slim the band
   height on small screens, and consider no-hero on dense utility pages.
6. **Nav is 12 items.** Long for a phone drawer. Group tools (Site plan,
   Engineering) or demote rarely-used items; revisit once usage is real.
7. **Icon collisions.** "edit" = Amend AND Site plan tool; "check" = Engineering
   and every tick; "grid" = Dashboard. Draw 2–3 dedicated nav glyphs in the
   existing stroke style.
8. **One state, three names.** "Action required" (sections) vs "Further
   information needed from you" (status label) vs "With you" (chips). Keep:
   Action required = headings/badges; "With you since <date>" = time chip;
   align the status label to "Action required — see the request".
9. **Global search.** Search lives only on My Jobs. Premium SaaS: search in
   the shell header from anywhere, same matcher (ref/their ref/address/desc).
10. **Message delivery trust.** Client replies post to the Monday card
    instantly — show it: a subtle "Delivered to your surveyor · 9:41am" state
    under sent messages. Kills the "did it go?" phone call.
11. **Amend from the job.** Amend page starts with a job dropdown; from a job
    page there's no "Amend this job" path. Add it (prefilled), keep the page.
12. **Cross-link the tools into the journey.** Drawings bucket hint should
    offer the Site plan tool; note 01/05 should link it; engineering bucket
    already meets the library. Tools clients don't meet in-flow don't exist.
13. **Library first-run education.** Empty "From your documents" should sell
    the save-for-next-time tick in one line, not render nothing.
14. **Elapsed-context on in-progress jobs.** We never forecast — but "Day 2 ·
    most jobs 3–4 business days" is honest elapsed context that pre-empts the
    status call. (Elapsed only. Never a promise.)
15. **Outdoor readability audit.** Builders read this in full sun. Check the
    low-contrast greys (ink/45–55 on wash) and amber-on-cream against WCAG AA;
    darken where marginal. Light theme is CORRECT for outdoors — no dark mode.
16. **PWA install.** Manifest + icons so "Add to Home Screen" gives an
    app-like icon, splash and standalone window. Cheap, feels native.
17. **Trust footer.** Once privacy wording is approved: registration details,
    ABN, "Documents stored in Australia", privacy link — small footer on
    sign-in and Help. Premium portals wear their credentials.
18. **Skeleton loading.** force-dynamic pages show nothing while data loads;
    branded skeleton shimmer on dashboard/jobs beats a blank.
19. **Status share link.** Builders forward status to homeowners by
    screenshot; a read-only tokened "share this job's status" page (no docs,
    no messages) would be a genuine differentiator. Design carefully (scope,
    expiry) — roadmap, not now.
20. **Session longevity on phones.** Verify cookie lifetime ~30 days rolling;
    a builder re-logging weekly on site will stop using the portal.

## 10 quickest wins, biggest visual impact
1. Sign-in restyle (hero + trust) — the first impression.
2. Success screen → "View your job" (+ their ref echoed).
3. "Reply now" jump link in the FIR banner.
4. clientRef on jobs rows + dashboard cards.
5. Slim mobile heroes (h reduction + smaller crops).
6. Dedicated nav icons for Site plan / Engineering / Amend.
7. Library empty-state line + save-tick nudge.
8. "Delivered to your surveyor" tick on sent messages.
9. Day-counter chip on in-progress jobs ("Day 2 · typical 3–4").
10. PWA manifest + home-screen icon.

## Missing vs premium portals
Notification centre (bell + recent events) — email covers v1, park.
Bulk download across jobs — rare need, park. Multi-entity builders (one login,
two companies) — note, revisit on demand. Payment surface — arrives with
one-off public lodgement. Everything else already exists or is on the
SPECS.md roadmap (checker, assistant, autocomplete, library, photos, plan
tool, one-off flow).

## Friction builders will actually hit
Lodge → dead-end success (fix #2). FIR → hunt for reply box (#3). "Where's my
PO number?" (#4). Slow first paint on site 4G (#5). Sign-in that undersells
the product (#1). Empty library teaching nothing (#13). These six are the
launch-week experience; all are small.

## Inconsistencies to correct (own decisions included)
Sign-in vs rest (biggest). FIR naming trio. Icon reuse in nav. Hero on ALL
pages regardless of density (utility pages could use a slimmer band). Buckets
say "PDF only — or drag" while the photos bucket takes images (reword photos
hint). Collateral print drafts 13–16 still in repo though superseded by site
notes (archive note exists; consider moving to /archive).

## Prioritised roadmap
**Must fix (before first client):** wins 1–7 above + hero perf pass.
**Should (launch fortnight):** wins 8–10, global search, amend-from-job,
tool cross-links, contrast audit, session-length check.
**Scheduled (SPECS.md):** autocomplete, AI checker, assistant, plan-tool v2
(underlay/elevations/cadastre), one-off public lodgement.
**Nice to have:** notification centre, status share links, skeletons,
bulk download.
