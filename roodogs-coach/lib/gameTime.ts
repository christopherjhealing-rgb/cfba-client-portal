// Pure helpers for the event-sourced match model. Game time is always
// computed from sub_on/sub_off events intersected with the clock's live
// periods — never stored — so undo (deleting the last event) and halftime
// both fall out for free.

import type { ClockPeriod, MatchEvent } from "./types";

/** Total ms the game clock has run. Open period counts up to nowMs. */
export function clockElapsedMs(
  periods: ClockPeriod[],
  nowMs: number
): number {
  return periods.reduce(
    (sum, p) => sum + Math.max(0, (p.endMs ?? nowMs) - p.startMs),
    0
  );
}

export function isClockRunning(periods: ClockPeriod[]): boolean {
  const last = periods[periods.length - 1];
  return last !== undefined && last.endMs === undefined;
}

/** Player ids currently on the field, replayed from sub events. */
export function onFieldIds(events: MatchEvent[]): string[] {
  const on = new Set<string>();
  for (const e of events) {
    if (e.type === "sub_on") on.add(e.playerId);
    else if (e.type === "sub_off") on.delete(e.playerId);
  }
  return [...on];
}

interface Stint {
  onMs: number;
  offMs?: number;
}

function playerStints(playerId: string, events: MatchEvent[]): Stint[] {
  const stints: Stint[] = [];
  let open: Stint | null = null;
  for (const e of events) {
    if (e.playerId !== playerId) continue;
    if (e.type === "sub_on" && open === null) {
      open = { onMs: e.timestampMs };
      stints.push(open);
    } else if (e.type === "sub_off" && open !== null) {
      open.offMs = e.timestampMs;
      open = null;
    }
  }
  return stints;
}

function overlapMs(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number
): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Game time for one player: their on-field stints intersected with the
 * clock's live periods. Open stints and the open period are closed out at
 * nowMs — for a finished match, pass the final whistle timestamp (the last
 * period's endMs) so anyone still on the field is closed out there.
 */
export function playerGameTimeMs(
  playerId: string,
  events: MatchEvent[],
  periods: ClockPeriod[],
  nowMs: number
): number {
  const stints = playerStints(playerId, events);
  let total = 0;
  for (const stint of stints) {
    for (const period of periods) {
      total += overlapMs(
        stint.onMs,
        stint.offMs ?? nowMs,
        period.startMs,
        period.endMs ?? nowMs
      );
    }
  }
  return total;
}

/** Final whistle timestamp of a finished match (end of its last period). */
export function finalWhistleMs(periods: ClockPeriod[]): number {
  const last = periods[periods.length - 1];
  return last?.endMs ?? last?.startMs ?? 0;
}

export function countEvents(
  events: MatchEvent[],
  playerId: string,
  type: MatchEvent["type"]
): number {
  return events.filter((e) => e.playerId === playerId && e.type === type)
    .length;
}

export function formatClock(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function formatMins(ms: number): string {
  return `${Math.round(ms / 60000)} min`;
}
