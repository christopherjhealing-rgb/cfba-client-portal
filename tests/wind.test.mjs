import { test } from "node:test";
import assert from "node:assert/strict";
import {
  windClass, topographicClass, rowCells, gustSpeed, GUST,
  REGION_KEYS, TERRAIN_KEYS, TOPO_KEYS, SHIELDING_KEYS,
  REGIONS, TERRAIN, SHIELDING, TOPOGRAPHY, SLOPE_BANDS, LANDFORMS, POSITIONS,
} from "../lib/wind.mjs";

// ---------------------------------------------------------------------------
// The whole of Table 2, typed out a second time from the printed page.
//
// This is deliberate duplication. Everything in lib/wind.mjs is transcription,
// so the only failure mode that matters is a typo — and a test that imported
// the table it was checking would agree with any typo perfectly. Reading the
// guide twice is the only thing that actually catches one.
// ---------------------------------------------------------------------------
const PRINTED = `
A 1   N2 N3 N3  N3 N3 N3  N3 N4 N4  N3 N4 N4
A 1.5 N2 N2 N3  N2 N3 N3  N3 N3 N4  N3 N4 N4
A 2   N1 N2 N2  N2 N3 N3  N2 N3 N3  N3 N3 N4
A 2.5 N1 N2 N2  N2 N2 N3  N2 N3 N3  N3 N3 N3
A 3   N1 N1 N2  N1 N2 N2  N2 N3 N3  N2 N3 N3
B 1   N3 N4 N4  N4 N4 N5  N4 N5 N5  N5 N5 N5
B 1.5 N3 N4 N4  N3 N4 N4  N4 N4 N5  N4 N5 N5
B 2   N3 N3 N3  N3 N4 N4  N4 N4 N4  N4 N4 N5
B 2.5 N3 N3 N3  N3 N3 N4  N3 N4 N4  N4 N4 N5
B 3   N2 N3 N3  N3 N3 N3  N3 N4 N4  N3 N4 N4
C 1   C2 C3 C3  C3 C3 C4  C3 C4 C4  C4 C4 NA
C 1.5 C2 C3 C3  C2 C3 C3  C3 C3 C4  C3 C4 C4
C 2   C2 C2 C2  C2 C3 C3  C3 C3 C3  C3 C3 C4
C 2.5 C1 C2 C2  C2 C2 C3  C2 C3 C3  C3 C3 C4
C 3   C1 C2 C2  C2 C2 C2  C2 C3 C3  C2 C3 C3
D 1   C4 C4 NA  C4 NA NA  NA NA NA  NA NA NA
D 1.5 C3 C4 C4  C4 C4 NA  C4 NA NA  NA NA NA
D 2   C3 C3 C4  C3 C4 C4  C4 NA NA  C4 NA NA
D 2.5 C3 C3 C3  C3 C4 C4  C4 C4 NA  C4 NA NA
D 3   C2 C3 C3  C3 C3 C4  C3 C4 C4  C4 C4 NA
`.trim().split("\n").map((l) => l.trim().split(/\s+/));

test("every cell of Table 2 matches the printed guide", () => {
  assert.equal(PRINTED.length, 20, "the guide has 4 regions x 5 terrain categories");
  for (const [region, terrain, ...cells] of PRINTED) {
    assert.equal(cells.length, 12, `${region}/${terrain}: 4 topographic classes x 3 shielding`);
    assert.deepEqual(rowCells(region, terrain), cells, `row ${region} / TC${terrain}`);
  }
});

test("the lookup reads the row in the printed order — T0..T3, then FS/PS/NS", () => {
  for (const [region, terrain, ...cells] of PRINTED) {
    let i = 0;
    for (const topography of TOPO_KEYS) {
      for (const shielding of SHIELDING_KEYS) {
        const want = cells[i++];
        const got = windClass({ region, terrain, topography, shielding });
        if (want === "NA") {
          assert.equal(got.ok, false, `${region}/${terrain}/${topography}/${shielding} should be NA`);
          assert.equal(got.reason, "not-covered");
        } else {
          assert.equal(got.windClass, want,
            `${region}/${terrain}/${topography}/${shielding}`);
        }
      }
    }
  }
});

test("all six worked examples from the back of the guide reproduce", () => {
  // The guide prints six typical sites with the answer for Regions A, B and C.
  // These are the strongest check there is: the answers come from the guide's
  // authors, not from the table I typed in, so a transcription error anywhere
  // near these rows shows up here.
  const EXAMPLES = [
    // [what it is,                         terrain, topo, shielding, A,    B,    C   ]
    ["Flat suburbia",                          "3", "T0", "FS",     "N1", "N2", "C1"],
    ["Backing onto an oval or vacant lot",   "2.5", "T0", "NS",     "N2", "N3", "C2"],
    ["Undulating terrain in suburbia",         "3", "T1", "PS",     "N2", "N3", "C2"],
    ["Undulating, sparsely populated",         "2", "T1", "NS",     "N3", "N4", "C3"],
    ["First row of buildings at the seafront", "1.5", "T0", "NS",   "N3", "N4", "C3"],
    ["Isolated building on the crest of a hill", "2", "T3", "NS",   "N4", "N5", "C4"],
  ];
  for (const [what, terrain, topography, shielding, a, bReg, c] of EXAMPLES) {
    for (const [region, want] of [["A", a], ["B", bReg], ["C", c]]) {
      assert.equal(
        windClass({ region, terrain, topography, shielding }).windClass, want,
        `${what} — Region ${region}`
      );
    }
  }
  // And the speeds the guide prints beside them.
  assert.equal(GUST.N1, "W28");
  assert.equal(GUST.N2, "W33");
  assert.equal(GUST.C1, "W41");
  assert.equal(GUST.N4, "W50");
  assert.equal(GUST.C4, "W70");
});

test("the guide's own hill-crest example, worked from the landform up", () => {
  // "Extremely severe — isolated building on the crest of a hill", which the
  // guide answers N4 for Region A. Reached here through the topographic
  // helper rather than by picking T3, so the two tables are checked together.
  const t = topographicClass({ landform: "hill", slope: "b4", position: "top" });
  assert.equal(t.topography, "T3");
  assert.equal(
    windClass({ region: "A", terrain: "2", topography: t.topography, shielding: "NS" }).windClass,
    "N4"
  );
});

test("the answer carries the gust speed, and cyclonic is flagged", () => {
  const perthSuburb = windClass({ region: "A", terrain: "3", topography: "T0", shielding: "FS" });
  assert.deepEqual(perthSuburb, { ok: true, windClass: "N1", cyclonic: false, gust: "W28", speed: 28 });

  const north = windClass({ region: "C", terrain: "2", topography: "T1", shielding: "NS" });
  assert.equal(north.windClass, "C3");
  assert.equal(north.cyclonic, true);
  assert.equal(north.speed, 60);

  // N and C classes that share a speed really do share it (Table 1).
  for (const [a, b] of [["N3", "C1"], ["N4", "C2"], ["N5", "C3"], ["N6", "C4"]]) {
    assert.equal(gustSpeed(a), gustSpeed(b), `${a} and ${b} are the same speed`);
  }
});

test("an incomplete or invented answer is refused, never guessed", () => {
  const bad = [
    {},
    { region: "A", terrain: "3", topography: "T0" },                    // no shielding
    { region: "A", terrain: "3", shielding: "FS" },                     // no topography
    { region: "E", terrain: "3", topography: "T0", shielding: "FS" },   // no such region
    { region: "A", terrain: "4", topography: "T0", shielding: "FS" },   // no such terrain
    { region: "A", terrain: "3", topography: "T4", shielding: "FS" },   // no such topography
    { region: "A", terrain: "3", topography: "T0", shielding: "XX" },   // no such shielding
    { region: "a", terrain: "3", topography: "T0", shielding: "FS" },   // case matters
  ];
  for (const input of bad) {
    const r = windClass(input);
    assert.equal(r.ok, false, `should refuse ${JSON.stringify(input)}`);
    assert.equal(r.windClass, undefined);
  }
});

test("Region D runs out of table, and says so rather than picking C4", () => {
  // The guide prints NA across most of Region D's exposed rows. Returning the
  // nearest class would be a fabrication with a structural consequence.
  const r = windClass({ region: "D", terrain: "1", topography: "T3", shielding: "NS" });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "not-covered");
  // The whole T2 and T3 blocks for Region D / TC1 are NA.
  for (const topography of ["T2", "T3"]) {
    for (const shielding of SHIELDING_KEYS) {
      assert.equal(windClass({ region: "D", terrain: "1", topography, shielding }).ok, false);
    }
  }
});

// ---------------------------------------------------------------------------
// Topographic classification
// ---------------------------------------------------------------------------

test("hill: from the guide's diagram, lower / middle / top", () => {
  const t = (slope, position) => topographicClass({ landform: "hill", slope, position }).topography;
  assert.deepEqual(["lower", "middle", "top"].map((p) => t("b1", p)), ["T0", "T0", "T1"]);
  assert.deepEqual(["lower", "middle", "top"].map((p) => t("b2", p)), ["T0", "T1", "T2"]);
  assert.deepEqual(["lower", "middle", "top"].map((p) => t("b3", p)), ["T0", "T1", "T2"]);
  assert.deepEqual(["lower", "middle", "top"].map((p) => t("b4", p)), ["T0", "T2", "T3"]);
});

test("escarpment: same up the face, but the plateau behind keeps the effect", () => {
  const t = (slope, position) => topographicClass({ landform: "escarpment", slope, position }).topography;
  const all = ["lower", "middle", "top", "plateau"];
  assert.deepEqual(all.map((p) => t("b1", p)), ["T0", "T0", "T1", "T0"]);
  assert.deepEqual(all.map((p) => t("b2", p)), ["T0", "T1", "T2", "T0"]);
  assert.deepEqual(all.map((p) => t("b3", p)), ["T0", "T1", "T2", "T1"]);
  assert.deepEqual(all.map((p) => t("b4", p)), ["T0", "T2", "T3", "T2"]);
  // This is the whole difference between the two landforms: on a hill the
  // ground falls away behind the crest, on an escarpment it doesn't.
  assert.equal(t("b4", "plateau"), "T2");
  assert.equal(topographicClass({ landform: "hill", slope: "b4", position: "plateau" }).ok, false);
});

test("flat ground is T0 whatever else is answered, and 1:3 is off the end", () => {
  for (const landform of ["hill", "escarpment", undefined]) {
    for (const position of ["lower", "top", undefined]) {
      const r = topographicClass({ landform, slope: "flat", position });
      assert.equal(r.topography, "T0");
    }
  }
  const steep = topographicClass({ landform: "hill", slope: "steeper", position: "top" });
  assert.equal(steep.ok, false);
  assert.equal(steep.reason, "too-steep");
});

test("a half-answered landform gets no classification", () => {
  for (const input of [
    {},
    { landform: "hill" },
    { slope: "b2" },
    { landform: "hill", slope: "b2" },
    { landform: "mountain", slope: "b2", position: "top" },
    { landform: "hill", slope: "b9", position: "top" },
    { landform: "hill", slope: "b2", position: "summit" },
  ]) {
    assert.equal(topographicClass(input).ok, false, `should refuse ${JSON.stringify(input)}`);
  }
});

test("the two helpers join up: every topographic answer is a valid table input", () => {
  for (const landform of ["hill", "escarpment"]) {
    for (const slope of ["b1", "b2", "b3", "b4"]) {
      for (const position of ["lower", "middle", "top", "plateau"]) {
        const r = topographicClass({ landform, slope, position });
        if (!r.ok) continue;
        assert.ok(TOPO_KEYS.includes(r.topography), `${r.topography} isn't a column of Table 2`);
        const w = windClass({ region: "A", terrain: "2", topography: r.topography, shielding: "FS" });
        assert.equal(w.ok, true, "a derived T class must be usable");
      }
    }
  }
});

test("every option offered on screen is one the tables actually accept", () => {
  assert.deepEqual(REGIONS.map((r) => r.key), REGION_KEYS);
  assert.deepEqual(TERRAIN.map((t) => t.key), TERRAIN_KEYS);
  assert.deepEqual(SHIELDING.map((s) => s.key), SHIELDING_KEYS);
  assert.deepEqual(TOPOGRAPHY.map((t) => t.key), TOPO_KEYS);
  // Every listed choice must produce an answer for at least one site, or it's
  // a dead option on the form.
  for (const r of REGIONS) {
    for (const t of TERRAIN) {
      assert.ok(rowCells(r.key, t.key), `no row for ${r.key} / ${t.key}`);
    }
  }
  for (const s of [...REGIONS, ...TERRAIN, ...SHIELDING, ...TOPOGRAPHY, ...SLOPE_BANDS, ...LANDFORMS, ...POSITIONS]) {
    assert.ok(s.label?.trim(), `an option has no label: ${JSON.stringify(s)}`);
  }
  // Only the escarpment has a behind-the-crest position.
  assert.deepEqual(POSITIONS.filter((p) => p.escarpmentOnly).map((p) => p.key), ["plateau"]);
});
