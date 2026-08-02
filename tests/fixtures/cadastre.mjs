// Synthetic cadastre responses, in the shapes a Landgate/SLIP ArcGIS REST
// query actually returns. Not recorded from the live service — this build was
// written without network access to services.slip.wa.gov.au, so every fixture
// is constructed from exact ground geometry (see docs/SPECS.md) rather than
// captured. That makes them better tests, not worse ones: the true answer for
// each is known to the millimetre.
//
// All four lots are laid out around one Baldivis-ish origin at
// -32.32340, 115.84120, which is the front-left corner of each. Local metres
// are east and north from there, the street is to the south unless a fixture
// says otherwise, and coordinates are written to eight decimal places — about
// a millimetre, the same precision the real service returns.
//
//   SUBURBAN   12.5 × 32 m,  400 m²  — the ordinary Perth block
//   CORNER     18 × 25 m,    450 m²  — two street frontages, address on the
//                                      east street, so the frontage is a
//                                      boundary that is NOT the south one
//   BATTLEAXE  620 m²                — rear lot 20 × 25 with a 4 × 30 m
//                                      access leg to the street: the shape
//                                      that must never be simplified away
//   IRREGULAR  495 m²                — six-sided infill lot, no right angles
//                                      to lean on
//
// Property names follow Landgate's cadastre as closely as can be assumed from
// here. parseParcel reads them case-insensitively from a candidate list, so a
// different spelling in the live service costs the identifier line on the
// sheet and nothing else — see docs/SPECS.md for how to correct it.

const feature = (props, ring) => ({
  type: "Feature",
  properties: props,
  geometry: { type: "Polygon", coordinates: [ring] },
});

const collection = (f) => ({ type: "FeatureCollection", features: [f] });

// --- a plain rectangular suburban lot ---------------------------------------
export const SUBURBAN_RING = [
  [115.8412, -32.3234],
  [115.84133288, -32.3234],
  [115.84133288, -32.32311254],
  [115.8412, -32.32311254],
  [115.8412, -32.3234],
];
export const SUBURBAN = collection(feature(
  {
    land_id: "P123456",
    lot_number: "214",
    plan_number: "78123",
    address: "12 WANDOO RISE, BALDIVIS",
    land_area: 400,
  },
  SUBURBAN_RING,
));
/** Where "12 Wandoo Rise" geocodes: the roof, 8 m in from the front. */
export const SUBURBAN_STREET = { lat: -32.32332813, lng: 115.84126644 };

// --- a corner lot: the address is on the east street ------------------------
export const CORNER_RING = [
  [115.8412, -32.3234],
  [115.84139135, -32.3234],
  [115.84139135, -32.32317542],
  [115.8412, -32.32317542],
  [115.8412, -32.3234],
];
export const CORNER = collection(feature(
  {
    land_id: "P223344",
    lot_number: "7",
    plan_number: "55901",
    address: "2 KARRI PARADE, BALDIVIS",
  },
  CORNER_RING,
));
export const CORNER_STREET = { lat: -32.32328771, lng: 115.84134883 };

// --- a battleaxe / flag lot, access leg and all -----------------------------
export const BATTLEAXE_RING = [
  [115.84128504, -32.3234],
  [115.84132756, -32.3234],
  [115.84132756, -32.32313051],
  [115.84141261, -32.32313051],
  [115.84141261, -32.32290593],
  [115.8412, -32.32290593],
  [115.8412, -32.32313051],
  [115.84128504, -32.32313051],
  [115.84128504, -32.3234],
];
export const BATTLEAXE = collection(feature(
  {
    land_id: "P334455",
    lot_number: "3",
    plan_number: "61200",
    address: "14B JARRAH LOOP, BALDIVIS",
  },
  BATTLEAXE_RING,
));
/** A flag lot geocodes to the dwelling at the back, not the driveway. */
export const BATTLEAXE_STREET = { lat: -32.32302271, lng: 115.8413063 };

// --- a six-sided infill lot -------------------------------------------------
export const IRREGULAR_RING = [
  [115.8412, -32.3234],
  [115.84135946, -32.3234],
  [115.84139135, -32.32331017],
  [115.84139135, -32.32316644],
  [115.84126378, -32.32311254],
  [115.8412, -32.32320237],
  [115.8412, -32.3234],
];
export const IRREGULAR = collection(feature(
  { land_id: "P445566", lot_number: "101", plan_number: "402117" },
  IRREGULAR_RING,
));
export const IRREGULAR_STREET = { lat: -32.32335508, lng: 115.84127441 };

// --- the same suburban lot as Esri JSON -------------------------------------
// What the service returns when it ignores f=geojson, which is exactly the
// failure this parser must not have.
export const SUBURBAN_ESRI = {
  displayFieldName: "land_id",
  features: [{
    attributes: {
      OBJECTID: 88213,
      LAND_ID: "P123456",
      SURVEY_LOT_NO: "214",
      SURVEY_PLAN_NO: "78123",
      FULL_ADDRESS: "12 WANDOO RISE, BALDIVIS",
    },
    geometry: { rings: [SUBURBAN_RING] },
  }],
};

// --- a multipart parcel with a sliver ---------------------------------------
// One lot, two polygons. The lot is the big one; the sliver is a capture
// artefact and must not become the drawing.
export const MULTIPART = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { lot_number: "9", plan_number: "12345" },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [[
          [115.84150000, -32.32340000],
          [115.84150500, -32.32340000],
          [115.84150500, -32.32339500],
          [115.84150000, -32.32340000],
        ]],
        [SUBURBAN_RING],
      ],
    },
  }],
};

/** Nothing there: the ordinary answer for a new subdivision. */
export const EMPTY = { type: "FeatureCollection", features: [] };
