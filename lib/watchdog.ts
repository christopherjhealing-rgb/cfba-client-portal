// The evening report.
//
// Everything else in this portal reacts to something happening. This is the
// one thing that looks for something that should have happened and didn't —
// the job that never reaches the client, which is the only failure here that
// costs somebody a week and never announces itself.
//
// It builds the report; it doesn't send it. See app/api/report/route.ts.

import * as repo from "./repo";
import { env } from "./env";
import { ISSUED_STATUSES, READY_STATUS, GENERAL_REF } from "./core.mjs";

export interface ReportLine {
  ref: string;
  address: string;
  company: string;
  detail: string;
  /** Whole days since the thing we're worried about started. */
  days: number;
}

export interface DailyReport {
  /** The Perth date this covers. */
  date: string;
  /** Nothing needs a human. Still sent — a quiet day should look quiet, not
   *  like the report stopped working. */
  allClear: boolean;
  /** Issued today, reached the portal today, downloaded today. */
  issuedToday: number;
  readyToday: number;
  downloadedToday: number;
  /** Card says issued; the portal still has no files. */
  stuck: ReportLine[];
  /** Portal has the files; the client was never told. */
  untold: ReportLine[];
  /** Ready for a while and the client still hasn't opened it. */
  unopened: ReportLine[];
  /** Older than the report's window, so listed as a count rather than by name.
   *  Said out loud: a report that quietly drops things reads as "all clear"
   *  when it isn't. */
  stuckOlder: number;
  unopenedOlder: number;
  /** A PORTAL write the board wouldn't take. */
  boardFails: ReportLine[];
  /** Enquiries waiting on an answer. */
  enquiriesWaiting: number;
  /** Lodgements sitting in the review queue. Normally none: a job goes
   *  straight onto the board. One that couldn't — Monday down at the moment
   *  they pressed Lodge — lands here, and the client believes it's lodged. */
  queued: ReportLine[];
  /** Set when the sync itself is the problem — everything above is only as
   *  current as the last run, so a stale sync is said first, not last. */
  syncProblem: string | null;
}

const DAY = 86_400_000;

/** How far back a daily report reaches. Past this a problem has stopped being
 *  news and become a cleanup job — it's still counted, just not named, so the
 *  report stays short enough to actually be read. */
const WINDOW_DAYS = 21;

function perthDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Perth" }).format(d);
}

function daysSince(iso: string | null | undefined, now: Date): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** Whole days a card has been at issued without the portal getting anything.
 *  Falls back to lastSyncedAt when the watch list has no start time — a job
 *  that went quiet before this feature existed still deserves a line. */
function stuckDays(
  watch: repo.WatchState, ref: string, fallback: string | null, now: Date
): number {
  return daysSince(watch.stuckSince[ref] || fallback, now);
}

export async function buildDailyReport(now = new Date()): Promise<DailyReport> {
  const today = perthDate(now);
  const [jobs, companies, watch, lastSync, enquiries, pending] = await Promise.all([
    repo.listAllJobs().catch(() => []),
    repo.listCompanies().catch(() => []),
    repo.getWatch().catch(() => repo.EMPTY_WATCH),
    repo.getSetting<{ at?: string; ok?: boolean; error?: string }>("last_sync").catch(() => null),
    repo.listMessagesByRef(GENERAL_REF).catch(() => []),
    repo.listSubmissions("pending").catch(() => []),
  ]);

  const nameOf = new Map(companies.map((c) => [c.id, c.name]));
  const byRef = new Map(jobs.map((j) => [j.ref, j]));
  const line = (ref: string, detail: string, days: number): ReportLine => {
    const j = byRef.get(ref);
    return {
      ref,
      address: j?.address || "",
      company: (j && nameOf.get(j.companyId)) || "",
      detail,
      days,
    };
  };

  // --- the sync itself -----------------------------------------------------
  // Said first because everything below is only as current as the last run.
  let syncProblem: string | null = null;
  if (!lastSync?.at) {
    syncProblem = "The sync has never recorded a run.";
  } else if (lastSync.ok === false) {
    syncProblem = `The last sync failed: ${lastSync.error || "no reason recorded"}.`;
  } else if (now.getTime() - new Date(lastSync.at).getTime() > 60 * 60 * 1000) {
    const mins = Math.round((now.getTime() - new Date(lastSync.at).getTime()) / 60000);
    syncProblem = `The last sync was ${mins} minutes ago — it runs every five. ` +
      `Nothing below has been checked since then.`;
  }

  // --- issued, but the portal has nothing ----------------------------------
  // Exactly "Issued", not the whole issued family: a card the office has moved
  // on to To Invoice or Invoiced / Completed is one they've dealt with, and
  // the pre-portal backlog sits in those two with no files by definition.
  const stuck: ReportLine[] = [];
  let stuckOlder = 0;
  for (const j of jobs) {
    if (j.mondayStatus !== READY_STATUS) continue;
    if (j.fileCount > 0) continue;
    const days = stuckDays(watch, j.ref, j.lastSyncedAt, now);
    if (days > WINDOW_DAYS) { stuckOlder++; continue; }
    stuck.push(line(j.ref, "at Issued on the board, no files in the portal", days));
  }

  // --- in the portal, but the client was never told ------------------------
  const untold: ReportLine[] = [];
  for (const [ref, note] of Object.entries(watch.emailFailed)) {
    untold.push(line(ref, note.why || "the ready email didn't send", daysSince(note.at, now)));
  }

  // --- ready for a while and still not opened ------------------------------
  // Not a failure by itself. It's how a dead email address, a wrong contact or
  // a builder who never checks their inbox actually shows up.
  const unopened: ReportLine[] = [];
  let unopenedOlder = 0;
  for (const j of jobs) {
    if (!j.issuedAt || j.firstDownloadedAt || j.fileCount === 0) continue;
    const days = daysSince(j.issuedAt, now);
    if (days < env.unopenedAfterDays) continue;
    if (days > WINDOW_DAYS) { unopenedOlder++; continue; }
    unopened.push(line(j.ref, "ready in the portal, client hasn't opened it", days));
  }

  // --- board writes the portal couldn't make -------------------------------
  const boardFails: ReportLine[] = [];
  for (const [ref, note] of Object.entries(watch.boardFailed)) {
    boardFails.push(line(ref, note.why || "the board wouldn't take the write", daysSince(note.at, now)));
  }

  // --- what went right today ----------------------------------------------
  const issuedToday = jobs.filter(
    (j) => ISSUED_STATUSES.has(j.mondayStatus) && j.issuedAt && perthDate(new Date(j.issuedAt)) === today
  ).length;
  const readyToday = jobs.filter(
    (j) => j.issuedAt && j.fileCount > 0 && perthDate(new Date(j.issuedAt)) === today
  ).length;
  const downloadedToday = jobs.filter(
    (j) => j.firstDownloadedAt && perthDate(new Date(j.firstDownloadedAt)) === today
  ).length;

  // --- lodgements that never reached the board -----------------------------
  // Auto-accept puts a job on Monday the moment it's lodged. When it can't —
  // Monday down, a token expired — the lodgement drops into the review queue
  // and nothing else in the system says so, while the client has every reason
  // to believe the job is with us.
  const queued: ReportLine[] = pending.map((s) => ({
    ref: s.clientRef || "—",
    address: s.address || "",
    company: nameOf.get(s.companyId) || "",
    detail: "lodged, waiting to be accepted onto the board",
    days: daysSince(s.createdAt, now),
  })).sort((a, b) => b.days - a.days);

  // --- enquiries waiting ---------------------------------------------------
  const lastFrom = new Map<string, string>();
  for (const m of enquiries) lastFrom.set(m.companyId, m.from);
  const enquiriesWaiting = [...lastFrom.values()].filter((f) => f === "client").length;

  const sortByAge = (a: ReportLine, b: ReportLine) => b.days - a.days;
  stuck.sort(sortByAge);
  untold.sort(sortByAge);
  unopened.sort(sortByAge);
  boardFails.sort(sortByAge);

  return {
    date: today,
    allClear: !syncProblem && !stuck.length && !untold.length && !unopened.length
      && !boardFails.length && !queued.length && enquiriesWaiting === 0
      && stuckOlder === 0 && unopenedOlder === 0,
    issuedToday, readyToday, downloadedToday,
    stuck, untold, unopened, boardFails, stuckOlder, unopenedOlder,
    queued, enquiriesWaiting, syncProblem,
  };
}
