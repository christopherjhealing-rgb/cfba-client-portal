// The past-jobs index.
//
// The sync only ever pulls issued and non-closed cards, so the portal holds a
// client's current work and nothing else. Everything we've finished — for most
// clients, nearly everything they've ever had from us — is on the board and
// invisible here. That's fine until they want to amend one, at which point
// they have to type a reference from memory.
//
// This builds a small per-client list of every job we've ever done for them,
// so the amendment picker can offer it.
//
// It is DELIBERATELY not the jobs table. A finished job imported there would
// land in the "in progress" bucket, show a client a job with no certificate to
// download, and quietly change every turnaround report — three problems in
// exchange for an autocomplete. This is a lookup list and nothing else.

import * as repo from "./repo";
import * as monday from "./monday";
import { matchCompany, HIDDEN_STATUSES, CANCELLED_STATUS } from "./core.mjs";

export interface PastJob {
  ref: string;
  address: string;
  /** The board's own status, so the picker can say "completed" or "cancelled". */
  status: string;
  /** When the card was created — used only to order the list. */
  at: string | null;
}

interface PastJobIndex { at: string; jobs: PastJob[] }

const key = (companyId: string) => `pastjobs:${companyId}`;

/** Most clients have a handful; the busiest have hundreds. A cap keeps one
 *  client's history from becoming a settings row nobody can load, and the
 *  newest are the ones anybody amends. */
const MAX_PER_COMPANY = 400;

export async function getPastJobs(companyId: string): Promise<PastJob[]> {
  const idx = await repo.getSetting<PastJobIndex>(key(companyId)).catch(() => null);
  return idx?.jobs || [];
}

export async function pastJobsBuiltAt(companyId: string): Promise<string | null> {
  const idx = await repo.getSetting<PastJobIndex>(key(companyId)).catch(() => null);
  return idx?.at || null;
}

export interface RefreshResult {
  scanned: number;
  matched: number;
  companies: number;
  unmatched: number;
}

/**
 * Rebuild the index for every client, from one walk of the board.
 *
 * Once for everybody rather than once each: per-client it would be eight pages
 * multiplied by the number of clients, for the same answer. Runs on a
 * schedule and on demand from /admin — never on a request somebody is waiting
 * for.
 */
export async function refreshPastJobs(): Promise<RefreshResult> {
  const res: RefreshResult = { scanned: 0, matched: 0, companies: 0, unmatched: 0 };

  const [cards, companies] = await Promise.all([
    monday.listAllCards(),
    repo.companiesForMatch(),
  ]);
  res.scanned = cards.length;
  if (!cards.length) return res;

  const byCompany = new Map<string, PastJob[]>();
  for (const c of cards) {
    // QUERY exists to hide a job from the client completely. This index reads
    // the board directly and so walks straight past isClientVisible — without
    // this, a job the office deliberately hid would appear in the amendment
    // picker. Cancelled jobs are dropped too: there's nothing to amend.
    if (HIDDEN_STATUSES.has(c.status)) continue;
    if (c.status === CANCELLED_STATUS) continue;

    const companyId = matchCompany({ clientName: c.clientName, email: c.email }, companies);
    if (!companyId) { res.unmatched++; continue; }
    res.matched++;
    const list = byCompany.get(companyId) || [];
    list.push({ ref: c.ref, address: c.address, status: c.status, at: c.createdAt });
    byCompany.set(companyId, list);
  }

  for (const [companyId, list] of byCompany) {
    // Newest first, then capped — a client amending something is almost always
    // amending recent work.
    list.sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    const jobs = list.slice(0, MAX_PER_COMPANY);
    try {
      await repo.setSetting(key(companyId), { at: new Date().toISOString(), jobs });
      res.companies++;
    } catch (e) {
      console.warn(`past jobs: couldn't store ${companyId}:`, (e as Error).message);
    }
  }

  // A company whose cards have all gone is left with a stale list rather than
  // an empty one — harmless, and safer than deleting on the strength of one
  // run that might have been a bad read.
  return res;
}
