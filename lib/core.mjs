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

/** The username a client name suggests: the whole thing, lower case, with
 *  everything that isn't a letter or a digit taken out. "Kacie's Patio's and
 *  Sheds" -> "kaciespatiosandsheds". Capped at the 40 the API accepts, and
 *  only ever a suggestion — staff can type over it. */
export function suggestUsername(companyName) {
  const base = (companyName || "")
    .toLowerCase()
    .replace(/\(.*?\)/g, "")     // drop "(formerly K and M)"
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
  return base || "client";
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
//
// Matched case- and space-insensitively, because the board's labels are typed
// by people and don't stay in one case. The board carries "QUERY" in capitals
// while this file had "Query"; the lookup was exact, so a job the office put
// on QUERY — a status meant to hide it from the client completely — sailed
// past HIDDEN_STATUSES and showed up reading "In progress". Nothing on the
// board is at QUERY today, which is the only reason nobody has seen it.
// ---------------------------------------------------------------------------
export const READY_STATUS = "Issued";

/** The one normalisation every status comparison in this file goes through. */
const statusKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/** A Set that doesn't care how the office capitalised the label. */
function statusSet(labels) {
  const keys = new Set(labels.map(statusKey));
  return { has: (s) => keys.has(statusKey(s)), values: () => labels[Symbol.iterator]() };
}

// Monday statuses the client should never see a job under — hidden entirely
// unless the job has already been downloaded.
export const HIDDEN_STATUSES = statusSet(["Query"]);

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
  // On the board and previously unmapped, so both read "In progress".
  "To Do": "Received — in the queue",
  "KACIE DOCS": "Assessed — certificate being written up",
};

/** Case-insensitive view of CLIENT_LABELS, built once. */
const CLIENT_LABELS_BY_KEY = new Map(
  Object.entries(CLIENT_LABELS).map(([k, v]) => [statusKey(k), v])
);

export function clientStatusLabel(mondayStatus, fileCount) {
  // An issued-family card whose files haven't been delivered yet (issue hold /
  // OneDrive settling / invoiced before collection) must not read as complete
  // or downloadable — nothing is downloadable yet.
  if (ISSUED_STATUSES.has(mondayStatus) && fileCount === 0) {
    return "Being finalised";
  }
  return CLIENT_LABELS_BY_KEY.get(statusKey(mondayStatus)) || "In progress";
}

/** Whether a job should appear in the client's list at all. */
export function isClientVisible(job) {
  if (job.firstDownloadedAt) return true; // once downloaded, always visible
  return !HIDDEN_STATUSES.has(job.mondayStatus);
}

// ---------------------------------------------------------------------------
// Writing BACK to the board: the "PORTAL" column.
//
// The board carries a status column called PORTAL. It answers one question —
// where is this job up to in the client portal? — and that is a question only
// the portal can answer, so the portal writes all of it. Nothing here is a
// manual step, which is the point: a column somebody has to remember to
// update is a column that goes stale and then gets ignored.
//
// It replaced the old "Send?" / "Job Sent" pair, which mixed the office's own
// pre-flight flag in with the portal's progress and needed a human to move
// the first rung.
//
//   ISSUED       the portal has seen the card at Issued and is working on it
//   READY        the portal HAS the files and the client has been emailed
//   DOWNLOADED   the client has actually taken it
//
// The gap between ISSUED and READY is the one worth having. It is exactly
// where job 56733 sat for a night: the card said issued, the files were in
// the folder, and nothing anywhere said the client still couldn't get them.
//
// STUCK is not a rung. It is a flag that replaces whatever rung a job had
// reached, and — alone among the labels here — it is REVERSIBLE: when the
// problem clears, the portal writes the rung the job should be at. Two things
// it never does. It is never set on a job the client has already downloaded,
// because nothing is stuck once they have it. And it is never set for the
// ordinary waits — the issue hold and the OneDrive settle window are the
// system working, not failing — so it needs a threshold well clear of both.
//
// Otherwise the rule is the whole safety story: the portal only moves a card
// FORWARD. It never rewrites a rung already reached, never drags a card back,
// and never invents a label — `create_labels_if_missing` is off for every
// write in lib/monday.ts, because a portal that quietly adds labels to a
// 3,700-item board is a portal nobody can trust. A label the board doesn't
// carry fails loudly in the admin banner and the evening report rather than
// appearing on the board unasked.
// ---------------------------------------------------------------------------

/** The rungs, in order. Spellings are overridable in lib/env.ts: these labels
 *  are typed onto the board by a person, not created by us. */
export const PORTAL_ISSUED = "ISSUED";
export const PORTAL_READY = "READY";
export const PORTAL_DOWNLOADED = "DOWNLOADED";
/** Not a rung — see the note above. */
export const PORTAL_STUCK = "STUCK";

export function portalLadder(
  issued = PORTAL_ISSUED, ready = PORTAL_READY, downloaded = PORTAL_DOWNLOADED
) {
  return [issued, ready, downloaded];
}

/** Where a label sits on the ladder; -1 for blank, STUCK, or anything we
 *  don't recognise. */
export function portalRank(label, ladder = portalLadder()) {
  const now = String(label || "").trim().toUpperCase();
  if (!now) return -1;
  return ladder.findIndex((l) => String(l).trim().toUpperCase() === now);
}

const isStuck = (label, stuck = PORTAL_STUCK) =>
  String(label || "").trim().toUpperCase() === String(stuck).trim().toUpperCase();

/**
 * Whether to move PORTAL to `target`, given what it says right now.
 *
 *   "write"          — go ahead
 *   "already"        — the card is at that rung or past it; leave it
 *   "unknown"        — the column says something not on the ladder and not
 *                      STUCK. Somebody put it there on purpose; that's a
 *                      decision, not a gap to fill.
 *   "unknown-target" — we were asked for a label that isn't on the ladder.
 *                      Caller's bug; refuse rather than guess.
 */
export function portalColumnWrite(
  currentLabel, target, ladder = portalLadder(), stuck = PORTAL_STUCK
) {
  const blank = !String(currentLabel || "").trim();

  // Flagging a problem. Never over DOWNLOADED — the client has it, so whatever
  // went wrong stopped mattering — and never over itself.
  if (isStuck(target, stuck)) {
    if (isStuck(currentLabel, stuck)) return "already";
    const at = portalRank(currentLabel, ladder);
    if (at === ladder.length - 1) return "already";
    if (at < 0 && !blank) return "unknown";
    return "write";
  }

  const to = portalRank(target, ladder);
  if (to < 0) return "unknown-target";

  // Recovering from STUCK is the one move that isn't forward along the ladder,
  // and it has to be allowed or a job that unsticks stays flagged for ever.
  if (isStuck(currentLabel, stuck)) return "write";

  const from = portalRank(currentLabel, ladder);
  if (from < 0) return blank ? "write" : "unknown";
  return from >= to ? "already" : "write";
}

// ---------------------------------------------------------------------------
// Is the certificate actually in the package?
//
// The autogen writes the CDC as "CDC - <address>.docx" and there is no
// docx-to-PDF step anywhere in it. The portal deliberately skips Word files —
// they're working documents, not deliverables — so the certificate only
// reaches a client if a human exported a PDF into the Issued folder.
//
// Nothing checked that. The portal asked "are there files?", not "is there a
// certificate?", so a package could go out complete in every respect except
// the one document the client actually needs, and read as a success.
// ---------------------------------------------------------------------------

/** Does this set of delivered files include the certificate itself? Matched on
 *  the name the autogen gives it, which is also what the exported PDF inherits
 *  when somebody saves-as from the Word original. */
export function hasCertificate(filenames, prefix = "CDC") {
  const p = String(prefix || "CDC").trim().toLowerCase();
  return (filenames || []).some((n) => {
    const name = String(n || "").trim().toLowerCase();
    return name.startsWith(p) && name.endsWith(".pdf");
  });
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
export const ISSUED_STATUSES = statusSet([
  "Issued", "To Invoice", "Invoiced / Completed",
]);

/**
 * The statuses the sync collects files for — the working end of the issued
 * family. Deliberately NOT Invoiced / Completed: that is where the board's
 * years of history sit, and scanning thousands of closed cards every five
 * minutes to maybe collect files nobody asked for is how a 5-minute sync
 * stops being one. A card that reaches Invoiced / Completed without its files
 * ever being collected shows up on the evening report instead.
 */
export const COLLECT_STATUSES = ["Issued", "To Invoice"];
export const COLLECT_STATUS_SET = statusSet(COLLECT_STATUSES);

export function canCancel(job) {
  if (!job) return false;
  if (statusKey(job.mondayStatus) === statusKey(CANCELLED_STATUS)) return false;
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
  // The whole issued family, not the literal label: the office moves a card
  // Issued → To Invoice → Invoiced / Completed as it closes out, and none of
  // those moves may take the Download button away from a client who hasn't
  // downloaded yet. (Found live: two jobs invoiced same-day sat in "Current"
  // with no button, and the client couldn't collect their certificate.)
  if (ISSUED_STATUSES.has(job.mondayStatus) && job.fileCount > 0) return "ready";
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
export const CLIENT_ACTION_STATUSES = statusSet(["FIR"]);
export const IN_HOUSE_WAIT_STATUSES = statusSet(["FIR - ENG", "SCL"]);

// ---------------------------------------------------------------------------
// A client answering a request for information.
//
// The reply itself lands on the card as an update, but that is not enough: a
// card left sitting at FIR stays in the board's Further Information Request
// group, and the job looks like it is still waiting on somebody who has in
// fact already answered. That is how a job goes quiet for a week.
//
// So a reply moves the card, and only from a status that was genuinely waiting
// on something from outside. A reply on a job nobody was waiting on must never
// drag it backwards into the assessment queue.
// ---------------------------------------------------------------------------
export const INFO_RECEIVED_STATUS = "New Info Received";

/** Statuses a client reply moves OFF. Deliberately short. To FIR is NOT here:
 *  it means the request hasn't been sent yet, and moving off it would lose the
 *  fact that somebody still has to write one. */
export const AWAITING_REPLY_STATUSES = statusSet(["FIR", "FIR - ENG"]);

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
export const PAUSED_STATUSES = statusSet(["On Hold", "Query"]);

/** Case-insensitive view of STAGE_OF, built once. */
const STAGE_BY_KEY = new Map(
  Object.entries(STAGE_OF).map(([k, v]) => [statusKey(k), v])
);

/** Which step a job is currently on, 0-4. Anything unrecognised sits at
 *  Received rather than being invented further along. */
export function stageIndex(job) {
  return STAGE_BY_KEY.get(statusKey(job.mondayStatus)) ?? 0;
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
/**
 * Is a job contact an email address, or a person's name?
 *
 * The lodgement form used to ask for an email and now asks for a name, and
 * both are in the same submissions column — there is no migration and no need
 * for one. This is the only thing that has to tell them apart, because a name
 * in Monday's email column is corrupt data that nothing downstream notices:
 * the column would accept "Dave Smith" and every mail-merge off that board
 * would quietly carry it.
 *
 * Deliberately strict. Anything that isn't unmistakably an address is treated
 * as a name, which is the safe way round — a real address demoted to a note
 * costs a reader two seconds, a name promoted to the email column costs a
 * bounced email nobody sees.
 */
export function looksLikeEmail(s) {
  const t = String(s || "").trim();
  return /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(t);
}

export function surveyorFor(peopleText, status) {
  const p = (peopleText || "").toLowerCase();
  // "To Assess" held by Chris or Rebecca IS assessment by that surveyor —
  // only Kacie (or nobody) at To Assess means it hasn't been allocated yet.
  if (status === "To Check" || status === "Chris CDC" || status === "Chris CDC 2") return "Chris";
  if (p.includes("chris")) return "Chris";
  if (p.includes("rebecca")) return "Rebecca";
  return null;
}

// ---------------------------------------------------------------------------
// Teams notifications — the pure parts.
//
// Transport, config and the on/off switch live in lib/teams.ts. What's here is
// what's worth being certain about: which destinations a webhook may point at,
// and the exact shape of the two card formats (a card Teams silently rejects
// looks identical to one nobody read).
// ---------------------------------------------------------------------------

/** What a notification is, before it's a card in anybody's format. */
export const TEAMS_EVENTS = [
  { key: "lodged", label: "A job is lodged", detail: "Someone lodges through the portal." },
  { key: "message", label: "A client replies on a job", detail: "Usually an answer to an FIR — the thing that unblocks a job." },
  { key: "enquiry", label: "A general enquiry arrives", detail: "A question with no job behind it, so nothing on the board catches it." },
  { key: "stuck", label: "A certificate can't be delivered", detail: "The portal marked a job STUCK." },
  { key: "downloaded", label: "A client downloads a certificate", detail: "Reassuring, but one per job — noisy on a busy day." },
];

/** Everything that needs a person is on. The download ping isn't: it fires
 *  once per job and asks nothing of anybody. */
export const TEAMS_DEFAULT_EVENTS = {
  lodged: true, message: true, enquiry: true, stuck: true, downloaded: false,
};

/**
 * Hosts a webhook may point at.
 *
 * This is a staff-typed URL that the server posts client names, site addresses
 * and message excerpts to. A URL pasted wrong shouldn't be able to send any of
 * that somewhere it doesn't belong, so the destination is pinned to Microsoft
 * rather than trusted.
 */
export const TEAMS_ALLOWED_HOSTS = [
  ".webhook.office.com",   // legacy Office 365 connector
  ".logic.azure.com",      // Power Automate / Logic Apps HTTP trigger
  ".powerplatform.com",    // newer Power Automate
  ".azure-apihub.net",
];

export function checkWebhook(url) {
  const raw = String(url || "").trim();
  if (!raw) return { ok: false, why: "Paste the webhook URL Teams gave you." };
  let u;
  try { u = new URL(raw); } catch { return { ok: false, why: "That isn't a URL." }; }
  if (u.protocol !== "https:") return { ok: false, why: "The webhook has to be https." };
  const host = u.hostname.toLowerCase();
  // endsWith on a dotted suffix, so "logic.azure.com.evil.test" can't pass by
  // containing the string — and the bare apex isn't a webhook host anyway.
  if (!TEAMS_ALLOWED_HOSTS.some((h) => host.endsWith(h))) {
    return {
      ok: false,
      why: `${u.hostname} isn't a Microsoft address. A Teams webhook ends in ` +
        `powerplatform.com, logic.azure.com or webhook.office.com — check you ` +
        `copied the whole URL.`,
    };
  }
  return { ok: true };
}

/** Legacy connector URLs want the old MessageCard; everything else is a
 *  Workflow and wants an Adaptive Card. */
export function teamsPrefersLegacy(url) {
  try {
    return new URL(String(url || "")).hostname.toLowerCase().endsWith(".webhook.office.com");
  } catch { return false; }
}

const TEAMS_MAX_TEXT = 400;

export function teamsTrim(s, n = TEAMS_MAX_TEXT) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

const usableFacts = (facts) =>
  (facts || []).filter(([, v]) => String(v ?? "").trim());

/** Power Automate / Workflows: an Adaptive Card in a message envelope. */
export function teamsAdaptiveCard(note) {
  const body = [
    { type: "TextBlock", text: note.title, weight: "Bolder", size: "Medium", wrap: true },
  ];
  const facts = usableFacts(note.facts);
  if (facts.length) {
    body.push({ type: "FactSet", facts: facts.map(([title, value]) => ({ title, value: String(value) })) });
  }
  if (note.text) body.push({ type: "TextBlock", text: teamsTrim(note.text), wrap: true });

  return {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body,
        ...(note.link
          ? { actions: [{ type: "Action.OpenUrl", title: note.link.label, url: note.link.url }] }
          : {}),
      },
    }],
  };
}

/** Legacy Office 365 connector: a MessageCard. */
export function teamsMessageCard(note) {
  const facts = usableFacts(note.facts);
  const section = {
    activityTitle: note.title,
    facts: facts.map(([name, value]) => ({ name, value: String(value) })),
    // Client text is never markdown, and rendering it as such would let a
    // stray underscore or bracket rewrite what somebody actually wrote.
    markdown: false,
  };
  if (note.text) section.text = teamsTrim(note.text);

  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: "1F4E3D",
    summary: note.title,
    sections: [section],
    ...(note.link
      ? { potentialAction: [{ "@type": "OpenUri", name: note.link.label, targets: [{ os: "default", uri: note.link.url }] }] }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Amendments
//
// An amendment is a client changing their mind, or a council asking them to.
// It does NOT get its own Monday card — it would sit on the board for days
// looking like an assessment when the real work is a watermark and a re-issue.
// It goes by email to whoever certified the original, and comes back through
// the portal.
//
// Routing is off the board's "Certified By" column, not People: People is
// empty on most issued cards, while Certified By is filled in by definition
// once a certificate exists.
// ---------------------------------------------------------------------------

/** Normalise a person's name for matching — case, extra spaces, stray commas. */
const nameKey = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Who an amendment goes to.
 *
 * `certifiedByText` is the raw column text, which for a people column can hold
 * several names ("Chris Healing, Rebecca Creighan"). The first name that
 * matches a configured route wins — a job two people signed still only needs
 * one person to say yes.
 *
 * Falls back rather than failing. An unallocated job, a name nobody has
 * configured, a typo on the board: all of them route to the fallback and say
 * why, because an amendment that silently goes nowhere is the exact failure
 * this replaced.
 */
export function routeAmendment(certifiedByText, routes = [], fallbackName = "") {
  const usable = (routes || []).filter((r) => r && r.name && r.email);
  const byName = new Map(usable.map((r) => [nameKey(r.name), r]));

  const names = String(certifiedByText || "")
    .split(",").map((n) => n.trim()).filter(Boolean);

  for (const n of names) {
    const hit = byName.get(nameKey(n));
    if (hit) return { ...hit, matched: true, reason: "certified-by" };
  }

  const fallback = byName.get(nameKey(fallbackName)) || null;
  if (!fallback) {
    return {
      name: "", email: "", matched: false,
      reason: names.length ? "no-route-and-no-fallback" : "unallocated-and-no-fallback",
    };
  }
  return {
    ...fallback, matched: false,
    reason: names.length ? "name-not-configured" : "unallocated",
  };
}

/** What the office is told about why an amendment landed where it did. */
export function routeExplanation(route, certifiedByText) {
  const who = String(certifiedByText || "").trim();
  switch (route?.reason) {
    case "certified-by":
      return `Certified by ${who}.`;
    case "unallocated":
      return `Nobody is in Certified By on the original, so this went to ${route.name}.`;
    case "name-not-configured":
      return `Certified By reads "${who}", which isn't one of the configured people, ` +
        `so this went to ${route.name}.`;
    default:
      return `No one could be worked out to send this to — it's in the portal only.`;
  }
}

/** Statuses an amendment moves through. Deliberately not the submission
 *  statuses: an amendment never joins the review queue. */
export const AMENDMENT_OPEN = "amendment";
export const AMENDMENT_DONE = "amendment_done";

/**
 * Search terms to try against the board's Ref # column, most precise first.
 *
 * Monday's `contains_text` is a literal substring match, so it does NOT
 * forgive the formatting differences a person does. A client who types
 * "261042" for a job stored as "26-1042" would otherwise find nothing and be
 * told the job isn't theirs.
 *
 * The digit tail is the workhorse: "26-1042", "26 1042" and "261042" all
 * reduce to "1042", which is a substring of every stored formatting of it.
 * Same approach as the public status page, and for the same reason.
 */
export function refSearchTerms(ref) {
  const raw = String(ref || "").trim();
  const terms = [];
  const add = (t) => { if (t && !terms.includes(t)) terms.push(t); };

  add(raw);
  const tight = raw.toLowerCase().replace(/[\s\-\/._#]/g, "");
  add(tight);

  const digits = tight.replace(/\D/g, "");
  if (digits.length >= 4) add(digits.slice(-4));
  else if (digits) add(digits);

  return terms;
}

/** Two references that are the same job written differently. */
export function sameRef(a, b) {
  const norm = (v) => String(v || "").toLowerCase().replace(/[\s\-\/._#]/g, "");
  const x = norm(a);
  return !!x && x === norm(b);
}

/** Marks the revised certificate on an amendment's file list, so the documents
 *  the client lodged and the ones we sent back can live together. They used to
 *  overwrite each other, which lost the record of what was asked for. */
export const REVISED = "revised";
