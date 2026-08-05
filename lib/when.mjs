/**
 * How a date or time is shown anywhere in the UI.
 *
 * Two rules, both learned the hard way:
 *
 *   Always Perth. These pages render on a server in UTC and hydrate in a
 *   browser in Perth (UTC+8). A toLocale* call with no timeZone formats in the
 *   runtime's own zone, so the server writes one time and the client writes
 *   another for the same instant — React sees the mismatch and throws a
 *   hydration error (#418), and anything sent after 4pm shows on the wrong day.
 *   Pinning the zone makes server and client agree.
 *
 *   Never "Invalid Date". new Date("") and new Date(undefined) are Invalid
 *   Date, and toLocale* renders that literally as the words "Invalid Date" in
 *   front of a client. A blank is better than a lie.
 *
 * Pure — see tests/when.test.mjs.
 */
const TZ = "Australia/Perth";

const valid = (iso) => {
  // Guard falsy FIRST: new Date(null) is the epoch (1 Jan 1970), not Invalid
  // Date, so a null slips through as "1 Jan 1970" without this.
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** "3 Aug 2026". The everyday date on a job row. */
export function fmtDate(iso) {
  const d = valid(iso);
  return d ? d.toLocaleDateString("en-AU",
    { day: "numeric", month: "short", year: "numeric", timeZone: TZ }) : null;
}

/** "3 Aug · 2:15 pm". A message or event timestamp — date and time together. */
export function fmtWhen(iso) {
  const d = valid(iso);
  if (!d) return "";
  const date = d.toLocaleDateString("en-AU", { day: "numeric", month: "short", timeZone: TZ });
  const time = d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  return `${date} · ${time}`;
}

/** "3 Aug 2026, 2:15 pm". The longer form for admin logs and cards. */
export function fmtStamp(iso) {
  const d = valid(iso);
  return d ? d.toLocaleString("en-AU",
    { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }) : "";
}

/** Megabytes to one decimal, or "" when the size is missing or nonsense —
 *  never "NaN MB". */
export function fmtMB(bytes) {
  // Missing is not zero: Number(null) is 0, which would print "0.0 MB" for a
  // size that was never recorded. == null catches null and undefined both.
  if (bytes == null) return "";
  const n = Number(bytes);
  return Number.isFinite(n) && n >= 0 ? `${(n / 1_048_576).toFixed(1)} MB` : "";
}
