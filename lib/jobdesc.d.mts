// Types for lib/jobdesc.mjs — what's being built, and the one line the board gets.

export interface JobType {
  label: string;
  plural: string;
}

export interface JobClass {
  key: string;
  label: string;
  short: string;
  board: string;
  hint: string;
  types: readonly JobType[];
}

/** One thing being built, after normalising. */
export interface JobItem {
  classKey: string;
  /** A label from that class's list, or OTHER. */
  type: string;
  /** Free text, set only when type is OTHER. */
  text: string;
  qty: number;
}

/** What the browser sends — anything, really; normaliseItems copes. */
export interface RawJobItem {
  classKey?: string;
  type?: string;
  text?: string;
  qty?: number | string;
}

export const OTHER: string;
export const MAX_ITEMS: number;
export const MAX_QTY: number;
export const MAX_TEXT: number;
export const MIXED_10: string;
export const JOB_CLASSES: readonly JobClass[];

export function classByKey(key: string): JobClass | null;
export function hasTypes(key: string): boolean;
export function normaliseItems(raw: unknown): JobItem[];
export function mergeItems(items: readonly JobItem[]): JobItem[];
export function phraseFor(item: JobItem): string;
export function joinAnd(parts: readonly string[]): string;
export function classKeysOf(items: readonly JobItem[]): string[];
export function boardClass(items: readonly JobItem[]): string;
export function buildDescription(items: readonly JobItem[]): string;

export const NOTHING_TO_LODGE: string;

export type DescribeResult =
  | { ok: false; error: string }
  | { ok: true; items: JobItem[]; jobClass: string; description: string };

export function describeJob(raw: unknown): DescribeResult;
