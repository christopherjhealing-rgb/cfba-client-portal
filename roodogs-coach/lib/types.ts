// Core entities for Roodogs Coach. All dates are ISO strings, all times epoch ms.

export type DrillTag =
  | "passing"
  | "tackling"
  | "evasion"
  | "rucking"
  | "fitness"
  | "fun"
  | "warmup";

export interface Player {
  id: string;
  name: string;
  notes: string;
  /** Soft delete: archived players keep their history but leave the roster. */
  active: boolean;
}

export interface Drill {
  id: string;
  name: string;
  tags: DrillTag[];
  durationMins: number;
  equipment: string;
  description: string;
  /** Optional whiteboard diagram for this drill. */
  boardId?: string;
}

export interface Session {
  id: string;
  date: string;
  drillIds: string[];
  notes: string;
}

export type MatchStatus = "setup" | "live" | "finished";

/** A stretch of real time during which the game clock was running
 *  (kick-off/resume through to pause/full-time). Open while live. */
export interface ClockPeriod {
  startMs: number;
  endMs?: number;
}

export interface Match {
  id: string;
  date: string;
  opponent: string;
  halfLengthMins: number;
  result?: string;
  status: MatchStatus;
  /** Players at the game today; defaults to the active roster. */
  squadIds?: string[];
  /** Clock bookkeeping — game time is computed from event overlap with
   *  these periods, so halftime never counts toward anyone's minutes. */
  clockPeriods?: ClockPeriod[];
}

export type MatchEventType = "sub_on" | "sub_off" | "try" | "tackle";

/** What a whiteboard diagram is for. */
export type BoardKind = "drill" | "game" | "set_play";

export type TokenType =
  | "player"
  | "opponent"
  | "cone"
  | "hurdle"
  | "bag"
  | "ball";

export type MovementType = "run" | "pass" | "kick" | "tackle" | "jump";

/** A thing placed on the whiteboard. Coordinates are in pitch units
 *  (0–100 across, 0–140 down), not pixels. */
export interface BoardToken {
  id: string;
  type: TokenType;
  x: number;
  y: number;
  label?: string;
}

/** A movement arrow drawn on the whiteboard, start to finish. */
export interface BoardMovement {
  id: string;
  type: MovementType;
  points: { x: number; y: number }[];
}

export interface Board {
  id: string;
  name: string;
  kind: BoardKind;
  tokens: BoardToken[];
  movements: BoardMovement[];
  updatedMs: number;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  playerId: string;
  type: MatchEventType;
  timestampMs: number;
}
