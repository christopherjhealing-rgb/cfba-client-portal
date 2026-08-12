// The standard FIR library.
//
// An update on a Monday card that starts with "FIR:" is already delivered to
// the client and emailed to them — see CLIENT_PREFIXES in lib/sync.ts. This
// module sits in front of that: if what follows the prefix is a shortcut, or a
// list of them, it is expanded into the full request before it goes.
//
//     FIR: Soil Class                    -> the full paragraph
//     FIR: Soil Class, Elevations        -> one message, two numbered items
//     FIR: <anything we don't recognise> -> sent exactly as typed, as today
//
// Three rules the whole thing turns on:
//
//   1. It never half-expands. Either every fragment is a known shortcut and
//      the message is composed, or none of it is touched. A letter that is
//      half template and half typo is worse than either.
//
//   2. A near-miss is held, not sent. "Sol Class" is one keystroke from a
//      shortcut and nothing like a sentence, so it is almost certainly a
//      mistyped code — sending it would put "Sol Class" in front of a client
//      over our name. Held ones get a note back on the card instead.
//
//   3. Free text still works. Anything that isn't close to a shortcut goes
//      out exactly as it always has. Nobody has to learn this to keep working.
//      With one exception: a single bare word is never a message. "FIR: Plans"
//      is somebody reaching for a shortcut, and a client receiving a message
//      that says only "Plans" over our name is worse than being asked twice.
//
// A shortcut that has been switched off is still recognised, and still held.
// Muscle memory outlives a settings change by months, and the alternative is
// the word itself going to the client as though it were the request.
//
// The wording is the product here, not the matching. Every item below is
// drawn from what our own guidance notes already tell clients — note 07 for
// the drawing items, notes 09 to 14 for the rest — so a request and the sheet
// it points at can't drift apart.

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

/** Case, spacing, punctuation and plurals all stop mattering. */
export function normalise(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .replace(/s$/, "");
}

/** How far apart two strings are, in single-character edits. Bounded work:
 *  anything longer than a shortcut is never going to be a typo of one. */
export function editDistance(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    prev = row;
  }
  return prev[b.length];
}

/**
 * How wrong a fragment can be and still count as a typo of a shortcut.
 *
 * One edit for a short code, two for a longer one, and never more — "soil
 * class" and "pool barrier" are four edits apart, and mixing those two up
 * silently would ask a client for the wrong document entirely.
 */
export function typoAllowance(len) {
  if (len <= 4) return 0;
  if (len <= 9) return 1;
  return 2;
}

/** Fragments, as somebody would type a list of them. */
export function splitCodes(text) {
  return String(text || "")
    .split(/[,;+\n]|(?:\s+&\s+)|(?:\s+and\s+)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read what follows "FIR:".
 *
 * Returns one of three verdicts, and the caller does something different with
 * each — see the header. `items` is only populated for "expand"; `held` names
 * what looked like a typo and what it was probably meant to be.
 */
export function parseFir(text, library = FIR_ITEMS, retired = []) {
  const raw = String(text || "").trim();
  if (!raw) return { kind: "verbatim", items: [], held: [] };

  const fragments = splitCodes(raw);
  // A whole paragraph is never a shortcut list. Bail before the edit distance
  // work rather than after it.
  if (!fragments.length || raw.length > 120) {
    return { kind: "verbatim", items: [], held: [] };
  }

  const items = [];
  const held = [];
  for (const fragment of fragments) {
    const key = normalise(fragment);
    if (!key) return { kind: "verbatim", items: [], held: [] };

    const exact = library.find((it) => keysFor(it).includes(key));
    if (exact) { items.push(exact); continue; }

    // A shortcut somebody switched off. It was right last month, so say so
    // rather than posting the bare word to the client.
    const gone = (retired || []).find((it) => keysFor(it).includes(key));
    if (gone) { held.push({ typed: fragment.trim(), meant: gone, why: "off" }); continue; }

    // Not a shortcut. Is it near enough to one to be a mistyped shortcut?
    const near = nearest(key, library);
    if (near) { held.push({ typed: fragment.trim(), meant: near, why: "typo" }); continue; }

    // One bare word, matching nothing, is a reach for a shortcut rather than
    // a sentence — and "Plans" is not a message to send a client.
    if (fragments.length === 1 && isBareWord(raw)) {
      held.push({ typed: raw, meant: null, why: "bare" });
      continue;
    }

    return { kind: "verbatim", items: [], held: [] };
  }

  if (held.length) return { kind: "held", items: [], held };
  // Same shortcut twice in one update asks for the same thing twice.
  const seen = new Set();
  const unique = items.filter((it) => !seen.has(it.code) && seen.add(it.code));
  return { kind: "expand", items: unique, held: [] };
}

/** One or two words, no sentence to them. Not a message. */
export function isBareWord(s) {
  const t = String(s || "").trim();
  return t.length <= 24 && !/[.!?]/.test(t) && t.split(/\s+/).length <= 2;
}

/** Every spelling a shortcut answers to. */
export function keysFor(item) {
  return [item.code, ...(item.aliases || [])].map(normalise);
}

/** The closest shortcut to a fragment, if one is close enough to be a typo. */
export function nearest(key, library = FIR_ITEMS) {
  let best = null;
  let bestDist = Infinity;
  for (const it of library) {
    for (const k of keysFor(it)) {
      const d = editDistance(key, k);
      if (d < bestDist) { bestDist = d; best = it; }
    }
  }
  if (!best) return null;
  const allowed = typoAllowance(Math.max(key.length, 1));
  return bestDist > 0 && bestDist <= allowed ? best : null;
}

// ---------------------------------------------------------------------------
// Composing
// ---------------------------------------------------------------------------

/**
 * The message that goes to the client.
 *
 * No greeting and no sign-off: this body is dropped into updateEmail, which
 * already opens with "Hello", says which job it's about, and tells them they
 * can reply in the portal. Adding our own would have the client read the same
 * courtesy twice and the same instruction twice.
 */
export function composeFir(items, { address = "" } = {}) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return "";

  const where = address ? ` of ${address}` : "";
  const lead = `Before we can complete our assessment${where} we need the following:`;

  const body = list.length === 1
    ? list[0].body
    : list.map((it, i) => `${i + 1}. ${it.body}`).join("\n\n");

  return `${lead}\n\n${body}`;
}

/** What goes back on the card when a shortcut is expanded, so the board shows
 *  what the client was actually asked for rather than the shorthand. */
export function firCardNote(items) {
  const names = (items || []).map((it) => it.title);
  if (!names.length) return "";
  return `FIR sent to the client — ${names.join(", ")}.`;
}

/** What goes back on the card when nothing was sent. Names the codes rather
 *  than only the mistake, because the next thing the reader wants is the
 *  spelling that would have worked. */
export function firHeldNote(held, library = FIR_ITEMS) {
  const lines = (held || []).map(({ typed, meant, why }) => {
    if (why === "off") {
      return `“${typed}” — that shortcut is switched off. Turn it back on in Admin → FIR Library, or write the request out in full.`;
    }
    if (why === "bare" || !meant) {
      return `“${typed}” — not a shortcut, and too short to send as a message on its own.`;
    }
    return `“${typed}” — did you mean ${meant.code} (${meant.title})?`;
  });
  return [
    "Nothing was sent to the client.",
    ...lines,
    "",
    `Post the update again with a shortcut from the list, or write the request out in full after FIR: and it will go as written. ${library.length} shortcuts are set up — see Admin → FIR Library.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

/**
 * The shipped set. Staff can edit the wording and add their own from
 * Admin → FIR Library; those live in portal_settings and are merged over the
 * top of these, so a deployment always has a working library and an edit
 * never needs a release.
 *
 * `code` is what somebody types. `aliases` are the other things they'll type
 * meaning the same thing — the point of the alias list is that nobody has to
 * remember which word we chose.
 */
export const FIR_ITEMS = [
  // --- the engineering -----------------------------------------------------
  { code: "engineering", group: "Engineering",
    aliases: ["eng", "structural", "engineers certificate"],
    title: "Engineering certification",
    body: "Structural engineering certification for the proposed structure, signed and dated, showing the engineer's name, company and registration number." },

  { code: "eng sign", group: "Engineering",
    aliases: ["unsigned", "not signed", "sign engineering"],
    title: "Engineering not signed",
    body: "The engineering provided is not signed and dated. Please send a signed and dated copy showing the engineer's name, company and registration number." },

  { code: "eng match", group: "Engineering",
    aliases: ["mismatch", "engineering mismatch", "wrong engineering"],
    title: "Engineering doesn't match the structure",
    body: "The engineering provided does not match the structure shown on the drawings. Please send engineering prepared for this structure at this address, or amended drawings that match the engineering already supplied." },

  { code: "wind", group: "Engineering",
    aliases: ["wind class", "wind classification", "n class"],
    title: "Wind classification",
    body: "The wind classification the engineering has been designed to, together with the terrain category and shielding it assumes. The structure has to be certified to the wind classification for this site." },

  { code: "soil class", group: "Engineering",
    aliases: ["soil", "site class", "soil classification", "as2870", "geotech"],
    title: "Soil classification report",
    body: "A soil classification report for the site, prepared in accordance with AS 2870. The footing design has to be matched to the classification, so we need both together." },

  { code: "footings", group: "Engineering",
    aliases: ["footing", "footing details"],
    title: "Footing details",
    body: "Footing details for the structure — depth, diameter and reinforcement — taken from the engineering and shown on the drawings." },

  { code: "tiedown", group: "Engineering",
    aliases: ["tie down", "bracing", "tie-down and bracing"],
    title: "Tie-down and bracing",
    body: "Tie-down and bracing details from the engineering, shown on the drawings as well as in the engineer's documentation." },

  // --- the site plan -------------------------------------------------------
  { code: "site plan", group: "Site plan",
    aliases: ["siteplan", "plan"],
    title: "Site plan",
    body: "A site plan showing every lot boundary dimensioned, the proposed structure dimensioned and located, the setback to every boundary, all existing structures on the lot, the north point and the street frontage." },

  { code: "setbacks", group: "Site plan",
    aliases: ["setback", "boundary setback"],
    title: "Setbacks to every boundary",
    body: "The setback from the proposed structure to every boundary, dimensioned on the site plan — not only the closest one." },

  { code: "north", group: "Site plan",
    aliases: ["north point", "orientation", "frontage"],
    title: "North point and frontage",
    body: "A north point and the street frontage marked on the site plan." },

  { code: "existing", group: "Site plan",
    aliases: ["existing structures", "existing buildings"],
    title: "Existing structures",
    body: "All existing structures on the lot shown on the site plan, including any not part of this application." },

  { code: "scale", group: "Site plan",
    aliases: ["not to scale", "nts"],
    title: "Scale",
    body: "The scale of the drawings stated, or a note confirming they are not to scale." },

  // --- the elevations ------------------------------------------------------
  { code: "elevations", group: "Elevations",
    aliases: ["elevation", "elevs"],
    title: "Elevations",
    body: "Elevations showing the proposed works. For a freestanding structure that is usually all four." },

  { code: "height", group: "Elevations",
    aliases: ["overall height", "building height"],
    title: "Overall height",
    body: "The overall height of the structure measured from natural ground level, not from the slab or the finished floor level." },

  { code: "ngl", group: "Elevations",
    aliases: ["ground line", "natural ground", "ffl", "floor level"],
    title: "Natural ground line and floor level",
    body: "The natural ground line and the finished floor level shown on the elevations." },

  { code: "pitch", group: "Elevations",
    aliases: ["roof pitch", "fall", "roof fall"],
    title: "Roof pitch",
    body: "The roof pitch or fall stated as a figure on the drawings." },

  // --- the site itself -----------------------------------------------------
  { code: "bal", group: "The site",
    aliases: ["bushfire", "bal assessment", "bal rating"],
    title: "BAL assessment",
    body: "A Bushfire Attack Level (BAL) assessment for the site. This lot is in a designated bushfire prone area, so the assessment cannot be completed without one. We don't prepare BAL reports — they come from an accredited bushfire assessor — so please have one prepared and send it through on this job." },

  { code: "stormwater", group: "The site",
    aliases: ["soakwell", "soakwells", "drainage", "soak well"],
    title: "Stormwater and soakwells",
    body: "Where the stormwater from the new roof will go. Soakwell locations and sizes marked on the site plan, the downpipe positions, and which soakwell each downpipe connects to. There is a soakwell calculator under Resources in the portal." },

  { code: "retaining", group: "The site",
    aliases: ["retaining wall", "retaining walls"],
    title: "Retaining wall details",
    body: "Details of the retaining wall — its height, materials and the engineering for it — and whether it is existing or proposed." },

  { code: "easement", group: "The site",
    aliases: ["sewer", "easements", "water corp", "build over"],
    title: "Easement or sewer",
    body: "The easement, sewer or drainage asset affecting the works shown on the site plan, together with the asset owner's agreement to build over or near it where that is required." },

  { code: "pool barrier", group: "The site",
    aliases: ["pool", "barrier", "pool fence"],
    title: "Pool barrier details",
    body: "Details of the swimming pool barrier — its height, the gates, and the 900 mm non-climbable zone. Show the barrier line on the site plan, along with anything climbable within 900 mm of it." },

  // --- the paperwork -------------------------------------------------------
  { code: "planning", group: "Paperwork",
    aliases: ["development approval", "da", "planning approval"],
    title: "Planning approval",
    body: "Evidence of development (planning) approval from the local government, or written confirmation from them that it is not required. The council will not issue a building permit while a required planning approval is outstanding." },

  { code: "ba1", group: "Paperwork",
    aliases: ["form", "application form", "ba form"],
    title: "Signed BA1",
    body: "A completed and signed BA1 application form. The current version is available under Resources in the portal." },

  { code: "owner", group: "Paperwork",
    aliases: ["owners consent", "owner signature", "consent"],
    title: "Owner's consent",
    body: "The owner's signature on the application. We cannot proceed without the owner's consent to the proposed works." },
];

/** Grouped for a screen, in the order the groups are declared above. */
export function firGroups(library = FIR_ITEMS) {
  const order = [];
  const byGroup = new Map();
  for (const it of library) {
    const g = it.group || "Other";
    if (!byGroup.has(g)) { byGroup.set(g, []); order.push(g); }
    byGroup.get(g).push(it);
  }
  return order.map((name) => ({ name, items: byGroup.get(name) }));
}

/** Two items answering to the same word means one of them never fires. */
export function duplicateKeys(library = FIR_ITEMS) {
  const seen = new Map();
  const clashes = [];
  for (const it of library) {
    for (const k of keysFor(it)) {
      if (seen.has(k) && seen.get(k) !== it.code) clashes.push({ key: k, codes: [seen.get(k), it.code] });
      else seen.set(k, it.code);
    }
  }
  return clashes;
}
