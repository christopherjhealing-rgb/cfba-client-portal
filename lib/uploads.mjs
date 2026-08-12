// Standardising what a client uploads at lodgement.
//
// Clients attach whatever their drafter sent them — "final drawings v3.pdf",
// "elevations.pdf", a site plan and a set of elevations as two files, an
// engineering certificate scanned in halves. The office wants one tidy,
// predictably-named PDF per category on the card, named for the job. This
// module owns the naming half of that (the merging lives in pdf-merge /
// combine-uploads); it is pure and shared so the name the form previews at
// upload time is exactly the name the server files under. If the two ever
// disagreed, the preview would be a lie.

/**
 * The upload categories that get combined into one PDF and renamed, mapped to
 * the fixed base name each takes. Everything else (Other Supporting Documents,
 * a BAL report, site photos) is left exactly as the client named it — those are
 * distinct documents, not pieces of one.
 */
export const COMBINE = {
  drawings: "Site Plan and Elevations",
  engineering: "Engineering",
};

/** Is this a category the portal combines-and-renames? */
export function combinable(category) {
  return Object.prototype.hasOwnProperty.call(COMBINE, String(category));
}

// Australian states, abbreviations and full names, for trimming off a name.
// Longest-first so "Western Australia" is matched before a bare "WA".
const STATE =
  "Western Australia|New South Wales|South Australia|Northern Territory|" +
  "Australian Capital Territory|Queensland|Tasmania|Victoria|" +
  "A\\.?C\\.?T|N\\.?S\\.?W|N\\.?T|Q\\.?L\\.?D|S\\.?A|T\\.?A\\.?S|V\\.?I\\.?C|W\\.?A";

/**
 * The address as it should read in a file name: street and suburb, without the
 * state, postcode or country (Chris's call). "32 Elvira Street, Palmyra WA 6156"
 * becomes "32 Elvira Street, Palmyra"; a geocoded "…WA 6156, Australia" the same.
 *
 * Order matters — country, then postcode, then state — because each strip
 * uncovers the next ("…Palmyra WA 6156, Australia" → "…Palmyra WA 6156" →
 * "…Palmyra WA" → "…Palmyra"). The state is only ever removed from the very
 * end, so a suburb that carries a state's name (Victoria Park, Albany) keeps it.
 */
export function addressForName(address) {
  let s = String(address || "").replace(/\s+/g, " ").trim();
  s = s.replace(/[\s,]+australia\.?\s*$/i, "");        // trailing country
  s = s.replace(/[\s,]+\d{4}\s*$/, "");                // trailing postcode
  s = s.replace(new RegExp(`[\\s,]+(?:${STATE})\\.?\\s*$`, "i"), ""); // trailing state
  return s.replace(/[\s,]+$/, "").trim();
}

// The character set the portal already uses for every stored file name, so a
// combined name is a valid storage key on the same terms as an uploaded one.
// Anything outside it — a comma between street and suburb, a slash in a unit
// number, an apostrophe — becomes a space rather than risk a key the store
// rejects (which would fail the lodgement, not just rename it oddly). Letters,
// digits, spaces, dots, underscores and hyphens are kept.
const NON_KEY = /[^A-Za-z0-9 ._-]+/g;

/** A string made safe to use as a file name and storage key (no extension). */
export function safeForFilename(s) {
  return String(s || "")
    .replace(NON_KEY, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "") // no leading/trailing dot or space
    .slice(0, 120)
    .trim();
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * A date stamp for a file name — "7 Aug 2026" — read in Perth time, which is
 * the office's day, so a lodgement just before midnight UTC doesn't stamp
 * tomorrow. Deterministic for a given instant, so the form's preview and the
 * server's write agree. Takes a Date or anything Date accepts.
 */
export function formatStamp(date) {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Australia/Perth", day: "numeric", month: "numeric", year: "numeric",
  }).formatToParts(d);
  const n = (t) => Number(parts.find((p) => p.type === t)?.value);
  return `${n("day")} ${MONTHS[n("month") - 1]} ${n("year")}`;
}

/**
 * The name the combined PDF for a category takes, or null for a category that
 * isn't combined. An empty / not-yet-typed address falls back to the base name
 * alone, so a job still files under something sensible rather than "…- .pdf".
 *
 * `date` (a Date or ISO string) appends the day it came in — used for an FIR
 * response, so a re-sent "Site Plan and Elevations" is told apart from the
 * one it replaces. Omitted for a first lodgement, which needs no stamp.
 */
export function combinedName(category, address, date) {
  const base = COMBINE[String(category)];
  if (!base) return null;
  const addr = safeForFilename(addressForName(address));
  const stamp = date ? ` - ${formatStamp(date)}` : "";
  const site = addr ? ` - ${addr}` : "";
  return `${base}${site}${stamp}.pdf`;
}

/**
 * What the form shows under a bucket before sending. The same as combinedName
 * once an address is known; a visible placeholder before then, so the client
 * sees where their address will land rather than a bare base name.
 */
export function plannedName(category, address, date) {
  const base = COMBINE[String(category)];
  if (!base) return null;
  const addr = safeForFilename(addressForName(address));
  const stamp = date ? ` - ${formatStamp(date)}` : "";
  const site = addr ? ` - ${addr}` : " - [site address]";
  return `${base}${site}${stamp}.pdf`;
}

/**
 * The stable part of a combined name, without the date or extension —
 * "Site Plan and Elevations - 32 Elvira Street Palmyra". Every version of that
 * document the portal writes shares this stem; only the date on the end
 * differs. It's what a new version matches against to find the ones it
 * supersedes. Null for a category that isn't combined.
 */
export function nameStem(category, address) {
  const base = COMBINE[String(category)];
  if (!base) return null;
  const addr = safeForFilename(addressForName(address));
  return addr ? `${base} - ${addr}` : base;
}

/**
 * Which of the files already in the job folder a new version supersedes: the
 * ones the portal wrote for this same document (they share the stem), never the
 * new file itself, and never anything else in the folder (a certificate, the
 * office's own working files). Matching on the portal's own stem is what keeps
 * it from ever moving a file it didn't write.
 */
export function supersededBy(existingNames, stem, newName) {
  if (!stem) return [];
  const prefix = `${stem} `; // the " - <date>" or " (n)" that follows the stem
  return existingNames.filter(
    (n) => n !== newName && (n === `${stem}.pdf` || n.startsWith(prefix))
  );
}

/**
 * A name that doesn't collide with anything already written. The same file
 * name arriving twice (drawings AND engineering both called "plan.pdf") used
 * to overwrite silently — the second write won, the first document was gone,
 * and the combine then merged the wrong bytes. Suffix instead: plan.pdf,
 * plan-2.pdf, plan-3.pdf… Mirrors the guard the signing route and library
 * docs always had; the multipart paths get it through here so all three
 * spell a collision the same way.
 */
export function uniqueName(name, used) {
  let out = name;
  let n = 2;
  while (used.has(out)) out = name.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
  used.add(out);
  return out;
}
