"use client";
// The site plan canvas. Everything is drawn in real metres — the SVG viewBox
// IS the lot — and annotation sizes come from paper millimetres via the
// chosen scale, so the screen view and the printed A4 sheet are the same
// drawing. Pure geometry lives in lib/site-plan.mjs; this file is state,
// pointers and SVG. The tool measures and labels — it never judges.
import { useEffect, useRef, useState } from "react";
import {
  DRAW_MARGIN_MM, LOT_INDICATIVE, LOT_MIN_CORNERS, STRUCTURE_PRESETS,
  UNDERLAY_MAX_ROT, UNDERLAY_MIN_OPACITY,
  addLotCorner, alignSnap, applyLotEdit, boundaryFooter, boundaryRow, boundsOf,
  clampToLot, clampUnderlayOpacity, clampUnderlayRot,
  defaultPlacement, deriveStreet, edgeLabels, fitScale, fmtDate, fmtM, fmtM2,
  footprint, frontageFacingStreet, holdUnderlayAnchor,
  isPinned, isSimplePolygon, lotEdges, lotFrontage, lotOrigin, lotOriginNote,
  lotPts, lotSetbacks, mToMmOnPaper,
  mmOnPaperToM, moveLotCorner, moveLotEdge, nearbyGaps, normalisePts,
  pairKey, parseMetres,
  polyBounds, polyFromFootprint,
  polygonArea, polygonCentroid, polygonInside, printedGaps, pushHistory,
  rectLotPts, removeLotCorner, resizeBounds, rotateStructure,
  sanitiseLot, sanitisePins,
  sanitiseUnderlay, scaleBarMetres, setbackMarks, setbacks, snap,
  streetLooksCopied,
  structureArea, structureGap, structureState, togglePin, toggleState,
  underlayAnchor, underlayCentre, underlayMapSize,
  underlayScale, underlayZoom,
  GUTTER_M_PER_DOWNPIPE, PATIO_MAX_COLS, PATIO_MAX_PITCH,
  downpipesNeeded, patioColumns, patioElevationProfile, patioGutter,
  patioRoofHeights, sanitisePatio,
  sanitisePlanUnderlay, rescalePlanUnderlay,
  type Lot, type LotOrigin, type PatioParams, type Pin, type PlanUnderlay,
  type StructureState, type Underlay,
} from "@/lib/site-plan.mjs";
import { findSize, sizeKey, sizeLabel, sizeNew, SOAKWELLS, SOAKWELL_CAVEAT } from "@/lib/soakwell.mjs";
import { getUnderlay, putUnderlay, delUnderlay } from "@/lib/underlay-store";
import { buildLot, reorientLot } from "@/lib/cadastre.mjs";
import { WA_BOUNDS } from "@/lib/address.mjs";
import { GOOGLE_MAPS_KEY, loadMapsLibrary } from "@/lib/google-maps";

type Pt = { x: number; y: number };

// ---------------------------------------------------------------------------
// The aerial underlay. A real photo of the site, sitting behind the drawing at
// the drawing's own scale, so the client can trace their lot over what's
// actually there. Screen only: it is a tracing guide, never part of the sheet
// that gets lodged — Google's imagery may not be redistributed inside a lodged
// document, and a photo has no place on a plan that says it was measured.
//
// The projection maths is all in lib/site-plan.mjs and tested there. What
// lives here is the wiring: one Google map element behind the SVG, clipped to
// the canvas, turned and scaled by CSS, and a set of controls for shoving it
// into place by hand — because geocoding lands on a rooftop, not a lot corner.
// ---------------------------------------------------------------------------

/** The slice of the Maps API we call. @types/google.maps is a heavy
 *  dependency for four members, so the shapes are declared here. */
interface GoogleMapLike {
  setCenter(c: { lat: number; lng: number }): void;
  setZoom(z: number): void;
  getZoom(): number | undefined;
}
interface MapsLibrary {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GoogleMapLike;
}
interface GeocodingLibrary {
  Geocoder: new () => {
    geocode(req: Record<string, unknown>): Promise<{
      results?: Array<{ geometry?: { location?: { lat(): number; lng(): number } } }>;
    }>;
  };
}

const AERIAL_MISS =
  "We couldn't find that address on the map — you can still draw your plan by hand.";

// ---------------------------------------------------------------------------
// The lot boundary, from the State's cadastre.
//
// Typing a width and a depth turns every lot into a rectangle, and a great
// many aren't: corner blocks, battleaxes, the six-sided leftovers of an
// infill subdivision. Landgate holds the real parcel outline, so the tool
// asks for it and draws the lot that is actually there — right shape, right
// dimensions, right orientation, with setbacks measured to the real
// boundaries and north derived from the parcel rather than guessed at.
//
// Two things about that boundary matter more than the feature does:
//
//   It is INDICATIVE. Cadastral boundaries in parts of Perth sit a metre or
//   more off the surveyed pegs, and this plan feeds building permit
//   applications where 900 mm decides the answer. The sheet names the source
//   and the date, says plainly that it is not a survey, and the on-screen
//   copy says the same in fewer words.
//
//   It is often missing. New subdivisions are a large share of this business
//   and they routinely aren't in the cadastre yet. Not finding a lot is a
//   main path, not an error path: the client lands exactly where the tool
//   left them before this existed — trace the aerial, or type the numbers in.
// ---------------------------------------------------------------------------

const LOT_MISS =
  "We couldn't find this lot on the State's records yet — you can trace it " +
  "over the aerial photo, or type the dimensions in.";
const LOT_NO_ADDRESS =
  "Pop the site address in above and we'll go looking for your lot.";

// ---------------------------------------------------------------------------
// Moving the boundary by hand.
//
// The cadastre has the lot when it has it, and a typed 19 × 40 is nobody's
// real block. So the outline is editable the same way the structures already
// are: square handles on the corners, handles on the edges, drag them. Two
// ways in — drag what's there, or tap the corners out over the aerial — and
// one way back, which is undo, because an accidental drag on a phone had no
// way back at all.
//
// The geometry is all in lib/site-plan.mjs and tested there. What lives here
// is the pointer wiring, and one promise the wiring has to keep: an edited
// boundary is the client's own measurement, and the printed sheet says so.
// ---------------------------------------------------------------------------

const LOT_FOLD =
  "That would fold the lot over itself — try a smaller move.";
const LOT_TOO_FEW =
  `A lot needs at least ${LOT_MIN_CORNERS} corners, so this one has to stay.`;

/** Alignment buttons get pressed with a thumb, on site, in the sun: 40 px
 *  minimum on both axes and a press you can see. */
const NUDGE =
  "flex h-10 items-center justify-center rounded-md border border-rule bg-white " +
  "font-display text-[15px] leading-none text-ink transition hover:bg-wash active:bg-[#E7EDE7]";

interface Structure {
  id: string;
  kind: string;
  label: string;
  /** Overall size of the unrotated shape. For a drawn outline these mirror
   *  the outline's bounds and are read-only. */
  w: number;
  d: number;
  /** Top-left of the rotated footprint's bounding box, in lot metres. */
  x: number;
  y: number;
  /** Quarter turns only: 0 / 90 / 180 / 270. */
  rot: number;
  shape: "rect" | "lshape" | "poly";
  notchW?: number;
  notchD?: number;
  pts?: Pt[];
  /** Patio roof / posts / drainage. Only meaningful on a `patio`, only ever
   *  set by the studio (the certifier's portal never turns the tooling on),
   *  and absent on every patio saved before this existed. */
  patio?: PatioParams;
  /** Already there, or being applied for. Every design saved before this
   *  existed loads as proposed and draws exactly as it did. */
  state: StructureState;
}

interface Design {
  address: string;
  street: string;
  /** Overall size of the lot. For a polygon lot these mirror its bounding
   *  box and drive the paper scale exactly as they always have. */
  lotW: number;
  lotD: number;
  /** North arrow bearing, degrees clockwise from straight up. Turned by hand
   *  in 45° steps; derived to the degree from a cadastre lot. */
  north: number;
  structures: Structure[];
  /** Screen-only aerial. No site in it means no photo — which is every
   *  design saved before this existed. */
  underlay: Underlay;
  /** The lot itself: a rectangle unless a real parcel has been loaded, which
   *  is every design saved before the cadastre existed. */
  lot: Lot;
  /** Distances between structures the client has pinned. An unpinned distance
   *  is a screen aid; a pinned one is part of the drawing and prints. Every
   *  design saved before pinning existed has none. */
  pins: Pin[];
  /** Where the client's own house plan sits behind the drawing, if they've
   *  added one. Screen-only tracing guide, never printed; the picture itself
   *  lives in the browser, so only this placement is saved. Studio only. */
  planUnderlay: PlanUnderlay;
}

interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

/** One dimension between two structures, ready to draw: which pair, how far,
 *  where the closest approach runs, and whether it is pinned to the sheet. */
interface GapRow {
  a: string;
  b: string;
  d: number;
  from: Pt;
  to: Pt;
  overlap: boolean;
  pinned: boolean;
}

/** Screen pixels to drawing metres, frozen for the length of one gesture. */
interface Frame {
  left: number;
  top: number;
  k: number;
  mL: number;
  mT: number;
}

/** One step back from a boundary edit. The structures are held by id and by
 *  position only, so undoing a drag never un-adds a shed placed since. */
interface LotSnapshot {
  lot: Lot;
  lotW: number;
  lotD: number;
  north: number;
  at: Record<string, Pt>;
  offsetX: number;
  offsetY: number;
}

const BLANK: Design = {
  address: "", street: "", lotW: 20, lotD: 40, north: 0, structures: [],
  underlay: sanitiseUnderlay(undefined),
  lot: sanitiseLot(undefined),
  pins: [],
  planUnderlay: sanitisePlanUnderlay(undefined),
};

const INK = "#101A15";
const SEAL = "#1E5B3C";
const BRASS = "#B07A18";
const FLAG = "#A6222E";
const FONT_LAB = "Inter, system-ui, sans-serif";
const FONT_NUM = "'IBM Plex Mono', ui-monospace, monospace";

/** One muted, print-friendly fill per structure type — distinct at a glance
 *  but all sitting comfortably beside the portal's seal green. The same list
 *  drives the sheet legend, in this order. */
const KINDS: { kind: string; name: string; fill: string; dark?: boolean }[] = [
  { kind: "dwelling", name: "Dwelling", fill: "#ECE8DD" },
  { kind: "patio", name: "Patio", fill: "#DBE6D4" },
  { kind: "shed", name: "Shed", fill: "#E6DCC6" },
  { kind: "pool", name: "Pool", fill: "#D3E4EA" },
  { kind: "carport", name: "Carport", fill: "#DFE3E4" },
  { kind: "retaining", name: "Retaining Wall", fill: "#2B3A31", dark: true },
  { kind: "lshape", name: "L-shape", fill: "#EBDDD5" },
  { kind: "custom", name: "Custom Shape", fill: "#E3DFEA" },
];
const FILL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.kind, k.fill]));

// ---------------------------------------------------------------------------
// Existing and proposed, told apart on a photocopy.
//
// These sheets get printed in black and white, scanned, and looked at on a
// phone in a ute. So the difference between a building that is already there
// and one being applied for can never be carried by colour:
//
//   PROPOSED — full type colour, a bold solid outline. The subject.
//   EXISTING — the same colour washed right back, a thin dashed outline, and a
//              light diagonal hatch. Reads as background in ink or in grey,
//              and survives a fax.
//
// The dark retaining-wall fill would swallow the hatch, so it gets a pale
// stand-in when it's existing. Nothing else is special-cased.
// ---------------------------------------------------------------------------
const EXIST_WASH = 0.34;
const EXIST_DARK_FILL = "#C6CFC9";
const HATCH_INK = "#2B3A31";

/** What one drawn layer of a footprint is painted with — the same handful of
 *  attributes whether the footprint is a rect or a polygon. */
interface Paint {
  fill: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
}

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// localStorage keys: one design per company per address, plus a pointer to
// the one last worked on so a returning client lands back in their plan.
const designKey = (companyId: string, address: string) =>
  `cfba-site-plan:${companyId}:${address.trim().toLowerCase().replace(/\s+/g, " ") || "unaddressed"}`;
const pointerKey = (companyId: string) => `cfba-site-plan:${companyId}:last`;

function sanitise(raw: unknown): Design {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const dim = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : fb;
  const pos = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
  const structures: Structure[] = Array.isArray(d.structures)
    ? (d.structures as Record<string, unknown>[])
        .filter((s) => s && typeof s === "object")
        .map((s) => {
          // Designs saved before shapes existed carry none of these fields:
          // they default to an unrotated rectangle and behave exactly as
          // they always did.
          const rot = s.rot === 90 || s.rot === 180 || s.rot === 270 ? s.rot : 0;
          const shape = s.shape === "lshape" || s.shape === "poly" ? s.shape : "rect";
          const base: Structure = {
            id: typeof s.id === "string" ? s.id : uid(),
            kind: typeof s.kind === "string" ? s.kind : "shed",
            label: typeof s.label === "string" ? s.label : "Structure",
            w: dim(s.w, 3), d: dim(s.d, 3), x: pos(s.x), y: pos(s.y),
            rot, shape,
            // No state on the record is proposed — every structure saved
            // before existing/proposed existed.
            state: structureState(s),
          };
          if (shape === "lshape") {
            base.notchW = dim(s.notchW, base.w / 2);
            base.notchD = dim(s.notchD, base.d / 2);
          }
          if (shape === "poly") {
            const pts = Array.isArray(s.pts)
              ? (s.pts as Record<string, unknown>[]).filter(
                  (p) => p && typeof p === "object" &&
                    typeof p.x === "number" && Number.isFinite(p.x) &&
                    typeof p.y === "number" && Number.isFinite(p.y),
                ).map((p) => ({ x: p.x as number, y: p.y as number }))
              : [];
            if (pts.length >= 3) {
              base.pts = normalisePts(pts);
              const b = polyBounds(base.pts);
              base.w = b.maxX; base.d = b.maxY;
            } else {
              base.shape = "rect";
            }
          }
          // Patio parameters, on a patio that has them — every studio patio
          // saved since this build. A patio saved before it (or one drawn in
          // the certifier's portal, which never sets them) carries none and
          // stays the plain rectangle it always was.
          if (base.kind === "patio" && s.patio && typeof s.patio === "object") {
            base.patio = sanitisePatio(s.patio);
          }
          return base;
        })
    : [];
  // North used to be 45° steps because it was only ever turned by hand. A
  // cadastre lot derives it to the degree, so any bearing is valid now —
  // and every design saved before this build held a multiple of 45 anyway,
  // so they all load exactly as they were.
  const north = typeof d.north === "number" && Number.isFinite(d.north)
    ? ((d.north % 360) + 360) % 360 : 0;
  return {
    address: typeof d.address === "string" ? d.address : "",
    street: typeof d.street === "string" ? d.street : "",
    lotW: dim(d.lotW, BLANK.lotW),
    lotD: dim(d.lotD, BLANK.lotD),
    north,
    structures,
    underlay: sanitiseUnderlay(d.underlay),
    lot: sanitiseLot(d.lot),
    // A pin naming a structure that is no longer on the plan goes with it.
    pins: sanitisePins(d.pins, structures.map((s) => s.id)),
    planUnderlay: sanitisePlanUnderlay(d.planUnderlay),
  };
}

/** Metres input that commits on blur/Enter — partial typing must never
 *  collapse the lot mid-keystroke. Bad input reverts to the last good value. */
function MetresField({ label, value, onCommit }: {
  label: string; value: number; onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(fmtM(value));
  const editing = useRef(false);
  useEffect(() => { if (!editing.current) setText(fmtM(value)); }, [value]);
  return (
    <div>
      <label className="label">{label}</label>
      <input
        className="field" inputMode="decimal" value={text}
        onFocus={() => { editing.current = true; }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        onBlur={() => {
          editing.current = false;
          const n = parseMetres(text);
          if (n) onCommit(n); else setText(fmtM(value));
        }}
      />
    </div>
  );
}

/** The one question the set-scale line asks: this span is so-many metres now,
 *  what is it really? Its own tiny component so the field's half-typed text
 *  never lives in the builder's state. */
function PlanScaleAsk({ drawn, onApply, onCancel }: {
  drawn: number; onApply: (n: number) => void; onCancel: () => void;
}) {
  const [text, setText] = useState("");
  const val = parseMetres(text);
  return (
    <div className="flex flex-1 flex-wrap items-center gap-2">
      <span className="text-[12.5px] leading-snug text-ink/70">
        That line is <span className="font-mono">{fmtM(drawn)} m</span> at the moment. How long is it really?
      </span>
      <input className="field !h-9 w-24" inputMode="decimal" autoFocus placeholder="metres"
        aria-label="The line's real length in metres"
        value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && val) onApply(val);
          if (e.key === "Escape") onCancel();
        }} />
      <button type="button" className="btn min-h-[40px] !px-3 !py-1.5" disabled={!val}
        onClick={() => val && onApply(val)}>Set the scale</button>
      <button type="button" className="btn-ghost min-h-[40px] !px-3 !py-1.5" onClick={onCancel}>Cancel</button>
    </div>
  );
}

/** Somewhere other than localStorage to keep the drawing — the studio passes
 *  its API here. load() runs once; save() is already debounced by the
 *  builder, so it can go straight to the network. */
export interface DesignStore {
  load(): Promise<unknown | null>;
  save(design: unknown, address: string): void;
}

export function SitePlanBuilder(
  { companyId, cadastre = false, store, patioTools = false, underlayKey, chrome = false }:
  { companyId: string; cadastre?: boolean; store?: DesignStore;
    patioTools?: boolean; underlayKey?: string; chrome?: boolean },
) {
  const [design, setDesign] = useState<Design>(BLANK);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  /** Studio chrome: which toolbar menu is open (a Word-style drop-down that
   *  reveals one group of controls at a time). Null is the resting state — the
   *  canvas has the screen to itself. Only ever used when `chrome` is on. */
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [today, setToday] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [draw, setDraw] = useState<{ pts: Pt[]; hint: string } | null>(null);
  /** A free-drawn shape has just closed and is waiting to be named. */
  const [naming, setNaming] = useState(false);
  const labelRef = useRef<HTMLInputElement>(null);
  // Put the cursor in the name field with the placeholder text selected, so
  // the next thing typed replaces it. Runs after the panel has rendered the
  // newly selected structure, which is why it hangs off `naming` rather than
  // being called inside finishDraw.
  useEffect(() => {
    if (!naming) return;
    // Deferred by a frame on purpose: closing the shape also puts focus back
    // on the drawing so the keyboard shortcuts keep working, and that call
    // runs synchronously inside the same click. Without the frame it lands
    // after this one and the cursor never reaches the name field.
    const id = requestAnimationFrame(() => {
      const el = labelRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      el.select();
    });
    return () => cancelAnimationFrame(id);
  }, [naming]);
  const [pxPerM, setPxPerM] = useState(30);
  /** Boundary editing: whether the handles are out, which corner or edge is
   *  picked up, the outline being traced from scratch, what to say when a
   *  move is refused, and the way back. */
  const [lotEdit, setLotEdit] = useState(false);
  const [lotSel, setLotSel] = useState<{ kind: "corner" | "edge"; i: number } | null>(null);
  const [trace, setTrace] = useState<{ pts: Pt[]; hint: string } | null>(null);
  const [lotNudge, setLotNudge] = useState("");
  const [lotDrag, setLotDrag] = useState<{ kind: "corner" | "edge"; i: number } | null>(null);
  const [history, setHistory] = useState<LotSnapshot[]>([]);
  /** Aerial: what the geocoder is doing, what the map really zoomed to, and
   *  whether a map element exists at all. All three stay false-y when there's
   *  no key, so nothing below this line ever renders. */
  const [finding, setFinding] = useState(false);
  const [aerialNote, setAerialNote] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [liveZoom, setLiveZoom] = useState<number | null>(null);
  /** The lot lookup: whether one is in flight, and what to say if it didn't
   *  land. A blank note is the ordinary state — this never nags. */
  const [findingLot, setFindingLot] = useState(false);
  const [lotNote, setLotNote] = useState("");
  /** House-plan underlay (studio only). The picture in the browser right now,
   *  how many pages a PDF had, whether one is being read in, a message when a
   *  saved plan's picture isn't on this device, and the two points of a
   *  set-scale line waiting for a real length. */
  const planOn = !!underlayKey;
  const [planImg, setPlanImg] = useState<string | null>(null);
  const [planPages, setPlanPages] = useState(1);
  const [planBusy, setPlanBusy] = useState(false);
  const [planMissing, setPlanMissing] = useState(false);
  const [planScaling, setPlanScaling] = useState(false);
  const [planScale, setPlanScale] = useState<{ pts: Pt[]; metres: number | null }>({ pts: [], metres: null });
  const planDragRef = useRef<{ cx: number; cy: number; start: Pt; frame: Frame } | null>(null);
  /** The file the house plan came from, kept for this session so a multi-page
   *  PDF can switch page. Not persisted — a reload asks for it again. */
  const planFileRef = useRef<File | null>(null);
  const keyRef = useRef(designKey(companyId, ""));
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GoogleMapLike | null>(null);
  /** Claimed synchronously so a re-render mid-import can't build two maps. */
  const buildingRef = useRef(false);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ id: string; handle?: string; vertex?: number } | null>(null);
  /** A boundary drag, captured whole at pointer-down: the outline as it was,
   *  where the finger started, and what it took hold of. Everything is worked
   *  out from that rather than from the last frame, so a dropped move can
   *  never leave the boundary lagging behind the finger. */
  const lotDragRef = useRef<{
    kind: "corner" | "edge"; i: number; pts: Pt[]; start: Pt; from: Pt;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    base: LotSnapshot; banked: boolean; frame: Frame;
  } | null>(null);
  /** Long-press on a boundary adds a corner, which is how a thumb does what a
   *  mouse does with a double-click. */
  const pressRef = useRef<{ timer: ReturnType<typeof setTimeout>; x: number; y: number } | null>(null);
  /** Live pointers on the alignment overlay, so one finger drags the photo
   *  and two fingers also turn it. Pinching deliberately does nothing: the
   *  photo's size is what keeps it true to scale. */
  const gestureRef = useRef<{
    pts: Map<number, Pt>; cx: number; cy: number; angle: number | null;
  }>({ pts: new Map(), cx: 0, cy: 0, angle: null });
  /** True once the client has typed their own street name — their word wins
   *  over the derived one until they clear the field again. */
  const streetEditedRef = useRef(false);

  /**
   * Read a saved design's street field, and say whether it is the client's own
   * word or one to derive.
   *
   * A design saved before the street was ever derived holds the WHOLE address
   * in this field, which is why the frontage on the sheet read "24 Narranbee
   * Ridge" beside a site address of "24 Narranbee Ridge". A copy is corrected
   * here on the spot; a street the client actually typed — the different
   * frontage of a corner lot — is kept, and stops the derivation for good.
   */
  function readStreet(d: Design): Design {
    const edited = !!(d.street.trim() && !streetLooksCopied(d.street, d.address));
    streetEditedRef.current = edited;
    return edited ? d : { ...d, street: deriveStreet(d.address) };
  }

  // Restore the last design for this company; date is set client-side only so
  // the server render never disagrees with the browser's timezone.
  useEffect(() => {
    const finish = () => {
      setLoaded(true);
      setToday(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }));
    };
    if (store) {
      // The studio's copy of this drawing. A load that fails just means a
      // blank sheet — same promise localStorage makes below.
      store.load()
        .then((raw) => { if (raw) setDesign(readStreet(sanitise(raw))); })
        .catch(() => {})
        .finally(finish);
      return;
    }
    try {
      const last = localStorage.getItem(pointerKey(companyId));
      const raw = last && localStorage.getItem(last);
      if (last && raw) {
        setDesign(readStreet(sanitise(JSON.parse(raw))));
        keyRef.current = last;
      } else {
        keyRef.current = designKey(companyId, "");
      }
    } catch { /* a broken saved design just means a blank sheet */ }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is stable per mount
  }, [companyId]);

  // Autosave, debounced. Never before the restore has run, or the blank
  // initial state would overwrite the saved plan.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      if (store) { store.save(design, design.address); return; }
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(design));
        localStorage.setItem(pointerKey(companyId), keyRef.current);
      } catch { /* storage full or blocked — keep drawing */ }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- store is stable per mount
  }, [design, loaded, companyId]);

  /** The address is the document key. Committed on blur; typing a previously
   *  used address onto an empty sheet brings that design back. (localStorage
   *  mode only — in the studio the design IS the record, whatever the
   *  address says, so there is no key to switch.) */
  function commitAddress() {
    if (store) return;
    const key = designKey(companyId, design.address);
    if (key === keyRef.current) return;
    if (design.structures.length === 0) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          setDesign(readStreet({ ...sanitise(JSON.parse(raw)), address: design.address }));
        }
      } catch { /* ignore */ }
    }
    keyRef.current = key;
  }

  const { lotW, lotD, north, street } = design;
  const { denom, fits } = fitScale(lotW, lotD);
  const mm = (v: number) => mmOnPaperToM(v, denom);

  // The lot, whichever kind it is. Everything downstream — the outline, the
  // boundary lengths, the setback list, the area on the sheet — reads these
  // four, so a rectangle and a cadastre parcel travel exactly the same path.
  const boundary = design.lot;
  const isPoly = boundary.kind === "poly";
  const lotOutline = lotPts(boundary, lotW, lotD);
  const frontage = lotFrontage(boundary);
  const edges = lotEdges(lotOutline);
  const edgeNames = edgeLabels(lotOutline.length, frontage);
  const lotArea = polygonArea(lotOutline);

  // viewBox: the lot plus paper-true annotation margins, all in metres.
  const mL = mm(DRAW_MARGIN_MM.left), mR = mm(DRAW_MARGIN_MM.right);
  const mT = mm(DRAW_MARGIN_MM.top), mB = mm(DRAW_MARGIN_MM.bottom);
  const vbW = lotW + mL + mR, vbH = lotD + mT + mB;
  const viewBox = `${-mL} ${-mT} ${vbW} ${vbH}`;
  const sel = design.structures.find((s) => s.id === selected) ?? null;
  /** Boundary handles are out. Mutually exclusive with both drawing modes —
   *  one gesture means one thing at a time. */
  const editing = lotEdit && !draw && !trace;
  const origin = lotOrigin(design.lot);

  // Screen pixels per drawing metre — resize handles size their touch
  // targets from this so a fingertip always has ≥ 32 px to land on,
  // whatever the lot size or window width.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const update = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setPxPerM(w / vbW);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vbW]);

  // ---- the aerial underlay -------------------------------------------------

  const under = design.underlay;
  const sited = GOOGLE_MAPS_KEY !== "" && under.lat !== null && under.lng !== null;
  const showing = sited && under.visible;
  /** Imagery on screen, so the drawing can go see-through over it. */
  const tracing = showing && mapReady;
  /** Lining the photo up: the plan is frozen and the overlay takes the drags. */
  const aligning = tracing && !under.locked;

  // How far the imagery is turned: the sheet's north, plus the client's own
  // fine turn for a frontage that isn't square to the photo.
  const imageryDeg = (((north + under.rot) % 360) + 360) % 360;
  // The clip is the canvas box; the map element sits behind it, centred on it.
  const clipW = pxPerM * vbW, clipH = pxPerM * vbH;
  const wantZoom = under.lat !== null ? underlayZoom(under.lat, pxPerM) : null;
  const mapScale = under.lat !== null && liveZoom !== null
    ? underlayScale(under.lat, liveZoom, pxPerM) : 1;
  const mapBox = underlayMapSize(clipW, clipH, imageryDeg, mapScale);
  // Where the map element's own centre sits in the drawing's metres, and
  // where the geocoded point should land.
  const elCentre = { x: -mL + vbW / 2, y: -mT + vbH / 2 };
  // With a cadastre lot the photo needs no lining up at all: the parcel gives
  // one point whose real latitude and longitude are known exactly, and where
  // it sits on the drawing. That — with north derived from the same parcel —
  // is what drops the imagery straight onto the lot. The nudge controls stay
  // for the cases where the cadastre itself is the thing that's out.
  const lotAnchored = isPoly && boundary.anchor !== null &&
    boundary.lat !== null && under.lat === boundary.lat && under.lng === boundary.lng;
  const anchor = underlayAnchor(
    lotW, lotD, under.offsetX, under.offsetY, lotAnchored ? boundary.anchor : null,
  );
  const centre = under.lat !== null && under.lng !== null
    ? underlayCentre({ lat: under.lat, lng: under.lng }, anchor, elCentre, imageryDeg)
    : null;

  const patchUnderlay = (patch: Partial<Underlay> | ((u: Underlay) => Partial<Underlay>)) =>
    setDesign((p) => ({
      ...p,
      underlay: { ...p.underlay, ...(typeof patch === "function" ? patch(p.underlay) : patch) },
    }));

  // ---- the house-plan underlay (studio only) ------------------------------

  const plan0 = design.planUnderlay;
  /** A house plan is placed AND its picture is here to draw. */
  const planShowing = planOn && plan0.placed && !!planImg && plan0.visible;
  /** Lining the house plan up: it's placed, visible, unlocked, and no other
   *  gesture owns the canvas. */
  const planAligning = planShowing && !plan0.locked && !draw && !trace && !lotEdit && !planScaling;

  const patchPlan = (patch: Partial<PlanUnderlay> | ((u: PlanUnderlay) => Partial<PlanUnderlay>)) =>
    setDesign((p) => ({
      ...p,
      planUnderlay: sanitisePlanUnderlay({
        ...p.planUnderlay,
        ...(typeof patch === "function" ? patch(p.planUnderlay) : patch),
      }),
    }));

  // Bring the saved picture back from this browser when a design that has one
  // loads. Not on the server — if it isn't on this device, say so and offer to
  // re-add it, keeping the placement so a same-size picture lands back true.
  // Keyed on the load, not on `placed`: a design that arrives with a house
  // plan fetches its picture once; adding one later sets the picture in hand
  // and must not be clobbered by a re-fetch (which, with no IndexedDB, would
  // read back null and wrongly report it missing).
  useEffect(() => {
    if (!planOn || !loaded || !plan0.placed) return;
    let dead = false;
    void getUnderlay(underlayKey!).then((data) => {
      if (dead) return;
      if (data) { setPlanImg(data); setPlanMissing(false); }
      else setPlanMissing(true);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once the design has loaded; underlayKey is stable per mount
  }, [planOn, loaded]);

  // Picking a structure opens its editor — the one panel that's contextual, so
  // it comes to the front the moment there's something to edit. Studio only.
  useEffect(() => {
    if (chrome && selected) setOpenMenu("selected");
  }, [chrome, selected]);

  /** Read an image file to a data URL and its natural pixel size. */
  function readImage(file: File): Promise<{ dataUrl: string; w: number; h: number }> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const dataUrl = String(fr.result || "");
        const img = new Image();
        img.onload = () => resolve({ dataUrl, w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => reject(new Error("image"));
        img.src = dataUrl;
      };
      fr.onerror = () => reject(new Error("read"));
      fr.readAsDataURL(file);
    });
  }

  /** Render one page of a PDF to a data URL, big enough to trace over without
   *  going soft, capped so a huge sheet doesn't blow the browser's memory. */
  async function renderPdf(file: File, page: number): Promise<{ dataUrl: string; w: number; h: number; pages: number }> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const buf = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: buf }).promise;
    const pg = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
    const base = pg.getViewport({ scale: 1 });
    const target = 2000;                              // long edge, in pixels
    const scale = Math.min(target / Math.max(base.width, base.height), 4);
    const viewport = pg.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await pg.render({ canvasContext: ctx, viewport }).promise;
    const pages = doc.numPages;
    await doc.destroy();
    return { dataUrl: canvas.toDataURL("image/jpeg", 0.85), w: canvas.width, h: canvas.height, pages };
  }

  /** Take the picture on: read or render it, drop it behind the plan roughly
   *  fitting the lot width, and go straight into lining it up. The picture
   *  stays in this browser; only the placement is saved. */
  async function addPlan(file: File, page = 1, keepPlacement = false) {
    if (!planOn || !file) return;
    planFileRef.current = file;
    setPlanBusy(true);
    setPlanMissing(false);
    try {
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      const r = isPdf ? await renderPdf(file, page) : { ...(await readImage(file)), pages: 1 };
      if (!(r.w > 0) || !(r.h > 0)) throw new Error("empty");
      await putUnderlay(underlayKey!, r.dataUrl);
      setPlanImg(r.dataUrl);
      setPlanPages(r.pages);
      if (keepPlacement && plan0.placed) {
        // Just a different page of the same plan — leave it where it sits.
        patchPlan({ w: r.w, h: r.h, page });
      } else {
        setSelected(null);
        setDraw(null);
        // Fit the picture's width to about three-quarters of the lot, centred,
        // so there's something sensible on screen before the scale is even set.
        patchPlan({
          placed: true, w: r.w, h: r.h, page,
          cx: lotW / 2, cy: lotD / 2, mpp: (lotW * 0.75) / r.w, rot: 0,
          visible: true, locked: false,
        });
      }
    } catch {
      setPlanMissing(true);
    } finally {
      setPlanBusy(false);
    }
  }

  const removePlan = () => {
    if (underlayKey) void delUnderlay(underlayKey);
    setPlanImg(null);
    setPlanPages(1);
    setPlanMissing(false);
    setPlanScaling(false);
    setPlanScale({ pts: [], metres: null });
    patchPlan(sanitisePlanUnderlay(undefined));
  };

  // Set the scale by drawing a line along something of a known length. The
  // line is measured in the drawing's own metres at the current size; telling
  // the tool what it really is resizes the picture to match, about the line.
  function startPlanScale() {
    setPlanScaling(true);
    setPlanScale({ pts: [], metres: null });
    patchPlan({ locked: true });
    setSelected(null);
    setDraw(null);
    canvasRef.current?.focus({ preventScroll: true });
  }
  function addPlanScalePoint(e: { clientX: number; clientY: number }) {
    const p = toM(e);
    setPlanScale((s) => {
      if (s.metres !== null) return s;
      const pts = [...s.pts, { x: snap(p.x, 0.01), y: snap(p.y, 0.01) }];
      if (pts.length >= 2) {
        return { pts: [pts[0], pts[1]], metres: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) };
      }
      return { pts, metres: null };
    });
  }
  function applyPlanScale(realM: number) {
    const now = planScale.metres;
    const [a, b] = planScale.pts;
    if (now && now > 0 && realM > 0 && a && b) {
      const k = realM / now;
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      patchPlan((u) => ({
        mpp: rescalePlanUnderlay(u.mpp, now, realM),
        cx: mx + k * (u.cx - mx),
        cy: my + k * (u.cy - my),
      }));
    }
    setPlanScaling(false);
    setPlanScale({ pts: [], metres: null });
  }
  const cancelPlanScale = () => { setPlanScaling(false); setPlanScale({ pts: [], metres: null }); };

  // Dragging the house plan to line it up — one finger moves it; rotation and
  // scale are set from the card, so the drag only ever translates.
  function planDown(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const frame = frameNow();
    planDragRef.current = { cx: plan0.cx, cy: plan0.cy, start: toMIn(e, frame), frame };
  }
  function planMove(e: React.PointerEvent) {
    const g = planDragRef.current;
    if (!g) return;
    const p = toMIn(e, g.frame);
    patchPlan({ cx: g.cx + (p.x - g.start.x), cy: g.cy + (p.y - g.start.y) });
  }
  const planUp = () => { planDragRef.current = null; };

  /** The house plan's box on the canvas, in CSS pixels — where the picture
   *  sits behind the drawing, before its own rotation. */
  function planBox() {
    const u = plan0;
    const wPx = u.w * u.mpp * pxPerM, hPx = u.h * u.mpp * pxPerM;
    const cxPx = (u.cx + mL) * pxPerM, cyPx = (u.cy + mT) * pxPerM;
    return { left: cxPx - wPx / 2, top: cyPx - hPx / 2, w: wPx, h: hPx };
  }

  // Taking the photo off throws the map element away with it, so let the map
  // go too — the next one has to build into the element that's really there.
  useEffect(() => {
    if (sited) return;
    mapRef.current = null;
    buildingRef.current = false;
    setMapReady(false);
    setLiveZoom(null);
  }, [sited]);

  // Build the map once, and only once there's somewhere to put it. Google
  // failing to arrive leaves mapReady false and the tool exactly as it was.
  useEffect(() => {
    if (!showing || mapRef.current || buildingRef.current) return;
    buildingRef.current = true;
    let dead = false;
    void (async () => {
      const lib = await loadMapsLibrary<MapsLibrary>("maps");
      const el = mapElRef.current;
      if (dead || !lib?.Map || !el || mapRef.current) { buildingRef.current = false; return; }
      try {
        mapRef.current = new lib.Map(el, {
          center: { lat: under.lat, lng: under.lng },
          zoom: under.zoom ?? 19,
          mapTypeId: "satellite",
          tilt: 0,
          // No map UI of our own on top of the drawing — but Google's own
          // logo and imagery credit are its to draw, and are never touched.
          disableDefaultUI: true,
          gestureHandling: "none",
          keyboardShortcuts: false,
          isFractionalZoomEnabled: true,
          clickableIcons: false,
          backgroundColor: "#EEF0EA",
        });
        setMapReady(true);
      } catch {
        /* a map that won't build is a plan drawn by hand — say nothing */
      } finally {
        buildingRef.current = false;
      }
    })();
    return () => { dead = true; };
  }, [showing, under.lat, under.lng, under.zoom]);

  // Hold the map on the point the alignment says, at the zoom that makes one
  // drawing metre one metre of ground. Raster maps round the zoom; whatever
  // they land on is read straight back and corrected in CSS.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || wantZoom === null || !centre) return;
    try {
      map.setZoom(wantZoom);
      const got = map.getZoom();
      setLiveZoom(typeof got === "number" && Number.isFinite(got) ? got : wantZoom);
      map.setCenter(centre);
    } catch { /* ignore — the drawing is unaffected */ }
    // centre is rebuilt every render; its two numbers are the real inputs.
  }, [mapReady, wantZoom, centre?.lat, centre?.lng]);

  /** The typed address as a point on the ground, or null. Quiet on every
   *  failure: an address Google can't place is not the client's mistake. */
  async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const lib = await loadMapsLibrary<GeocodingLibrary>("geocoding");
      if (!lib?.Geocoder) return null;
      const { results } = await new lib.Geocoder().geocode({
        address,
        componentRestrictions: { country: "AU" },
        bounds: WA_BOUNDS,
        region: "au",
      });
      const loc = results?.[0]?.geometry?.location;
      const lat = typeof loc?.lat === "function" ? loc.lat() : NaN;
      const lng = typeof loc?.lng === "function" ? loc.lng() : NaN;
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
    } catch {
      return null;
    }
  }

  /** Geocode the typed address and drop the photo behind the plan. */
  async function findSite() {
    // With a real parcel on the sheet, the photo belongs on the parcel's own
    // point rather than on the geocode — that is what keeps it lined up.
    // Nothing to look up, and nothing to line up either.
    if (isPoly && boundary.lat !== null && boundary.lng !== null) {
      setAerialNote("");
      setSelected(null);
      setDraw(null);
      patchUnderlay({
        lat: boundary.lat, lng: boundary.lng,
        zoom: underlayZoom(boundary.lat, pxPerM),
        offsetX: 0, offsetY: 0, rot: 0, visible: true, locked: true,
      });
      return;
    }
    const address = design.address.trim();
    if (!address) {
      setAerialNote("Pop the site address in above and we'll go looking for it.");
      return;
    }
    setFinding(true);
    setAerialNote("");
    const site = await geocode(address);
    setFinding(false);
    if (!site) { setAerialNote(AERIAL_MISS); return; }
    setSelected(null);
    setDraw(null);
    patchUnderlay({
      lat: site.lat, lng: site.lng, zoom: underlayZoom(site.lat, pxPerM),
      offsetX: 0, offsetY: 0, rot: 0, visible: true,
      // Straight into alignment: the pin lands on a roof, not a corner.
      locked: false,
    });
  }

  /** Put a real parcel on the sheet. The outline becomes the lot, its
   *  bounding size drives the paper scale exactly as typed dimensions did,
   *  north comes from the parcel, and the photo hangs off the parcel's own
   *  ground point — so it arrives already lined up. */
  function applyLot(lot: Lot, keepPhotoState = false) {
    const b = polyBounds(lot.pts);
    const w = Math.max(Math.ceil(b.maxX * 100) / 100, 1);
    const d = Math.max(Math.ceil(b.maxY * 100) / 100, 1);
    setDesign((p) => ({
      ...p,
      lot, lotW: w, lotD: d, north: lot.north,
      structures: p.structures.map((s) => {
        const bb = boundsOf(s);
        return { ...s, ...clampToLot(s.x, s.y, bb.w, bb.d, w, d) };
      }),
      underlay: lot.lat !== null && lot.lng !== null
        ? {
            ...p.underlay,
            lat: lot.lat, lng: lot.lng, zoom: underlayZoom(lot.lat, pxPerM),
            offsetX: 0, offsetY: 0, rot: 0,
            visible: keepPhotoState ? p.underlay.visible : true,
            // Nothing to line up — the parcel did it.
            locked: true,
          }
        : p.underlay,
    }));
  }

  /**
   * Fetch the lot boundary for the typed address.
   *
   * The photo goes down first, deliberately. If the cadastre has the lot, the
   * boundary lands on top of it and the client is done. If it hasn't — which
   * is the ordinary answer for a new estate — they are left with an aerial to
   * trace and the dimension fields to type into, which is exactly where this
   * tool stood before today. That path is a main road, so it gets the good
   * outcome ready before the lookup is even attempted.
   */
  async function findLot() {
    const address = design.address.trim();
    if (!address) { setLotNote(LOT_NO_ADDRESS); return; }
    setFindingLot(true);
    setLotNote("");
    setSelected(null);
    setDraw(null);
    try {
      const site = await geocode(address);
      if (!site) { setLotNote(LOT_MISS); return; }
      patchUnderlay({
        lat: site.lat, lng: site.lng, zoom: underlayZoom(site.lat, pxPerM),
        offsetX: 0, offsetY: 0, rot: 0, visible: true, locked: false,
      });
      const r = await fetch(
        `/api/cadastre?lat=${encodeURIComponent(site.lat)}&lng=${encodeURIComponent(site.lng)}`,
        { headers: { Accept: "application/json" } },
      );
      const j = await r.json().catch(() => null);
      const ring = j?.lot?.ring;
      if (!r.ok || !j?.found || !Array.isArray(ring)) { setLotNote(LOT_MISS); return; }
      const lot = buildLot(
        { ring, lotId: String(j.lot.lotId || ""), address: String(j.lot.address || "") },
        site,
        { source: String(j.lot.source || ""), fetched: String(j.lot.fetched || "") },
      );
      if (!lot) { setLotNote(LOT_MISS); return; }
      applyLot(lot);
    } catch {
      setLotNote(LOT_MISS);
    } finally {
      setFindingLot(false);
    }
  }

  /** Tapping a boundary makes it the street. The parcel is laid out again
   *  from its own ground ring, so the lot turns on the sheet, north follows
   *  it and the labels re-derive — nothing is re-measured or approximated. */
  function setFrontage(i: number) {
    if (!isPoly || i === frontage) return;
    applyLot(reorientLot(design.lot, i), true);
  }

  /** Back to typed dimensions, keeping the overall size so nothing jumps. */
  function clearLot() {
    setLotNote("");
    setDesign((p) => ({
      ...p,
      lot: sanitiseLot(undefined),
      north: ((Math.round(p.north / 45) * 45) % 360 + 360) % 360,
    }));
  }

  // ---- moving the boundary by hand ---------------------------------------

  /** How far a corner may be dragged: the canvas, which is the lot plus the
   *  annotation margins. Growing further is another drag — and the margins
   *  grow with the lot, so it is never a wall. */
  const lotBounds = () => ({ minX: -mL, minY: -mT, maxX: lotW + mR, maxY: lotD + mB });

  /** Is the photo hanging off this lot's own ground point? Mirrors the test
   *  the underlay itself makes, for a lot that doesn't exist yet. */
  const anchoredTo = (l: Lot) =>
    l.kind === "poly" && l.anchor !== null && l.lat !== null &&
    under.lat === l.lat && under.lng === l.lng;

  const takeSnapshot = (): LotSnapshot => ({
    lot: design.lot, lotW, lotD, north,
    at: Object.fromEntries(design.structures.map((s) => [s.id, { x: s.x, y: s.y }])),
    offsetX: under.offsetX, offsetY: under.offsetY,
  });
  /** Bank the way back, and hand the caller the state the edit is reckoned
   *  from — a drag re-reckons from this on every single move, so a hundred
   *  moves land in exactly the same place one move would. */
  function remember(): LotSnapshot {
    const snap = takeSnapshot();
    setHistory((h) => pushHistory(h, snap));
    return snap;
  }

  /** One step back. Structures are restored by id, so a shed added since the
   *  drag stays exactly where it was put. */
  function undoLot() {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) return h;
      setDesign((p) => ({
        ...p,
        lot: prev.lot, lotW: prev.lotW, lotD: prev.lotD, north: prev.north,
        structures: p.structures.map((s) =>
          (prev.at[s.id] ? { ...s, ...prev.at[s.id] } : s)),
        underlay: { ...p.underlay, offsetX: prev.offsetX, offsetY: prev.offsetY },
      }));
      return h.slice(0, -1);
    });
    setLotNudge("");
    setLotSel(null);
  }

  /**
   * Put an edited outline on the design.
   *
   * Three things move together or the drawing tells a lie: the lot, the
   * structures (an edit that grows the block upward or leftward shifts the
   * whole coordinate space, and they have to travel with it), and the aerial
   * (which hangs off one ground point and would otherwise slide off the very
   * boundary it was just matched to).
   */
  function commitLotPts(
    pts: Pt[],
    from: LotSnapshot,
    opts: { origin?: LotOrigin | null; frontage?: number | null; reset?: boolean } = {},
  ) {
    const res = applyLotEdit(from.lot, pts, opts);
    if (!res) { setLotNudge(LOT_FOLD); return false; }
    // A traced outline throws the old record away, so the sheet's north — set
    // by hand or derived from a parcel — is what the new lot carries.
    const lot: Lot = opts.reset && res.lot.kind === "poly"
      ? { ...res.lot, north: from.north } : res.lot;
    const hold = holdUnderlayAnchor(
      { offsetX: from.offsetX, offsetY: from.offsetY },
      { lotW: from.lotW, lotD: from.lotD, base: anchoredTo(from.lot) ? from.lot.anchor : null },
      { lotW: res.lotW, lotD: res.lotD, base: anchoredTo(lot) ? lot.anchor : null },
      res.shift,
    );
    setDesign((p) => ({
      ...p,
      lot, lotW: res.lotW, lotD: res.lotD,
      structures: p.structures.map((s) => {
        const was = from.at[s.id];
        if (!was) return s;
        const b = boundsOf(s);
        return {
          ...s,
          ...clampToLot(
            Math.round((was.x + res.shift.dx) * 100) / 100,
            Math.round((was.y + res.shift.dy) * 100) / 100,
            b.w, b.d, res.lotW, res.lotD,
          ),
        };
      }),
      underlay: sited ? { ...p.underlay, ...hold } : p.underlay,
    }));
    setLotNudge("");
    return true;
  }

  function startLotEdit() {
    setLotEdit(true);
    setTrace(null);
    setDraw(null);
    setSelected(null);
    setLotSel(null);
    setLotNudge("");
    cancelPlanScale();
    // Handles get grabbed on the plan, so the photo has to stop taking drags.
    if (aligning) patchUnderlay({ locked: true });
    canvasRef.current?.focus({ preventScroll: true });
  }

  function stopLotEdit() {
    setLotEdit(false);
    setLotSel(null);
    setLotDrag(null);
    setGuides([]);
    setLotNudge("");
  }

  /** A long press is how a thumb does what a mouse does with a double-click.
   *  It's armed on pointer-down, and any real movement calls it a drag
   *  instead and lets go of it. */
  const clearPress = () => {
    if (pressRef.current) { clearTimeout(pressRef.current.timer); pressRef.current = null; }
  };
  const armPress = (e: React.PointerEvent, run: () => void) => {
    clearPress();
    pressRef.current = {
      x: e.clientX, y: e.clientY,
      timer: setTimeout(() => { pressRef.current = null; run(); }, 500),
    };
  };
  const checkPress = (e: React.PointerEvent) => {
    const pr = pressRef.current;
    if (pr && Math.hypot(e.clientX - pr.x, e.clientY - pr.y) > 8) clearPress();
  };

  /** Put a corner on a boundary — the midpoint, or wherever it was tapped. */
  function addCornerOn(edge: number, at: Pt | null = null) {
    const res = addLotCorner(lotOutline, edge, at, frontage);
    if (!res) { setLotNudge(LOT_FOLD); return; }
    if (commitLotPts(res.pts, remember(), { frontage: res.frontage })) {
      setLotSel({ kind: "corner", i: edge + 1 });
    }
  }

  /** Take a corner out. Never below three, and it says so rather than just
   *  ignoring the tap. */
  function removeCorner(i: number) {
    const res = removeLotCorner(lotOutline, i, frontage);
    if (!res) { setLotNudge(LOT_TOO_FEW); return; }
    if (commitLotPts(res.pts, remember(), { frontage: res.frontage })) setLotSel(null);
  }

  // ---- tracing the lot over the aerial -------------------------------------

  function startTrace() {
    setTrace({ pts: [], hint: "" });
    setLotEdit(false);
    setLotSel(null);
    setDraw(null);
    setSelected(null);
    setLotNudge("");
    cancelPlanScale();
    if (aligning) patchUnderlay({ locked: true });
    canvasRef.current?.focus({ preventScroll: true });
  }

  function addTracePoint(e: { clientX: number; clientY: number }) {
    if (!trace) return;
    const b = lotBounds();
    const p = toM(e);
    const x = Math.min(Math.max(snap(p.x, 0.1), b.minX), b.maxX);
    const y = Math.min(Math.max(snap(p.y, 0.1), b.minY), b.maxY);
    const pts = trace.pts;
    // Tapping the first corner again closes the outline.
    if (pts.length >= 3 &&
        Math.hypot(x - pts[0].x, y - pts[0].y) <= Math.max(0.3, 20 / pxPerM)) {
      finishTrace(pts);
      return;
    }
    const last = pts[pts.length - 1];
    if (last && last.x === x && last.y === y) return;
    setTrace({ pts: [...pts, { x, y }], hint: "" });
  }

  function finishTrace(from?: Pt[]) {
    const pts = from ?? trace?.pts;
    if (!pts) return;
    if (pts.length < 3) {
      setTrace({ pts, hint: `Three corners minimum — keep tapping.` });
      return;
    }
    if (!isSimplePolygon(pts)) {
      setTrace({
        pts,
        hint: "That outline crosses itself — move the last corner so no sides overlap, or start again.",
      });
      return;
    }
    const ok = commitLotPts(pts, remember(), {
      origin: "traced", frontage: frontageFacingStreet(pts), reset: true,
    });
    if (!ok) { setTrace({ pts, hint: LOT_FOLD }); return; }
    setTrace(null);
    setLotEdit(true);
    canvasRef.current?.focus({ preventScroll: true });
  }

  const nudgeUnderlay = (dx: number, dy: number) =>
    patchUnderlay((u) => ({
      offsetX: Math.round((u.offsetX + dx) * 1000) / 1000,
      offsetY: Math.round((u.offsetY + dy) * 1000) / 1000,
    }));

  /** Centroid and spread angle of every finger currently on the overlay. */
  function gestureNow() {
    const arr = [...gestureRef.current.pts.values()];
    const n = arr.length || 1;
    const cx = arr.reduce((a, p) => a + p.x, 0) / n;
    const cy = arr.reduce((a, p) => a + p.y, 0) / n;
    const angle = arr.length >= 2
      ? (Math.atan2(arr[1].y - arr[0].y, arr[1].x - arr[0].x) * 180) / Math.PI
      : null;
    return { cx, cy, angle };
  }
  const rebaseGesture = () => Object.assign(gestureRef.current, gestureNow());

  function alignDown(e: React.PointerEvent) {
    e.preventDefault();
    canvasRef.current?.focus({ preventScroll: true });
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    gestureRef.current.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    rebaseGesture();
  }

  function alignMove(e: React.PointerEvent) {
    const g = gestureRef.current;
    if (!g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const now = gestureNow();
    const dx = (now.cx - g.cx) / pxPerM, dy = (now.cy - g.cy) / pxPerM;
    let turn = 0;
    if (now.angle !== null && g.angle !== null) {
      turn = ((now.angle - g.angle + 540) % 360) - 180;
    }
    g.cx = now.cx; g.cy = now.cy; g.angle = now.angle;
    patchUnderlay((u) => ({
      offsetX: Math.round((u.offsetX + dx) * 1000) / 1000,
      offsetY: Math.round((u.offsetY + dy) * 1000) / 1000,
      rot: turn ? clampUnderlayRot(u.rot + turn) : u.rot,
    }));
  }

  function alignUp(e: React.PointerEvent) {
    gestureRef.current.pts.delete(e.pointerId);
    rebaseGesture();
  }

  const patchStructure = (id: string, patch: Partial<Structure>) =>
    setDesign((prev) => ({
      ...prev,
      structures: prev.structures.map((s) => {
        if (s.id !== id) return s;
        const n = { ...s, ...patch };
        if (n.shape === "lshape") {
          n.notchW = Math.min(n.notchW ?? n.w / 2, Math.max(n.w - 0.1, 0.1));
          n.notchD = Math.min(n.notchD ?? n.d / 2, Math.max(n.d - 0.1, 0.1));
        }
        const b = boundsOf(n);
        return { ...n, ...clampToLot(n.x, n.y, b.w, b.d, prev.lotW, prev.lotD) };
      }),
    }));

  /** Patch a patio's parameters, normalised through sanitisePatio so a stray
   *  value out of the panel can never reach the drawing or the saved design.
   *  Starts from the current params (defaulted) so the first touch of any
   *  control gives the patio a full, sensible record. */
  const patchPatio = (id: string, patch: Partial<PatioParams>) =>
    patchStructure(id, {
      patio: sanitisePatio({ ...sanitisePatio(
        design.structures.find((s) => s.id === id)?.patio,
      ), ...patch }),
    });

  const setLot = (patch: Partial<Pick<Design, "lotW" | "lotD">>) =>
    setDesign((prev) => {
      const lot = { lotW: prev.lotW, lotD: prev.lotD, ...patch };
      return {
        ...prev, ...lot,
        structures: prev.structures.map((s) => {
          const b = boundsOf(s);
          return { ...s, ...clampToLot(s.x, s.y, b.w, b.d, lot.lotW, lot.lotD) };
        }),
      };
    });

  function pushStructure(s: Structure) {
    setDesign((prev) => ({ ...prev, structures: [...prev.structures, s] }));
    setDraw(null);
    setSelected(s.id);
    canvasRef.current?.focus({ preventScroll: true });
  }

  /** New structures land on the lot's own middle. For a rectangle that is
   *  the middle of the sheet; for a battleaxe it is inside the block, not
   *  out on the neighbour's where the bounding box's centre falls. */
  const dropAt = (w: number, d: number) =>
    defaultPlacement(w, d, lotW, lotD, design.structures.length,
      isPoly ? polygonCentroid(lotOutline) : null);

  function addStructure(preset: (typeof STRUCTURE_PRESETS)[number]) {
    const at = dropAt(preset.w, preset.d);
    pushStructure({
      id: uid(), kind: preset.kind, label: preset.label,
      w: preset.w, d: preset.d, rot: 0, shape: "rect",
      // Only the dwelling lands as existing — the common job here is work
      // going onto a house that's already there. One tap corrects it.
      state: structureState(preset), ...at,
    });
  }

  function addLShape() {
    const w = 6, d = 4;
    const at = dropAt(w, d);
    pushStructure({
      id: uid(), kind: "lshape", label: "L-shape",
      w, d, rot: 0, shape: "lshape", notchW: 3, notchD: 2,
      state: "proposed", ...at,
    });
  }

  const removeSelected = () => {
    if (!sel) return;
    setDesign((prev) => {
      const structures = prev.structures.filter((s) => s.id !== sel.id);
      return { ...prev, structures, pins: sanitisePins(prev.pins, structures.map((s) => s.id)) };
    });
    setSelected(null);
  };

  /** Pin a distance between two structures, or take the pin out. Pinned means
   *  it stays on the plan and goes on the printed sheet. */
  const pinPair = (a: string, b: string) =>
    setDesign((p) => ({ ...p, pins: togglePin(p.pins, a, b) }));

  const rotateSelected = () => {
    if (!sel) return;
    patchStructure(sel.id, rotateStructure(sel, lotW, lotD));
  };

  /** Pointer position in lot metres — the SVG keeps its viewBox aspect, so
   *  one uniform factor maps client px to drawing metres. */
  function toM(e: { clientX: number; clientY: number }) {
    return toMIn(e, frameNow());
  }

  /** The mapping from screen pixels to drawing metres, as it stands right
   *  now. A boundary drag takes a copy of this when the finger goes down and
   *  reads every move through that copy — because the sidebar, the hint bar
   *  and the lot's own proportions all change while a corner is being moved,
   *  and any of them shifting the canvas would slide the drawing out from
   *  under the finger mid-gesture. */
  function frameNow(): Frame {
    const r = svgRef.current!.getBoundingClientRect();
    return { left: r.left, top: r.top, k: vbW / r.width, mL, mT };
  }

  function toMIn(e: { clientX: number; clientY: number }, f: Frame) {
    return { x: -f.mL + (e.clientX - f.left) * f.k, y: -f.mT + (e.clientY - f.top) * f.k };
  }

  // ---- the odd-shape drawing mode -----------------------------------------

  function startDraw() {
    setDraw({ pts: [], hint: "" });
    setSelected(null);
    cancelPlanScale();
    // Corners get tapped on the plan, so the photo has to stop taking taps.
    if (aligning) patchUnderlay({ locked: true });
    canvasRef.current?.focus({ preventScroll: true });
  }

  function addDrawPoint(e: { clientX: number; clientY: number }) {
    if (!draw) return;
    const p = toM(e);
    const x = Math.min(Math.max(snap(p.x, 0.1), 0), lotW);
    const y = Math.min(Math.max(snap(p.y, 0.1), 0), lotD);
    const pts = draw.pts;
    // Tapping the first corner again closes the outline.
    if (pts.length >= 3 &&
        Math.hypot(x - pts[0].x, y - pts[0].y) <= Math.max(0.3, 16 / pxPerM)) {
      finishDraw();
      return;
    }
    const last = pts[pts.length - 1];
    if (last && last.x === x && last.y === y) return;
    setDraw({ pts: [...pts, { x, y }], hint: "" });
  }

  function finishDraw() {
    if (!draw) return;
    if (draw.pts.length < 3) {
      setDraw({ ...draw, hint: "Three corners minimum — keep tapping." });
      return;
    }
    if (!isSimplePolygon(draw.pts)) {
      setDraw({ ...draw, hint: "That outline crosses itself — move the last corner so no sides overlap, or cancel and start again." });
      return;
    }
    const stored = polyFromFootprint(draw.pts, 0);
    pushStructure({
      id: uid(), kind: "custom", label: "Custom Shape",
      rot: 0, shape: "poly", state: "proposed", ...stored,
    });
    // A shape nobody named is a shape nobody can read on the printed sheet.
    // Ask for the name the moment it closes, while they still know what they
    // just drew — the field is focused with its placeholder text selected, so
    // typing replaces it and ignoring it still leaves something sensible.
    setNaming(true);
  }

  const ARROWS: Record<string, [number, number]> = {
    ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
  };

  function onKeyDown(e: React.KeyboardEvent) {
    // Setting the house-plan scale owns Escape while it's on.
    if (planScaling) {
      if (e.key === "Escape") { e.preventDefault(); cancelPlanScale(); }
      return;
    }
    // Undo is the way back from a boundary drag, wherever you are.
    if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) {
      e.preventDefault();
      undoLot();
      return;
    }
    if (trace) {
      if (e.key === "Escape") { e.preventDefault(); setTrace(null); }
      if (e.key === "Enter") { e.preventDefault(); finishTrace(); }
      return;
    }
    if (draw) {
      if (e.key === "Escape") { e.preventDefault(); setDraw(null); }
      if (e.key === "Enter") { e.preventDefault(); finishDraw(); }
      return;
    }
    if (editing) {
      if (e.key === "Escape") { e.preventDefault(); stopLotEdit(); return; }
      if ((e.key === "Delete" || e.key === "Backspace") && lotSel?.kind === "corner") {
        e.preventDefault();
        removeCorner(lotSel.i);
        return;
      }
      if (e.key === "+" && lotSel?.kind === "edge") {
        e.preventDefault();
        addCornerOn(lotSel.i, null);
        return;
      }
      if (lotSel?.kind === "corner") {
        const d = ARROWS[e.key];
        if (d) {
          e.preventDefault();
          const step = e.shiftKey ? 1 : 0.1;
          const p = lotOutline[lotSel.i];
          const res = moveLotCorner(
            lotOutline, lotSel.i, p.x + d[0] * step, p.y + d[1] * step,
            // Nudging is the precise path, exactly as it is for a structure.
            { snap: false },
          );
          if (!res) { setLotNudge(LOT_FOLD); return; }
          commitLotPts(res.pts, remember());
        }
      }
      return;
    }
    // While the photo is being lined up it owns the arrow keys — that's the
    // adjustment in hand, and nothing on the plan can be selected anyway.
    if (aligning) {
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault();
        patchUnderlay({ locked: true });
        return;
      }
      const a = ARROWS[e.key];
      if (a) {
        e.preventDefault();
        const step = e.shiftKey ? 1 : 0.1;
        nudgeUnderlay(a[0] * step, a[1] * step);
      }
      return;
    }
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
    if (e.key === "Escape") { setSelected(null); return; }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateSelected(); return; }
    if (e.key === "e" || e.key === "E") {
      e.preventDefault();
      patchStructure(sel.id, { state: toggleState(structureState(sel)) });
      return;
    }
    const step = e.shiftKey ? 1 : 0.1;
    const d = ARROWS[e.key];
    if (!d) return;
    e.preventDefault();
    // Nudging is the precise path — it never magnet-snaps.
    patchStructure(sel.id, {
      x: snap(sel.x + d[0] * step, 0.01), y: snap(sel.y + d[1] * step, 0.01),
    });
  }

  // ---- drawing ------------------------------------------------------------

  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: mm(0.7), strokeLinejoin: "round" as const };
  /** The same, cut wider — what a figure needs to stay legible when it sits on
   *  top of a hatch. A draughtsman would leave a window in the hatching; this
   *  is the same idea, done with the halo the labels already carry. */
  const haloWide = { ...halo, strokeWidth: mm(1.4) };

  function dimTexts() {
    return (
      <g fontFamily={FONT_NUM} fontSize={mm(2.7)} fill={INK} fillOpacity={0.75}>
        {/* lot width, under the bottom boundary */}
        <line x1={0} y1={lotD + mm(4.5)} x2={lotW} y2={lotD + mm(4.5)} stroke={INK} strokeOpacity={0.55} strokeWidth={mm(0.2)} />
        {[0, lotW].map((x) => (
          <line key={x} x1={x} y1={lotD + mm(3.3)} x2={x} y2={lotD + mm(5.7)} stroke={INK} strokeOpacity={0.55} strokeWidth={mm(0.2)} />
        ))}
        <text x={lotW / 2} y={lotD + mm(3.6)} textAnchor="middle" style={halo}>{fmtM(lotW)} m</text>
        {/* lot depth, along the left boundary */}
        <line x1={-mm(4.5)} y1={0} x2={-mm(4.5)} y2={lotD} stroke={INK} strokeOpacity={0.55} strokeWidth={mm(0.2)} />
        {[0, lotD].map((y) => (
          <line key={y} x1={-mm(3.3)} y1={y} x2={-mm(5.7)} y2={y} stroke={INK} strokeOpacity={0.55} strokeWidth={mm(0.2)} />
        ))}
        <text transform={`translate(${-mm(5.8)} ${lotD / 2}) rotate(-90)`} textAnchor="middle" style={halo}>
          {fmtM(lotD)} m
        </text>
      </g>
    );
  }

  /** Dashed distances from the selected structure to every boundary. On a
   *  rectangle these are the four the tool has always drawn; on a real lot
   *  they run to whichever boundary line is nearest, at whatever angle it
   *  happens to sit. Measurements, both ways round — the sheet says how far,
   *  never whether it's far enough. */
  function setbackLines(s: Structure) {
    if (isPoly) {
      const runs = lotSetbacks(s, lotOutline, frontage).filter((r) => r.v > 0.004);
      return (
        <g>
          {runs.map((r) => {
            const dx = r.x2 - r.x1, dy = r.y2 - r.y1;
            const len = Math.hypot(dx, dy) || 1;
            // Sit the figure just off its own dimension line, whichever way
            // that line happens to run.
            const ox = (-dy / len) * mm(1.5), oy = (dx / len) * mm(1.5);
            return (
              <g key={r.i}>
                <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={BRASS}
                  strokeWidth={mm(0.3)} strokeDasharray={`${mm(1.8)} ${mm(1.2)}`} />
                <text x={(r.x1 + r.x2) / 2 + ox} y={(r.y1 + r.y2) / 2 + oy + mm(0.9)}
                  textAnchor="middle" fontFamily={FONT_NUM} fontSize={mm(2.6)}
                  fill={BRASS} style={halo}>
                  {fmtM2(r.v)} m
                </text>
              </g>
            );
          })}
        </g>
      );
    }
    const marks = setbackMarks(s, lotW, lotD);
    const runs = [
      { ...marks.rear, vertical: true }, { ...marks.front, vertical: true },
      { ...marks.left, vertical: false }, { ...marks.right, vertical: false },
    ];
    return (
      <g>
        {runs.filter((r) => r.v > 0.004).map((r, i) => (
          <g key={i}>
            <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={BRASS}
              strokeWidth={mm(0.3)} strokeDasharray={`${mm(1.8)} ${mm(1.2)}`} />
            <text
              x={r.vertical ? r.x1 + mm(1.2) : (r.x1 + r.x2) / 2}
              y={r.vertical ? (r.y1 + r.y2) / 2 : r.y1 - mm(1.4)}
              textAnchor={r.vertical ? "start" : "middle"}
              fontFamily={FONT_NUM} fontSize={mm(2.6)} fill={BRASS} style={halo}>
              {fmtM2(r.v)} m
            </text>
          </g>
        ))}
      </g>
    );
  }

  // ---- distances between structures ---------------------------------------
  //
  // Setbacks answer "how far from the fence". These answer "how far from the
  // house" — separation between buildings, and how far a pool sits from what
  // is around it. Measurements, both of them. What they mean is assessment's
  // call and never this file's.

  /** What the selected structure is measured to on screen: its nearest few
   *  neighbours, plus every distance the client has pinned. */
  const byId = new Map(design.structures.map((s) => [s.id, s]));
  const pins = sanitisePins(design.pins, [...byId.keys()]);
  const screenGaps: GapRow[] = (() => {
    const rows = new Map<string, GapRow>();
    for (const [x, y] of pins) {
      const a = byId.get(x), b = byId.get(y);
      if (a && b) rows.set(pairKey(x, y), { a: x, b: y, pinned: true, ...structureGap(a, b) });
    }
    if (sel) {
      for (const g of nearbyGaps(sel, design.structures)) {
        const k = pairKey(sel.id, g.id);
        if (!rows.has(k)) {
          rows.set(k, {
            a: sel.id, b: g.id, pinned: false,
            d: g.d, from: g.from, to: g.to, overlap: g.overlap,
          });
        }
      }
    }
    return [...rows.values()];
  })();
  /** What the sheet carries: the pins, plus every proposed structure's
   *  distance to the existing ones nearest it. Never the whole mesh. */
  const printGaps: GapRow[] = printedGaps(design.structures, pins);
  /** The same list the panel reads, so the plan and the panel never disagree. */
  const nearSel = sel ? nearbyGaps(sel, design.structures) : [];
  /** Structures sitting on ground another one already occupies. Two things
   *  cannot be in the same place, so this is a drawing to fix rather than a
   *  question for assessment — and a 0.00 m figure on its own is easy to miss.
   *  Said on screen only: the sheet reports the measurement and leaves the
   *  colour of it alone. */
  const overlaps = (() => {
    const out = new Set<string>();
    const list = design.structures;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (structureGap(list[i], list[j]).overlap) {
          out.add(list[i].id); out.add(list[j].id);
        }
      }
    }
    return out;
  })();

  /**
   * The dimensions between structures, drawn in the same idiom as the
   * setbacks — brass, with the figure sitting just off its own line.
   *
   * Dashed is a screen aid. Solid, with a tick at each end, is a dimension the
   * client pinned: it stays put and it prints. That is how a draughtsman keeps
   * a sheet readable, and it is why this never draws every distance at once.
   *
   * Two structures sitting on top of each other measure zero — never a
   * negative, never the distance between their far outlines — and the sheet
   * says 0.00 m at the point they share.
   */
  function gapLines(rows: GapRow[], live: boolean) {
    if (rows.length === 0) return null;
    const tick = mm(1.3);
    // A number on the plan is a 40 px target, whatever the scale.
    const padW = Math.max(mm(11), 46 / pxPerM), padH = Math.max(mm(4.6), 42 / pxPerM);
    return (
      <g>
        {rows.map((r) => {
          const zero = r.overlap || r.d < 0.005;
          const dx = r.to.x - r.from.x, dy = r.to.y - r.from.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len, uy = dy / len;
          // Off to one side of its own line, whichever way that line runs.
          const ox = -uy * mm(1.6), oy = ux * mm(1.6);
          const tx = zero ? r.from.x : (r.from.x + r.to.x) / 2 + ox;
          const ty = (zero ? r.from.y - mm(2.4) : (r.from.y + r.to.y) / 2 + oy) + mm(0.9);
          const other = byId.get(r.a)?.label ?? "", mate = byId.get(r.b)?.label ?? "";
          return (
            <g key={pairKey(r.a, r.b)}>
              {zero ? (
                <circle cx={r.from.x} cy={r.from.y} r={mm(1.3)} fill="none"
                  stroke={r.overlap && live ? FLAG : BRASS} strokeWidth={mm(0.4)} />
              ) : (
                <>
                  <line x1={r.from.x} y1={r.from.y} x2={r.to.x} y2={r.to.y}
                    stroke={BRASS} strokeWidth={r.pinned ? mm(0.4) : mm(0.3)}
                    strokeDasharray={r.pinned ? undefined : `${mm(1.8)} ${mm(1.2)}`} />
                  {r.pinned && [r.from, r.to].map((p, i) => (
                    <line key={i} x1={p.x - uy * tick} y1={p.y + ux * tick}
                      x2={p.x + uy * tick} y2={p.y - ux * tick}
                      stroke={BRASS} strokeWidth={mm(0.35)} />
                  ))}
                </>
              )}
              <text x={tx} y={ty} textAnchor="middle" fontFamily={FONT_NUM}
                fontWeight={r.pinned || r.overlap ? 700 : 400} fontSize={mm(2.6)}
                fill={r.overlap && live ? FLAG : BRASS} style={halo} pointerEvents="none">
                {fmtM2(r.d)} m{r.overlap ? " — overlapping" : ""}
              </text>
              {/* Tap the number to pin it. The line itself stays out of the
                  way — a fat target along it would swallow taps meant for the
                  structures either side. */}
              {live && (
                <rect x={tx - padW / 2} y={ty - padH + mm(0.9)} width={padW} height={padH}
                  fill="transparent" style={{ cursor: "pointer" }}
                  onPointerDown={(e) => { e.stopPropagation(); pinPair(r.a, r.b); }}>
                  <title>
                    {`${other} to ${mate} — ${fmtM2(r.d)} m${r.overlap ? " (they overlap)" : ""}. `
                      + (r.pinned ? "Tap to unpin it from the plan." : "Tap to pin it to the plan and the print.")}
                  </title>
                </rect>
              )}
            </g>
          );
        })}
      </g>
    );
  }

  /** Short form of a boundary's name for the plan itself, where "BOUNDARY 4"
   *  would be four times the width of the line it labels. */
  const shortEdgeName = (name: string) =>
    name.startsWith("Boundary ") ? name.slice(9) : name.toUpperCase();

  /** Every boundary of a real lot, dimensioned and named: its length outside
   *  the line, what it is inside it, and the street boundary drawn heavier
   *  because everything else is reckoned from it. */
  function boundaryTexts() {
    return (
      <g pointerEvents="none">
        <line x1={edges[frontage].a.x} y1={edges[frontage].a.y}
          x2={edges[frontage].b.x} y2={edges[frontage].b.y}
          stroke={SEAL} strokeWidth={mm(0.9)} strokeLinecap="round" />
        {edges.map((e, i) => {
          if (e.length < 0.5) return null;
          return (
            <g key={i}>
              <text x={e.mid.x + e.nx * mm(2.4)} y={e.mid.y + e.ny * mm(2.4) + mm(0.9)}
                textAnchor="middle" fontFamily={FONT_NUM} fontSize={mm(2.6)}
                fill={INK} fillOpacity={0.8} style={halo}>
                {fmtM(e.length)} m
              </text>
              <text x={e.mid.x - e.nx * mm(3.2)} y={e.mid.y - e.ny * mm(3.2) + mm(0.8)}
                textAnchor="middle" fontFamily={FONT_LAB} fontWeight={700}
                fontSize={mm(2.1)} letterSpacing={mm(0.25)}
                fill={i === frontage ? SEAL : INK}
                fillOpacity={i === frontage ? 0.95 : 0.45} style={halo}>
                {shortEdgeName(edgeNames[i])}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  /** An invisible fat line over each boundary: tap one and it becomes the
   *  street. The cadastre records parcels, not frontages, so whatever the
   *  tool inferred is only ever an opening offer. Drawn under the structures
   *  so a tap near the fence still picks up the shed sitting on it. */
  function edgeTargets() {
    const grab = Math.max(20 / pxPerM, mm(3));
    return (
      <g>
        {edges.map((e, i) => (
          <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke="transparent" strokeWidth={grab} pointerEvents="stroke"
            style={{ cursor: "pointer" }}
            onPointerDown={(ev) => { ev.stopPropagation(); setFrontage(i); }}>
            <title>{`Make this the street frontage — ${edgeNames[i]}, ${fmtM(e.length)} m`}</title>
          </line>
        ))}
      </g>
    );
  }

  /** In editing, the same fat lines pick a boundary instead of the frontage —
   *  and a double-tap or a long press puts a new corner on it, right where
   *  the finger landed. */
  function lotEdgeTargets() {
    const grab = Math.max(22 / pxPerM, mm(3.2));
    return (
      <g>
        {edges.map((e, i) => (
          <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y}
            stroke="transparent" strokeWidth={grab} pointerEvents="stroke"
            style={{ cursor: "pointer" }}
            onPointerDown={(ev) => {
              ev.stopPropagation();
              setLotSel({ kind: "edge", i });
              setLotNudge("");
              canvasRef.current?.focus({ preventScroll: true });
              const at = toM(ev);
              armPress(ev, () => addCornerOn(i, at));
            }}
            onPointerMove={checkPress}
            onPointerUp={clearPress}
            onPointerCancel={clearPress}
            onDoubleClick={(ev) => { ev.stopPropagation(); addCornerOn(i, toM(ev)); }}>
            <title>{`${edgeNames[i]} — ${fmtM(e.length)} m. Double-tap or hold to add a corner.`}</title>
          </line>
        ))}
      </g>
    );
  }

  /**
   * The boundary's own handles: a square on every corner, a smaller one in
   * the middle of every boundary. Same shape, same colour and same feel as
   * the resize handles on a structure, because it is the same gesture — the
   * only difference is that this one is the lot.
   *
   * Every handle carries an invisible pad of at least 40 px across, whatever
   * the plan's scale, because this gets done on a phone standing in a
   * driveway.
   */
  function lotHandleNodes() {
    const hitR = Math.max(20 / pxPerM, mm(2));
    const vis = mm(1.3), midVis = mm(1);
    const bounds = lotBounds();

    const begin = (kind: "corner" | "edge", i: number, e: React.PointerEvent) => {
      e.stopPropagation();
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      const from = kind === "corner" ? lotOutline[i] : edges[i].mid;
      const frame = frameNow();
      // The way back is banked on the first move that actually lands, not
      // here — picking a corner up and putting it down again is not an edit,
      // and shouldn't cost an undo.
      lotDragRef.current = {
        kind, i, pts: lotOutline, start: toMIn(e, frame), from, bounds, frame,
        base: takeSnapshot(), banked: false,
      };
      setLotSel({ kind, i });
      setLotDrag({ kind, i });
      setLotNudge("");
      canvasRef.current?.focus({ preventScroll: true });
    };
    const end = () => {
      lotDragRef.current = null;
      setLotDrag(null);
      setGuides([]);
    };
    const move = (e: React.PointerEvent) => {
      const g = lotDragRef.current;
      if (!g) return;
      const p = toMIn(e, g.frame);
      // Alt is a free hand: no grid, no lining up with the other corners, no
      // squaring — the same key that frees a structure drag.
      const opts = { snap: !e.altKey, bounds: g.bounds };
      const bank = () => {
        if (g.banked) return;
        g.banked = true;
        setHistory((h) => pushHistory(h, g.base));
      };
      if (g.kind === "corner") {
        const res = moveLotCorner(g.pts, g.i, p.x, p.y, opts);
        if (!res) { setLotNudge(LOT_FOLD); return; }
        setGuides(res.guides as Guide[]);
        bank();
        commitLotPts(res.pts, g.base);
      } else {
        const res = moveLotEdge(
          g.pts, g.i, g.from.x + (p.x - g.start.x), g.from.y + (p.y - g.start.y), opts,
        );
        if (!res) { setLotNudge(LOT_FOLD); return; }
        bank();
        commitLotPts(res.pts, g.base);
      }
    };

    const pad = (
      key: string, x: number, y: number, r: number, cursor: string,
      kind: "corner" | "edge", i: number, node: React.ReactNode, label: string,
    ) => (
      <g key={key} style={{ cursor }}
        onPointerDown={(e) => {
          begin(kind, i, e);
          // The middle of a boundary is exactly where a thumb lands to add a
          // corner, and it is also the handle that shifts the whole boundary.
          // Holding still says corner; moving says shift.
          if (kind === "edge") {
            armPress(e, () => {
              lotDragRef.current = null;
              setLotDrag(null);
              setGuides([]);
              addCornerOn(i, null);
            });
          }
        }}
        onPointerMove={(e) => { checkPress(e); move(e); }}
        onPointerUp={() => { clearPress(); end(); }}
        onPointerCancel={() => { clearPress(); end(); }}
        onDoubleClick={kind === "edge"
          ? (e) => { e.stopPropagation(); addCornerOn(i, null); } : undefined}>
        <circle cx={x} cy={y} r={r} fill="transparent" />
        {node}
        <title>{label}</title>
      </g>
    );

    return (
      <g>
        {/* Boundary middles first, so a corner always wins a shared tap. */}
        {edges.map((e, i) => {
          const picked = lotSel?.kind === "edge" && lotSel.i === i;
          return e.length < 0.4 ? null : pad(
            `e${i}`, e.mid.x, e.mid.y, hitR,
            Math.abs(e.nx) > Math.abs(e.ny) ? "ew-resize" : "ns-resize", "edge", i,
            <rect x={e.mid.x - midVis} y={e.mid.y - midVis}
              width={midVis * 2} height={midVis * 2}
              transform={`rotate(45 ${e.mid.x} ${e.mid.y})`}
              fill={picked ? BRASS : "#fff"} stroke={BRASS} strokeWidth={mm(0.3)} />,
            `Drag to move this whole boundary — ${edgeNames[i]}, ${fmtM(e.length)} m. Double-tap to add a corner.`,
          );
        })}
        {lotOutline.map((p, i) => {
          const picked = lotSel?.kind === "corner" && lotSel.i === i;
          return pad(
            `c${i}`, p.x, p.y, hitR, "grab", "corner", i,
            <rect x={p.x - vis} y={p.y - vis} width={vis * 2} height={vis * 2}
              fill={picked ? BRASS : "#fff"} stroke={BRASS}
              strokeWidth={picked ? mm(0.5) : mm(0.35)} />,
            `Corner ${i + 1} of ${lotOutline.length} — drag to move it`,
          );
        })}
      </g>
    );
  }

  /** What the boundary measures, while it is being moved. The figures a
   *  builder is actually watching: the two boundaries either side of the
   *  corner in hand, or the length of the edge being shifted. */
  function lotDragReadout() {
    if (!lotDrag) return null;
    const show = lotDrag.kind === "corner"
      ? [edges[(lotDrag.i - 1 + edges.length) % edges.length], edges[lotDrag.i]]
      : [edges[lotDrag.i]];
    const held = lotDrag.kind === "corner"
      ? lotOutline[lotDrag.i] : edges[lotDrag.i].mid;
    return (
      <g pointerEvents="none">
        {show.map((e) => (
          <text key={e.i} x={e.mid.x + e.nx * mm(2.4)} y={e.mid.y + e.ny * mm(2.4) + mm(0.9)}
            textAnchor="middle" fontFamily={FONT_NUM} fontSize={mm(3)}
            fontWeight={700} fill={BRASS} style={halo}>
            {fmtM2(e.length)} m
          </text>
        ))}
        {/* Said on the drawing rather than in a panel: a refused move must
            never move the plan under the finger that made it. */}
        {lotNudge && (
          <text x={held.x} y={held.y - mm(4)} textAnchor="middle"
            fontFamily={FONT_LAB} fontWeight={600} fontSize={mm(2.7)}
            fill={BRASS} style={halo}>
            {lotNudge}
          </text>
        )}
      </g>
    );
  }

  /** Resize handles for the selected structure: corners + edges move the
   *  bounding box of rectangles and Ls; drawn outlines get a handle on every
   *  corner. Each handle carries an invisible touch pad of at least 32 px. */
  function handleNodes(s: Structure) {
    const hitR = Math.max(16 / pxPerM, mm(1.8));
    const vis = mm(1.2);
    const pad = (x: number, y: number, cursor: string,
      start: () => void, move: (e: React.PointerEvent) => void, key: string) => (
      <g key={key} style={{ cursor }}
        onPointerDown={(e) => {
          e.stopPropagation();
          start();
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={() => { resizeRef.current = null; }}
        onPointerCancel={() => { resizeRef.current = null; }}>
        <circle cx={x} cy={y} r={hitR} fill="transparent" />
        <rect x={x - vis} y={y - vis} width={vis * 2} height={vis * 2}
          fill="#fff" stroke={BRASS} strokeWidth={mm(0.35)} />
      </g>
    );
    if (s.shape === "poly") {
      return (
        <g>
          {footprint(s).map((p, i) =>
            pad(p.x, p.y, "grab",
              () => { resizeRef.current = { id: s.id, vertex: i }; },
              (e) => {
                const r = resizeRef.current;
                if (!r || r.id !== s.id || r.vertex !== i) return;
                const m = toM(e);
                const x = Math.min(Math.max(snap(m.x, 0.1), 0), lotW);
                const y = Math.min(Math.max(snap(m.y, 0.1), 0), lotD);
                const next = footprint(s).map((q, j) => (j === i ? { x, y } : q));
                // A corner dragged across another side would fold the shape —
                // hold the last honest outline instead.
                if (!isSimplePolygon(next)) return;
                patchStructure(s.id, polyFromFootprint(next, s.rot));
              }, `v${i}`))}
        </g>
      );
    }
    const b = boundsOf(s);
    const spots: { h: string; x: number; y: number; cursor: string }[] = [
      { h: "nw", x: s.x, y: s.y, cursor: "nwse-resize" },
      { h: "n", x: s.x + b.w / 2, y: s.y, cursor: "ns-resize" },
      { h: "ne", x: s.x + b.w, y: s.y, cursor: "nesw-resize" },
      { h: "e", x: s.x + b.w, y: s.y + b.d / 2, cursor: "ew-resize" },
      { h: "se", x: s.x + b.w, y: s.y + b.d, cursor: "nwse-resize" },
      { h: "s", x: s.x + b.w / 2, y: s.y + b.d, cursor: "ns-resize" },
      { h: "sw", x: s.x, y: s.y + b.d, cursor: "nesw-resize" },
      { h: "w", x: s.x, y: s.y + b.d / 2, cursor: "ew-resize" },
    ];
    return (
      <g>
        {spots.map(({ h, x, y, cursor }) =>
          pad(x, y, cursor,
            () => { resizeRef.current = { id: s.id, handle: h }; },
            (e) => {
              const r = resizeRef.current;
              if (!r || r.id !== s.id || r.handle !== h) return;
              const m = toM(e);
              const cur = boundsOf(s);
              const nb = resizeBounds({ x: s.x, y: s.y, w: cur.w, d: cur.d }, h, m.x, m.y, lotW, lotD);
              const swap = (s.rot / 90) % 2 === 1;
              patchStructure(s.id, { x: nb.x, y: nb.y, w: swap ? nb.d : nb.w, d: swap ? nb.w : nb.d });
            }, h))}
      </g>
    );
  }

  /**
   * The hatch on an existing structure: real 45° lines, clipped to the shape.
   *
   * An SVG `<pattern>` is the obvious way to do this and it is the wrong one
   * here. Chrome's PDF printer rasterises a patterned region, and one hatched
   * structure was enough to turn the whole drawing into a ~90 dpi bitmap on
   * the sheet that gets lodged — on a plan whose entire claim is that it is
   * drawn to a stated scale. Lines stay lines, at any zoom and on any printer.
   *
   * `id` scopes the clip: the screen canvas and the printed sheet are two
   * trees in one document, and an id may only mean one thing across both.
   */
  function hatchOver(id: string, shape: React.ReactElement, box: {
    minX: number; minY: number; maxX: number; maxY: number;
  }) {
    // 2.1 mm apart on paper: open enough that the figures inside a hatched
    // structure still read, close enough to survive a photocopier.
    const gap = mm(2.1);
    const w = box.maxX - box.minX, h = box.maxY - box.minY;
    if (!(gap > 0) || !(w > 0) || !(h > 0)) return null;
    // Sweep far enough left that the first line still crosses the shape.
    const n = Math.min(Math.ceil((w + h) / gap) + 1, 240);
    return (
      <g key="hatch">
        <clipPath id={id}>{shape}</clipPath>
        <g clipPath={`url(#${id})`} stroke={HATCH_INK} strokeOpacity={0.42}
          strokeWidth={mm(0.22)}>
          {Array.from({ length: n }, (_, i) => {
            const x = box.minX - h + i * gap;
            return <line key={i} x1={x} y1={box.minY} x2={x + h} y2={box.maxY} />;
          })}
        </g>
      </g>
    );
  }

  function structureNode(s: Structure, interactive: boolean, hatch: string, onScreen = false) {
    const isSel = interactive && s.id === selected;
    const dark = s.kind === "retaining";
    const here = structureState(s) === "existing";
    const clash = onScreen && overlaps.has(s.id);
    const b = boundsOf(s);
    const thin = b.d < mm(9);
    const cx = s.x + b.w / 2;
    const labelY = thin ? s.y - mm(4.4) : s.y + b.d / 2 - mm(0.8);
    const dimsY = thin ? s.y - mm(1.4) : s.y + b.d / 2 + mm(2.8);
    // Proposed is exactly the weight and colour this tool has always drawn —
    // every design already saved is proposed, and none of them changes.
    // Existing steps back: washed out, thinner, dashed, hatched.
    const stroke = clash ? FLAG : isSel ? BRASS : here ? "#59695E" : dark ? "#12332A" : SEAL;
    const strokeW = clash ? mm(0.6)
      : here ? (isSel ? mm(0.4) : mm(0.22)) : (isSel ? mm(0.55) : mm(0.35));
    const dash = here ? `${mm(1.4)} ${mm(0.9)}` : undefined;
    const fill = here && dark ? EXIST_DARK_FILL : (FILL[s.kind] || "#E7F0EA");
    const fillOp = here && !dark ? EXIST_WASH : 1;
    const marg = mm(1.1);
    /** The footprint, drawn once per layer: the wash, the hatch over it for an
     *  existing structure, then the outline on top of both. */
    const layer = (key: string, p: Paint) =>
      s.shape === "rect" ? (
        <rect key={key} x={s.x} y={s.y} width={b.w} height={b.d}
          rx={s.kind === "pool" ? Math.min(b.w, b.d) * 0.18 : 0}
          stroke="none" {...p} />
      ) : (
        <polygon key={key} points={footprint(s).map((q) => `${q.x},${q.y}`).join(" ")}
          stroke="none" strokeLinejoin="round" {...p} />
      );
    return (
      <g key={s.id}
        style={interactive ? { cursor: "move" } : undefined}
        onPointerDown={interactive ? (e) => {
          e.stopPropagation();
          setSelected(s.id);
          canvasRef.current?.focus({ preventScroll: true });
          const p = toM(e);
          dragRef.current = { id: s.id, dx: p.x - s.x, dy: p.y - s.y };
          (e.currentTarget as Element).setPointerCapture(e.pointerId);
        } : undefined}
        onPointerMove={interactive ? (e) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== s.id) return;
          const p = toM(e);
          const bb = boundsOf(s);
          const raw = clampToLot(snap(p.x - drag.dx, 0.05), snap(p.y - drag.dy, 0.05), bb.w, bb.d, lotW, lotD);
          // Magnetic alignment with the other structures — hold Alt for a
          // free drag. Arrow-key nudges never pass through here.
          if (e.altKey || design.structures.length < 2) {
            patchStructure(s.id, raw);
            setGuides([]);
            return;
          }
          const others = design.structures
            .filter((o) => o.id !== s.id)
            .map((o) => { const ob = boundsOf(o); return { x: o.x, y: o.y, w: ob.w, d: ob.d }; });
          const snapped = alignSnap(raw.x, raw.y, bb.w, bb.d, others);
          const fin = clampToLot(snapped.x, snapped.y, bb.w, bb.d, lotW, lotD);
          patchStructure(s.id, fin);
          setGuides(fin.x === snapped.x && fin.y === snapped.y ? snapped.guides : []);
        } : undefined}
        onPointerUp={interactive ? () => { dragRef.current = null; setGuides([]); } : undefined}
        onPointerCancel={interactive ? () => { dragRef.current = null; setGuides([]); } : undefined}
      >
        {layer("wash", { fill, fillOpacity: fillOp })}
        {here && hatchOver(`${hatch}-${s.id}`, layer("clip", { fill: "#000" }), polyBounds(footprint(s)))}
        {layer("line", {
          fill: "none", stroke, strokeWidth: strokeW, strokeDasharray: dash,
        })}
        {/* Patio roof, posts and drainage, over the footprint and under the
            name. Studio only — the certifier's portal never turns it on. */}
        {patioTools && s.kind === "patio" && patioMarks(s)}
        {isSel && (
          <rect x={s.x - marg} y={s.y - marg} width={b.w + marg * 2} height={b.d + marg * 2}
            fill="none" stroke={BRASS} strokeWidth={mm(0.25)}
            strokeDasharray={`${mm(1.2)} ${mm(0.9)}`} pointerEvents="none" />
        )}
        {/* The state is said on the drawing, beside the name. An assessor
            reading this sheet must never have to guess which buildings the
            application is actually for. */}
        <text x={cx} y={labelY} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(2.9)} fill={INK} style={here ? haloWide : halo}>
          {s.label}
          <tspan fontWeight={500} fontSize={mm(2.4)} fillOpacity={0.75}>
            {` (${structureState(s)})`}
          </tspan>
        </text>
        <text x={cx} y={dimsY} textAnchor="middle" fontFamily={FONT_NUM}
          fontSize={mm(2.5)} fill={INK} fillOpacity={0.75} style={here ? haloWide : halo}>
          {s.shape === "poly" ? `${fmtM(structureArea(s))} m²` : `${fmtM(s.w)} × ${fmtM(s.d)} m`}
        </text>
        {isSel && !draw && handleNodes(s)}
      </g>
    );
  }

  // ---- the parametric patio (studio only) ---------------------------------

  const SIDE_PAIRS = [[0, 1], [1, 2], [2, 3], [3, 0]];
  const ROOF_INK = "#5B6B61";
  const POST_INK = "#12332A";
  const WELL_INK = "#3E7C8C";
  const SCREEN_LABELS = ["Top", "Right", "Bottom", "Left"];
  const SCREEN_ARROWS = ["↑", "→", "↓", "←"];

  /** The posts, roof geometry, downpipes and soakwells drawn on the plan for
   *  a patio — the studio's parametric patio made visible. Screen and sheet
   *  both, so the printed plan carries every figure the client set. */
  function patioMarks(s: Structure) {
    const fp = footprint(s);
    if (fp.length !== 4) return null;
    const p = sanitisePatio(s.patio);
    const cx = (fp[0].x + fp[1].x + fp[2].x + fp[3].x) / 4;
    const cy = (fp[0].y + fp[1].y + fp[2].y + fp[3].y) / 4;
    const sideMid = (k: number) => {
      const [a, b] = SIDE_PAIRS[k];
      return { x: (fp[a].x + fp[b].x) / 2, y: (fp[a].y + fp[b].y) / 2 };
    };
    const sideLen = (k: number) => {
      const [a, b] = SIDE_PAIRS[k];
      return Math.hypot(fp[b].x - fp[a].x, fp[b].y - fp[a].y);
    };
    const unit = (dx: number, dy: number) => {
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };

    const gutter = patioGutter(s);
    const posts = patioColumns(s);
    const bb = polyBounds(fp);

    // Roof geometry: a gable draws its ridge; anything else draws a fall arrow
    // pointing the way the water runs, toward its low (gutter) side.
    let roofGeom: React.ReactNode = null;
    if (p.roof === "gable") {
      const e1 = sideMid((p.fall + 1) % 4), e2 = sideMid((p.fall + 3) % 4);
      roofGeom = (
        <line x1={e1.x} y1={e1.y} x2={e2.x} y2={e2.y} stroke={ROOF_INK}
          strokeWidth={mm(0.45)} strokeDasharray={`${mm(2)} ${mm(1.1)}`} />
      );
    } else {
      const to = sideMid(p.fall);
      const hx = cx + (to.x - cx) * 0.72, hy = cy + (to.y - cy) * 0.72;
      const u = unit(to.x - cx, to.y - cy);
      const perp = { x: -u.y, y: u.x };
      const hw = mm(1.5), hl = mm(2.3);
      const head = `${hx},${hy} ` +
        `${hx - u.x * hl + perp.x * hw},${hy - u.y * hl + perp.y * hw} ` +
        `${hx - u.x * hl - perp.x * hw},${hy - u.y * hl - perp.y * hw}`;
      roofGeom = (
        <>
          <line x1={cx - (to.x - cx) * 0.55} y1={cy - (to.y - cy) * 0.55} x2={hx} y2={hy}
            stroke={ROOF_INK} strokeWidth={mm(0.4)} />
          <polygon points={head} fill={ROOF_INK} />
        </>
      );
    }

    // Downpipes, spread along the gutter side(s) in proportion to their length.
    const dpMarks: Pt[] = [];
    if (gutter.sides.length && p.downpipes > 0) {
      const total = gutter.length || 1;
      let left = p.downpipes;
      gutter.sides.forEach((k, idx) => {
        const n = idx === gutter.sides.length - 1
          ? left : Math.min(left, Math.round((p.downpipes * sideLen(k)) / total));
        left -= n;
        const [ai, bi] = SIDE_PAIRS[k];
        const a = fp[ai], b = fp[bi];
        for (let i = 0; i < n; i++) {
          const t = (i + 0.5) / Math.max(n, 1);
          dpMarks.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      });
    }

    // Soakwell(s), to scale, set out just beyond the gutter side. Indicative:
    // the sheet shows the size the sizing asked for, in about the right place.
    const size = p.soak ? findSize(p.soak.key) : null;
    let soakNode: React.ReactNode = null;
    if (size && p.soak) {
      const rad = size.dia / 2000;
      const k = gutter.sides[0] ?? p.fall;
      const m = sideMid(k);
      const out = unit(m.x - cx, m.y - cy);
      const tan = { x: -out.y, y: out.x };
      const step = rad * 2 + 0.3;
      const start = { x: m.x + out.x * (rad + 0.6), y: m.y + out.y * (rad + 0.6) };
      const wells = Array.from({ length: p.soak.count }, (_, i) => ({
        x: start.x + tan.x * (i - (p.soak!.count - 1) / 2) * step,
        y: start.y + tan.y * (i - (p.soak!.count - 1) / 2) * step,
      }));
      soakNode = (
        <g>
          {wells.map((w, i) => (
            <circle key={i} cx={w.x} cy={w.y} r={rad} fill="#D3E4EA" fillOpacity={0.55}
              stroke={WELL_INK} strokeWidth={mm(0.35)} strokeDasharray={`${mm(1.4)} ${mm(0.8)}`} />
          ))}
          <text x={start.x} y={start.y + rad + mm(3)} textAnchor="middle"
            fontFamily={FONT_NUM} fontSize={mm(2.3)} fill={INK} fillOpacity={0.8} style={halo}>
            {p.soak.count > 1 ? `${p.soak.count} × ` : ""}{sizeLabel(size)}
          </text>
        </g>
      );
    }

    const roofWord = p.roof === "skillion" ? "Skillion" : p.roof === "gable" ? "Gable" : "Flat";
    const postSize = Math.max(mm(0.95), 0.08);
    return (
      <g pointerEvents="none">
        {roofGeom}
        {soakNode}
        {dpMarks.map((q, i) => (
          <g key={i}>
            <circle cx={q.x} cy={q.y} r={mm(1.1)} fill="#fff" stroke={BRASS} strokeWidth={mm(0.3)} />
            <circle cx={q.x} cy={q.y} r={mm(0.45)} fill={BRASS} />
          </g>
        ))}
        {posts.map((q, i) => (
          <rect key={i} x={q.x - postSize} y={q.y - postSize}
            width={postSize * 2} height={postSize * 2} fill={POST_INK} />
        ))}
        <text x={cx} y={bb.minY - mm(1.6)} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(2.3)} fill={ROOF_INK} style={halo}>
          {roofWord} · {fmtM(p.pitch)}° · {fmtM(p.colHeight)} m
        </text>
      </g>
    );
  }

  /** The patio panel: roof, posts and drainage, shown only in the studio and
   *  only for a patio. The tool measures and offers sizing help; whether any
   *  of it satisfies a council is never decided here. */
  function patioControls(s: Structure) {
    const p = sanitisePatio(s.patio);
    const q = ((((s.rot ?? 0) / 90) % 4) + 4) % 4;
    const screenToLocal = (sd: number) => (sd - q + 4) % 4;
    const gutter = patioGutter(s);
    const need = downpipesNeeded(gutter.length);
    const sizing = sizeNew({ roofM2: structureArea(s) });
    const best = sizing.ok ? sizing.best : null;

    /** A four-way pad that maps a screen direction to the patio's own side,
     *  so "this way on the plan" always means what it looks like whichever way
     *  the patio is turned. */
    const sidePad = (
      active: Set<number>, onPick: (local: number) => void,
      dim?: (local: number) => boolean,
    ) => {
      const cell = (sd: number) => {
        const local = screenToLocal(sd);
        const on = active.has(local);
        const off = dim ? dim(local) : false;
        return (
          <button type="button" aria-pressed={on} disabled={off}
            onClick={() => onPick(local)}
            className={`${NUDGE} ${on ? "!border-brass !bg-[#F6EEDA] !text-brass-deep" : ""} disabled:opacity-30`}>
            {SCREEN_ARROWS[sd]}
          </button>
        );
      };
      return (
        <div className="mx-auto grid w-[132px] grid-cols-3 gap-1">
          <span />{cell(0)}<span />
          {cell(3)}
          <span className="flex items-center justify-center text-[9px] uppercase tracking-wide text-ink/35">plan</span>
          {cell(1)}
          <span />{cell(2)}<span />
        </div>
      );
    };

    const setCols = (local: number, n: number) => {
      const cols = [...p.cols];
      cols[local] = Math.min(Math.max(Math.round(n) || 0, 0), PATIO_MAX_COLS);
      patchPatio(s.id, { cols });
    };
    const stepDown = () => patchPatio(s.id, { downpipes: Math.max(0, p.downpipes - 1) });
    const stepUp = () => patchPatio(s.id, { downpipes: Math.min(20, p.downpipes + 1) });

    return (
      <div className="space-y-3 rounded-md border border-seal/25 bg-wash/60 p-3">
        <p className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-seal">
          Patio roof &amp; drainage
        </p>

        {/* Freestanding, or attached to the dwelling */}
        <div>
          <span className="label">Standing</span>
          <div className="grid grid-cols-2 gap-2">
            {(["free", "attached"] as const).map((mt) => (
              <button key={mt} type="button" aria-pressed={p.mount === mt}
                onClick={() => patchPatio(s.id, { mount: mt })}
                className={`min-h-[40px] rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.08em] transition ${
                  p.mount === mt ? "border-seal bg-white text-seal" : "border-rule bg-white text-ink/60 hover:bg-white"
                }`}>
                {mt === "free" ? "Freestanding" : "Attached"}
              </button>
            ))}
          </div>
          {p.mount === "attached" && (
            <div className="mt-2">
              <span className="label">Attaches to the dwelling on the…</span>
              {sidePad(new Set([p.attach]), (local) => patchPatio(s.id, { attach: local }))}
            </div>
          )}
        </div>

        {/* Roof shape */}
        <div>
          <span className="label">Roof</span>
          <div className="grid grid-cols-3 gap-1.5">
            {(["flat", "skillion", "gable"] as const).map((rf) => (
              <button key={rf} type="button" aria-pressed={p.roof === rf}
                onClick={() => patchPatio(s.id, { roof: rf })}
                className={`min-h-[40px] rounded-md border px-1 py-2 font-display text-[11.5px] font-semibold capitalize transition ${
                  p.roof === rf ? "border-seal bg-white text-seal" : "border-rule bg-white text-ink/60 hover:bg-white"
                }`}>
                {rf}
              </button>
            ))}
          </div>
        </div>

        {/* Pitch */}
        <div>
          <div className="flex items-baseline justify-between">
            <span className="label !mb-0">Roof pitch</span>
            <span className="font-mono text-[11.5px] text-ink/55">{fmtM(p.pitch)}°</span>
          </div>
          <input type="range" className="mt-1.5 h-10 w-full accent-[#1E5B3C]"
            min={0} max={PATIO_MAX_PITCH} step={0.5} value={p.pitch}
            aria-label="Roof pitch in degrees"
            onChange={(e) => patchPatio(s.id, { pitch: Number(e.target.value) })} />
        </div>

        {/* Fall / ridge direction */}
        <div>
          <span className="label">
            {p.roof === "gable" ? "Ridge across the plan" : "Roof falls toward"}
          </span>
          {sidePad(
            new Set(p.roof === "gable" ? [p.fall, (p.fall + 2) % 4] : [p.fall]),
            (local) => patchPatio(s.id, { fall: local }),
          )}
        </div>

        {/* Posts per side + height */}
        <div>
          <span className="label">Posts per side</span>
          <div className="grid grid-cols-4 gap-1.5">
            {[0, 1, 2, 3].map((sd) => {
              const local = screenToLocal(sd);
              const wall = p.mount === "attached" && p.attach === local;
              return (
                <div key={sd}>
                  <span className="block text-center text-[10px] uppercase tracking-wide text-ink/45">
                    {SCREEN_LABELS[sd]}
                  </span>
                  <input type="number" inputMode="numeric" min={0} max={PATIO_MAX_COLS}
                    className="field !px-1 text-center" disabled={wall}
                    value={wall ? 0 : p.cols[local]}
                    onChange={(e) => setCols(local, Number(e.target.value))} />
                </div>
              );
            })}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink/50">
            Corners count as a post, and are shared between two sides. The side
            against the dwelling carries a wall, not posts.
          </p>
        </div>
        <MetresField label="Post / eave height (m)" value={p.colHeight}
          onCommit={(n) => patchPatio(s.id, { colHeight: n })} />

        {/* Downpipes */}
        <div>
          <span className="label">Downpipes</span>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="One fewer downpipe" onClick={stepDown}
              className={`${NUDGE} w-10 shrink-0`}>−</button>
            <span className="min-w-[2ch] flex-1 text-center font-mono text-[15px] text-ink">{p.downpipes}</span>
            <button type="button" aria-label="One more downpipe" onClick={stepUp}
              className={`${NUDGE} w-10 shrink-0`}>+</button>
            <button type="button" onClick={() => patchPatio(s.id, { downpipes: need })}
              className="btn-ghost min-h-[40px] shrink-0 !px-3 !py-2">
              Set {need}
            </button>
          </div>
          <p className={`mt-1.5 text-[12px] leading-snug ${p.downpipes < need ? "text-brass-deep" : "text-ink/55"}`}>
            {gutter.length > 0
              ? `Gutter runs about ${fmtM(gutter.length)} m — that's around ${need} downpipe${need === 1 ? "" : "s"} at one per ${GUTTER_M_PER_DOWNPIPE} m. A rule of thumb, not a ruling.`
              : "No gutter on this roof yet — set the fall direction above."}
          </p>
        </div>

        {/* Soakwells */}
        <div>
          <span className="label">Soakwells</span>
          {best ? (
            <>
              <p className="text-[12.5px] leading-snug text-ink/70">
                For {fmtM(structureArea(s))} m² of roof, about{" "}
                <span className="font-mono">{fmtM(sizing.ok ? sizing.required : 0)} m³</span> of
                storage — <span className="font-medium text-ink">{best.label}</span>{" "}
                (<span className="font-mono">{fmtM(best.total)} m³</span>).
              </p>
              {p.soak ? (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <select className="field flex-1"
                      value={p.soak.key}
                      onChange={(e) => patchPatio(s.id, {
                        soak: { key: e.target.value, count: p.soak?.count ?? 1 },
                      })}>
                      {SOAKWELLS.map((w) => (
                        <option key={sizeKey(w)} value={sizeKey(w)}>
                          {sizeLabel(w)} — {fmtM(w.capacity)} m³
                        </option>
                      ))}
                    </select>
                    <input type="number" inputMode="numeric" min={1} max={10}
                      className="field w-16 text-center" value={p.soak.count}
                      aria-label="How many soakwells"
                      onChange={(e) => patchPatio(s.id, {
                        soak: {
                          key: p.soak?.key ?? sizeKey(best.size),
                          count: Math.min(Math.max(Math.round(Number(e.target.value)) || 1, 1), 10),
                        },
                      })} />
                  </div>
                  <button type="button" onClick={() => patchPatio(s.id, { soak: null })}
                    className="btn-ghost min-h-[40px] w-full !py-2">
                    Take the soakwell off the plan
                  </button>
                </div>
              ) : (
                <button type="button"
                  onClick={() => patchPatio(s.id, {
                    soak: { key: sizeKey(best.size), count: best.count },
                  })}
                  className="btn-ghost mt-2 min-h-[40px] w-full !py-2">
                  Put this soakwell on the plan
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] leading-snug text-ink/55">
              Give the patio a size and a roof and we&apos;ll size the soakwells for it.
            </p>
          )}
          <p className="mt-1.5 text-[11.5px] leading-snug text-ink/45">{SOAKWELL_CAVEAT}</p>
        </div>
      </div>
    );
  }

  /** One patio elevation — the view of the `span` face ("w" width, "d" depth),
   *  drawn to a scale of its own chosen to fit. Posts to their heights, the
   *  roof as a rake where the slope shows and a flat eave with a dashed
   *  ridge/high line where it runs into the page, the dwelling wall where the
   *  patio attaches, and the figures that carry it all. Studio only. */
  function elevationView(s: Structure, span: "w" | "d", title: string) {
    const e = patioElevationProfile(s, span);
    const W = Math.max(e.width, 0.5);
    const dwellTop = e.attachHere ? Math.max(e.high, e.eave) + 0.9 : 0;
    const maxH = Math.max(e.high, e.ridge ?? 0, e.eave, dwellTop, 0.5);
    // Pick the largest standard scale that still fits the drawing in the box.
    let dn = 500;
    for (const c of [20, 50, 100, 200, 500]) {
      if ((W * 1000) / c <= 150 && (maxH * 1000) / c <= 70) { dn = c; break; }
    }
    const M = 0.7;
    // Room below the ground line for the width dimension and its label, and a
    // little above for the ridge; the viewBox top sits at -M.
    const vbW = W + M * 2.4, vbH = maxH + M * 3.4;
    const wmm = (vbW * 1000) / dn, hmm = (vbH * 1000) / dn;
    const gy = maxH;
    const Y = (h: number) => gy - h;
    const em = (v: number) => (v * dn) / 1000;  // paper mm → metres at this scale

    const postHeightAt = (x: number) => {
      if (!e.slopeInPlane) return e.eave;
      const t = W > 0 ? x / W : 0;
      if (e.roof === "gable") return e.eave + ((e.ridge ?? e.high) - e.eave) * (1 - Math.abs(2 * t - 1));
      const f = e.lowAtStart ? t : 1 - t;
      return e.eave + (e.high - e.eave) * f;
    };
    const roofPts: [number, number][] = e.slopeInPlane
      ? (e.roof === "gable"
          ? [[0, e.eave], [W / 2, e.ridge ?? e.high], [W, e.eave]]
          : e.lowAtStart ? [[0, e.eave], [W, e.high]] : [[0, e.high], [W, e.eave]])
      : [[0, e.eave], [W, e.eave]];
    const topRef = e.ridge ?? e.high;   // the high/ridge line, for the into-page view
    const wallX = e.attachAtStart ? -0.55 : W;

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "2.6mm", fontWeight: 600, color: INK, fontFamily: FONT_LAB }}>
          {title}
          <span style={{ marginLeft: "2mm", opacity: 0.5, fontSize: "2.2mm", fontFamily: FONT_NUM }}>
            1:{dn}
          </span>
        </div>
        <svg viewBox={`${-M} ${-M} ${vbW} ${vbH}`} aria-hidden="true"
          style={{ width: `${wmm.toFixed(1)}mm`, height: `${hmm.toFixed(1)}mm`, display: "block", marginTop: "1mm" }}>
          {/* the dwelling the patio attaches to */}
          {e.attachHere && (
            <g>
              <rect x={wallX} y={Y(dwellTop)} width={0.55} height={dwellTop}
                fill="#ECE8DD" stroke={INK} strokeWidth={em(0.3)} strokeOpacity={0.8} />
              <text x={wallX + 0.275} y={Y(dwellTop) + em(3)} textAnchor="middle"
                fontFamily={FONT_LAB} fontSize={em(2)} fill={INK} fillOpacity={0.6}>Dwelling</text>
            </g>
          )}
          {/* ground */}
          <line x1={-M * 0.6} y1={gy} x2={W + M * 0.6} y2={gy} stroke={INK} strokeWidth={em(0.45)} />
          {/* the high/ridge line, when it sits behind the view rather than in it */}
          {!e.slopeInPlane && topRef > e.eave + 0.001 && (
            <line x1={0} y1={Y(topRef)} x2={W} y2={Y(topRef)} stroke={ROOF_INK}
              strokeWidth={em(0.3)} strokeDasharray={`${em(1.6)} ${em(1)}`} />
          )}
          {/* posts */}
          {e.postXs.map((x, i) => (
            <line key={i} x1={x} y1={gy} x2={x} y2={Y(postHeightAt(x))}
              stroke={SEAL} strokeWidth={em(0.5)} strokeLinecap="round" />
          ))}
          {/* roof */}
          <polyline points={roofPts.map(([x, h]) => `${x},${Y(h)}`).join(" ")}
            fill="none" stroke={SEAL} strokeWidth={em(0.6)} strokeLinejoin="round" strokeLinecap="round" />
          {/* width dimension, under the ground line */}
          <g fontFamily={FONT_NUM} fontSize={em(2.4)} fill={INK} fillOpacity={0.75}>
            <line x1={0} y1={gy + M * 0.75} x2={W} y2={gy + M * 0.75} stroke={INK} strokeOpacity={0.5} strokeWidth={em(0.2)} />
            {[0, W].map((x) => (
              <line key={x} x1={x} y1={gy + M * 0.55} x2={x} y2={gy + M * 0.95} stroke={INK} strokeOpacity={0.5} strokeWidth={em(0.2)} />
            ))}
            <text x={W / 2} y={gy + M * 1.45} textAnchor="middle">{fmtM(e.width)} m</text>
          </g>
          {/* eave and high/ridge heights, either side */}
          <g fontFamily={FONT_NUM} fontSize={em(2.3)} fill={INK} fillOpacity={0.7}>
            <line x1={-M * 0.5} y1={gy} x2={-M * 0.5} y2={Y(e.eave)} stroke={INK} strokeOpacity={0.45} strokeWidth={em(0.2)} />
            <text transform={`translate(${-M * 0.7} ${Y(e.eave / 2)}) rotate(-90)`} textAnchor="middle">{fmtM(e.eave)} m</text>
            {topRef > e.eave + 0.001 && (
              <>
                <line x1={W + M * 0.5} y1={gy} x2={W + M * 0.5} y2={Y(topRef)} stroke={INK} strokeOpacity={0.45} strokeWidth={em(0.2)} />
                <text transform={`translate(${W + M * 0.72} ${Y(topRef / 2)}) rotate(-90)`} textAnchor="middle">{fmtM(topRef)} m</text>
              </>
            )}
          </g>
        </svg>
      </div>
    );
  }

  /** A patio's own A4 sheet: its two elevations, front and side, with a header
   *  that names it and its roof. Printed after the site plan. Studio only, and
   *  — like every studio sheet — carrying no CFBA name. */
  function patioElevationSheet(s: Structure) {
    const p = sanitisePatio(s.patio);
    const heights = patioRoofHeights(s);
    const roofWord = p.roof === "skillion" ? "Skillion" : p.roof === "gable" ? "Gable" : "Flat";
    const summary =
      `${roofWord} roof at ${fmtM(p.pitch)}°, ` +
      `${fmtM(heights.eave)} m to the eave` +
      (heights.ridge !== null ? `, ${fmtM(heights.ridge)} m to the ridge`
        : heights.high > heights.eave ? `, ${fmtM(heights.high)} m at the high side` : "") +
      `. Posts ${fmtM(p.colHeight)} m` +
      (p.mount === "attached" ? ", attached to the dwelling." : ", freestanding.");
    return (
      <div key={s.id} className="cfba-sheet">
        <div style={{ border: "0.5mm solid #2B3A31", color: INK, fontFamily: FONT_LAB }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "4mm", padding: "1.2mm 3mm", borderBottom: "0.3mm solid #2B3A31" }}>
            <span style={{ fontSize: "2.8mm", fontWeight: 700, letterSpacing: "0.5mm", textTransform: "uppercase", color: SEAL }}>Patio elevations</span>
            <strong style={{ fontSize: "3.2mm", fontWeight: 600 }}>{s.label || "Patio"}</strong>
          </div>
          <div style={{ padding: "1.2mm 3mm", fontSize: "2.6mm", fontFamily: FONT_NUM }}>{summary}</div>
        </div>
        <div style={{ display: "flex", gap: "6mm", marginTop: "4mm", alignItems: "flex-start" }}>
          {elevationView(s, "w", "Front elevation")}
          {elevationView(s, "d", "Side elevation")}
        </div>
        <p style={{ marginTop: "3mm", fontSize: "2.15mm", lineHeight: 1.3, color: INK, opacity: 0.7, fontFamily: FONT_LAB }}>
          Indicative elevations drawn from the dimensions entered — the tool
          sets them out and dimensions them; it does not detail the build.
          Bracing, footings, tie-downs and the roof structure itself are the
          engineer&apos;s and the builder&apos;s.
        </p>
      </div>
    );
  }

  /** The legend: one row per structure type actually on the plan, then — under
   *  a hairline — the two states, drawn exactly as the plan draws them. The
   *  colours say what a thing is; the weight and the hatch say whether it is
   *  already there, and that half of the legend is the half that still works
   *  when the sheet comes out of a black-and-white printer. */
  function legendBox(hatch: string) {
    const present = KINDS.filter((k) => design.structures.some((s) => s.kind === k.kind));
    if (present.length === 0) return null;
    const states = (["proposed", "existing"] as StructureState[])
      .filter((st) => design.structures.some((s) => structureState(s) === st));
    const row = mm(4.2), pad = mm(1.8), sw = mm(3), swH = mm(2.6);
    const boxW = mm(28);
    const gap = mm(2.4);
    const boxH = pad * 2 + row * (present.length + states.length) + gap - mm(1);
    const bx = Math.max(mm(1), lotW - boxW - mm(1.5));
    const by = mm(1.5);
    const ruleY = by + pad + row * present.length + gap / 2 - mm(0.6);
    return (
      <g pointerEvents="none">
        <rect x={bx} y={by} width={boxW} height={boxH} fill="#FFFFFF" fillOpacity={0.92}
          stroke={INK} strokeOpacity={0.35} strokeWidth={mm(0.2)} />
        {present.map((k, i) => {
          const y = by + pad + row * i;
          return (
            <g key={k.kind}>
              <rect x={bx + pad} y={y} width={sw} height={swH} rx={mm(0.3)}
                fill={k.fill} stroke={k.dark ? "none" : SEAL} strokeOpacity={0.45} strokeWidth={mm(0.15)} />
              <text x={bx + pad + sw + mm(1.5)} y={y + mm(2.2)} fontFamily={FONT_LAB}
                fontSize={mm(2.3)} fill={INK} fillOpacity={0.8}>
                {k.name}
              </text>
            </g>
          );
        })}
        {states.length > 0 && (
          <line x1={bx + pad} y1={ruleY} x2={bx + boxW - pad} y2={ruleY}
            stroke={INK} strokeOpacity={0.25} strokeWidth={mm(0.15)} />
        )}
        {states.map((st, i) => {
          const y = by + pad + row * (present.length + i) + gap;
          const here = st === "existing";
          return (
            <g key={st}>
              <rect x={bx + pad} y={y} width={sw} height={swH} rx={mm(0.3)}
                fill="#E8ECE6" fillOpacity={here ? EXIST_WASH : 1} />
              {here && hatchOver(
                `${hatch}-key`,
                <rect x={bx + pad} y={y} width={sw} height={swH} rx={mm(0.3)} />,
                { minX: bx + pad, minY: y, maxX: bx + pad + sw, maxY: y + swH },
              )}
              <rect x={bx + pad} y={y} width={sw} height={swH} rx={mm(0.3)} fill="none"
                stroke={here ? "#59695E" : SEAL} strokeWidth={here ? mm(0.22) : mm(0.35)}
                strokeDasharray={here ? `${mm(1.4)} ${mm(0.9)}` : undefined} />
              <text x={bx + pad + sw + mm(1.5)} y={y + mm(2.2)} fontFamily={FONT_LAB}
                fontWeight={here ? 400 : 600} fontSize={mm(2.3)} fill={INK}
                fillOpacity={here ? 0.7 : 0.9}>
                {here ? "Existing" : "Proposed"}
              </text>
            </g>
          );
        })}
      </g>
    );
  }

  function northAndScale() {
    const barM = scaleBarMetres(denom);
    const nx = lotW - mm(5), ny = -mm(7);
    return (
      <g>
        {/* scale bar, top left */}
        <rect x={0} y={-mm(8.2)} width={barM / 2} height={mm(1.4)} fill={INK} />
        <rect x={0} y={-mm(8.2)} width={barM} height={mm(1.4)} fill="none" stroke={INK} strokeWidth={mm(0.2)} />
        <g fontFamily={FONT_NUM} fontSize={mm(2.3)} fill={INK} fillOpacity={0.75}>
          <text x={0} y={-mm(9.3)}>0</text>
          <text x={barM} y={-mm(9.3)} textAnchor="end">{barM} m</text>
          <text x={barM + mm(3)} y={-mm(6.9)} fontFamily={FONT_LAB} fontWeight={600}>
            {fits ? `Scale 1:${denom} (A4)` : "Not to a standard scale — use the bar"}
          </text>
        </g>
        {/* north arrow, top right, rotatable in 45° steps */}
        <g transform={`translate(${nx} ${ny}) rotate(${north})`}>
          <circle r={mm(4)} fill="#fff" stroke={INK} strokeOpacity={0.4} strokeWidth={mm(0.25)} />
          <path d={`M 0 ${-mm(2.8)} L ${mm(1.6)} ${mm(2.4)} L 0 ${mm(1)} L ${-mm(1.6)} ${mm(2.4)} Z`} fill={SEAL} />
          <text y={-mm(5)} textAnchor="middle" fontFamily={FONT_LAB} fontWeight={700}
            fontSize={mm(2.6)} fill={INK}>N</text>
        </g>
      </g>
    );
  }

  /** `seeThrough` is the screen view with the aerial behind it: the paper
   *  whites drop away so the photo reads, and every line and figure stays
   *  exactly where it was. The printed sheet is never drawn this way. */
  function plan(interactive: boolean, seeThrough = false) {
    const hatch = interactive ? "cfba-hatch-screen" : "cfba-hatch-sheet";
    return (
      <>
        {/* street along the bottom edge */}
        <rect x={-mL} y={lotD} width={vbW} height={mB} fill="#E9ECE6"
          fillOpacity={seeThrough ? 0.35 : 1} />
        <text x={lotW / 2} y={lotD + mm(11.8)} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(3.2)} letterSpacing={mm(0.5)} fill={INK} fillOpacity={0.55}>
          {(street.trim() || "Street").toUpperCase()}
        </text>
        {/* the lot: the real parcel where we have one, a rectangle otherwise */}
        {isPoly ? (
          <>
            <polygon points={lotOutline.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="#FFFFFF" fillOpacity={seeThrough ? 0 : 1}
              stroke={INK} strokeWidth={interactive && editing ? mm(0.75) : mm(0.5)}
              strokeLinejoin="round" />
            {interactive && !draw && !trace && (editing ? lotEdgeTargets() : edgeTargets())}
            {boundaryTexts()}
          </>
        ) : (
          <>
            <rect x={0} y={0} width={lotW} height={lotD} fill="#FFFFFF"
              fillOpacity={seeThrough ? 0 : 1} stroke={INK}
              strokeWidth={interactive && editing ? mm(0.75) : mm(0.5)} />
            {interactive && editing && !draw && !trace && lotEdgeTargets()}
            {dimTexts()}
          </>
        )}
        {design.structures.map((s) =>
          structureNode(s, interactive && !draw && !trace && !editing, hatch, interactive))}
        {/* Every dimension goes over the structures, which is where a
            dimension belongs. A setback figure that runs across a hatched
            building used to end up under the hatching, and a figure nobody
            can read off the sheet is worse than one that crosses a line. */}
        {sel && setbackLines(sel)}
        {/* Distances between the structures, over the top of them so the
            figures always read. On screen: the selected structure's nearest
            neighbours plus every pinned one. On the sheet: the pins, plus each
            proposed structure's distance to the existing ones nearest it. */}
        {gapLines(interactive ? screenGaps : printGaps,
          interactive && !draw && !trace && !editing)}
        {/* alignment guides while a drag is snapped */}
        {interactive && guides.map((g, i) => (
          <line key={i}
            x1={g.axis === "x" ? g.at : g.from - mm(2)}
            y1={g.axis === "x" ? g.from - mm(2) : g.at}
            x2={g.axis === "x" ? g.at : g.to + mm(2)}
            y2={g.axis === "x" ? g.to + mm(2) : g.at}
            stroke="#2E7D5B" strokeWidth={mm(0.3)}
            strokeDasharray={`${mm(1.2)} ${mm(1)}`} pointerEvents="none" />
        ))}
        {/* the boundary's handles, and what it measures while it moves */}
        {interactive && editing && !draw && !trace && lotHandleNodes()}
        {interactive && lotDragReadout()}
        {/* the lot outline being traced over the photo */}
        {interactive && trace && (
          <g pointerEvents="none">
            {trace.pts.length > 1 && (
              <polyline points={trace.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={BRASS} strokeWidth={mm(0.55)}
                strokeDasharray={`${mm(1.8)} ${mm(1.1)}`} />
            )}
            {trace.pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? mm(1.8) : mm(1.1)}
                fill={i === 0 ? "#fff" : BRASS} stroke={BRASS} strokeWidth={mm(0.4)} />
            ))}
          </g>
        )}
        {/* the set-scale line across the house plan */}
        {interactive && planScaling && (
          <g pointerEvents="none">
            {planScale.pts.length === 2 && (
              <line x1={planScale.pts[0].x} y1={planScale.pts[0].y}
                x2={planScale.pts[1].x} y2={planScale.pts[1].y}
                stroke={SEAL} strokeWidth={mm(0.6)} strokeLinecap="round" />
            )}
            {planScale.pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={mm(1.4)}
                fill="#fff" stroke={SEAL} strokeWidth={mm(0.45)} />
            ))}
          </g>
        )}
        {/* the outline being drawn */}
        {interactive && draw && (
          <g pointerEvents="none">
            {draw.pts.length > 1 && (
              <polyline points={draw.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none" stroke={SEAL} strokeWidth={mm(0.35)}
                strokeDasharray={`${mm(1.5)} ${mm(1)}`} />
            )}
            {draw.pts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={i === 0 ? mm(1.6) : mm(1)}
                fill={i === 0 ? "#fff" : SEAL} stroke={SEAL} strokeWidth={mm(0.35)} />
            ))}
          </g>
        )}
        {legendBox(hatch)}
        {northAndScale()}
      </>
    );
  }

  // Cap the on-screen canvas height so deep lots don't become a scroll.
  const maxCanvasPx = Math.max(280, Math.round(680 * (vbW / vbH)));
  // Printed drawing size in real millimetres. When the lot is beyond A4 at
  // 1:500 the whole drawing shrinks by one factor — never distorts — and the
  // sheet stops claiming a scale (the scale bar shrinks with it, so it stays
  // true either way).
  const fitFactor = Math.min(186 / mToMmOnPaper(vbW, denom), 237 / mToMmOnPaper(vbH, denom), 1);
  const sheetWmm = mToMmOnPaper(vbW, denom) * fitFactor;
  const sheetHmm = mToMmOnPaper(vbH, denom) * fitFactor;

  /** The lot's address, street, size and the lookup buttons — the top card in
   *  the classic layout, and the contents of the "Lot" menu in studio chrome. */
  function lotSetup() {
    return (
      <div className="card mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label">Site Address</label>
            <input className="field" value={design.address} placeholder="e.g. 12 Wandoo Rise, Baldivis"
              onChange={(e) => {
                const address = e.target.value;
                setDesign((p) => ({
                  ...p, address,
                  street: streetEditedRef.current ? p.street : deriveStreet(address),
                }));
              }}
              onBlur={commitAddress}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </div>
          <div>
            <label className="label">Street Name (frontage)</label>
            <input className="field" value={street} placeholder="e.g. Wandoo Rise"
              onChange={(e) => {
                const v = e.target.value;
                streetEditedRef.current = v.trim() !== "";
                setDesign((p) => ({ ...p, street: v }));
              }}
              onBlur={() => {
                if (!street.trim()) {
                  streetEditedRef.current = false;
                  setDesign((p) => ({ ...p, street: deriveStreet(p.address) }));
                }
              }} />
          </div>
          {isPoly ? (
            <div className="sm:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <span className="label">Lot Area</span>
                <p className="font-mono text-[15px] leading-[38px] text-ink">{fmtM(lotArea)} m²</p>
              </div>
              <div>
                <span className="label">Overall</span>
                <p className="font-mono text-[15px] leading-[38px] text-ink">
                  {fmtM(lotW)} × {fmtM(lotD)} m
                </p>
              </div>
            </div>
          ) : (
            <>
              <MetresField label="Lot Width (m)" value={lotW} onCommit={(n) => setLot({ lotW: n })} />
              <MetresField label="Lot Depth (m)" value={lotD} onCommit={(n) => setLot({ lotD: n })} />
            </>
          )}
        </div>
        {/* Neither of these is ever offered where it can't actually turn up:
            no Google key, no geocode and so no lookup at all; no cadastre
            configured, no lot button. A missing optional service must never
            surface to a client as a promise the portal can't keep. */}
        {GOOGLE_MAPS_KEY !== "" && (
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {cadastre && (
              <button type="button" onClick={findLot} disabled={findingLot || finding}
                className="btn min-h-[40px] !py-2">
                {findingLot ? "Looking…" : isPoly ? "Find My Lot Again" : "Find My Lot"}
              </button>
            )}
            <button type="button" onClick={findSite} disabled={finding || findingLot}
              className="btn-ghost min-h-[40px] !py-2">
              {finding ? "Looking…" : sited ? "Find This Site Again" : "Show the Aerial Photo"}
            </button>
            {sited && (
              <button type="button" onClick={startTrace}
                className={`min-h-[40px] rounded-md border px-3 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                  trace ? "border-seal bg-wash text-seal" : "border-brass bg-[#F6EEDA] text-brass-deep hover:bg-[#F1E6CE]"
                }`}>
                Trace the lot on the photo
              </button>
            )}
            <p className={`min-w-[200px] flex-1 text-[12.5px] leading-snug ${lotNote || aerialNote ? "text-brass-deep" : "text-ink/55"}`}>
              {lotNote || aerialNote || (isPoly
                ? origin === "cadastre" ? LOT_INDICATIVE : lotOriginNote(boundary)
                : cadastre && !sited
                  ? "We'll look your lot up on the State's records and draw the real boundary — shape, dimensions and all."
                  : sited
                    ? "Drag the lot's corners to match the photo, or tap them out with Trace. The photo is a guide — it's never printed."
                    : "Puts an aerial photo of the site behind your plan to trace over. It never appears on the printed plan.")}
            </p>
          </div>
        )}
        <p className="mt-2.5 text-[12.5px] text-ink/50">
          {origin === "cadastre"
            ? "This is the lot as the State records it. Tap any boundary on the plan to make it the street frontage, or hit Adjust the boundary and drag a corner if it doesn't match what's on the ground."
            : isPoly
              ? "This boundary is your own — drag any corner to fix it, add or remove corners, and tap a boundary to make it the street frontage."
              : "Type the lot size here, or take hold of it on the plan: Adjust the boundary puts handles on the corners and edges. Street frontage runs along the bottom."}
          {" "}The street name fills itself from the address; type over it if
          your frontage is a different street. Your design saves automatically
          in this browser, per address.
        </p>
      </div>
    );
  }

  /** The studio's top toolbar: one drop-down per group of controls, canvas
   *  underneath. A second tap on an open menu closes it, giving the drawing
   *  the whole screen. */
  function studioToolbar() {
    const items: { id: string; label: string }[] = [
      { id: "lot", label: "Lot" },
      { id: "underlays", label: "Underlays" },
      { id: "add", label: "Add" },
      ...(sel ? [{ id: "selected", label: sel.label || "Selected" }] : []),
      { id: "sheet", label: "Sheet" },
    ];
    return (
      <div className="mb-4 flex flex-wrap gap-1.5 rounded-lg border border-rule bg-white p-1.5 shadow-sm">
        {items.map((it) => {
          const on = openMenu === it.id;
          return (
            <button key={it.id} type="button" aria-pressed={on}
              onClick={() => setOpenMenu(on ? null : it.id)}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-md px-3.5 font-display text-[13px] font-semibold transition ${
                on ? "bg-seal text-white" : "text-ink hover:bg-wash"
              }`}>
              {it.label}
              <span className={`text-[9px] transition ${on ? "rotate-180" : ""}`}>▾</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {/* Studio chrome puts a toolbar on top and reveals one group of controls
          at a time; the classic layout keeps the lot-setup card here and the
          controls in a column beside the canvas. */}
      {chrome ? studioToolbar() : lotSetup()}

      <div className={chrome
        ? (openMenu ? "grid gap-5 lg:grid-cols-[340px,minmax(0,1fr)]" : "")
        : "grid gap-5 lg:grid-cols-[290px,minmax(0,1fr)]"}>
        {/* toolbox + selected structure */}
        <div className={chrome && !openMenu ? "hidden" : "space-y-5"}>
          {chrome && openMenu === "lot" && lotSetup()}
          {/* The lot boundary. Always here now: a typed rectangle is a lot
              boundary too, and the whole point of this card is that you can
              take hold of it. */}
          {(!chrome || openMenu === "lot") && (
          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Lot Boundary</h2>
            <dl className="space-y-1 font-mono text-[12.5px] text-ink/75">
              {boundary.lotId && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink/50">Lot</dt>
                  <dd className="text-right">{boundary.lotId}</dd>
                </div>
              )}
              <div className="flex justify-between gap-2">
                <dt className="text-ink/50">Area</dt>
                <dd>{fmtM(lotArea)} m²</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-ink/50">Corners</dt>
                <dd>{lotOutline.length}</dd>
              </div>
              {isPoly && (
                <div className="flex justify-between gap-2">
                  <dt className="text-ink/50">North</dt>
                  <dd>{Math.round(north)}° on this sheet</dd>
                </div>
              )}
            </dl>

            <div className="mt-3 flex gap-2">
              <button type="button"
                onClick={() => (editing ? stopLotEdit() : startLotEdit())}
                aria-pressed={editing}
                className={`min-h-[40px] flex-1 rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                  editing ? "border-brass bg-[#F6EEDA] text-brass-deep" : "border-rule bg-white text-ink hover:bg-wash"
                }`}>
                {editing ? "Done Adjusting" : "Adjust the Boundary"}
              </button>
              <button type="button" onClick={startTrace}
                className={`min-h-[40px] flex-1 rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                  trace ? "border-seal bg-wash text-seal" : "border-rule bg-white text-ink hover:bg-wash"
                }`}>
                Trace the lot
              </button>
            </div>
            <button type="button" onClick={undoLot} disabled={history.length === 0}
              className="btn-ghost mt-2 min-h-[40px] w-full !py-2 disabled:opacity-40">
              Undo the Last Boundary Change{history.length > 1 ? ` (${history.length})` : ""}
            </button>

            {/* What's picked up, and what can be done to it. Both controls are
                here as well as on the plan, because a corner is a fiddly thing
                to hold on to and then reach for a key with. */}
            {editing && (
              <div className="mt-3 rounded-md border border-brass/40 bg-[#FBF7EE] p-2.5">
                {lotSel?.kind === "corner" ? (
                  <>
                    <p className="text-[12.5px] font-medium text-ink/75">
                      Corner {lotSel.i + 1} of {lotOutline.length}
                    </p>
                    <button type="button" onClick={() => removeCorner(lotSel.i)}
                      className="btn-ghost mt-2 min-h-[40px] w-full !py-2 !text-flag hover:!border-flag/40">
                      Remove This Corner
                    </button>
                  </>
                ) : lotSel?.kind === "edge" ? (
                  <>
                    <p className="text-[12.5px] font-medium text-ink/75">
                      {edgeNames[lotSel.i]} — {fmtM(edges[lotSel.i].length)} m
                    </p>
                    <button type="button" onClick={() => addCornerOn(lotSel.i, null)}
                      className="btn-ghost mt-2 min-h-[40px] w-full !py-2">
                      Add a Corner Here
                    </button>
                    {isPoly && lotSel.i !== frontage && (
                      <button type="button" onClick={() => setFrontage(lotSel.i)}
                        className="btn-ghost mt-2 min-h-[40px] w-full !py-2">
                        Make This the Street Frontage
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[12.5px] leading-snug text-ink/65">
                    Tap a corner or a boundary on the plan to pick it up.
                  </p>
                )}
              </div>
            )}
            {lotNudge && !lotDrag && (
              <p className="mt-2 text-[12.5px] leading-snug text-brass-deep">{lotNudge}</p>
            )}

            {isPoly && (
              <div className="mt-3">
                <span className="label">Boundaries — Tap to Set the Frontage</span>
                <div className="space-y-1">
                  {edges.map((e, i) => (
                    <button key={i} type="button" onClick={() => setFrontage(i)}
                      aria-pressed={i === frontage}
                      className={`flex min-h-[36px] w-full items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-left transition ${
                        i === frontage
                          ? "border-seal/50 bg-wash"
                          : "border-rule bg-white hover:border-seal/40 hover:bg-wash"
                      }`}>
                      <span className={`text-[13px] ${i === frontage ? "font-semibold text-seal" : "text-ink/70"}`}>
                        {edgeNames[i]}
                      </span>
                      <span className="font-mono text-[12px] text-ink/60">{fmtM(e.length)} m</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {isPoly && (
              <button type="button" onClick={clearLot}
                className="btn-ghost mt-3 min-h-[40px] w-full !py-2">
                Type the Dimensions Instead
              </button>
            )}
            {/* Where this boundary came from, in the same words the printed
                sheet uses. Never a claim the boundary can't keep. */}
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/55">
              {lotOriginNote(boundary)}
            </p>
          </div>
          )}

          {/* Aerial alignment — only once there's a photo to line up. */}
          {(!chrome || openMenu === "underlays") && sited && (
            <div className="card p-4">
              <h2 className="sectionhead !mb-2">Aerial Photo</h2>
              <div className="flex gap-2">
                <button type="button"
                  onClick={() => patchUnderlay((u) => ({ visible: !u.visible }))}
                  className="btn-ghost min-h-[40px] flex-1 !px-2 !py-2">
                  {under.visible ? "Hide Photo" : "Show Photo"}
                </button>
                <button type="button"
                  onClick={() => patchUnderlay((u) => ({ locked: !u.locked, visible: true }))}
                  className={`min-h-[40px] flex-1 rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                    aligning ? "border-brass bg-[#F6EEDA] text-brass-deep" : "border-rule bg-white text-ink hover:bg-wash"
                  }`}>
                  {under.locked ? "Line it up" : "Lock it"}
                </button>
              </div>

              {under.visible && (
                <div className="mt-3 space-y-3">
                  {/* nudge pad — 44 px targets, arrow keys do the same job */}
                  <div>
                    <span className="label">Nudge the Photo</span>
                    <div className="mx-auto grid w-[152px] grid-cols-3 gap-1">
                      <span />
                      <button type="button" aria-label="Nudge the photo up"
                        onClick={() => nudgeUnderlay(0, -0.1)} className={NUDGE}>↑</button>
                      <span />
                      <button type="button" aria-label="Nudge the photo left"
                        onClick={() => nudgeUnderlay(-0.1, 0)} className={NUDGE}>←</button>
                      <button type="button" aria-label="Put the photo back where it landed"
                        onClick={() => patchUnderlay({ offsetX: 0, offsetY: 0, rot: 0 })}
                        className={`${NUDGE} text-[10px]`}>reset</button>
                      <button type="button" aria-label="Nudge the photo right"
                        onClick={() => nudgeUnderlay(0.1, 0)} className={NUDGE}>→</button>
                      <span />
                      <button type="button" aria-label="Nudge the photo down"
                        onClick={() => nudgeUnderlay(0, 0.1)} className={NUDGE}>↓</button>
                      <span />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="label !mb-0">Turn the photo</span>
                      <span className="font-mono text-[11.5px] text-ink/55">{under.rot.toFixed(1)}°</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button type="button" aria-label="Turn the photo anticlockwise"
                        onClick={() => patchUnderlay((u) => ({ rot: clampUnderlayRot(u.rot - 0.5) }))}
                        className={`${NUDGE} w-10 shrink-0`}>↺</button>
                      <input type="range" className="h-10 flex-1 accent-[#1E5B3C]"
                        min={-UNDERLAY_MAX_ROT} max={UNDERLAY_MAX_ROT} step={0.5}
                        aria-label="Photo rotation in degrees"
                        value={under.rot}
                        onChange={(e) => patchUnderlay({ rot: clampUnderlayRot(Number(e.target.value)) })} />
                      <button type="button" aria-label="Turn the photo clockwise"
                        onClick={() => patchUnderlay((u) => ({ rot: clampUnderlayRot(u.rot + 0.5) }))}
                        className={`${NUDGE} w-10 shrink-0`}>↻</button>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="label !mb-0">How strong</span>
                      <span className="font-mono text-[11.5px] text-ink/55">{Math.round(under.opacity * 100)}%</span>
                    </div>
                    <input type="range" className="mt-1.5 h-10 w-full accent-[#1E5B3C]"
                      min={UNDERLAY_MIN_OPACITY} max={1} step={0.05}
                      aria-label="How strongly the photo shows through"
                      value={under.opacity}
                      onChange={(e) => patchUnderlay({ opacity: clampUnderlayOpacity(Number(e.target.value)) })} />
                  </div>
                </div>
              )}

              <button type="button"
                onClick={() => patchUnderlay(sanitiseUnderlay(undefined))}
                className="btn-ghost mt-3 min-h-[40px] w-full !py-2">
                Take the Photo Off
              </button>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/55">
                {aligning
                  ? "Drag the photo to line it up — two fingers to turn it, arrow keys to nudge (Shift for a metre). Lock it when it sits right."
                  : "A tracing guide only. It won't appear on the printed plan, it may be a year or two old, and it isn't a survey — your own measurements win."}
              </p>
            </div>
          )}

          {/* House plan (trace) — studio only. The client's own PDF or image,
              placed behind the drawing to trace over. Kept in this browser,
              never uploaded, never printed. */}
          {(!chrome || openMenu === "underlays") && planOn && (
            <div className="card p-4">
              <h2 className="sectionhead !mb-2">House Plan (trace)</h2>
              {!plan0.placed ? (
                <>
                  <label className={`btn-ghost flex min-h-[40px] w-full cursor-pointer items-center justify-center !py-2 ${planBusy ? "opacity-60" : ""}`}>
                    {planBusy ? "Adding…" : "Add a House Plan"}
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={planBusy}
                      onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void addPlan(f); }} />
                  </label>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/55">
                    Upload a PDF or a photo of your house plans and trace over it.
                    It stays on this device — it&apos;s never uploaded, and it
                    never appears on the printed plan.
                  </p>
                </>
              ) : planMissing || !planImg ? (
                <>
                  <p className="text-[12.5px] leading-snug text-brass-deep">
                    Your house plan isn&apos;t on this device. It stays in the
                    browser you added it in and was never uploaded — add it again
                    here to keep tracing. What you&apos;ve already drawn is safe.
                  </p>
                  <label className={`btn-ghost mt-2 flex min-h-[40px] w-full cursor-pointer items-center justify-center !py-2 ${planBusy ? "opacity-60" : ""}`}>
                    {planBusy ? "Adding…" : "Re-add the House Plan"}
                    <input type="file" accept="application/pdf,image/*" className="hidden" disabled={planBusy}
                      onChange={(e) => { const f = e.target.files?.[0]; e.currentTarget.value = ""; if (f) void addPlan(f, 1, true); }} />
                  </label>
                  <button type="button" onClick={removePlan}
                    className="btn-ghost mt-2 min-h-[40px] w-full !py-2">
                    Forget This House Plan
                  </button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => patchPlan((u) => ({ visible: !u.visible }))}
                      className="btn-ghost min-h-[40px] flex-1 !px-2 !py-2">
                      {plan0.visible ? "Hide Plan" : "Show Plan"}
                    </button>
                    <button type="button"
                      onClick={() => {
                        const unlocking = plan0.locked;
                        patchPlan({ locked: !plan0.locked, visible: true });
                        if (unlocking) patchUnderlay({ locked: true });
                      }}
                      className={`min-h-[40px] flex-1 rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                        planAligning ? "border-seal bg-wash text-seal" : "border-rule bg-white text-ink hover:bg-wash"
                      }`}>
                      {plan0.locked ? "Line it up" : "Lock it"}
                    </button>
                  </div>

                  {plan0.visible && (
                    <div className="mt-3 space-y-3">
                      {planPages > 1 && planFileRef.current && (
                        <div>
                          <span className="label">Page</span>
                          <select className="field" value={plan0.page} disabled={planBusy}
                            onChange={(e) => {
                              const pg = Number(e.target.value);
                              if (planFileRef.current) void addPlan(planFileRef.current, pg, true);
                            }}>
                            {Array.from({ length: planPages }, (_, i) => i + 1).map((n) => (
                              <option key={n} value={n}>Page {n} of {planPages}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Scale — the one thing a photo of a plan doesn't carry. */}
                      <div>
                        <span className="label">Scale</span>
                        <button type="button" onClick={startPlanScale}
                          className="btn-ghost min-h-[40px] w-full !py-2">
                          Set the Scale by a Known Length
                        </button>
                        <div className="mt-2">
                          <MetresField label="…or type its width on the plan (m)"
                            value={Math.round(plan0.w * plan0.mpp * 100) / 100}
                            onCommit={(n) => { if (plan0.w > 0) patchPlan({ mpp: n / plan0.w }); }} />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-baseline justify-between">
                          <span className="label !mb-0">Turn the plan</span>
                          <span className="font-mono text-[11.5px] text-ink/55">{Math.round(plan0.rot)}°</span>
                        </div>
                        <input type="range" className="mt-1.5 h-10 w-full accent-[#1E5B3C]"
                          min={0} max={360} step={1} value={plan0.rot}
                          aria-label="House plan rotation in degrees"
                          onChange={(e) => patchPlan({ rot: Number(e.target.value) })} />
                      </div>

                      <div>
                        <div className="flex items-baseline justify-between">
                          <span className="label !mb-0">How strong</span>
                          <span className="font-mono text-[11.5px] text-ink/55">{Math.round(plan0.opacity * 100)}%</span>
                        </div>
                        <input type="range" className="mt-1.5 h-10 w-full accent-[#1E5B3C]"
                          min={UNDERLAY_MIN_OPACITY} max={1} step={0.05} value={plan0.opacity}
                          aria-label="How strongly the house plan shows through"
                          onChange={(e) => patchPlan({ opacity: clampUnderlayOpacity(Number(e.target.value)) })} />
                      </div>
                    </div>
                  )}

                  <button type="button" onClick={removePlan}
                    className="btn-ghost mt-3 min-h-[40px] w-full !py-2">
                    Take the House Plan Off
                  </button>
                  <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/55">
                    {planAligning
                      ? "Drag the plan to line it up with your drawing, then lock it. Set the scale off a length you know, and it'll sit true to the metre."
                      : "A tracing guide only — it stays on this device, isn't uploaded, and never appears on the printed plan."}
                  </p>
                </>
              )}
            </div>
          )}

          {(!chrome || openMenu === "add") && (
          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Add a Structure</h2>
            <div className="grid grid-cols-2 gap-2">
              {/* Free draw leads. The presets cover the common shapes, but the
                  reason someone opens this panel with something unusual in
                  mind is the one thing the presets can't do — so it shouldn't
                  be the last thing they find. */}
              <button type="button" onClick={startDraw}
                className={`col-span-2 rounded-md border px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash ${draw ? "border-seal bg-wash" : "border-rule bg-white"}`}>
                <span className="block text-[13.5px] font-medium">Free Draw</span>
                <span className="block font-mono text-[11px] text-ink/45">
                  tap its corners, then name it
                </span>
              </button>
              {STRUCTURE_PRESETS.map((p) => (
                <button key={p.kind} type="button" onClick={() => addStructure(p)}
                  className="rounded-md border border-rule bg-white px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash">
                  <span className="block text-[13.5px] font-medium">{p.label}</span>
                  <span className="block font-mono text-[11px] text-ink/45">
                    {fmtM(p.w)} × {fmtM(p.d)} m
                    {structureState(p) === "existing" ? " · existing" : ""}
                  </span>
                </button>
              ))}
              <button type="button" onClick={addLShape}
                className="rounded-md border border-rule bg-white px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash">
                <span className="block text-[13.5px] font-medium">L-shape</span>
                <span className="block font-mono text-[11px] text-ink/45">6 × 4 m, notched</span>
              </button>
            </div>
          </div>
          )}

          {(!chrome || openMenu === "selected") && (
          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Selected Structure</h2>
            {sel ? (
              <div className="space-y-3">
                <div>
                  <label className="label" htmlFor="structure-label">
                    {naming ? "Name This Shape" : "Label"}
                  </label>
                  <input id="structure-label" ref={labelRef} className="field" value={sel.label}
                    onChange={(e) => {
                      setNaming(false);
                      patchStructure(sel.id, { label: e.target.value });
                    }} />
                  {naming && (
                    <p className="mt-1.5 text-[12.5px] leading-snug text-brass-deep">
                      What is it? Alfresco, workshop, verandah — whatever you&apos;d
                      call it. The name goes on the printed plan.
                    </p>
                  )}
                </div>
                {/* Existing or proposed. First thing under the name, because
                    it changes what the drawing means rather than how it
                    looks — and a new build has to be one tap away. */}
                <div>
                  <span className="label">Already There, or Proposed</span>
                  <div className="grid grid-cols-2 gap-2">
                    {(["existing", "proposed"] as StructureState[]).map((st) => {
                      const on = structureState(sel) === st;
                      return (
                        <button key={st} type="button" aria-pressed={on}
                          onClick={() => patchStructure(sel.id, { state: st })}
                          className={`min-h-[44px] rounded-md border px-2 py-2 font-display text-[12px] font-semibold uppercase tracking-[0.09em] transition ${
                            on
                              ? "border-seal bg-wash text-seal"
                              : "border-rule bg-white text-ink/60 hover:bg-wash"
                          }`}>
                          {st === "existing" ? "Existing" : "Proposed"}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-snug text-ink/55">
                    {structureState(sel) === "existing"
                      ? "Already on the block. Drawn washed back, hatched and dashed, and labelled “existing” on the sheet."
                      : "What you're applying for. Drawn solid and bold, and labelled “proposed” on the sheet."}
                    {" "}E swaps it.
                  </p>
                </div>
                {sel.shape === "poly" ? (
                  <p className="text-[12.5px] leading-relaxed text-ink/55">
                    Drawn outline, {sel.pts?.length ?? 0} corners — drag the
                    corner handles on the plan to reshape it.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <MetresField label="Width (m)" value={sel.w} onCommit={(n) => patchStructure(sel.id, { w: n })} />
                    <MetresField label="Depth (m)" value={sel.d} onCommit={(n) => patchStructure(sel.id, { d: n })} />
                  </div>
                )}
                {sel.shape === "lshape" && (
                  <div className="grid grid-cols-2 gap-2">
                    <MetresField label="Notch Width (m)" value={sel.notchW ?? sel.w / 2}
                      onCommit={(n) => patchStructure(sel.id, { notchW: n })} />
                    <MetresField label="Notch Depth (m)" value={sel.notchD ?? sel.d / 2}
                      onCommit={(n) => patchStructure(sel.id, { notchD: n })} />
                  </div>
                )}
                {/* The parametric patio — studio only. */}
                {patioTools && sel.kind === "patio" && sel.shape === "rect" && patioControls(sel)}
                <div className="flex justify-between font-mono text-[12.5px] text-ink/75">
                  <span className="text-ink/50">Footprint Area</span>
                  <span>{fmtM(structureArea(sel))} m²</span>
                </div>
                <div>
                  <span className="label">Distance to Boundaries</span>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[12.5px] text-ink/75">
                    {isPoly
                      ? lotSetbacks(sel, lotOutline, frontage).map((r) => (
                          <div key={r.i} className="flex justify-between gap-2">
                            <dt className="text-ink/50">
                              {r.label === "Front" ? "front (street)" : r.label.toLowerCase()}
                            </dt>
                            <dd>{fmtM2(r.v)} m</dd>
                          </div>
                        ))
                      : Object.entries(setbacks(sel, lotW, lotD)).map(([side, v]) => (
                          <div key={side} className="flex justify-between gap-2">
                            <dt className="capitalize text-ink/50">{side === "front" ? "front (street)" : side}</dt>
                            <dd>{fmtM2(v)} m</dd>
                          </div>
                        ))}
                  </dl>
                  {/* A polygon lot is not its bounding box, so a structure can
                      be dragged out of it. Said as an observation, not a
                      ruling — this tool has never told anyone they're wrong. */}
                  {isPoly && !polygonInside(footprint(sel), lotOutline) && (
                    <p className="mt-1.5 text-[12.5px] leading-snug text-brass-deep">
                      Part of this sits outside the lot boundary — drag it back in.
                    </p>
                  )}
                </div>
                {/* Distances to the other structures. Measured outline to
                    outline at the closest approach — the gap you could walk
                    through, not the distance between two centres. Reported and
                    never judged: separation and barrier distances are decided
                    during assessment, not here. */}
                <div>
                  <span className="label">Distance to Nearby Structures</span>
                  {nearSel.length === 0 ? (
                    <p className="text-[12.5px] leading-snug text-ink/55">
                      Nothing else on the plan to measure to yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {nearSel.map((g) => {
                        const other = byId.get(g.id);
                        const on = isPinned(pins, sel.id, g.id);
                        return (
                          <div key={g.id} className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink/70">
                              {other?.label ?? "Structure"}
                              {g.overlap && <span className="text-brass-deep"> — overlapping</span>}
                            </span>
                            <span className="shrink-0 font-mono text-[12.5px] text-ink/75">
                              {fmtM2(g.d)} m
                            </span>
                            <button type="button" aria-pressed={on}
                              onClick={() => pinPair(sel.id, g.id)}
                              className={`min-h-[40px] shrink-0 rounded-md border px-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.08em] transition ${
                                on
                                  ? "border-brass bg-[#F6EEDA] text-brass-deep"
                                  : "border-rule bg-white text-ink/60 hover:bg-wash"
                              }`}>
                              {on ? "Pinned" : "Pin"}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-1.5 text-[12.5px] leading-snug text-ink/55">
                    Measured outline to outline, at the closest point. Pin one —
                    here or by tapping the figure on the plan — and it stays on
                    the drawing and goes on the printed sheet.
                  </p>
                </div>
                <button type="button" onClick={rotateSelected} className="btn-ghost w-full">
                  Rotate 90°{sel.rot ? ` — at ${sel.rot}°` : ""}
                </button>
                <button type="button" onClick={removeSelected}
                  className="btn-ghost w-full !text-flag hover:!border-flag/40">
                  Remove Structure
                </button>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink/55">
                Tap a structure on the plan to select it — drag to move (edges
                pull in line with neighbours; hold Alt to drag free), drag the
                square handles to resize, R to rotate, E to swap existing and
                proposed, arrow keys to nudge (hold Shift for 1&nbsp;m steps),
                Delete to remove.
                {editing && " The boundary handles are out at the moment, so the structures are on hold — hit Done adjusting to get them back."}
              </p>
            )}
          </div>
          )}

          {(!chrome || openMenu === "sheet") && (
          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Sheet</h2>
            <div className="space-y-2">
              {/* With a real parcel on the sheet, north is a fact rather than
                  a setting: it falls out of the boundary's own bearing, and
                  turning it by hand would only put it out. Choose a different
                  frontage instead and the whole sheet turns together. */}
              {isPoly ? (
                <p className="rounded-md border border-rule bg-wash px-3 py-2 text-[12.5px] leading-snug text-ink/60">
                  North is {Math.round(north)}° on this sheet, worked out from the
                  lot boundary. Tap a different boundary to turn the plan.
                </p>
              ) : (
                <button type="button" className="btn-ghost w-full"
                  onClick={() => setDesign((p) => ({ ...p, north: (p.north + 45) % 360 }))}>
                  Rotate north — {north}°
                </button>
              )}
              <button type="button" className="btn w-full" onClick={() => window.print()}>
                Print / Save as PDF
              </button>
              <button type="button" className="btn-ghost w-full"
                onClick={() => {
                  if (window.confirm("Clear every structure and start this plan again?")) {
                    setDesign((p) => ({ ...p, structures: [], pins: [], north: 0 }));
                    setSelected(null);
                    setDraw(null);
                  }
                }}>
                Start again
              </button>
            </div>
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink/50">
              {fits
                ? <>Prints on A4 at <span className="font-mono">1:{denom}</span>. In the print dialog choose &ldquo;Save as PDF&rdquo; and keep the size at 100%.</>
                : <>This lot is larger than A4 fits at 1:500 — the print is reduced to fit and says so. The scale bar stays true.</>}
              {patioTools && (() => {
                const n = design.structures.filter((s) => s.kind === "patio" && s.patio).length;
                return n > 0
                  ? ` A front and side elevation prints for each patio you've set up — ${n} extra ${n === 1 ? "sheet" : "sheets"} after the plan.`
                  : "";
              })()}
            </p>
          </div>
          )}
        </div>

        {/* The canvas. Sticky from lg up: the options column is long, and
            scrolling down to reach a control used to take the drawing you are
            adjusting off the screen. self-start stops the grid stretching this
            item, which would make sticky a no-op. */}
        <div className="card p-4 lg:sticky lg:top-4 lg:self-start">
          {/* Tracing the lot out over the photo — the same tap-the-corners
              gesture the odd-shape tool uses, pointed at the boundary. */}
          {trace && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brass/50 bg-[#FBF7EE] px-3 py-2">
              <p className={`min-w-[180px] flex-1 text-[12.5px] leading-snug ${trace.hint ? "text-brass-deep" : "text-ink/70"}`}>
                {trace.hint || (
                  trace.pts.length === 0
                    ? "Tap each corner of your lot on the photo. Start anywhere and go round — if the lot runs off the edge, bump the width or depth up first to make room."
                    : trace.pts.length < 3
                      ? `${trace.pts.length} corner${trace.pts.length === 1 ? "" : "s"} placed — keep going round.`
                      : `${trace.pts.length} corners placed — tap the first one again, or Done, to close the lot.`
                )}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn min-h-[40px] !px-3 !py-1.5"
                  onClick={() => finishTrace()}>Done</button>
                <button type="button" className="btn-ghost min-h-[40px] !px-3 !py-1.5"
                  onClick={() => setTrace(null)}>Cancel</button>
              </div>
            </div>
          )}
          {/* One steady message. Nothing in here may change while a corner is
              being dragged: this bar sits above the drawing, so a line of
              text appearing or disappearing would slide the whole plan out
              from under the finger. What's live goes on the drawing itself. */}
          {editing && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-brass/50 bg-[#FBF7EE] px-3 py-2">
              <p className="min-w-[180px] flex-1 text-[12.5px] leading-snug text-ink/70">
                Drag the square handles to move a corner, or the diamonds to
                shift a whole boundary. Double-tap or hold a boundary to add a
                corner. Hold Alt to turn the snapping off. A drag reaches as
                far as you can see — drag again to keep going.
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn-ghost min-h-[40px] !px-3 !py-1.5"
                  onClick={undoLot} disabled={history.length === 0}>Undo</button>
                <button type="button" className="btn min-h-[40px] !px-3 !py-1.5"
                  onClick={stopLotEdit}>Done</button>
              </div>
            </div>
          )}
          {draw && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-seal/30 bg-wash px-3 py-2">
              <p className={`min-w-[180px] flex-1 text-[12.5px] leading-snug ${draw.hint ? "text-brass-deep" : "text-ink/65"}`}>
                {draw.hint || (
                  draw.pts.length === 0
                    ? "Tap the plan at each corner of the shape."
                    : draw.pts.length < 3
                      ? `${draw.pts.length} corner${draw.pts.length === 1 ? "" : "s"} placed — keep tapping.`
                      : `${draw.pts.length} corners placed — tap the first corner or Done to close.`
                )}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn !px-3 !py-1.5" onClick={finishDraw}>Done</button>
                <button type="button" className="btn-ghost !px-3 !py-1.5" onClick={() => setDraw(null)}>Cancel</button>
              </div>
            </div>
          )}
          {/* Setting the house plan's scale by a known length. */}
          {planScaling && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-seal/30 bg-wash px-3 py-2">
              {planScale.metres === null ? (
                <p className="min-w-[180px] flex-1 text-[12.5px] leading-snug text-ink/70">
                  {planScale.pts.length === 0
                    ? "Tap the two ends of something on your plan you know the real length of — a wall, a boundary, the scale bar."
                    : "Now tap the other end."}
                </p>
              ) : (
                <PlanScaleAsk
                  drawn={planScale.metres}
                  onApply={applyPlanScale}
                  onCancel={cancelPlanScale}
                />
              )}
              {planScale.metres === null && (
                <button type="button" className="btn-ghost min-h-[40px] !px-3 !py-1.5" onClick={cancelPlanScale}>
                  Cancel
                </button>
              )}
            </div>
          )}
          <div ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Site plan drawing area"
            className="relative mx-auto select-none rounded-md" style={{ maxWidth: `${maxCanvasPx}px` }}>
            {/* The aerial, behind everything and clipped to the canvas. Marked
                out for the print stylesheet twice over: it is off the printed
                sheet's ancestor path, and cfba-underlay is struck out
                explicitly below. Never any part of what gets lodged. */}
            {sited && (
              <div className="cfba-underlay pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]"
                aria-hidden="true"
                style={{
                  zIndex: 0,
                  opacity: under.visible ? under.opacity : 0,
                  transition: "opacity 0.15s ease",
                }}>
                <div ref={mapElRef}
                  style={{
                    position: "absolute", left: "50%", top: "50%",
                    width: `${mapBox.w}px`, height: `${mapBox.h}px`,
                    marginLeft: `${-mapBox.w / 2}px`, marginTop: `${-mapBox.h / 2}px`,
                    transform: `rotate(${imageryDeg}deg) scale(${mapScale})`,
                    transformOrigin: "50% 50%",
                    backgroundColor: "#EEF0EA",
                  }} />
              </div>
            )}
            {/* The client's own house plan, behind the drawing and clipped to
                the canvas. Same cfba-underlay mark as the aerial: a tracing
                guide only, struck from the print, never part of what lodges.
                Its picture lives in this browser; it is never uploaded. */}
            {planShowing && (() => {
              const box = planBox();
              return (
                <div className="cfba-underlay pointer-events-none absolute inset-0 overflow-hidden rounded-[3px]"
                  aria-hidden="true" style={{ zIndex: 0, opacity: plan0.opacity, transition: "opacity 0.15s ease" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a client-local data URL, never a remote asset */}
                  <img src={planImg!} alt=""
                    style={{
                      position: "absolute", left: `${box.left}px`, top: `${box.top}px`,
                      width: `${box.w}px`, height: `${box.h}px`, maxWidth: "none",
                      transform: `rotate(${plan0.rot}deg)`, transformOrigin: "50% 50%",
                    }} />
                </div>
              );
            })()}
            <svg ref={svgRef} viewBox={viewBox} role="img" aria-label="Site plan"
              style={{
                width: "100%", height: "auto", aspectRatio: `${vbW} / ${vbH}`,
                display: "block", touchAction: "none", position: "relative", zIndex: 1,
                cursor: draw || trace ? "crosshair" : undefined,
              }}
              onPointerDown={(e) => {
                if (planScaling) { addPlanScalePoint(e); return; }
                if (trace) { addTracePoint(e); return; }
                if (draw) { addDrawPoint(e); return; }
                if (editing) { setLotSel(null); return; }
                setSelected(null);
              }}>
              {plan(true, tracing || planShowing)}
            </svg>
            {/* Alignment only exists while it's unlocked. Locked, this is
                gone from the tree entirely and every structure is as
                draggable as it ever was. */}
            {aligning && !planAligning && (
              <div
                className="absolute inset-0 cursor-move rounded-[3px] ring-2 ring-brass/70"
                style={{ zIndex: 3, touchAction: "none" }}
                role="application"
                aria-label="Drag to line the aerial photo up with your lot"
                onPointerDown={alignDown}
                onPointerMove={alignMove}
                onPointerUp={alignUp}
                onPointerCancel={alignUp}
              />
            )}
            {/* Lining the house plan up — one finger moves it; turn and scale
                are set from its card. Only here while it's unlocked. */}
            {planAligning && (
              <div
                className="absolute inset-0 cursor-move rounded-[3px] ring-2 ring-seal/60"
                style={{ zIndex: 3, touchAction: "none" }}
                role="application"
                aria-label="Drag to line your house plan up with the drawing"
                onPointerDown={planDown}
                onPointerMove={planMove}
                onPointerUp={planUp}
                onPointerCancel={planUp}
              />
            )}
          </div>
          {/* Google draws its own logo and imagery credit inside the map, and
              we never cover or strip them. This line sits outside the canvas
              so the credit is still upright and legible in the states where
              turning and scaling the photo pushes Google's own out of the
              clip — it adds to Google's attribution, it never replaces it. */}
          {tracing && (
            <p className="mt-1.5 text-right text-[10.5px] leading-none text-ink/45">
              Imagery © Google
            </p>
          )}
          <p className="mt-2 text-center text-[12px] text-ink/50">
            {aligning
              ? "Drag the photo until it sits under your lot, then lock it — the plan is on hold until you do."
              : editing
                ? "Drag a corner to move it, or a boundary to shift it whole. Everything measures as you go, and Undo puts it back."
                : trace
                  ? "Tap your lot's corners on the photo. The photo is only a guide and won't be printed — what you draw is your own measurement, not a survey."
                  : "Select a structure to see its distances to the boundaries and to what's around it. Tap a figure between two structures to pin it — pinned dimensions print, along with each proposed structure's distance to the existing ones nearest it."}
          </p>
        </div>
      </div>

      {/* The print set. Hidden on screen; the print stylesheet below shows this
          and nothing else. The site plan first, then a patio elevation sheet
          per configured patio (studio only). Each sheet is sized in real
          millimetres so the stated scale is true on paper (print at 100%). */}
      <div id="site-plan-print" className="hidden">
      <div id="site-plan-sheet" className="cfba-sheet">
        <svg viewBox={viewBox} aria-hidden="true"
          style={{ width: `${sheetWmm.toFixed(2)}mm`, height: `${sheetHmm.toFixed(2)}mm`, display: "block", margin: "0 auto" }}>
          {plan(false)}
        </svg>
        <div style={{ marginTop: "2mm", border: "0.5mm solid #2B3A31", color: INK, fontFamily: FONT_LAB }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "4mm", padding: "1.2mm 3mm", borderBottom: "0.3mm solid #2B3A31" }}>
            <span style={{ fontSize: "2.8mm", fontWeight: 700, letterSpacing: "0.5mm", textTransform: "uppercase", color: SEAL }}>Site plan</span>
            <strong style={{ fontSize: "3.4mm", fontWeight: 600 }}>{design.address.trim() || "Site address not entered"}</strong>
          </div>
          <div style={{ display: "flex" }}>
            {[
              ["Lot", isPoly
                ? `${fmtM(lotArea)} m² — ${fmtM(lotW)} × ${fmtM(lotD)} m overall`
                : `${fmtM(lotW)} m × ${fmtM(lotD)} m`],
              ["Street frontage", street.trim() || "—"],
              ["Scale", fits ? `1:${denom} (A4)` : "Reduced to fit A4 — use the scale bar"],
              ["Date", today],
            ].map(([k, v], i) => (
              <div key={k} style={{ flex: 1, padding: "1.1mm 3mm", borderLeft: i ? "0.3mm solid #2B3A31" : "none" }}>
                <div style={{ fontSize: "2.3mm", textTransform: "uppercase", letterSpacing: "0.4mm", opacity: 0.55 }}>{k}</div>
                <div style={{ fontSize: "2.8mm", fontFamily: FONT_NUM }}>{v}</div>
              </div>
            ))}
          </div>
          {/* Where the boundary came from and when.
              The reader of this sheet has to be able to tell a boundary
              fetched from the State's records from one somebody drew over a
              photograph — without being told and without asking. So the row
              names the source and the date when there is one, and says
              plainly when there isn't. A boundary that was fetched and then
              moved by hand says both: where it came from, and that it has
              since been moved. It is never allowed to read as the State's
              own record. */}
          {boundaryRow(boundary) && (
            <div style={{ display: "flex", alignItems: "baseline", gap: "2.5mm", padding: "1.1mm 3mm", borderTop: "0.3mm solid #2B3A31" }}>
              <span style={{ flexShrink: 0, fontSize: "2.3mm", textTransform: "uppercase", letterSpacing: "0.4mm", opacity: 0.55 }}>
                Lot boundary
              </span>
              <span style={{ fontSize: "2.7mm", fontFamily: FONT_NUM }}
                data-lot-origin={origin}
                data-cadastre-source={origin.startsWith("cadastre") ? "1" : undefined}>
                {boundaryRow(boundary)}
              </span>
            </div>
          )}
        </div>
        <p data-lot-footer={origin}
          style={{ marginTop: "1.2mm", fontSize: "2.15mm", lineHeight: 1.3, color: INK, opacity: 0.75, fontFamily: FONT_LAB }}>
          {boundaryFooter(boundary)}
        </p>
      </div>
        {patioTools && design.structures
          .filter((s) => s.kind === "patio" && s.patio)
          .map((s) => patioElevationSheet(s))}
      </div>

      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm; }
          /* Print the sheet and nothing else. Everything off the sheet's
             ancestor path is removed outright — display:none frees the space
             it would otherwise reserve — and the path itself is flattened:
             no padding, min-heights or animation transforms left standing.
             (The page-entrance animation keeps a computed transform on main,
             which silently became the containing block for the previous
             position:absolute approach and pushed the sheet down the page —
             blank first page, plan on page two.) */
          body *:not(:has(#site-plan-print)):not(#site-plan-print):not(#site-plan-print *) {
            display: none !important;
          }
          body *:has(#site-plan-print) {
            display: block !important;
            position: static !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
            min-height: 0 !important;
            max-width: none !important;
            background: #fff !important;
            animation: none !important;
            transform: none !important;
            opacity: 1 !important;
          }
          #site-plan-print { display: block !important; }
          /* One sheet per page: each patio's elevations start on a fresh page,
             after the site plan. A single-sheet print (every certifier-portal
             plan, and a studio plan with no configured patio) is unchanged. */
          .cfba-sheet { break-inside: avoid; }
          .cfba-sheet + .cfba-sheet { break-before: page; }
          html, body { background: #fff !important; }
          /* Said twice on purpose. The aerial is a tracing guide on screen and
             nothing more: licensed imagery has no place inside a lodged
             document, and a photograph has no place on a sheet whose whole
             claim is that the figures on it were measured. */
          .cfba-underlay, .cfba-underlay * { display: none !important; }
        }
      `}</style>
    </div>
  );
}
