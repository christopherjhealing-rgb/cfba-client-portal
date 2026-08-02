export type Bucket = "ready" | "in_progress" | "downloaded" | "expired";

export interface CompanyMatch {
  id: string;
  aliasKeys?: string[];
  emails?: string[];
}

export interface CardRef {
  clientName?: string | null;
  email?: string | null;
}

export interface PortalJob {
  mondayStatus?: string | null;
  fileCount: number;
  firstDownloadedAt?: string | null;
  [k: string]: unknown;
}

export interface Retention {
  expired: boolean;
  expiresAt: string | null;
  daysLeft: number | null;
}

export function aliasKey(name: string | null | undefined): string;
export function normEmail(email: string | null | undefined): string;
export function matchCompany(card: CardRef, companies: CompanyMatch[]): string | null;
export function parseRef(nameOrUrl: string | null | undefined): string | null;
export function folderMatchesRef(folderName: string | null | undefined, ref: string): boolean;
export const READY_STATUS: string;
export const HIDDEN_STATUSES: Set<string>;
export function clientStatusLabel(mondayStatus: string | null | undefined, fileCount?: number): string;
export function isClientVisible(job: PortalJob): boolean;
export const SENT_STATUS: string;
export type StatusWriteDecision = "write" | "no-such-label" | "moved-on";
export function downloadStatusWrite(
  currentStatus: string | null | undefined,
  boardLabels: Iterable<string> | Set<string>,
  label?: string,
): StatusWriteDecision;
export const CANCELLED_STATUS: string;
export const ISSUED_STATUSES: Set<string>;
export function canCancel(job: PortalJob | null | undefined): boolean;
export function addMonths(iso: string, months: number): string | null;
export function retention(firstDownloadedAt: string | null | undefined, now?: Date | string, months?: number): Retention;
export function jobBucket(job: PortalJob, now?: Date | string, months?: number): Bucket;
export function groupJobs<T extends PortalJob>(jobs: T[], now?: Date | string, months?: number): Record<Bucket, T[]>;
export function tidyAddress(s: string | null | undefined): string;
export const CLIENT_ACTION_STATUSES: Set<string>;
export const IN_HOUSE_WAIT_STATUSES: Set<string>;
export function needsClientInfo(job: PortalJob): boolean;
export function splitInProgress<T extends PortalJob>(jobs: T[]): { awaiting: T[]; running: T[] };
export const STAGES: { key: string; label: string }[];
export const PAUSED_STATUSES: Set<string>;
export function stageIndex(job: PortalJob): number;
export function stageStates(job: PortalJob): string[];
export const WA_PUBLIC_HOLIDAYS: Set<string>;
export function businessDaysSince(iso: string, now?: Date, holidays?: Set<string>): number | null;

/** A job's with-the-client clock, stored in portal_settings as `firdays:<ref>`. */
export interface ClientPause {
  /** Business days banked from with-the-client periods that have closed. */
  days: number;
  /** When the current open period started; null when not with the client. */
  since: string | null;
}
export function clientPausedDays(
  pause: ClientPause | null | undefined, now?: Date, holidays?: Set<string>
): number;
export function nextClientPause(
  pause: ClientPause | null | undefined, isWithClient: boolean,
  now?: Date, holidays?: Set<string>
): ClientPause | null;
export function elapsedBusinessDays(
  receivedAt: string, pause?: ClientPause | null, now?: Date, holidays?: Set<string>
): number | null;

export function surveyorFor(peopleText: string | null | undefined, status: string | null | undefined): string | null;
