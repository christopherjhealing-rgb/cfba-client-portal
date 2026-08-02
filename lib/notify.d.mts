/** A job the client can download right now. The whole of what
 *  /api/notifications will ever say about a job. */
export interface ReadyJob {
  ref: string;
  address: string;
}

/** One poll's answer. Two fields, deliberately. */
export interface Snapshot {
  /** Message threads with something in them the client hasn't opened. */
  unread: number;
  ready: ReadyJob[];
}

/** What this browser has already been told about, per company. */
export interface Seen {
  unread: number;
  ready: string[];
}

export type NewsEvent =
  | { kind: "ready"; ref: string; address: string }
  | { kind: "message"; unread: number };

export const READY_MEMORY: number;
export const READY_TOASTS: number;
export function seenKey(company: string | null | undefined): string;
export function sanitiseSeen(raw: unknown): Seen | null;
export function sanitiseSnapshot(raw: unknown): Snapshot | null;
export function newsSince(
  seen: Seen | null, snap: Snapshot
): { events: NewsEvent[]; seen: Seen };
