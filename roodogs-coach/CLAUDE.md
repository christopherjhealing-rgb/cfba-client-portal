# Roodogs Coach

Personal coaching companion app for an Under 9s junior rugby union team
(Wanneroo Roodogs, Western Australia). Single user (the coach), used on a phone
at training and on the sideline on game day.

## Purpose

- Plan training sessions from a reusable drill library
- Run match days: track subs, game time per player, tries and tackles
- Prove fair game time across the season (Rugby Australia junior pathway
  expects everyone plays)
- Season stats view the kids will enjoy

## Stack

- Next.js (App Router) + React, deployed on Vercel
- TypeScript, Tailwind for styling
- **No database, no auth for v1.** All state in localStorage via a single
  storage module (`lib/storage.ts`). Components only ever talk to its typed
  get/set interface so it can be swapped for Vercel KV or a DB later without
  touching components.
- PWA: manifest + icons so it can be installed to the home screen

## U9 rugby context (rules that shape the app)

- Rolling subs, everyone must get meaningful game time
- Squad size and half length are configurable per match (nothing hardcoded)
- Stats to track: tries, tackles. Keep it positive — no "missed tackle" or
  negative stats for 8-year-olds.

## Data model

See `lib/types.ts`. Core entities: Player, Drill, Session, Match, MatchEvent.
Game time per player is **computed** from sub_on/sub_off event pairs
intersected with the match's `clockPeriods` (live stretches of the game
clock), never stored — so halftime never counts toward minutes and undo is
deleting the last event(s). A player still on when the match ends is closed
out at the final whistle. The pure helpers live in `lib/gameTime.ts` and are
unit-tested in `lib/gameTime.test.ts`.

## App structure

Five bottom-nav tabs, components colocated by feature under `app/(tabs)/`:

1. **Team** — roster list, add/edit/archive (soft delete via `active`)
2. **Drills** — library seeded with 25 U9 drills on first open, tag filter,
   add/edit (`lib/seedDrills.ts`)
3. **Sessions** — session builder picking drills to ~60 min with a running
   counter, reorder, duplicate past session
4. **Board** — whiteboard library for drawing drills, training games and set
   plays. Boards are tagged by kind and hold tokens (players, defenders,
   cones, hurdles, tackle bags, ball) plus movement arrows (run, pass, kick,
   tackle, jump — each with a distinct style; tackles end in a T-bar; a
   curved drag draws a curved arrow). A drill can link one board via
   `boardId` and shows its thumbnail on the drill card.
   Coordinates are pitch units (0–100 × 0–140), rendering is shared between
   the editor and list previews via `BoardCanvas.tsx`. Touch-first editor:
   tap-to-place, drag-to-move, drag-to-draw, erase, undo.
5. **Match** — match list, squad + starting line-up setup, live match mode
   (two-column sub swapping, per-player try/tackle with undo toast, pause for
   halftime, needs-minutes highlight), full-time summary

Plus `/stats` (linked from the Match tab): season totals per player.

## Conventions

- All dates ISO strings, all times epoch ms
- Australian English in UI copy ("centre", "organise")
- Kids' privacy: first names only in UI examples; no analytics, no external
  calls with player data
- Big tap targets (min 44–48px) — this is used with cold hands in winter

## Commands

- `npm run dev` — local dev
- `npm run build` — production build (must pass before commit)
- `npm test` — game-time engine unit tests (must pass before commit)
