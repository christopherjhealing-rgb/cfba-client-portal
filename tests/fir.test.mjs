import test from "node:test";
import assert from "node:assert/strict";
import {
  FIR_ITEMS, normalise, editDistance, typoAllowance, splitCodes,
  keysFor, nearest, parseFir, composeFir, firCardNote, firHeldNote,
  firGroups, duplicateKeys,
} from "../lib/fir.mjs";

const code = (c) => FIR_ITEMS.find((i) => i.code === c);

// ---------------------------------------------------------------------------
// The library itself
// ---------------------------------------------------------------------------

test("no two items answer to the same word", () => {
  // A clash means one of the two shortcuts silently never fires, and which one
  // depends on declaration order — the worst kind of bug to notice.
  assert.deepEqual(duplicateKeys(), []);
});

test("every item has a code, a title and a body that reads as a request", () => {
  for (const it of FIR_ITEMS) {
    assert.ok(it.code && it.title && it.body, `${it.code} incomplete`);
    assert.ok(it.body.length > 40, `${it.code}: body too short to be a request`);
    assert.ok(/[.!]$/.test(it.body.trim()), `${it.code}: body should end in a full stop`);
    // No greeting or sign-off — updateEmail already supplies both.
    assert.ok(!/^(dear|hello|hi)\b/i.test(it.body), `${it.code}: body greets the client`);
    assert.ok(!/regards|CF Building Approvals\s*$/i.test(it.body), `${it.code}: body signs off`);
  }
});

test("codes are short enough to type from memory", () => {
  for (const it of FIR_ITEMS) {
    assert.ok(it.code.length <= 14, `${it.code} is a mouthful`);
  }
});

test("groups come out in declaration order, every item in one", () => {
  const groups = firGroups();
  assert.deepEqual(groups.map((g) => g.name),
    ["Engineering", "Site plan", "Elevations", "The site", "Paperwork"]);
  assert.equal(groups.reduce((n, g) => n + g.items.length, 0), FIR_ITEMS.length);
});

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

test("case, spacing, punctuation and a trailing s all stop mattering", () => {
  for (const v of ["Soil Class", "soil class", "SOIL CLASS", "soil-class", "  Soil  Class  "]) {
    const r = parseFir(v);
    assert.equal(r.kind, "expand", v);
    assert.equal(r.items[0].code, "soil class");
  }
});

test("aliases are the point — nobody remembers which word we chose", () => {
  for (const [typed, want] of [
    ["geotech", "soil class"],
    ["bushfire", "bal"],
    ["soakwells", "stormwater"],
    ["tie down", "tiedown"],
    ["wind classification", "wind"],
    ["development approval", "planning"],
  ]) {
    const r = parseFir(typed);
    assert.equal(r.kind, "expand", typed);
    assert.equal(r.items[0].code, want, typed);
  }
});

test("a list of shortcuts becomes one message, not three", () => {
  const r = parseFir("Soil Class, Elevations, BAL");
  assert.equal(r.kind, "expand");
  assert.deepEqual(r.items.map((i) => i.code), ["soil class", "elevations", "bal"]);
});

test("separators people actually use", () => {
  for (const v of [
    "soil class, elevations",
    "soil class; elevations",
    "soil class + elevations",
    "soil class and elevations",
    "soil class & elevations",
    "soil class\nelevations",
  ]) {
    const r = parseFir(v);
    assert.equal(r.kind, "expand", v);
    assert.equal(r.items.length, 2, v);
  }
});

test("the same shortcut twice asks once", () => {
  const r = parseFir("soil class, Soil Class");
  assert.equal(r.items.length, 1);
});

// ---------------------------------------------------------------------------
// The three verdicts — the whole safety of the thing
// ---------------------------------------------------------------------------

test("free text goes out exactly as typed, as it always has", () => {
  for (const v of [
    "Please send the soil classification report for the shed at the rear.",
    "Can you confirm whether the patio is attached to the dwelling?",
    "We need the engineering resent — the copy on file is for a different address.",
  ]) {
    assert.equal(parseFir(v).kind, "verbatim", v);
  }
});

test("a short sentence is still free text, not a failed shortcut", () => {
  // The regression that would matter most: staff typing quick real requests.
  for (const v of ["Please resend the plans", "Call me about this one", "Need the form"]) {
    assert.equal(parseFir(v).kind, "verbatim", v);
  }
});

test("a near-miss is held rather than sent", () => {
  const r = parseFir("Sol Class");
  assert.equal(r.kind, "held");
  assert.equal(r.held[0].typed, "Sol Class");
  assert.equal(r.held[0].meant.code, "soil class");
  assert.equal(r.items.length, 0);
});

test("a held update sends nothing at all, even when the rest is fine", () => {
  // Half a form letter and half a typo is worse than either.
  const r = parseFir("Soil Class, Elevatons");
  assert.equal(r.kind, "held");
  assert.equal(r.items.length, 0);
  assert.equal(r.held.length, 1);
  assert.equal(r.held[0].meant.code, "elevations");
});

test("one fragment being free text makes the whole thing free text", () => {
  const r = parseFir("Soil Class, and please ring the owner before you send this");
  assert.equal(r.kind, "verbatim");
});

test("short words are never auto-corrected into a shortcut", () => {
  // Asking a client for the wrong document is the failure this guards. A
  // four-letter word gets no typo allowance at all, so "wing" stays free text
  // rather than quietly becoming the wind classification request.
  assert.equal(typoAllowance(4), 0);
  assert.equal(nearest(normalise("wing"), FIR_ITEMS), null);
  // Held as a bare word rather than expanded — the thing that must never
  // happen is it silently becoming the wind classification request.
  const r = parseFir("wing");
  assert.equal(r.kind, "held");
  assert.equal(r.held[0].why, "bare");
  assert.equal(r.items.length, 0);

  // An exact alias still resolves — nearest() is only ever asked about misses.
  assert.equal(nearest(normalise("pool"), FIR_ITEMS), null, "exact match is not a near-miss");
  assert.equal(parseFir("pool").items[0].code, "pool barrier");
});

test("empty and whitespace are verbatim, not a crash", () => {
  for (const v of ["", "   ", null, undefined]) {
    assert.equal(parseFir(v).kind, "verbatim");
  }
});

test("a whole paragraph never gets edit-distanced", () => {
  const long = "We have reviewed the drawings and require further information ".repeat(3);
  assert.ok(long.length > 120);
  assert.equal(parseFir(long).kind, "verbatim");
});

// ---------------------------------------------------------------------------
// Composing
// ---------------------------------------------------------------------------

test("one item reads as a sentence, not as a list of one", () => {
  const msg = composeFir([code("soil class")], { address: "12 Example St" });
  assert.ok(msg.startsWith("Before we can complete our assessment of 12 Example St we need the following:"));
  assert.ok(!msg.includes("1."), "a single request should not be numbered");
  assert.ok(msg.includes("AS 2870"));
});

test("several items are numbered", () => {
  const msg = composeFir([code("soil class"), code("elevations"), code("bal")]);
  assert.ok(msg.includes("1. "));
  assert.ok(msg.includes("2. "));
  assert.ok(msg.includes("3. "));
});

test("no address, no dangling 'of'", () => {
  const msg = composeFir([code("bal")]);
  assert.ok(msg.startsWith("Before we can complete our assessment we need the following:"));
  assert.ok(!msg.includes(" of  "));
});

test("the composed body never greets or signs off — updateEmail does both", () => {
  const msg = composeFir(FIR_ITEMS.slice(0, 6));
  assert.ok(!/^(dear|hello|hi)\b/i.test(msg));
  assert.ok(!/kind regards|CF Building Approvals/i.test(msg));
});

test("nothing to compose is an empty string, not a letter with no content", () => {
  assert.equal(composeFir([]), "");
  assert.equal(composeFir(), "");
  assert.equal(composeFir([null, undefined]), "");
});

// ---------------------------------------------------------------------------
// What goes back on the card
// ---------------------------------------------------------------------------

test("the card note names what was asked for, not the shorthand", () => {
  const note = firCardNote([code("soil class"), code("bal")]);
  assert.ok(note.includes("Soil classification report"));
  assert.ok(note.includes("BAL assessment"));
  assert.ok(!note.includes("soil class"), "the shorthand is what we're replacing");
});

test("the held note says nothing went, and gives the spelling that would have", () => {
  const parsed = parseFir("Sol Class");
  const note = firHeldNote(parsed.held);
  assert.ok(note.startsWith("Nothing was sent to the client."));
  assert.ok(note.includes("Sol Class"));
  assert.ok(note.includes("soil class"));
  assert.ok(note.includes("FIR Library"));
});

// ---------------------------------------------------------------------------
// A custom library behaves like the shipped one
// ---------------------------------------------------------------------------

test("an office's own item matches, expands and composes", () => {
  const mine = [{ code: "verge", title: "Verge treatment",
    body: "Details of the proposed verge treatment and crossover, dimensioned on the site plan." }];
  const r = parseFir("Verge", mine);
  assert.equal(r.kind, "expand");
  assert.equal(r.items[0].code, "verge");
  assert.ok(composeFir(r.items).includes("crossover"));
});

test("a shortcut missing from a trimmed library stops firing", () => {
  const trimmed = FIR_ITEMS.filter((i) => i.code !== "bal");
  // Nothing else is within a typo of it, so it never expands into whatever
  // happens to be nearest. Held rather than sent, because "bal" on its own is
  // not a message.
  const r = parseFir("bal", trimmed);
  assert.equal(r.kind, "held");
  assert.equal(r.items.length, 0);
});

// ---------------------------------------------------------------------------
// A bare word, and a shortcut somebody switched off
// ---------------------------------------------------------------------------

test("a lone word that isn't a shortcut is held, not posted to the client", () => {
  // The failure this catches: a client receiving a message that reads only
  // "Survey", over our name, because somebody reached for a shortcut we don't
  // have. ("Plans" is not in this list because it IS one — an alias of site
  // plan — which is the behaviour working, not a gap.)
  for (const v of ["Survey", "Photos", "Site levels"]) {
    const r = parseFir(v);
    assert.equal(r.kind, "held", v);
    assert.equal(r.held[0].why, "bare", v);
  }
});

test("a bare word with a full stop is a message, and goes", () => {
  assert.equal(parseFir("Resend.").kind, "verbatim");
});

test("three words or more is a message, not a reach for a shortcut", () => {
  assert.equal(parseFir("Please resend plans").kind, "verbatim");
});

test("a switched-off shortcut is recognised and held, never sent bare", () => {
  const live = FIR_ITEMS.filter((i) => i.code !== "scale");
  const retired = FIR_ITEMS.filter((i) => i.code === "scale");
  const r = parseFir("Scale", live, retired);
  assert.equal(r.kind, "held");
  assert.equal(r.held[0].why, "off");
  assert.equal(r.held[0].meant.code, "scale");

  const note = firHeldNote(r.held, live);
  assert.ok(note.includes("switched off"));
  assert.ok(note.includes("FIR Library"));
});

test("a retired shortcut in a list holds the whole update", () => {
  const live = FIR_ITEMS.filter((i) => i.code !== "scale");
  const retired = FIR_ITEMS.filter((i) => i.code === "scale");
  const r = parseFir("Soil Class, Scale", live, retired);
  assert.equal(r.kind, "held");
  assert.equal(r.items.length, 0);
});

test("the held note copes with every reason without crashing", () => {
  const note = firHeldNote([
    { typed: "Sol Class", meant: FIR_ITEMS[4], why: "typo" },
    { typed: "Scale", meant: FIR_ITEMS[0], why: "off" },
    { typed: "Plans", meant: null, why: "bare" },
  ]);
  assert.ok(note.includes("did you mean"));
  assert.ok(note.includes("switched off"));
  assert.ok(note.includes("too short to send"));
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

test("edit distance is symmetric and zero on a match", () => {
  assert.equal(editDistance("soilclass", "soilclass"), 0);
  assert.equal(editDistance("solclass", "soilclass"), 1);
  assert.equal(editDistance("abc", ""), 3);
  assert.equal(editDistance("kitten", "sitting"), editDistance("sitting", "kitten"));
});

test("splitCodes keeps a lone fragment whole", () => {
  assert.deepEqual(splitCodes("soil class"), ["soil class"]);
  assert.deepEqual(splitCodes(""), []);
});

test("keysFor covers the code and every alias", () => {
  const keys = keysFor(code("soil class"));
  assert.ok(keys.includes("soilclas"));   // normalise strips the trailing s
  assert.ok(keys.includes("geotech"));
});
