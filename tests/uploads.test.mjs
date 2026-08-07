import test from "node:test";
import assert from "node:assert/strict";
import {
  COMBINE, combinable, addressForName, safeForFilename, combinedName, plannedName,
  formatStamp, nameStem, supersededBy,
} from "../lib/uploads.mjs";

// ---------------------------------------------------------------------------
// combinable
// ---------------------------------------------------------------------------
test("only drawings and engineering are combined", () => {
  assert.equal(combinable("drawings"), true);
  assert.equal(combinable("engineering"), true);
  assert.equal(combinable("other"), false);
  assert.equal(combinable(""), false);
  assert.equal(combinable("Drawings"), false); // case-sensitive keys
});

// ---------------------------------------------------------------------------
// addressForName — street + suburb, state/postcode/country trimmed
// ---------------------------------------------------------------------------
test("strips state and postcode, keeps street and suburb", () => {
  assert.equal(addressForName("32 Elvira Street, Palmyra WA 6156"), "32 Elvira Street, Palmyra");
  assert.equal(addressForName("32 Elvira Street, Palmyra, WA 6156"), "32 Elvira Street, Palmyra");
});

test("strips a geocoded trailing country too", () => {
  assert.equal(addressForName("32 Elvira St, Palmyra WA 6156, Australia"), "32 Elvira St, Palmyra");
});

test("strips a bare postcode with no state", () => {
  assert.equal(addressForName("5 Banksia Ave, Mandurah 6210"), "5 Banksia Ave, Mandurah");
});

test("a suburb that carries a state's name is preserved", () => {
  // 'Victoria' is a state, but Victoria Park is a suburb — only a trailing
  // state token is removed, so the suburb survives.
  assert.equal(
    addressForName("882 Albany Highway, Victoria Park WA 6100"),
    "882 Albany Highway, Victoria Park"
  );
});

test("full state names are stripped", () => {
  assert.equal(addressForName("1 Test St, Someplace Western Australia 6000"), "1 Test St, Someplace");
  assert.equal(addressForName("1 Test St, Elsewhere New South Wales 2000"), "1 Test St, Elsewhere");
});

test("an address with no state or postcode is untouched", () => {
  assert.equal(addressForName("24 Narranbee Ridge, Tapping"), "24 Narranbee Ridge, Tapping");
  assert.equal(addressForName("12 Smith Street"), "12 Smith Street");
});

test("blank in, blank out", () => {
  assert.equal(addressForName(""), "");
  assert.equal(addressForName(null), "");
  assert.equal(addressForName(undefined), "");
});

// ---------------------------------------------------------------------------
// safeForFilename — stays inside the stored-file character set
// ---------------------------------------------------------------------------
test("reduces to letters, digits, spaces, dots, underscores and hyphens", () => {
  // Comma and slash become spaces (a comma in a storage key can be rejected).
  assert.equal(safeForFilename("32 Elvira Street, Palmyra"), "32 Elvira Street Palmyra");
  assert.equal(safeForFilename("Unit 3/12 Smith Street"), "Unit 3 12 Smith Street");
  assert.equal(safeForFilename("a:b*c?d\"e<f>g|h"), "a b c d e f g h");
});

test("trims leading and trailing dots and spaces", () => {
  assert.equal(safeForFilename("  .hello.  "), "hello");
  assert.equal(safeForFilename("a.b.c"), "a.b.c"); // interior dots stay
  assert.equal(safeForFilename("...  "), "");
});

// ---------------------------------------------------------------------------
// combinedName — the name the server files under
// ---------------------------------------------------------------------------
test("drawings name carries the fixed base and the site", () => {
  assert.equal(
    combinedName("drawings", "32 Elvira Street, Palmyra WA 6156"),
    "Site Plan and Elevations - 32 Elvira Street Palmyra.pdf"
  );
});

test("engineering name uses its base", () => {
  assert.equal(
    combinedName("engineering", "882 Albany Highway, Victoria Park WA 6100"),
    "Engineering - 882 Albany Highway Victoria Park.pdf"
  );
});

test("no address falls back to the base name alone", () => {
  assert.equal(combinedName("drawings", ""), "Site Plan and Elevations.pdf");
  assert.equal(combinedName("engineering", "   "), "Engineering.pdf");
});

test("a non-combined category has no combined name", () => {
  assert.equal(combinedName("other", "1 Test St"), null);
});

test("the base names match the exported map", () => {
  assert.ok(combinedName("drawings", "x").startsWith(COMBINE.drawings));
  assert.ok(combinedName("engineering", "x").startsWith(COMBINE.engineering));
});

// ---------------------------------------------------------------------------
// formatStamp — Perth-time date for a file name
// ---------------------------------------------------------------------------
test("formats a date stamp in Perth time", () => {
  // Mid-morning Perth (UTC+8): 02:00 UTC is 10:00 in Perth, same day.
  assert.equal(formatStamp("2026-08-07T02:00:00.000Z"), "7 Aug 2026");
});

test("uses the Perth day, not UTC, across midnight", () => {
  // 20:00 UTC on the 6th is 04:00 on the 7th in Perth — the office's day.
  assert.equal(formatStamp("2026-08-06T20:00:00.000Z"), "7 Aug 2026");
  assert.equal(formatStamp(new Date("2026-12-31T18:00:00.000Z")), "1 Jan 2027");
});

// ---------------------------------------------------------------------------
// combinedName with a date — FIR responses
// ---------------------------------------------------------------------------
test("a dated combined name carries the day it came in", () => {
  assert.equal(
    combinedName("drawings", "32 Elvira Street, Palmyra WA 6156", "2026-08-07T02:00:00.000Z"),
    "Site Plan and Elevations - 32 Elvira Street Palmyra - 7 Aug 2026.pdf"
  );
  assert.equal(
    combinedName("engineering", "12 Smith Street", "2026-08-07T02:00:00.000Z"),
    "Engineering - 12 Smith Street - 7 Aug 2026.pdf"
  );
});

test("no date means no stamp (a first lodgement)", () => {
  assert.equal(
    combinedName("drawings", "12 Smith Street"),
    "Site Plan and Elevations - 12 Smith Street.pdf"
  );
  assert.equal(combinedName("drawings", "12 Smith Street", null),
    "Site Plan and Elevations - 12 Smith Street.pdf");
});

// ---------------------------------------------------------------------------
// nameStem + supersededBy — the replace-and-supersede matching
// ---------------------------------------------------------------------------
test("nameStem is the dateless stem shared by every version", () => {
  assert.equal(
    nameStem("drawings", "3 Test Street, Greenwood WA 6024"),
    "Site Plan and Elevations - 3 Test Street Greenwood"
  );
  assert.equal(nameStem("other", "x"), null);
  // The stem is a prefix of both a dated and an undated combined name.
  const stem = nameStem("engineering", "3 Test Street");
  assert.ok(combinedName("engineering", "3 Test Street", "2026-08-07T02:00:00Z").startsWith(stem));
  assert.ok(combinedName("engineering", "3 Test Street").startsWith(stem));
});

test("supersededBy matches prior versions of the same document only", () => {
  const stem = "Site Plan and Elevations - 3 Test Street Greenwood";
  const newName = `${stem} - 12 Aug 2026.pdf`;
  const existing = [
    `${stem} - 7 Aug 2026.pdf`,     // an earlier dated version → superseded
    `${stem}.pdf`,                  // an undated version → superseded
    newName,                        // the new file itself → never
    "Engineering - 3 Test Street Greenwood - 7 Aug 2026.pdf", // a different doc → never
    "CDC - 3 Test Street.pdf",      // the certificate → never
    "Site Plan.pdf",                // an office working file → never
  ];
  assert.deepEqual(supersededBy(existing, stem, newName), [
    `${stem} - 7 Aug 2026.pdf`,
    `${stem}.pdf`,
  ]);
});

test("supersededBy is empty when there's nothing prior or no stem", () => {
  const stem = "Engineering - 12 Smith Street";
  assert.deepEqual(supersededBy([`${stem} - 7 Aug 2026.pdf`], stem, `${stem} - 7 Aug 2026.pdf`), []);
  assert.deepEqual(supersededBy(["anything.pdf"], null, "x.pdf"), []);
});

// ---------------------------------------------------------------------------
// plannedName — what the form shows before lodging
// ---------------------------------------------------------------------------
test("planned name shows a placeholder until an address is typed", () => {
  assert.equal(plannedName("drawings", ""), "Site Plan and Elevations - [site address].pdf");
  assert.equal(
    plannedName("drawings", "12 Smith Street, Greenwood WA 6024"),
    "Site Plan and Elevations - 12 Smith Street Greenwood.pdf"
  );
  assert.equal(plannedName("other", "x"), null);
});
