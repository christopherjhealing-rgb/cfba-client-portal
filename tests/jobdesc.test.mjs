import test from "node:test";
import assert from "node:assert/strict";
import {
  JOB_CLASSES, OTHER, MIXED_10, MAX_ITEMS, MAX_QTY, MAX_TEXT,
  classByKey, hasTypes, normaliseItems, mergeItems, phraseFor, joinAnd,
  classKeysOf, boardClass, buildDescription, describeJob,
} from "../lib/jobdesc.mjs";

const it = (classKey, type, qty = 1, text = "") => ({ classKey, type, qty, text });

// ---------------------------------------------------------------------------
// The example Chris gave, first.
// ---------------------------------------------------------------------------
test("Steel Patios x 2 and Steel Shed", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio", qty: 2 },
    { classKey: "10a", type: "Steel Shed", qty: 1 },
  ]);
  assert.equal(r.description, "Steel Patios x 2 and Steel Shed");
  assert.equal(r.jobClass, "Class 10a");
});

// ---------------------------------------------------------------------------
// The class table itself
// ---------------------------------------------------------------------------
test("every class carries a board label", () => {
  for (const c of JOB_CLASSES) {
    assert.ok(c.key && c.label && c.short && c.board, `${c.key} incomplete`);
  }
});

test("class keys are unique", () => {
  const keys = JOB_CLASSES.map((c) => c.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the classes Chris asked for carry the types he asked for", () => {
  assert.deepEqual(classByKey("10a").types.map((t) => t.label),
    ["Steel Patio", "Steel Carport", "Steel Shed"]);
  assert.deepEqual(classByKey("10b").types.map((t) => t.label),
    ["Retaining Wall", "Swimming Pool", "Water Tank"]);
});

test("CBC and commercial are free text — no type list", () => {
  assert.equal(hasTypes("cbc"), false);
  assert.equal(hasTypes("commercial"), false);
  assert.equal(hasTypes("10a"), true);
});

test("the commercial board label keeps the board's own double space", () => {
  // Not a typo in this file. The label on the board is spelled this way, and
  // writing anything else mints a near-duplicate on a 3,800-job board.
  assert.equal(classByKey("commercial").board,
    "CDC 10a associated with  a Commercial Building");
  assert.match(classByKey("commercial").board, /with {2}a/);
});

test("classByKey returns null for anything else", () => {
  assert.equal(classByKey("class1a"), null);
  assert.equal(classByKey(""), null);
});

// ---------------------------------------------------------------------------
// Phrasing
// ---------------------------------------------------------------------------
test("one of something is just the thing", () => {
  assert.equal(phraseFor(it("10a", "Steel Patio", 1)), "Steel Patio");
});

test("more than one pluralises and counts", () => {
  assert.equal(phraseFor(it("10a", "Steel Patio", 2)), "Steel Patios x 2");
  assert.equal(phraseFor(it("10b", "Retaining Wall", 3)), "Retaining Walls x 3");
  assert.equal(phraseFor(it("10b", "Water Tank", 4)), "Water Tanks x 4");
});

test("free text is never pluralised — guessing turns Canopy into Canopys", () => {
  assert.equal(phraseFor(it("10a", OTHER, 2, "Canopy")), "Canopy x 2");
  assert.equal(phraseFor(it("10a", OTHER, 1, "Canopy")), "Canopy");
});

test("joinAnd reads like a sentence", () => {
  assert.equal(joinAnd([]), "");
  assert.equal(joinAnd(["A"]), "A");
  assert.equal(joinAnd(["A", "B"]), "A and B");
  assert.equal(joinAnd(["A", "B", "C"]), "A, B and C");
  assert.equal(joinAnd(["A", "B", "C", "D"]), "A, B, C and D");
});

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------
test("the same thing added twice is counted, not repeated", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio", qty: 1 },
    { classKey: "10a", type: "Steel Patio", qty: 1 },
  ]);
  assert.equal(r.description, "Steel Patios x 2");
});

test("merging keeps first-seen order", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Shed", qty: 1 },
    { classKey: "10a", type: "Steel Patio", qty: 1 },
    { classKey: "10a", type: "Steel Shed", qty: 1 },
  ]);
  assert.equal(r.description, "Steel Sheds x 2 and Steel Patio");
});

test("free text merges case-insensitively", () => {
  const r = describeJob([
    { classKey: "10a", type: OTHER, text: "Pergola", qty: 1 },
    { classKey: "10a", type: OTHER, text: "pergola", qty: 1 },
  ]);
  assert.equal(r.description, "Pergola x 2");
});

test("the same word under different classes says which is which", () => {
  // "Screen and Screen" would tell the office nothing.
  const r = describeJob([
    { classKey: "10a", type: OTHER, text: "Screen", qty: 1 },
    { classKey: "10b", type: OTHER, text: "Screen", qty: 1 },
  ]);
  assert.equal(r.description, "Screen (Class 10a) and Screen (Class 10b)");
  assert.equal(r.jobClass, MIXED_10);
});

test("a phrase that appears once is left alone", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio" },
    { classKey: "10b", type: "Retaining Wall" },
  ]);
  assert.equal(r.description, "Steel Patio and Retaining Wall");
});

test("disambiguation survives a count", () => {
  const r = describeJob([
    { classKey: "10a", type: OTHER, text: "Screen", qty: 2 },
    { classKey: "10b", type: OTHER, text: "Screen", qty: 2 },
  ]);
  assert.equal(r.description, "Screen x 2 (Class 10a) and Screen x 2 (Class 10b)");
});

test("merging can't push a count past the cap", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio", qty: MAX_QTY },
    { classKey: "10a", type: "Steel Patio", qty: MAX_QTY },
  ]);
  assert.equal(r.description, `Steel Patios x ${MAX_QTY}`);
});

// ---------------------------------------------------------------------------
// The board's Class column
// ---------------------------------------------------------------------------
test("a single class is itself", () => {
  assert.equal(boardClass([it("10a", "Steel Patio")]), "Class 10a");
  assert.equal(boardClass([it("10b", "Swimming Pool")]), "Class 10b");
  assert.equal(boardClass([it("cbc", OTHER, 1, "Existing carport")]), "CBC");
});

test("10a and 10b together use the board's own combined label", () => {
  assert.equal(boardClass([it("10a", "Steel Shed"), it("10b", "Retaining Wall")]), MIXED_10);
  assert.equal(MIXED_10, "CDC10a & b");
});

test("the combined label needs no explaining in the description", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Shed" },
    { classKey: "10b", type: "Retaining Wall" },
  ]);
  assert.equal(r.description, "Steel Shed and Retaining Wall");
  assert.equal(r.jobClass, MIXED_10);
});

test("a mix with no board label names every class in the description", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio" },
    { classKey: "cbc", type: OTHER, text: "Existing patio" },
  ]);
  assert.equal(r.jobClass, "CBC");
  assert.equal(r.description, "Steel Patio and Existing patio (Class 10a and CBC)");
});

test("precedence is deterministic whichever order they were added", () => {
  const a = boardClass([it("10a", "Steel Patio"), it("cbc", OTHER, 1, "x")]);
  const b = boardClass([it("cbc", OTHER, 1, "x"), it("10a", "Steel Patio")]);
  assert.equal(a, b);
  assert.equal(a, "CBC");
});

test("commercial outranks Class 10 but not CBC", () => {
  assert.equal(boardClass([it("10b", "Water Tank"), it("commercial", OTHER, 1, "Awning")]),
    "CDC 10a associated with  a Commercial Building");
  assert.equal(boardClass([it("cbc", OTHER, 1, "x"), it("commercial", OTHER, 1, "y")]), "CBC");
});

test("the long commercial label is shortened in a description suffix", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio" },
    { classKey: "commercial", type: OTHER, text: "Awning" },
  ]);
  assert.equal(r.description, "Steel Patio and Awning (Class 10a and Commercial Class 10)");
});

test("no items, no class", () => {
  assert.equal(boardClass([]), "");
  assert.deepEqual(classKeysOf([]), []);
});

// ---------------------------------------------------------------------------
// Normalising what arrives — this is what the server actually trusts
// ---------------------------------------------------------------------------
test("an unknown class is dropped, not guessed at", () => {
  assert.deepEqual(normaliseItems([{ classKey: "class1a", type: "House" }]), []);
  assert.deepEqual(normaliseItems([{ classKey: "", type: "Steel Patio" }]), []);
});

test("an unknown type in a known class becomes free text", () => {
  const [x] = normaliseItems([{ classKey: "10a", type: "Timber Gazebo", text: "Timber gazebo" }]);
  assert.equal(x.type, OTHER);
  assert.equal(x.text, "Timber gazebo");
});

test("free text with nothing in it is dropped", () => {
  assert.deepEqual(normaliseItems([{ classKey: "10a", type: OTHER, text: "   " }]), []);
  assert.deepEqual(normaliseItems([{ classKey: "cbc", type: "Steel Patio" }]), []);
});

test("a type from another class doesn't count as known", () => {
  // "Retaining Wall" is a 10b type; claimed under 10a it's free text, and free
  // text with no `text` is dropped rather than silently becoming a 10a wall.
  assert.deepEqual(normaliseItems([{ classKey: "10a", type: "Retaining Wall" }]), []);
});

test("a class with no type list is always free text", () => {
  const [x] = normaliseItems([{ classKey: "cbc", type: "Steel Patio", text: "Existing shed" }]);
  assert.equal(x.type, OTHER);
  assert.equal(x.text, "Existing shed");
});

test("quantity is coerced into range", () => {
  const q = (v) => normaliseItems([{ classKey: "10a", type: "Steel Patio", qty: v }])[0].qty;
  assert.equal(q(undefined), 1);
  assert.equal(q(0), 1);
  assert.equal(q(-4), 1);
  assert.equal(q("3"), 3);
  assert.equal(q(2.7), 2);
  assert.equal(q(1e9), MAX_QTY);
  assert.equal(q(NaN), 1);
  assert.equal(q("banana"), 1);
});

test("free text is tidied and capped", () => {
  const [x] = normaliseItems([
    { classKey: "10a", type: OTHER, text: "  a\n\n  long   one  " },
  ]);
  assert.equal(x.text, "a long one");
  const [y] = normaliseItems([{ classKey: "10a", type: OTHER, text: "z".repeat(200) }]);
  assert.equal(y.text.length, MAX_TEXT);
});

test("the item list is capped", () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    ({ classKey: "10a", type: OTHER, text: `Thing ${i}` }));
  assert.equal(normaliseItems(many).length, MAX_ITEMS);
});

test("rubbish in gives nothing out, never a throw", () => {
  for (const bad of [null, undefined, "", 0, {}, "Steel Patio", [null], [undefined], [1, 2]]) {
    assert.deepEqual(normaliseItems(bad), [], JSON.stringify(bad));
  }
});

test("mergeItems on an empty list is empty", () => {
  assert.deepEqual(mergeItems([]), []);
});

// ---------------------------------------------------------------------------
// describeJob — the one the API calls
// ---------------------------------------------------------------------------
test("nothing readable is an error, never a fallback", () => {
  for (const bad of [[], null, "patio", [{ classKey: "nope" }]]) {
    const r = describeJob(bad);
    assert.equal(r.ok, false, JSON.stringify(bad));
    assert.ok(r.error, JSON.stringify(bad));
    assert.equal(r.description, undefined);
    assert.equal(r.jobClass, undefined);
  }
});

test("a good job returns items, class and description together", () => {
  const r = describeJob([{ classKey: "10b", type: "Swimming Pool", qty: 1 }]);
  assert.equal(r.ok, true);
  assert.equal(r.jobClass, "Class 10b");
  assert.equal(r.description, "Swimming Pool");
  assert.deepEqual(r.items, [{ classKey: "10b", type: "Swimming Pool", text: "", qty: 1 }]);
});

test("the description never runs away", () => {
  const many = Array.from({ length: MAX_ITEMS }, (_, i) =>
    ({ classKey: "10a", type: OTHER, text: "x".repeat(MAX_TEXT), qty: MAX_QTY }));
  const r = describeJob(many);
  // Capped input can only make so long a sentence — well inside a text column.
  assert.ok(r.description.length < 700, `${r.description.length}`);
});

test("a full mixed job reads the way a person would say it", () => {
  const r = describeJob([
    { classKey: "10a", type: "Steel Patio", qty: 2 },
    { classKey: "10a", type: "Steel Shed", qty: 1 },
    { classKey: "10b", type: "Retaining Wall", qty: 1 },
  ]);
  assert.equal(r.description, "Steel Patios x 2, Steel Shed and Retaining Wall");
  assert.equal(r.jobClass, MIXED_10);
});
