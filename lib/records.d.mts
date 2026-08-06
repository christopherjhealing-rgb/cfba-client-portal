// Types for lib/records.mjs — the correspondence record for a job.

export interface RecordFile {
  name: string;
  size?: number;
  storagePath?: string;
  contentType?: string;
}

export interface RecordMessage {
  from: "client" | "cfba";
  body: string;
  createdAt: string;
  files?: RecordFile[];
}

export interface RecordJob {
  ref: string;
  address?: string | null;
  description?: string | null;
  clientRef?: string | null;
  mondayStatus?: string | null;
  receivedAt?: string | null;
  issuedAt?: string | null;
}

export type BlockType =
  | "title" | "field" | "heading" | "note" | "from" | "body" | "attachment";

export interface Block {
  type: BlockType;
  text: string;
  meta?: { n?: number; from?: string; path?: string };
}

export interface PlacedFile extends RecordFile {
  path: string;
  messageIndex: number;
}

export interface Transcript {
  blocks: Block[];
  files: PlacedFile[];
  count: number;
}

export const PROVENANCE: readonly string[];

export function stamp(iso: string, tz?: string): string;
export function dateOnly(iso: string, tz?: string): string;
export function senderName(m: RecordMessage, companyName?: string): string;
export function safeName(s: string, max?: number): string;
export function attachmentPath(index: number, name: string): string;
export function transcript(input: {
  job: RecordJob;
  messages: readonly RecordMessage[];
  companyName?: string;
  exportedAt: string;
  tz?: string;
  /** The documents supplied at lodgement, by name — from the original
   *  submission. Listed, not embedded (the files are filed separately). */
  lodgedDocuments?: readonly { name: string; category?: string }[];
}): Transcript;
export function asText(t: Transcript): string;
export function chooseAttachment(input: {
  zipBytes: number; pdfBytes: number; budget: number;
}): { pick: "zip" | "pdf" | "none"; whole: boolean };
export function zipName(job: RecordJob): string;
