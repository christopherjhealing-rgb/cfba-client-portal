// Framework-agnostic domain logic for the CFBA client portal.
// Plain ESM so Node's test runner imports it directly and Next imports the same
// single source of truth. Types live alongside in core.d.ts.

// ---------------------------------------------------------------------------
// Client identity. The Monday "Client" field is free text — "GVF",
// "GVF (Joe Furfaro)", "GVF Pty Ltd" are one company. The portal owns the
// canonical identity; these helpers collapse the mess onto it.
// ---------------------------------------------------------------------------
const SUFFIX = /\b(pty\.?\s*ltd|p\/l|ltd|inc|group|homes?|building|builders?|constructions?|patios?|improvements?)\b/gi;

export function aliasKey(name) {
  let s = (name || "").toString().trim().toLowerCase();
  s = s.replace(/\(.*?\)/g, " ");        // drop "(Joe Furfaro)", "(formerly K and M)"
  s = s.replace(SUFFIX, " ");
  s = s.replace(/[^a-z0-9 ]+/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function normEmail(email) {
  return (email || "").toString().trim().toLowerCase();
}

/**
 * Match a Monday card to a company. Email wins (it's clean); the normalised
 * client name is the fallback. Returns the company id or null.
 * companies: [{ id, aliasKeys: string[], emails: string[] }]
 */
export function matchCompany(card, companies) {
  const email = normEmail(card.email);
  if (email) {
    for (const co of companies) {
      if ((co.emails || []).some((e) => normEmail(e) === email)) return co.id;
    }
  }
  const key = aliasKey(card.clientName);
  if (key) {
    for (const co of companies) {
      if ((co.aliasKeys || []).some((k) => k === key)) return co.id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Reference / folder matching. Job folders are named "<address> - <ref>".
// ---------------------------------------------------------------------------
const REF_TAIL = /-\s*([A-Za-z]?\d{3,6}(?:-\d{1,4})?)\s*(?:\/|$)/;

export function parseRef(nameOrUrl) {
  const m = REF_TAIL.exec((nameOrUrl || "").toString());
  return m ? m[1] : null;
}

export function folderMatchesRef(folderName, ref) {
  if (!ref) return false;
  const re = new RegExp("-\\s*" + String(ref).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$");
  return re.test((folderName || "").toString().trim());
}

// ---------------------------------------------------------------------------
// Status -> what the client sees. Monday labels are internal; clients get
// plain English. Only "Issued" makes files downloadable.
// ---------------------------------------------------------------------------
export const READY_STATUS = "Issued";

// Monday statuses the client should never see a job under — hidden entirely
// unless the job has already been downloaded.
export const HIDDEN_STATUSES = new Set(["Query"]);

const CLIENT_LABELS = {
  "To Assess": "Received — in the queue",
  "To CDC": "Assessed — certificate being written up",
  "Chris CDC": "Assessed — certificate being written up",
  "Chris CDC 2": "Assessed — certificate being written up",
  "To Check": "In final review",
  "To Issue": "Being finalised",
  "To FIR": "We need a little more information — an email with the details is on its way",
  // Matches the "Action required" language used for headings and badges —
  // one state, one name. "With you since <date>" chips stay separate: they
  // are a time statement, not a status.
  "FIR": "Action required — see the request",
  "FIR - ENG": "Waiting for documentation from the engineer",
  "SCL": "Waiting for documentation from the engineer",
  "New Info Received": "Requested information received — in for re-assessment",
  "Amendment": "Amendment in progress",
  "To Inspect": "Inspection stage",
  "Waiting for Time": "Inspection being scheduled",
  "TIME BOOKED": "Inspection booked",
  "Inspected": "Inspection complete",
  "To Lodge": "Being lodged",
  "To Send": "Being finalised",
  "Issued": "CDC Package issued — ready to download",
  "To Invoice": "Complete",
  "Invoiced / Completed": "Complete",
  "On Hold": "The job is currently on hold",
  "Query": "The job is currently on hold",
  "Cancelled": "Cancelled",
};

export function clientStatusLabel(mondayStatus, fileCount) {
  // An Issued card whose files haven't been delivered yet (issue hold /
  // OneDrive settling) must not read as downloadable.
  if (mondayStatus === READY_STATUS && fileCount === 0) return "Being finalised";
  return CLIENT_LABELS[mondayStatus] || "In progress";
}

/** Whether a job should appear in the client's list at all. */
export function isClientVisible(job) {
  if (job.firstDownloadedAt) return true; // once downloaded, always visible
  return !HIDDEN_STATUSES.has(job.mondayStatus);
}

// ---------------------------------------------------------------------------
// Writing BACK to the board: the "Send?" column.
//
// The board carries a column called "Send?" (NO / YES / SENT) with a date
// partner called "Job Sent". That pair — not the main Status column — is the
// office's record of the package reaching the client. Status tracks the
// assessment and has no Sent label at all, which is why an earlier version of
// this code wrote there and silently did nothing.
//
// Two things mean the client has the package, whichever happens first: the
// issued email going out, or the client downloading it. Both come through
// here, so the board reads the same either way.
//
// The one guard: never write over a label that already records the client
// having it. `create_labels_if_missing` stays off for every write in
// lib/monday.ts — a portal that quietly adds labels to a 3,700-item board is
// a portal nobody can trust — so a label the office hasn't created is a
// no-op we log rather than invent.
// ---------------------------------------------------------------------------
export const SEND_SENT = "SENT";

/** Labels on "Send?" that already mean the client has it. Never written over.
 *  DOWNLOADED is here ahead of the office adding it, so the day it appears on
 *  the board the portal already respects it. */
export const SEND_DONE = new Set([SEND_SENT, "DOWNLOADED"]);

/**
 * Whether to stamp "Send?" SENT, given whatever the column says right now.
 *
 *   "write"   — go ahead
 *   "already" — it already records the client having the package; leave it
 */
export function sendColumnWrite(currentLabel) {
  const now = String(currentLabel || "").trim().toUpperCase();
  return SEND_DONE.has(now) ? "already" : "write";
}

// ---------------------------------------------------------------------------
// The general enquiry channel.
//
// Every message in the portal hangs off a job reference, because until now
// every message was about a job. A client with a question that isn't about a
// job — a quote, a fee, "do I even need a CDC for this?" — had nowhere to put
// it but the phone, so it arrived as an interruption and left no record.
//
// An enquiry thread needs a ref like any other, so it gets a reserved one.
// Board references are digits, so nothing a client owns can collide with it,
// and no schema had to change to make room.
// ---------------------------------------------------------------------------
export const GENERAL_REF = "GENERAL";

/** Is this the enquiry thread rather than a job? */
export function isGeneralRef(ref) {
  return String(ref || "").trim().toUpperCase() === GENERAL_REF;
}

// ---------------------------------------------------------------------------
// Cancelling a job from the portal.
//
// Only before the certificate exists. Once a CDC Package has been issued the
// client cannot withdraw it — a signed certificate is a statutory document,
// not an order that can be taken back — so the option disappears rather than
// failing when pressed. "Issued" here is the whole issued family: the office
// moves a card on to To Invoice and Invoiced / Completed after issuing, and
// all three mean the same thing to a client. A job already downloaded was
// issued by definition, whatever the card says now.
// ---------------------------------------------------------------------------
export const CANCELLED_STATUS = "Cancelled";

/** Statuses at or past issuance — the certificate exists. */
export const ISSUED_STATUSES = new Set([
  "Issued", "To Invoice", "Invoiced / Completed",
]);

export function canCancel(job) {
  if (!job) return false;
  if (job.mondayStatus === CANCELLED_STATUS) return false;
  if (ISSUED_STATUSES.has(job.mondayStatus)) return false;
  if (job.firstDownloadedAt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Retention: a downloaded job stays visible for `months`, then it's expired
// (purged from storage, hidden from the portal).
// ---------------------------------------------------------------------------
export function addMonths(iso, months) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < day) d.setUTCDate(0); // clamp e.g. 31 Aug + 6 -> 28/29 Feb
  return d.toISOString();
}

export function retention(firstDownloadedAt, now = new Date(), months = 6) {
  if (!firstDownloadedAt) return { expired: false, expiresAt: null, daysLeft: null };
  const expiresAt = addMonths(firstDownloadedAt, months);
  const nowT = (now instanceof Date ? now : new Date(now)).getTime();
  const daysLeft = Math.ceil((new Date(expiresAt).getTime() - nowT) / 86400000);
  return { expired: daysLeft <= 0, expiresAt, daysLeft };
}

/**
 * Which portal bucket a job belongs in.
 *   in_progress -> status only, no download
 *   ready       -> Issued, files present, not yet downloaded
 *   downloaded  -> downloaded, still inside retention (archive section)
 *   expired     -> past retention (hidden/purged)
 */
export function jobBucket(job, now = new Date(), months = 6) {
  if (job.firstDownloadedAt) {
    return retention(job.firstDownloadedAt, now, months).expired
      ? "expired" : "downloaded";
  }
  if (job.mondayStatus === READY_STATUS && job.fileCount > 0) return "ready";
  return "in_progress";
}

export function groupJobs(jobs, now = new Date(), months = 6) {
  const out = { ready: [], in_progress: [], downloaded: [], expired: [] };
  for (const j of jobs) out[jobBucket(j, now, months)].push(j);
  return out;
}

// ---------------------------------------------------------------------------
// Address helper for the submission form / display.
// ---------------------------------------------------------------------------
export function tidyAddress(s) {
  return (s || "").toString().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Further information. Only "FIR" is the client's move — FIR-ENG and SCL are
// waits on the engineer, handled in-house, and must never prompt the client
// to do anything. They stay as ordinary in-progress rows.
// ---------------------------------------------------------------------------
export const CLIENT_ACTION_STATUSES = new Set(["FIR"]);
export const IN_HOUSE_WAIT_STATUSES = new Set(["FIR - ENG", "SCL"]);

export function needsClientInfo(job) {
  return CLIENT_ACTION_STATUSES.has(job.mondayStatus) && !job.firstDownloadedAt;
}

/** Dashboard split: what the client must act on vs what is simply running. */
export function splitInProgress(jobs) {
  const awaiting = [], running = [];
  for (const j of jobs) (needsClientInfo(j) ? awaiting : running).push(j);
  return { awaiting, running };
}

// ---------------------------------------------------------------------------
// Client-facing progress. Five steps, derived purely from the current Monday
// status — no transition history, and deliberately no dates. A stage is a
// statement about where a job IS, not a promise about when it moves.
// ---------------------------------------------------------------------------
export const STAGES = [
  { key: "received",   label: "Received" },
  { key: "assessment", label: "Under assessment" },
  { key: "fir",        label: "Further information" },
  { key: "certificate",label: "Certificate being prepared" },
  { key: "issued",     label: "Issued" },
];

const STAGE_OF = {
  "To Assess": 1, "New Info Received": 1, "To Check": 1, "Amendment": 1,
  "To FIR": 2, "FIR": 2, "FIR - ENG": 2, "SCL": 2,
  "To CDC": 3, "Chris CDC": 3, "Chris CDC 2": 3, "To Issue": 3,
  "To Lodge": 3, "To Send": 3,
  // Inspections happen while the job is still being assessed, not after the
  // certificate is drawn up.
  "To Inspect": 1, "Waiting for Time": 1, "TIME BOOKED": 1, "Inspected": 1,
  "Issued": 4, "To Invoice": 4, "Invoiced / Completed": 4,
};

// Paused rather than progressing. The job keeps whatever step it reached.
export const PAUSED_STATUSES = new Set(["On Hold", "Query"]);

/** Which step a job is currently on, 0-4. Anything unrecognised sits at
 *  Received rather than being invented further along. */
export function stageIndex(job) {
  return STAGE_OF[job.mondayStatus] ?? 0;
}

/** Per-step state for rendering: done | current | waiting | skipped | pending.
 *  "skipped" is the further-information step on a job that has moved past it —
 *  without transition history we can't know whether an FIR was ever raised, so
 *  it is shown as not applicable rather than as a stage that was completed. */
export function stageStates(job) {
  const at = stageIndex(job);
  const paused = PAUSED_STATUSES.has(job.mondayStatus);
  return STAGES.map((s, i) => {
    if (i < at) return s.key === "fir" ? "skipped" : "done";
    if (i > at) return "pending";
    if (s.key === "fir") return CLIENT_ACTION_STATUSES.has(job.mondayStatus) ? "waiting" : "current";
    return paused ? "paused" : "current";
  });
}

// ---------------------------------------------------------------------------
// Business days. Used for "waiting on you since" — a count of elapsed working
// days, never a forecast. Weekends AND WA public holidays are excluded: a
// holiday counted as a working day would OVERSTATE the elapsed working days
// (say "5 days" when only 4 have passed).
//
// 2026 and 2027 are complete (verified against the published WA calendar,
// Aug 2026). Extend each year with the movable ones — Labour Day (1st Mon
// Mar), Good Friday, Easter Monday, WA Day (1st Mon Jun), King's Birthday
// (WA, late Sep — proclaimed annually, so check it) — and any
// observed-substitute days. A missing date just means that day counts as a
// working day (the old behaviour), so an incomplete list is safe, only
// slightly generous. Weekend-dated holidays are no-ops here.
// ---------------------------------------------------------------------------
export const WA_PUBLIC_HOLIDAYS = new Set([
  // 2026
  "2026-01-01", // New Year's Day (Thu)
  "2026-01-26", // Australia Day (Mon)
  "2026-03-02", // Labour Day (WA)
  "2026-04-03", // Good Friday
  "2026-04-06", // Easter Monday
  "2026-04-25", // Anzac Day (Sat)
  "2026-04-27", // Anzac Day substitute (Mon)
  "2026-06-01", // WA Day
  "2026-09-28", // King's Birthday (WA)
  "2026-12-25", // Christmas Day (Fri)
  "2026-12-28", // Boxing Day substitute (26th is a Sat)
  // 2027
  "2027-01-01", // New Year's Day (Fri)
  "2027-01-26", // Australia Day (Tue)
  "2027-03-01", // Labour Day (WA)
  "2027-03-26", // Good Friday
  "2027-03-29", // Easter Monday
  "2027-04-26", // Anzac Day substitute (25th is a Sun)
  "2027-06-07", // WA Day
  "2027-09-27", // King's Birthday (WA) — subject to annual proclamation
  "2027-12-27", // Christmas Day observed (25th is a Sat)
  "2027-12-28", // Boxing Day observed (26th is a Sun)
]);

export function businessDaysSince(iso, now = new Date(), holidays = WA_PUBLIC_HOLIDAYS) {
  const from = new Date(iso);
  if (Number.isNaN(from.getTime())) return null;
  let n = 0;
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  while (cur < end) {
    cur.setUTCDate(cur.getUTCDate() + 1);
    const d = cur.getUTCDay();
    if (d === 0 || d === 6) continue;
    const iso = cur.toISOString().slice(0, 10);
    if (holidays.has(iso)) continue;
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// The day clock, and stopping it while the job is with the client.
//
// "Day 6" on a job counts working days since we received it. It must NOT run
// while we are waiting on the client: a builder who takes a fortnight to send
// the engineering should not come back to a counter that has been ticking the
// whole time, as though the job sat on a CFBA desk. Hiding the counter (which
// is all that used to happen) doesn't fix that — it comes back showing every
// one of those days.
//
// The sync keeps one small record per job in portal_settings, `firdays:<ref>`
// — an ordinary k/v row, so no schema change and no SQL to paste:
//
//   { days: 7, since: null }                       7 banked days, not with the client now
//   { days: 7, since: "2026-07-20T04:00:00.000Z" } 7 banked, and open since that stamp
//
// `days` is business days already banked from periods that have closed;
// `since` is when the current open period started, or null. A job with NO
// record behaves exactly as it always did — nothing is subtracted.
// ---------------------------------------------------------------------------

/** Business days a job has spent with the client: banked, plus any open run. */
export function clientPausedDays(pause, now = new Date(), holidays = WA_PUBLIC_HOLIDAYS) {
  if (!pause) return 0;
  const banked = Number.isFinite(pause.days) ? Math.max(0, Math.trunc(pause.days)) : 0;
  if (!pause.since) return banked;
  const open = businessDaysSince(pause.since, now, holidays);
  return banked + (open === null || open < 0 ? 0 : open);
}

/**
 * Fold one sync observation into a job's pause record.
 *
 * Pure: hand it the record as stored (or null/undefined for a job that has
 * never had one) and whether the card is sitting at a client-action status
 * right now, and it hands back the record to store.
 *
 * Returns null when nothing has changed, so the sync can skip the write —
 * which is most cards, most cycles.
 */
export function nextClientPause(pause, isWithClient, now = new Date(), holidays = WA_PUBLIC_HOLIDAYS) {
  const days = pause && Number.isFinite(pause.days) ? Math.max(0, Math.trunc(pause.days)) : 0;
  const since = (pause && pause.since) || null;
  const at = now instanceof Date ? now : new Date(now);

  if (isWithClient) {
    if (since) return null;                    // already open — leave the stamp alone
    return { days, since: at.toISOString() };  // going out to the client: stop the clock
  }
  if (!since) return null;                     // already closed — nothing to bank
  const run = businessDaysSince(since, at, holidays);
  return { days: days + (run === null || run < 0 ? 0 : run), since: null };
}

/**
 * Working days a job has actually been with CFBA: elapsed since we received
 * it, less every day it spent waiting on the client. Never below zero.
 * With no pause record this is exactly businessDaysSince.
 */
export function elapsedBusinessDays(receivedAt, pause, now = new Date(), holidays = WA_PUBLIC_HOLIDAYS) {
  const total = businessDaysSince(receivedAt, now, holidays);
  if (total === null) return null;
  return Math.max(0, total - clientPausedDays(pause, now, holidays));
}

// ---------------------------------------------------------------------------
// Assigned surveyor, as shown to the client. Derived from the Monday People
// column plus status: "To Check" and the Chris CDC queues are always Chris;
// otherwise the named surveyor (a Chris/Rebecca card at "To Assess" is under
// assessment by them). Kacie is admin, never shown — when only she holds the
// card (To Assess = not yet allocated; To CDC / To Issue = the certifier) the
// caller keeps the last surveyor the sync remembered, which at To Issue is
// whoever certified it.
// ---------------------------------------------------------------------------
export function surveyorFor(peopleText, status) {
  const p = (peopleText || "").toLowerCase();
  // "To Assess" held by Chris or Rebecca IS assessment by that surveyor —
  // only Kacie (or nobody) at To Assess means it hasn't been allocated yet.
  if (status === "To Check" || status === "Chris CDC" || status === "Chris CDC 2") return "Chris";
  if (p.includes("chris")) return "Chris";
  if (p.includes("rebecca")) return "Rebecca";
  return null;
}
