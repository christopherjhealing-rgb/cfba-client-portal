/**
 * The day's activity for the evening report.
 *
 * The rest of the report is exceptions — the things that should have happened
 * and didn't. This is the plain other half: what DID happen today, so the
 * email reads as a day's work and not only a list of problems. Chris asked for
 * it in those words — jobs lodged, sent back, downloaded, and what's still
 * waiting on someone.
 *
 * Pure: given the jobs, the submissions and "now", it buckets them by the Perth
 * calendar day. No I/O — see tests/report.test.mjs.
 */
import { ISSUED_STATUSES, CLIENT_ACTION_STATUSES } from "./core.mjs";

const DAY = 86_400_000;

/** The Perth calendar date (YYYY-MM-DD) an instant falls on. The report is
 *  "today in Perth", and 4 pm UTC is already tomorrow here — a naive UTC day
 *  would file the late-afternoon issues under the wrong date. */
export function perthDay(when, tz = "Australia/Perth") {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}

function daysSince(iso, now) {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/**
 * Bucket a day's jobs and submissions into the activity the report lists.
 *
 * `unopenedAfterDays` is the line between the healthy backlog and a problem: a
 * package that's been ready longer than that is chased in its own section of
 * the report, so it's kept OUT of "waiting to be downloaded" here — otherwise
 * the same job reads twice, once as news and once as a worry.
 */
export function dayActivity({
  jobs = [], submissions = [], companies = [], now,
  unopenedAfterDays = 3, tz = "Australia/Perth",
}) {
  const when = when0(now);
  const today = perthDay(when, tz);
  const nameOf = new Map(companies.map((c) => [c.id, c.name]));
  const isToday = (iso) => !!iso && perthDay(iso, tz) === today;
  const mk = (j, detail, days = 0) => ({
    ref: j.ref,
    address: j.address || "",
    company: nameOf.get(j.companyId) || "",
    detail,
    days,
  });

  const lodged = [], issued = [], downloaded = [], awaiting = [], atFir = [];

  for (const j of jobs) {
    if (isToday(j.receivedAt)) lodged.push(mk(j, j.description || "new job"));
    if (isToday(j.issuedAt) && ISSUED_STATUSES.has(j.mondayStatus)) {
      issued.push(mk(j, "issued — sent back to the client"));
    }
    if (isToday(j.firstDownloadedAt)) downloaded.push(mk(j, "downloaded their package"));

    // Ready and waiting: the certificate is in the portal, nobody's opened it
    // yet, and it hasn't sat long enough to be a worry (those are chased in the
    // "nobody's opened it" section instead).
    if (j.issuedAt && j.fileCount > 0 && !j.firstDownloadedAt) {
      const d = daysSince(j.issuedAt, when);
      if (d < unopenedAfterDays) awaiting.push(mk(j, "ready — not downloaded yet", d));
    }

    // With the client for information. The portal can't date the FIR itself —
    // that transition happens on the board — so this is who's waiting now, not
    // who was asked today.
    if (CLIENT_ACTION_STATUSES.has(j.mondayStatus) && !j.firstDownloadedAt) {
      atFir.push(mk(j, "with the client for further information", daysSince(j.receivedAt, when)));
    }
  }

  const amended = [];
  for (const s of submissions) {
    if (s.amendmentOf && isToday(s.createdAt)) {
      amended.push({
        ref: s.amendmentOf || "—",
        address: s.address || "",
        company: nameOf.get(s.companyId) || "",
        detail: "amendment lodged",
        days: 0,
      });
    }
  }

  awaiting.sort((a, b) => b.days - a.days);
  atFir.sort((a, b) => b.days - a.days);

  return { today, lodged, amended, issued, downloaded, awaiting, atFir };
}

/** now, coerced to a Date without ever calling Date.now() implicitly on a bad
 *  input — a missing `now` is a caller bug, so it throws rather than silently
 *  reporting "today" against wall-clock time the tests can't pin. */
function when0(now) {
  if (now instanceof Date) return now;
  const d = new Date(now);
  if (Number.isNaN(d.getTime())) {
    throw new Error("dayActivity: `now` must be a Date or an ISO string");
  }
  return d;
}
