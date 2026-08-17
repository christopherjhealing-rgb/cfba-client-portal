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
}

export interface Session {
  id: string;
  date: string;
  drillIds: string[];
  notes: string;
}

export type MatchStatus = "setup" | "live" | "finished";

export interface Match {
  id: string;
  date: string;
  opponent: string;
  halfLengthMins: number;
  result?: string;
  status: MatchStatus;
}

export type MatchEventType = "sub_on" | "sub_off" | "try" | "tackle";

export interface MatchEvent {
  id: string;
  matchId: string;
  playerId: string;
  type: MatchEventType;
  timestampMs: number;
}
