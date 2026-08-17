# Roodogs Coach 🏉

Coaching companion for the Wanneroo Roodogs Under 9s — plan training, run
match days one-handed from the sideline, and prove everyone's getting a fair
run.

- **Team** — roster with add, edit and archive
- **Drills** — 25 seeded U9 drills, filterable by tag, fully editable
- **Sessions** — build a ~60 minute plan from the library, duplicate past
  sessions
- **Match** — live mode: tap-to-swap subs, per-player game time, try and
  tackle buttons with undo, pause for halftime
- **Season stats** — minutes, games, tries and tackles per player

Everything is stored locally on the phone (localStorage) — no accounts, no
server, no player data leaving the device. Installable to the home screen as
a PWA.

## Running it

```bash
npm install
npm run dev    # local dev
npm run build  # production build
npm test       # game-time engine tests
```

## Deploying on Vercel

This app lives in the `roodogs-coach/` subdirectory — set the project's
**Root Directory** to `roodogs-coach` in Vercel, or move it to its own
repository. No environment variables needed.
