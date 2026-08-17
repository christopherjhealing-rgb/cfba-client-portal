import { describe, expect, it } from "vitest";
import {
  clockElapsedMs,
  countEvents,
  finalWhistleMs,
  formatClock,
  isClockRunning,
  onFieldIds,
  playerGameTimeMs,
} from "./gameTime";
import type { ClockPeriod, MatchEvent } from "./types";

const MIN = 60_000;

function ev(
  playerId: string,
  type: MatchEvent["type"],
  timestampMs: number
): MatchEvent {
  return { id: `${playerId}-${type}-${timestampMs}`, matchId: "m1", playerId, type, timestampMs };
}

describe("clockElapsedMs", () => {
  it("sums closed periods and counts an open period up to now", () => {
    const periods: ClockPeriod[] = [
      { startMs: 0, endMs: 15 * MIN }, // first half
      { startMs: 20 * MIN }, // second half, still running
    ];
    expect(clockElapsedMs(periods, 25 * MIN)).toBe(20 * MIN);
  });

  it("is zero with no periods", () => {
    expect(clockElapsedMs([], 999)).toBe(0);
  });
});

describe("isClockRunning", () => {
  it("reflects whether the last period is open", () => {
    expect(isClockRunning([])).toBe(false);
    expect(isClockRunning([{ startMs: 0, endMs: 5 }])).toBe(false);
    expect(isClockRunning([{ startMs: 0, endMs: 5 }, { startMs: 9 }])).toBe(true);
  });
});

describe("onFieldIds", () => {
  it("replays sub events to the current on-field set", () => {
    const events = [
      ev("a", "sub_on", 0),
      ev("b", "sub_on", 0),
      ev("a", "sub_off", 5 * MIN),
      ev("c", "sub_on", 5 * MIN),
      ev("b", "try", 6 * MIN), // non-sub events ignored
    ];
    expect(onFieldIds(events).sort()).toEqual(["b", "c"]);
  });
});

describe("playerGameTimeMs", () => {
  const halves: ClockPeriod[] = [
    { startMs: 0, endMs: 15 * MIN },
    { startMs: 20 * MIN, endMs: 35 * MIN }, // 5 min halftime break
  ];

  it("excludes the halftime break for a player on the whole game", () => {
    const events = [ev("a", "sub_on", 0)];
    // 30 min of rugby across 35 min of wall clock
    expect(playerGameTimeMs("a", events, halves, finalWhistleMs(halves))).toBe(
      30 * MIN
    );
  });

  it("closes an open stint at the final whistle", () => {
    const events = [ev("a", "sub_on", 25 * MIN)];
    expect(playerGameTimeMs("a", events, halves, finalWhistleMs(halves))).toBe(
      10 * MIN
    );
  });

  it("counts only completed stints plus the live one", () => {
    const events = [
      ev("a", "sub_on", 0),
      ev("a", "sub_off", 5 * MIN),
      ev("a", "sub_on", 10 * MIN),
    ];
    // 5 min first stint + (10→15 first half) + (20→25 live now)
    expect(playerGameTimeMs("a", events, halves, 25 * MIN)).toBe(15 * MIN);
  });

  it("gives no credit for a swap made during the break", () => {
    const events = [ev("a", "sub_on", 17 * MIN)]; // subbed on at halftime
    expect(playerGameTimeMs("a", events, halves, 18 * MIN)).toBe(0);
    // …but time accrues once the second half kicks off
    expect(playerGameTimeMs("a", events, halves, 22 * MIN)).toBe(2 * MIN);
  });

  it("drops to the pre-event total when the last event is deleted (undo)", () => {
    const on = ev("a", "sub_on", 0);
    const off = ev("a", "sub_off", 5 * MIN);
    const withOff = [on, off];
    const undone = withOff.filter((e) => e.id !== off.id);
    expect(playerGameTimeMs("a", withOff, halves, 10 * MIN)).toBe(5 * MIN);
    expect(playerGameTimeMs("a", undone, halves, 10 * MIN)).toBe(10 * MIN);
  });
});

describe("countEvents", () => {
  it("counts one player's events of one type", () => {
    const events = [
      ev("a", "try", 1),
      ev("a", "try", 2),
      ev("a", "tackle", 3),
      ev("b", "try", 4),
    ];
    expect(countEvents(events, "a", "try")).toBe(2);
    expect(countEvents(events, "a", "tackle")).toBe(1);
    expect(countEvents(events, "b", "tackle")).toBe(0);
  });
});

describe("formatClock", () => {
  it("formats mm:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65_000)).toBe("1:05");
    expect(formatClock(20 * MIN)).toBe("20:00");
  });
});
