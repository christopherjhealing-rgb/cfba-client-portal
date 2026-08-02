# Product review — August 2026

Honest audit of the portal against a premium-SaaS bar, by the product team
persona: UX, UI, PM, front-end architecture, CX, and building-surveying
practice. Nothing here is sacred because we built it; several findings are
self-corrections.

## The 20 biggest opportunities

1. **Sign-in page is design debt.** ✅ shipped 2026-08-02 — full-photo
   layout with trust markers and warm voice; the original is preserved as
   "classic" and staff can switch layouts instantly from /admin
   (login_design setting), which the review didn't ask for but de-risks it.
2. **Lodgement success is a dead end.** ✅ shipped 2026-08-02 — with one
   correction to this review: the accept flow does NOT know the ref (the
   board assigns `text__1` after the card lands), so linking "the new job
   page" would 404. The success card links My jobs with "it'll appear at
   the top of your jobs within a couple of minutes" and echoes their ref.
3. **FIR reply is too far from the FIR.** ✅ shipped 2026-08-02 — "Reply
   now →" in the amber banner jumps to the reply box (smooth-scroll,
   reduced-motion aware). The ask isn't separately pinned: the dashboard
   already surfaces firRequest in full.
4. **Builders think in THEIR reference.** ✅ shipped 2026-08-02 — muted
   "· your ref X" on dashboard card lines and jobs-table rows.
5. **Hero weight on mobile.** ✅ shipped 2026-08-02 — 900px q75 "-m"
   crops (70–103KB; classic sign-in photo 2.3MB → 77KB) served by media
   query from CSS custom properties (image-set can't select on viewport;
   next/image was skipped to keep scrim/layout pixel-identical), and hero
   bands ~30% shorter below md. Utility pages keep their heroes for now.
6. **Nav is 12 items.** Parked deliberately — regrouping waits for real
   usage, as written. The icon half of the problem is fixed (see 7).
7. **Icon collisions.** ✅ shipped 2026-08-02 — new "ruler" (Site plan
   tool) and "beam" truss (Engineering) glyphs in the house stroke style;
   no nav icon repeats now (Amend keeps "edit", Dashboard keeps "grid").
8. **One state, three names.** ✅ shipped 2026-08-02 — FIR status label is
   now "Action required — see the request"; stage labels and "With you
   since" chips unchanged.
9. **Global search.** ✅ shipped 2026-08-02 — search input in the sidebar
   (and phone drawer) submitting to /jobs?q=…, same matcher. Sidebar
   rather than a shell header: the portal has no header bar to put it in.
10. **Message delivery trust.** ✅ shipped 2026-08-02 — "✓ Delivered to
    your surveyor" micro-line on client messages that carry a
    mondayUpdateId (the id is the receipt; no polling). The message row
    already shows its time, so the line doesn't repeat it.
11. **Amend from the job.** ✅ shipped 2026-08-02 — quiet "Amend this job"
    (btn-ghost) on non-expired job pages, prefilling /amend?ref=….
12. **Cross-link the tools into the journey.** ✅ shipped 2026-08-02 —
    drawings bucket hint offers the site plan tool; the tool's intro
    points back at Lodge a job. Linking from inside notes 01/05 (static
    PDFs) is left for the next collateral render.
13. **Library first-run education.** ✅ shipped 2026-08-02 — one warm line
    selling the save-for-next-time tick when the library is empty.
14. **Elapsed-context on in-progress jobs.** ✅ shipped 2026-08-02 —
    "Day N · most jobs 3–4 business days" on the job page status card and
    jobs list, businessDaysSince(receivedAt), only while the job is
    actually running with us (not FIR/held/cancelled). Elapsed only.
15. **Outdoor readability audit.** ✅ shipped 2026-08-02 — conservative
    nudge, not a restyle: informational brass-on-cream moved to a darker
    brass ink (new brass.deep token), marginal ink/40–45 informational
    text stepped darker. Itemised in the commit.
16. **PWA install.** ✅ shipped 2026-08-02 — manifest + 192/512 icons on a
    seal-deep tile, standalone display, start_url /dashboard. No service
    worker on purpose: status must never be stale cache.
17. **Trust footer.** Still parked — waits on approved privacy wording.
    The sign-in half (trust markers) shipped with item 1.
18. **Skeleton loading.** ✅ shipped 2026-08-02 — branded animate-pulse
    skeletons for dashboard and My jobs, shapes matching the real layout,
    off under prefers-reduced-motion.
19. **Status share link.** Parked (roadmap), as written.
20. **Session longevity on phones.** ✅ shipped 2026-08-02 — "remember me"
    cookie/JWT lifetime raised from 14 to 30 days; the deliberate 12-hour
    no-remember session for shared machines is unchanged.

## 10 quickest wins, biggest visual impact — all shipped 2026-08-02
1. Sign-in restyle (hero + trust) — the first impression. ✅
2. Success screen → jobs list with their ref echoed (no ref exists at
   accept time, so "View your job" was impossible — see item 2 above). ✅
3. "Reply now" jump link in the FIR banner. ✅
4. clientRef on jobs rows + dashboard cards. ✅
5. Slim mobile heroes (h reduction + smaller crops). ✅
6. Dedicated nav icons for Site plan / Engineering (Amend keeps "edit"). ✅
7. Library empty-state line + save-tick nudge. ✅
8. "Delivered to your surveyor" tick on sent messages. ✅
9. Day-counter chip on in-progress jobs ("Day 2 · typical 3–4"). ✅
10. PWA manifest + home-screen icon. ✅

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
✅ shipped 2026-08-02.
**Should (launch fortnight):** wins 8–10, global search, amend-from-job,
tool cross-links, contrast audit, session-length check.
✅ shipped 2026-08-02.
**Scheduled (SPECS.md):** autocomplete, AI checker, assistant, plan-tool v2
(underlay/elevations/cadastre), one-off public lodgement.
**Nice to have:** notification centre, status share links, bulk download —
still parked. Skeletons were pulled forward and shipped 2026-08-02.
