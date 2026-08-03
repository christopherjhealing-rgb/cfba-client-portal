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
export function suggestUsername(companyName: string | null | undefined): string;
export function matchCompany(card: CardRef, companies: CompanyMatch[]): string | null;
export function parseRef(nameOrUrl: string | null | undefined): string | null;
export function folderMatchesRef(folderName: string | null | undefined, ref: string): boolean;
export const READY_STATUS: string;
/** Case-insensitive label sets. Not real Sets — `has` normalises first, so
 *  "QUERY" on the board still matches "Query" here. */
export interface StatusSet { has(s: string | null | undefined): boolean; values(): Iterable<string>; }
export const HIDDEN_STATUSES: StatusSet;
export function clientStatusLabel(mondayStatus: string | null | undefined, fileCount?: number): string;
export function isClientVisible(job: PortalJob): boolean;
export const PORTAL_ISSUED: string;
export const PORTAL_READY: string;
export const PORTAL_DOWNLOADED: string;
export const PORTAL_STUCK: string;
export function portalLadder(issued?: string, ready?: string, downloaded?: string): string[];
export function portalRank(label: string | null | undefined, ladder?: string[]): number;
export type PortalWriteDecision = "write" | "already" | "unknown" | "unknown-target";
export function portalColumnWrite(
  currentLabel: string | null | undefined,
  target: string,
  ladder?: string[],
  stuck?: string,
): PortalWriteDecision;
export const GENERAL_REF: string;
export function isGeneralRef(ref: string | null | undefined): boolean;
export const CANCELLED_STATUS: string;
export const ISSUED_STATUSES: StatusSet;
/** All canCancel needs. Both repo.Job and PortalJob satisfy it. */
export interface CancellableJob {
  mondayStatus?: string | null;
  firstDownloadedAt?: string | null;
}
export function canCancel(job: CancellableJob | null | undefined): boolean;
export function addMonths(iso: string, months: number): string | null;
export function retention(firstDownloadedAt: string | null | undefined, now?: Date | string, months?: number): Retention;
export function jobBucket(job: PortalJob, now?: Date | string, months?: number): Bucket;
export function groupJobs<T extends PortalJob>(jobs: T[], now?: Date | string, months?: number): Record<Bucket, T[]>;
export function tidyAddress(s: string | null | undefined): string;
export const CLIENT_ACTION_STATUSES: StatusSet;
export const IN_HOUSE_WAIT_STATUSES: StatusSet;
export const INFO_RECEIVED_STATUS: string;
export const AWAITING_REPLY_STATUSES: StatusSet;
export function needsClientInfo(job: PortalJob): boolean;
export function splitInProgress<T extends PortalJob>(jobs: T[]): { awaiting: T[]; running: T[] };
export const STAGES: { key: string; label: string }[];
export const PAUSED_STATUSES: StatusSet;
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
