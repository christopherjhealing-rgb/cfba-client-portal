/**
 * The portal's own address, handled carefully.
 *
 * Pure, and separate from lib/appurl (which reads settings and needs the
 * database) so both halves can be tested. These two functions between them
 * decide what a client's email links point at, which makes them worth more
 * scrutiny than their size suggests.
 */

/**
 * Normalise a portal address, or reject it.
 *
 * Rejecting is the important half. An address that isn't a real http(s) URL
 * must not be stored, because the alternative is every emailed link pointing
 * at nonsense — and unlike most bad input, nothing downstream would notice.
 * Trailing slashes go so joining with "/jobs" can't produce "//jobs".
 */
export function tidyUrl(s) {
  const t = (s || "").toString().trim().replace(/\/+$/, "");
  return /^https?:\/\/[^\s/]+\.[^\s/]+/i.test(t) ? t : "";
}

/**
 * Point every link in an already-built email at a different host.
 *
 * The mail templates embed the address they were built with. Rewriting once,
 * on the way out, covers every template by construction — including ones
 * written later by someone who never read this file. Threading a base URL
 * through a dozen templates would work until the thirteenth was missed.
 *
 * The length guard is not cosmetic: `"".split("")` explodes a document into
 * single characters and rejoins them with the replacement between every one.
 * A misconfigured address must never be able to mangle a client's email.
 */
export function rewriteLinks(html, from, to) {
  if (!from || !to || from.length < 8 || from === to) return html;
  return String(html).split(from).join(to);
}
