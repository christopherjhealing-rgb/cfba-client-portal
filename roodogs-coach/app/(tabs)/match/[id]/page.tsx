"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  clockElapsedMs,
  countEvents,
  finalWhistleMs,
  formatClock,
  isClockRunning,
  onFieldIds,
  playerGameTimeMs,
} from "@/lib/gameTime";
import { newId, storage } from "@/lib/storage";
import type { Match, MatchEvent, Player } from "@/lib/types";

interface UndoToast {
  label: string;
  eventIds: string[];
}

export default function MatchDetailPage() {
  const params = useParams<{ id: string }>();
  const matchId = params.id;

  const [match, setMatch] = useState<Match | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [starterIds, setStarterIds] = useState<string[]>([]);
  const [selectedOn, setSelectedOn] = useState<string | null>(null);
  const [selectedBench, setSelectedBench] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const m = storage.getMatches().find((x) => x.id === matchId) ?? null;
    setMatch(m);
    setPlayers(storage.getPlayers());
    setEvents(storage.getMatchEvents(matchId));
    setLoaded(true);
  }, [matchId]);

  const running = match ? isClockRunning(match.clockPeriods ?? []) : false;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  function saveMatch(updated: Match) {
    setMatch(updated);
    storage.setMatches(
      storage.getMatches().map((m) => (m.id === updated.id ? updated : m))
    );
  }

  function saveEvents(nextForMatch: MatchEvent[]) {
    setEvents(nextForMatch);
    const others = storage
      .getMatchEvents()
      .filter((e) => e.matchId !== matchId);
    storage.setMatchEvents([...others, ...nextForMatch]);
  }

  function showToast(label: string, eventIds: string[]) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ label, eventIds });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  }

  function undoToast() {
    if (!toast) return;
    saveEvents(events.filter((e) => !toast.eventIds.includes(e.id)));
    setToast(null);
  }

  if (!loaded) return null;

  if (!match) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-24 text-center">
        <p className="font-semibold">Match not found</p>
        <Link href="/match" className="font-medium text-pitch underline">
          Back to matches
        </Link>
      </div>
    );
  }

  const squad = players.filter((p) =>
    (match.squadIds ?? players.map((x) => x.id)).includes(p.id)
  );
  const byId = new Map(squad.map((p) => [p.id, p]));
  const periods = match.clockPeriods ?? [];
  const refMs =
    match.status === "finished" ? finalWhistleMs(periods) : now;
  const elapsed = clockElapsedMs(periods, refMs);
  const fieldIds = onFieldIds(events);
  const onField = fieldIds
    .map((id) => byId.get(id))
    .filter((p): p is Player => p !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));
  const bench = squad
    .filter((p) => !fieldIds.includes(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  const timeById = new Map(
    squad.map((p) => [
      p.id,
      playerGameTimeMs(p.id, events, periods, refMs),
    ])
  );
  const maxTime = Math.max(0, ...timeById.values());
  // "Falling behind": under 60% of the leader once the game has settled in.
  const behindThreshold =
    elapsed > 4 * 60_000 ? maxTime * 0.6 : -1;

  function kickOff() {
    if (!match) return;
    const t = Date.now();
    const subs: MatchEvent[] = starterIds.map((playerId) => ({
      id: newId(),
      matchId,
      playerId,
      type: "sub_on",
      timestampMs: t,
    }));
    saveEvents([...events, ...subs]);
    saveMatch({ ...match, status: "live", clockPeriods: [{ startMs: t }] });
    setNow(t);
  }

  function pauseResume() {
    if (!match) return;
    const t = Date.now();
    if (running) {
      const closed = periods.map((p, i) =>
        i === periods.length - 1 && p.endMs === undefined
          ? { ...p, endMs: t }
          : p
      );
      saveMatch({ ...match, clockPeriods: closed });
    } else {
      saveMatch({ ...match, clockPeriods: [...periods, { startMs: t }] });
      setNow(t);
    }
  }

  function fullTime() {
    if (!match) return;
    if (!window.confirm("Full-time — finish the match?")) return;
    const t = Date.now();
    const closed = periods.map((p, i) =>
      i === periods.length - 1 && p.endMs === undefined
        ? { ...p, endMs: t }
        : p
    );
    saveMatch({ ...match, status: "finished", clockPeriods: closed });
    setToast(null);
  }

  function trySwap(onId: string | null, benchId: string | null) {
    setSelectedOn(onId);
    setSelectedBench(benchId);
    if (!onId || !benchId) return;
    const t = Date.now();
    const off: MatchEvent = {
      id: newId(),
      matchId,
      playerId: onId,
      type: "sub_off",
      timestampMs: t,
    };
    const on: MatchEvent = {
      id: newId(),
      matchId,
      playerId: benchId,
      type: "sub_on",
      timestampMs: t,
    };
    saveEvents([...events, off, on]);
    setSelectedOn(null);
    setSelectedBench(null);
    showToast(
      `Sub: ${byId.get(benchId)?.name ?? "?"} on for ${byId.get(onId)?.name ?? "?"}`,
      [off.id, on.id]
    );
  }

  function recordStat(playerId: string, type: "try" | "tackle") {
    const e: MatchEvent = {
      id: newId(),
      matchId,
      playerId,
      type,
      timestampMs: Date.now(),
    };
    saveEvents([...events, e]);
    showToast(
      `${type === "try" ? "Try" : "Tackle"} — ${byId.get(playerId)?.name ?? "?"}!`,
      [e.id]
    );
  }

  const ourTries = events.filter((e) => e.type === "try").length;

  return (
    <div className="flex flex-col gap-4 px-4 pt-4">
      <header className="flex items-center justify-between">
        <Link href="/match" className="min-h-[44px] py-2 text-sm text-stone-500">
          ‹ Matches
        </Link>
        <span className="text-sm font-semibold">vs {match.opponent}</span>
      </header>

      {match.status === "setup" && (
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-bold">Starting line-up</h1>
          <p className="text-sm text-stone-500">
            Tap the players starting on the field ({starterIds.length}{" "}
            picked). Everyone else starts on the bench — rolling subs from
            kick-off.
          </p>
          <div className="flex flex-wrap gap-2">
            {squad
              .slice()
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => {
                const on = starterIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setStarterIds((prev) =>
                        on
                          ? prev.filter((x) => x !== p.id)
                          : [...prev, p.id]
                      )
                    }
                    aria-pressed={on}
                    className={`min-h-[48px] rounded-full border px-4 font-medium ${
                      on
                        ? "border-pitch bg-pitch text-white"
                        : "border-stone-300 bg-white text-stone-600"
                    }`}
                  >
                    {p.name}
                  </button>
                );
              })}
          </div>
          <button
            onClick={kickOff}
            disabled={starterIds.length === 0}
            className="min-h-[56px] rounded-xl bg-pitch text-lg font-bold text-white disabled:opacity-40"
          >
            Kick off 🏉
          </button>
        </section>
      )}

      {match.status === "live" && (
        <>
          <section className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-100/95 px-4 py-2 backdrop-blur">
            <div>
              <div className="text-3xl font-bold tabular-nums">
                {formatClock(elapsed)}
              </div>
              <div className="text-xs text-stone-500">
                {match.halfLengthMins}-minute halves · {ourTries}{" "}
                {ourTries === 1 ? "try" : "tries"}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={pauseResume}
                className={`min-h-[48px] rounded-lg px-4 font-semibold ${
                  running
                    ? "bg-amber-500 text-white"
                    : "bg-pitch text-white"
                }`}
              >
                {running ? "Pause" : "Resume"}
              </button>
              <button
                onClick={fullTime}
                className="min-h-[48px] rounded-lg border border-stone-300 bg-white px-3 font-semibold text-stone-600"
              >
                Full-time
              </button>
            </div>
          </section>

          {!running && (
            <p className="rounded-lg bg-amber-100 px-3 py-2 text-center text-sm font-medium text-amber-800">
              Clock paused — nobody&apos;s accruing game time.
            </p>
          )}

          <p className="text-center text-xs text-stone-400">
            Tap one player on each side to swap them.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <section className="flex flex-col gap-1.5">
              <h2 className="text-center text-xs font-bold uppercase tracking-wide text-pitch">
                On field ({onField.length})
              </h2>
              {onField.map((p) => {
                const selected = selectedOn === p.id;
                const t = timeById.get(p.id) ?? 0;
                return (
                  <div
                    key={p.id}
                    className={`rounded-xl border bg-white p-2 shadow-sm ${
                      selected
                        ? "border-pitch ring-2 ring-pitch"
                        : "border-stone-200"
                    }`}
                  >
                    <button
                      onClick={() =>
                        trySwap(selected ? null : p.id, selectedBench)
                      }
                      className="flex min-h-[48px] w-full items-center justify-between gap-1 text-left"
                    >
                      <span className="truncate font-semibold">{p.name}</span>
                      <span
                        className={`shrink-0 text-sm tabular-nums ${
                          behindThreshold >= 0 && t < behindThreshold
                            ? "font-bold text-amber-600"
                            : "text-stone-500"
                        }`}
                      >
                        {formatClock(t)}
                      </span>
                    </button>
                    <div className="flex gap-1.5 pt-1">
                      <button
                        onClick={() => recordStat(p.id, "try")}
                        className="min-h-[48px] flex-1 rounded-lg bg-emerald-600 text-sm font-bold text-white"
                      >
                        Try
                      </button>
                      <button
                        onClick={() => recordStat(p.id, "tackle")}
                        className="min-h-[48px] flex-1 rounded-lg bg-sky-600 text-sm font-bold text-white"
                      >
                        Tackle
                      </button>
                    </div>
                  </div>
                );
              })}
            </section>

            <section className="flex flex-col gap-1.5">
              <h2 className="text-center text-xs font-bold uppercase tracking-wide text-stone-500">
                Bench ({bench.length})
              </h2>
              {bench.map((p) => {
                const selected = selectedBench === p.id;
                const t = timeById.get(p.id) ?? 0;
                const behind = behindThreshold >= 0 && t < behindThreshold;
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      trySwap(selectedOn, selected ? null : p.id)
                    }
                    className={`flex min-h-[56px] w-full items-center justify-between gap-1 rounded-xl border bg-white p-2 text-left shadow-sm ${
                      selected
                        ? "border-pitch ring-2 ring-pitch"
                        : behind
                          ? "border-amber-400"
                          : "border-stone-200"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {p.name}
                      </span>
                      {behind && (
                        <span className="text-xs font-medium text-amber-600">
                          Needs minutes
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-stone-500">
                      {formatClock(t)}
                    </span>
                  </button>
                );
              })}
            </section>
          </div>
        </>
      )}

      {match.status === "finished" && (
        <section className="flex flex-col gap-3">
          <h1 className="text-xl font-bold">Full-time</h1>
          <p className="text-sm text-stone-600">
            {ourTries} {ourTries === 1 ? "try" : "tries"} to the Roodogs ·{" "}
            {formatClock(elapsed)} played
          </p>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Result <span className="font-normal text-stone-400">(optional)</span>
            <input
              defaultValue={match.result ?? ""}
              onBlur={(e) =>
                saveMatch({ ...match, result: e.target.value.trim() })
              }
              placeholder="e.g. Won 5 tries to 3"
              className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
            />
          </label>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="py-2 font-semibold">Player</th>
                <th className="py-2 text-right font-semibold">Time</th>
                <th className="py-2 text-right font-semibold">Tries</th>
                <th className="py-2 text-right font-semibold">Tackles</th>
              </tr>
            </thead>
            <tbody>
              {squad
                .slice()
                .sort(
                  (a, b) =>
                    (timeById.get(b.id) ?? 0) - (timeById.get(a.id) ?? 0)
                )
                .map((p) => (
                  <tr key={p.id} className="border-b border-stone-100">
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-right tabular-nums">
                      {formatClock(timeById.get(p.id) ?? 0)}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {countEvents(events, p.id, "try") || "–"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {countEvents(events, p.id, "tackle") || "–"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-20 z-20 mx-auto flex w-fit max-w-[90%] items-center gap-3 rounded-full bg-stone-900 px-4 py-2 text-sm text-white shadow-lg">
          <span className="truncate">{toast.label}</span>
          <button
            onClick={undoToast}
            className="min-h-[44px] shrink-0 font-bold text-amber-300"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
