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
  "FIR": "Further information needed from you",
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
  "Issued": "Issued — ready to download",
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
