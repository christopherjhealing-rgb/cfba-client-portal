// Single storage module for all app state. Everything lives in localStorage for v1;
// components only ever talk to this interface, so swapping in Vercel KV or a
// database later means changing this file and nothing else.

import type { Board, Drill, Match, MatchEvent, Player, Session } from "./types";

const KEYS = {
  players: "roodogs.players",
  drills: "roodogs.drills",
  sessions: "roodogs.sessions",
  matches: "roodogs.matches",
  matchEvents: "roodogs.matchEvents",
  boards: "roodogs.boards",
} as const;

function read<T>(key: string, fallback: T): T {
  // Rendering on the server (or with storage blocked) just yields the fallback;
  // components re-read on the client after mount.
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked — nothing sensible to do in v1.
  }
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const storage = {
  getPlayers(): Player[] {
    return read<Player[]>(KEYS.players, []);
  },
  setPlayers(players: Player[]): void {
    write(KEYS.players, players);
  },

  getDrills(): Drill[] {
    return read<Drill[]>(KEYS.drills, []);
  },
  setDrills(drills: Drill[]): void {
    write(KEYS.drills, drills);
  },

  getSessions(): Session[] {
    return read<Session[]>(KEYS.sessions, []);
  },
  setSessions(sessions: Session[]): void {
    write(KEYS.sessions, sessions);
  },

  getMatches(): Match[] {
    return read<Match[]>(KEYS.matches, []);
  },
  setMatches(matches: Match[]): void {
    write(KEYS.matches, matches);
  },

  getBoards(): Board[] {
    return read<Board[]>(KEYS.boards, []);
  },
  setBoards(boards: Board[]): void {
    write(KEYS.boards, boards);
  },

  getMatchEvents(matchId?: string): MatchEvent[] {
    const events = read<MatchEvent[]>(KEYS.matchEvents, []);
    return matchId ? events.filter((e) => e.matchId === matchId) : events;
  },
  setMatchEvents(events: MatchEvent[]): void {
    write(KEYS.matchEvents, events);
  },
};
