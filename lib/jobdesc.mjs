/**
 * What the client is building, and the one line that describes it.
 *
 * The lodgement form used to ask for a class from a dropdown and a description
 * as free text. Two problems with that. The description came in every shape
 * imaginable ("patio", "PATIO X2", "steel patio + shed"), so the board's
 * Description column couldn't be read consistently or searched. And a job with
 * a shed AND a retaining wall has two classes, which one dropdown can't say.
 *
 * So the client builds a list instead: each thing being built, what class it
 * is, and how many. Everything else is derived from that list — including the
 * single description string the board gets, because Monday's Description is
 * one text column and its Class is a single-select status column. The
 * derivation happens HERE, on the server, from the items; the browser's own
 * preview is a courtesy, not the source of truth.
 *
 * Pure. No imports, no I/O — see tests/jobdesc.test.mjs.
 */

/** The free-text escape hatch, offered on every class. */
export const OTHER = "Other";

/** Hard caps. A lodgement with nine different structures on it is a
 *  data-entry accident, and the description string stops being readable long
 *  before that. */
export const MAX_ITEMS = 8;
export const MAX_QTY = 20;
export const MAX_TEXT = 60;

/**
 * The classes a client can lodge, and the usual work in each.
 *
 * `board` is the label as the CFBA board spells it — that string is written
 * straight into the Class column with create_labels_if_missing, so anything
 * else silently mints a near-duplicate label on a board of ~3,800 jobs. The
 * commercial one really does carry a double space; it is copied from the
 * board, not a typo here.
 *
 * `short` is for the rare mixed-class job, where the class list is appended to
 * the description and the full commercial label would swamp it.
 */
export const JOB_CLASSES = [
  {
    key: "10a",
    label: "Class 10a",
    short: "Class 10a",
    board: "Class 10a",
    hint: "A non-habitable building — patios, carports, sheds.",
    types: [
      { label: "Steel Patio", plural: "Steel Patios" },
      { label: "Steel Carport", plural: "Steel Carports" },
      { label: "Steel Shed", plural: "Steel Sheds" },
    ],
  },
  {
    key: "10b",
    label: "Class 10b",
    short: "Class 10b",
    board: "Class 10b",
    hint: "A structure that isn't a building — retaining walls, pools, tanks.",
    types: [
      { label: "Retaining Wall", plural: "Retaining Walls" },
      { label: "Swimming Pool", plural: "Swimming Pools" },
      { label: "Water Tank", plural: "Water Tanks" },
    ],
  },
  {
    key: "cbc",
    label: "CBC",
    short: "CBC",
    board: "CBC",
    hint: "Certificate of Building Compliance — work that's already been built.",
    types: [],
  },
  {
    key: "commercial",
    label: "Class 10 associated with a Commercial Building",
    short: "Commercial Class 10",
    board: "CDC 10a associated with  a Commercial Building",
    hint: "Class 10 work on a commercial site.",
    types: [],
  },
];

/** The board's own label for a job that is both 10a and 10b. It already
 *  exists — the office has been recording mixed jobs this way for years. */
export const MIXED_10 = "CDC10a & b";

/** When no single board label covers the mix, the most significant class
 *  wins the column and the description names them all. Order is how different
 *  the job is from ordinary Class 10 work, so the label never understates it. */
const PRECEDENCE = ["cbc", "commercial", "10b", "10a"];

export const classByKey = (key) => JOB_CLASSES.find((c) => c.key === key) || null;

/** True when this class has a type list. CBC and commercial work don't —
 *  they're described in the client's own words. */
export const hasTypes = (key) => (classByKey(key)?.types.length ?? 0) > 0;

// ---------------------------------------------------------------------------
// Normalising what arrives
// ---------------------------------------------------------------------------

/**
 * Coerce whatever the request carried into items we'd be willing to write to
 * the board. Anything unrecognisable is dropped rather than guessed at: a
 * lodgement that quietly recorded the wrong class would be worse than one that
 * comes back asking.
 */
export function normaliseItems(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw.slice(0, MAX_ITEMS)) {
    if (!r || typeof r !== "object") continue;
    const cls = classByKey(String(r.classKey || ""));
    if (!cls) continue;

    const wanted = String(r.type || "").trim();
    const known = cls.types.find((t) => t.label === wanted);
    // A class with no type list is always free text, whatever `type` claims.
    const isOther = !known || !cls.types.length;
    const text = String(r.text || "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
    if (isOther && !text) continue;

    let qty = Math.floor(Number(r.qty));
    if (!Number.isFinite(qty) || qty < 1) qty = 1;
    if (qty > MAX_QTY) qty = MAX_QTY;

    out.push({
      classKey: cls.key,
      type: isOther ? OTHER : known.label,
      text: isOther ? text : "",
      qty,
    });
  }
  return out;
}

/** Same thing twice is one thing, counted twice — otherwise a client who adds
 *  two patios as separate rows gets "Steel Patio and Steel Patio". First
 *  appearance keeps its place in the sentence. */
export function mergeItems(items) {
  const out = [];
  const at = new Map();
  for (const it of items) {
    const k = `${it.classKey}|${it.type}|${it.text.toLowerCase()}`;
    const i = at.get(k);
    if (i === undefined) { at.set(k, out.length); out.push({ ...it }); }
    else out[i].qty = Math.min(MAX_QTY, out[i].qty + it.qty);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The sentence
// ---------------------------------------------------------------------------

/** "Steel Patios x 2". One of something is just the thing — "Steel Patio x 1"
 *  is how a form talks, not how a person does. Free text is never pluralised:
 *  guessing turns "Canopy" into "Canopys". */
export function phraseFor(it) {
  const cls = classByKey(it.classKey);
  const known = cls?.types.find((t) => t.label === it.type);
  const one = known ? known.label : it.text;
  const many = known ? known.plural : it.text;
  return it.qty > 1 ? `${many} x ${it.qty}` : one;
}

/** "A", "A and B", "A, B and C". */
export function joinAnd(parts) {
  const a = parts.filter(Boolean);
  if (a.length <= 1) return a[0] || "";
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`;
}

/** The distinct classes on a job, in the order the client picked them. */
export function classKeysOf(items) {
  return [...new Set(items.map((i) => i.classKey))];
}

/** Both halves of Class 10 and nothing else — the board has a label for
 *  exactly this, so it needs no explaining in the description. */
const isTen = (keys) => keys.length > 1 && keys.every((k) => k === "10a" || k === "10b");

/**
 * The single label for the board's Class column.
 *
 * One class is itself. 10a and 10b together are the board's own combined
 * label. Any other mix has no label to go to, so the most significant class
 * takes the column and buildDescription names the rest — the column is never
 * left saying something the job isn't.
 */
export function boardClass(items) {
  const keys = classKeysOf(items);
  if (!keys.length) return "";
  if (keys.length === 1) return classByKey(keys[0]).board;
  if (isTen(keys)) return MIXED_10;
  for (const k of PRECEDENCE) if (keys.includes(k)) return classByKey(k).board;
  return "";
}

/** The one string the Description column gets. */
export function buildDescription(items) {
  const merged = mergeItems(items);
  const said = merged.map(phraseFor);

  // Two items can read the same and mean different things — a "Screen" lodged
  // under 10a and another under 10b merge into nothing, because mergeItems
  // only collapses items that match on class too. "Screen and Screen" tells
  // the office nothing, so where a phrase repeats, each one names its class.
  const twice = new Set(said.filter((p, i) => said.indexOf(p) !== i));
  let s = joinAnd(merged.map((m, i) =>
    twice.has(said[i]) ? `${said[i]} (${classByKey(m.classKey).short})` : said[i]));

  const keys = classKeysOf(merged);
  // Only where the Class column can't say it on its own.
  if (keys.length > 1 && !isTen(keys)) {
    s += ` (${joinAnd(keys.map((k) => classByKey(k).short))})`;
  }
  return s;
}

export const NOTHING_TO_LODGE =
  "Tell us what's being built — pick a class and what the work is.";

/**
 * Everything a lodgement needs, derived from the items alone.
 *
 * Returns `{ ok: false }` rather than throwing, and rather than falling back
 * to anything: a job with no readable items must not reach the board at all,
 * and the flag makes that unignorable at every call site.
 */
export function describeJob(raw) {
  const items = mergeItems(normaliseItems(raw));
  if (!items.length) return { ok: false, error: NOTHING_TO_LODGE };
  return {
    ok: true, items,
    jobClass: boardClass(items),
    description: buildDescription(items),
  };
}
