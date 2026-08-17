"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  countEvents,
  finalWhistleMs,
  formatMins,
  playerGameTimeMs,
} from "@/lib/gameTime";
import { storage } from "@/lib/storage";

interface PlayerSeason {
  id: string;
  name: string;
  games: number;
  timeMs: number;
  tries: number;
  tackles: number;
}

export default function StatsPage() {
  const [rows, setRows] = useState<PlayerSeason[]>([]);
  const [matchCount, setMatchCount] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const players = storage.getPlayers();
    const finished = storage
      .getMatches()
      .filter((m) => m.status === "finished");
    const allEvents = storage.getMatchEvents();

    const totals = new Map<string, PlayerSeason>(
      players.map((p) => [
        p.id,
        { id: p.id, name: p.name, games: 0, timeMs: 0, tries: 0, tackles: 0 },
      ])
    );

    for (const match of finished) {
      const events = allEvents.filter((e) => e.matchId === match.id);
      const whistle = finalWhistleMs(match.clockPeriods ?? []);
      for (const row of totals.values()) {
        const t = playerGameTimeMs(
          row.id,
          events,
          match.clockPeriods ?? [],
          whistle
        );
        if (t > 0) {
          row.games += 1;
          row.timeMs += t;
        }
        row.tries += countEvents(events, row.id, "try");
        row.tackles += countEvents(events, row.id, "tackle");
      }
    }

    setRows(
      [...totals.values()]
        .filter((r) => r.games > 0)
        .sort((a, b) => b.timeMs - a.timeMs)
    );
    setMatchCount(finished.length);
    setLoaded(true);
  }, []);

  const topTries = rows.reduce(
    (best, r) => (r.tries > (best?.tries ?? 0) ? r : best),
    null as PlayerSeason | null
  );
  const topTackles = rows.reduce(
    (best, r) => (r.tackles > (best?.tackles ?? 0) ? r : best),
    null as PlayerSeason | null
  );

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <header>
        <Link href="/match" className="min-h-[44px] py-2 text-sm text-stone-500">
          ‹ Matches
        </Link>
        <h1 className="text-2xl font-bold">Season stats</h1>
        {loaded && (
          <p className="text-sm text-stone-500">
            {matchCount} {matchCount === 1 ? "match" : "matches"} played
          </p>
        )}
      </header>

      {loaded && rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <span className="text-4xl" aria-hidden>
            🏆
          </span>
          <p className="font-semibold">The season starts here</p>
          <p className="text-sm text-stone-500">
            Finish your first match and every Roodog&apos;s minutes, tries and
            tackles will show up on this page.
          </p>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3">
            {topTries && topTries.tries > 0 && (
              <div className="rounded-xl bg-emerald-100 p-3 text-emerald-900">
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Top try scorer
                </div>
                <div className="text-lg font-bold">{topTries.name}</div>
                <div className="text-sm">
                  {topTries.tries} {topTries.tries === 1 ? "try" : "tries"}
                </div>
              </div>
            )}
            {topTackles && topTackles.tackles > 0 && (
              <div className="rounded-xl bg-sky-100 p-3 text-sky-900">
                <div className="text-xs font-semibold uppercase tracking-wide">
                  Tackle machine
                </div>
                <div className="text-lg font-bold">{topTackles.name}</div>
                <div className="text-sm">{topTackles.tackles} tackles</div>
              </div>
            )}
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2 font-semibold">Player</th>
                <th className="py-2 text-right font-semibold">Games</th>
                <th className="py-2 text-right font-semibold">Time</th>
                <th className="py-2 text-right font-semibold">Tries</th>
                <th className="py-2 text-right font-semibold">Tackles</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-100">
                  <td className="py-2 font-medium">{r.name}</td>
                  <td className="py-2 text-right tabular-nums">{r.games}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatMins(r.timeMs)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.tries || "–"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.tackles || "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-stone-400">
            Game time is added up from every sub across finished matches —
            handy proof that everyone&apos;s getting a fair run.
          </p>
        </>
      )}
    </div>
  );
}
