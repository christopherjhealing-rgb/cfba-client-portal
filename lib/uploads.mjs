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

/**
 * The name the combined PDF for a category takes, or null for a category that
 * isn't combined. An empty / not-yet-typed address falls back to the base name
 * alone, so a job still files under something sensible rather than "…- .pdf".
 */
export function combinedName(category, address) {
  const base = COMBINE[String(category)];
  if (!base) return null;
  const addr = safeForFilename(addressForName(address));
  return addr ? `${base} - ${addr}.pdf` : `${base}.pdf`;
}

/**
 * What the form shows under a bucket before lodging. The same as combinedName
 * once an address is typed; a visible placeholder before then, so the client
 * sees where their address will land rather than a bare base name.
 */
export function plannedName(category, address) {
  const base = COMBINE[String(category)];
  if (!base) return null;
  const addr = safeForFilename(addressForName(address));
  return addr ? `${base} - ${addr}.pdf` : `${base} - [site address].pdf`;
}
