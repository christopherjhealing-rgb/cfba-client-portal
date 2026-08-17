"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { newId, storage } from "@/lib/storage";
import type { Match, Player } from "@/lib/types";

const STATUS_BADGE: Record<Match["status"], { label: string; cls: string }> = {
  setup: { label: "Setting up", cls: "bg-stone-100 text-stone-600" },
  live: { label: "Live", cls: "bg-rose-100 text-rose-700" },
  finished: { label: "Full-time", cls: "bg-emerald-100 text-emerald-800" },
};

function formatDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export default function MatchListPage() {
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [creating, setCreating] = useState(false);

  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState("");
  const [halfLength, setHalfLength] = useState("15");
  const [squadIds, setSquadIds] = useState<string[]>([]);

  useEffect(() => {
    setMatches(storage.getMatches());
    setPlayers(storage.getPlayers().filter((p) => p.active));
    setDate(new Date().toISOString().slice(0, 10));
    setLoaded(true);
  }, []);

  function openCreate() {
    setSquadIds(players.map((p) => p.id));
    setOpponent("");
    setHalfLength("15");
    setCreating(true);
  }

  function toggleSquad(id: string) {
    setSquadIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const half = Number(halfLength);
  const canCreate =
    opponent.trim().length > 0 &&
    Number.isFinite(half) &&
    half > 0 &&
    squadIds.length > 0;

  function createMatch() {
    if (!canCreate) return;
    const match: Match = {
      id: newId(),
      date,
      opponent: opponent.trim(),
      halfLengthMins: Math.round(half),
      status: "setup",
      squadIds,
      clockPeriods: [],
    };
    storage.setMatches([...matches, match]);
    router.push(`/match/${match.id}`);
  }

  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Match day</h1>
          <Link
            href="/stats"
            className="text-sm font-medium text-pitch underline underline-offset-2"
          >
            Season stats
          </Link>
        </div>
        {!creating && (
          <button
            onClick={openCreate}
            className="min-h-[48px] rounded-lg bg-pitch px-4 font-semibold text-white"
          >
            + New match
          </button>
        )}
      </header>

      {creating && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">New match</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMatch();
            }}
            className="flex flex-col gap-3"
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Opponent
              <input
                autoFocus
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="e.g. Joondalup"
                className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
              />
            </label>
            <div className="flex gap-3">
              <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
                Date
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
                />
              </label>
              <label className="flex w-32 flex-col gap-1 text-sm font-medium">
                Half (min)
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={40}
                  value={halfLength}
                  onChange={(e) => setHalfLength(e.target.value)}
                  className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
                />
              </label>
            </div>

            <fieldset className="flex flex-col gap-1 text-sm font-medium">
              <legend className="mb-1">
                Squad today ({squadIds.length} of {players.length})
              </legend>
              {players.length === 0 ? (
                <p className="text-sm font-normal text-stone-500">
                  No players on the roster yet — add them on the Team tab
                  first.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {players.map((p) => {
                    const on = squadIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleSquad(p.id)}
                        aria-pressed={on}
                        className={`min-h-[44px] rounded-full border px-3 text-sm font-medium ${
                          on
                            ? "border-pitch bg-pitch text-white"
                            : "border-stone-300 bg-white text-stone-500"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </fieldset>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!canCreate}
                className="min-h-[48px] flex-1 rounded-lg bg-pitch font-semibold text-white disabled:opacity-40"
              >
                Set up match
              </button>
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="min-h-[48px] rounded-lg border border-stone-300 px-4 font-medium text-stone-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {loaded && sorted.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <span className="text-4xl" aria-hidden>
            ⏱️
          </span>
          <p className="font-semibold">No matches yet</p>
          <p className="text-sm text-stone-500">
            Set one up before kick-off — subs, game time, tries and tackles
            are all one tap once you&apos;re live.
          </p>
          <button
            onClick={openCreate}
            className="mt-1 min-h-[48px] rounded-lg bg-pitch px-5 font-semibold text-white"
          >
            Set up your first match
          </button>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {sorted.map((match) => {
          const badge = STATUS_BADGE[match.status];
          return (
            <li key={match.id}>
              <Link
                href={`/match/${match.id}`}
                className="flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm active:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">
                    vs {match.opponent}
                  </span>
                  <span className="block text-sm text-stone-500">
                    {formatDate(match.date)}
                    {match.result ? ` · ${match.result}` : ""}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${badge.cls}`}
                >
                  {badge.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
