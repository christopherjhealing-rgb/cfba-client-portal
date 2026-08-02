"use client";
// The site plan canvas. Everything is drawn in real metres — the SVG viewBox
// IS the lot — and annotation sizes come from paper millimetres via the
// chosen scale, so the screen view and the printed A4 sheet are the same
// drawing. Pure geometry lives in lib/site-plan.mjs; this file is state,
// pointers and SVG. The tool measures and labels — it never judges.
import { useEffect, useRef, useState } from "react";
import {
  DRAW_MARGIN_MM, STRUCTURE_PRESETS, alignSnap, boundsOf, clampToLot,
  defaultPlacement, deriveStreet, fitScale, fmtM, fmtM2, footprint,
  isSimplePolygon, mToMmOnPaper, mmOnPaperToM, normalisePts, parseMetres,
  polyBounds, polyFromFootprint, resizeBounds, rotateStructure,
  scaleBarMetres, setbackMarks, setbacks, snap, structureArea,
} from "@/lib/site-plan.mjs";

type Pt = { x: number; y: number };

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
}

interface Design {
  address: string;
  street: string;
  lotW: number;
  lotD: number;
  /** North arrow bearing, degrees clockwise from straight up, steps of 45. */
  north: number;
  structures: Structure[];
}

interface Guide {
  axis: "x" | "y";
  at: number;
  from: number;
  to: number;
}

const BLANK: Design = { address: "", street: "", lotW: 20, lotD: 40, north: 0, structures: [] };

const INK = "#101A15";
const SEAL = "#1E5B3C";
const BRASS = "#B07A18";
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
  { kind: "retaining", name: "Retaining wall", fill: "#2B3A31", dark: true },
  { kind: "lshape", name: "L-shape", fill: "#EBDDD5" },
  { kind: "custom", name: "Custom shape", fill: "#E3DFEA" },
];
const FILL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.kind, k.fill]));

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
          return base;
        })
    : [];
  const north = typeof d.north === "number" && Number.isFinite(d.north)
    ? ((Math.round(d.north / 45) * 45) % 360 + 360) % 360 : 0;
  return {
    address: typeof d.address === "string" ? d.address : "",
    street: typeof d.street === "string" ? d.street : "",
    lotW: dim(d.lotW, BLANK.lotW),
    lotD: dim(d.lotD, BLANK.lotD),
    north,
    structures,
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

export function SitePlanBuilder({ companyId }: { companyId: string }) {
  const [design, setDesign] = useState<Design>(BLANK);
  const [selected, setSelected] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [today, setToday] = useState("");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [draw, setDraw] = useState<{ pts: Pt[]; hint: string } | null>(null);
  const [pxPerM, setPxPerM] = useState(30);
  const keyRef = useRef(designKey(companyId, ""));
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const resizeRef = useRef<{ id: string; handle?: string; vertex?: number } | null>(null);
  /** True once the client has typed their own street name — their word wins
   *  over the derived one until they clear the field again. */
  const streetEditedRef = useRef(false);

  // Restore the last design for this company; date is set client-side only so
  // the server render never disagrees with the browser's timezone.
  useEffect(() => {
    try {
      const last = localStorage.getItem(pointerKey(companyId));
      const raw = last && localStorage.getItem(last);
      if (last && raw) {
        const d = sanitise(JSON.parse(raw));
        setDesign(d);
        streetEditedRef.current = !!(d.street && d.street !== deriveStreet(d.address));
        keyRef.current = last;
      } else {
        keyRef.current = designKey(companyId, "");
      }
    } catch { /* a broken saved design just means a blank sheet */ }
    setLoaded(true);
    setToday(new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }));
  }, [companyId]);

  // Autosave, debounced. Never before the restore has run, or the blank
  // initial state would overwrite the saved plan.
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(keyRef.current, JSON.stringify(design));
        localStorage.setItem(pointerKey(companyId), keyRef.current);
      } catch { /* storage full or blocked — keep drawing */ }
    }, 400);
    return () => clearTimeout(t);
  }, [design, loaded, companyId]);

  /** The address is the document key. Committed on blur; typing a previously
   *  used address onto an empty sheet brings that design back. */
  function commitAddress() {
    const key = designKey(companyId, design.address);
    if (key === keyRef.current) return;
    if (design.structures.length === 0) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const restored = { ...sanitise(JSON.parse(raw)), address: design.address };
          setDesign(restored);
          streetEditedRef.current = !!(restored.street && restored.street !== deriveStreet(restored.address));
        }
      } catch { /* ignore */ }
    }
    keyRef.current = key;
  }

  const { lotW, lotD, north, street } = design;
  const { denom, fits } = fitScale(lotW, lotD);
  const mm = (v: number) => mmOnPaperToM(v, denom);

  // viewBox: the lot plus paper-true annotation margins, all in metres.
  const mL = mm(DRAW_MARGIN_MM.left), mR = mm(DRAW_MARGIN_MM.right);
  const mT = mm(DRAW_MARGIN_MM.top), mB = mm(DRAW_MARGIN_MM.bottom);
  const vbW = lotW + mL + mR, vbH = lotD + mT + mB;
  const viewBox = `${-mL} ${-mT} ${vbW} ${vbH}`;
  const sel = design.structures.find((s) => s.id === selected) ?? null;

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

  function addStructure(preset: (typeof STRUCTURE_PRESETS)[number]) {
    const at = defaultPlacement(preset.w, preset.d, lotW, lotD, design.structures.length);
    pushStructure({
      id: uid(), kind: preset.kind, label: preset.label,
      w: preset.w, d: preset.d, rot: 0, shape: "rect", ...at,
    });
  }

  function addLShape() {
    const w = 6, d = 4;
    const at = defaultPlacement(w, d, lotW, lotD, design.structures.length);
    pushStructure({
      id: uid(), kind: "lshape", label: "L-shape",
      w, d, rot: 0, shape: "lshape", notchW: 3, notchD: 2, ...at,
    });
  }

  const removeSelected = () => {
    if (!sel) return;
    setDesign((prev) => ({ ...prev, structures: prev.structures.filter((s) => s.id !== sel.id) }));
    setSelected(null);
  };

  const rotateSelected = () => {
    if (!sel) return;
    patchStructure(sel.id, rotateStructure(sel, lotW, lotD));
  };

  /** Pointer position in lot metres — the SVG keeps its viewBox aspect, so
   *  one uniform factor maps client px to drawing metres. */
  function toM(e: { clientX: number; clientY: number }) {
    const r = svgRef.current!.getBoundingClientRect();
    const k = vbW / r.width;
    return { x: -mL + (e.clientX - r.left) * k, y: -mT + (e.clientY - r.top) * k };
  }

  // ---- the odd-shape drawing mode -----------------------------------------

  function startDraw() {
    setDraw({ pts: [], hint: "" });
    setSelected(null);
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
      id: uid(), kind: "custom", label: "Custom shape",
      rot: 0, shape: "poly", ...stored,
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (draw) {
      if (e.key === "Escape") { e.preventDefault(); setDraw(null); }
      if (e.key === "Enter") { e.preventDefault(); finishDraw(); }
      return;
    }
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
    if (e.key === "Escape") { setSelected(null); return; }
    if (e.key === "r" || e.key === "R") { e.preventDefault(); rotateSelected(); return; }
    const step = e.shiftKey ? 1 : 0.1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    // Nudging is the precise path — it never magnet-snaps.
    patchStructure(sel.id, { x: snap(sel.x + d[0], 0.01), y: snap(sel.y + d[1], 0.01) });
  }

  // ---- drawing ------------------------------------------------------------

  const halo = { paintOrder: "stroke" as const, stroke: "#fff", strokeWidth: mm(0.7), strokeLinejoin: "round" as const };

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

  function setbackLines(s: Structure) {
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

  function structureNode(s: Structure, interactive: boolean) {
    const isSel = interactive && s.id === selected;
    const dark = s.kind === "retaining";
    const b = boundsOf(s);
    const thin = b.d < mm(9);
    const cx = s.x + b.w / 2;
    const labelY = thin ? s.y - mm(4.4) : s.y + b.d / 2 - mm(0.8);
    const dimsY = thin ? s.y - mm(1.4) : s.y + b.d / 2 + mm(2.8);
    const stroke = isSel ? BRASS : dark ? "#12332A" : SEAL;
    const strokeW = isSel ? mm(0.55) : mm(0.35);
    const fill = FILL[s.kind] || "#E7F0EA";
    const marg = mm(1.1);
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
        {s.shape === "rect" ? (
          <rect x={s.x} y={s.y} width={b.w} height={b.d}
            rx={s.kind === "pool" ? Math.min(b.w, b.d) * 0.18 : 0}
            fill={fill} stroke={stroke} strokeWidth={strokeW} />
        ) : (
          <polygon points={footprint(s).map((p) => `${p.x},${p.y}`).join(" ")}
            fill={fill} stroke={stroke} strokeWidth={strokeW} strokeLinejoin="round" />
        )}
        {isSel && (
          <rect x={s.x - marg} y={s.y - marg} width={b.w + marg * 2} height={b.d + marg * 2}
            fill="none" stroke={BRASS} strokeWidth={mm(0.25)}
            strokeDasharray={`${mm(1.2)} ${mm(0.9)}`} pointerEvents="none" />
        )}
        <text x={cx} y={labelY} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(2.9)} fill={INK} style={halo}>
          {s.label}
        </text>
        <text x={cx} y={dimsY} textAnchor="middle" fontFamily={FONT_NUM}
          fontSize={mm(2.5)} fill={INK} fillOpacity={0.75} style={halo}>
          {s.shape === "poly" ? `${fmtM(structureArea(s))} m²` : `${fmtM(s.w)} × ${fmtM(s.d)} m`}
        </text>
        {isSel && !draw && handleNodes(s)}
      </g>
    );
  }

  /** The legend: one row per structure type actually on the plan, in a
   *  quiet box tucked into the top-right of the lot on screen and on the
   *  printed sheet alike. */
  function legendBox() {
    const present = KINDS.filter((k) => design.structures.some((s) => s.kind === k.kind));
    if (present.length === 0) return null;
    const row = mm(4.2), pad = mm(1.8), sw = mm(3);
    const boxW = mm(27);
    const boxH = pad * 2 + row * present.length - mm(1);
    const bx = Math.max(mm(1), lotW - boxW - mm(1.5));
    const by = mm(1.5);
    return (
      <g pointerEvents="none">
        <rect x={bx} y={by} width={boxW} height={boxH} fill="#FFFFFF" fillOpacity={0.92}
          stroke={INK} strokeOpacity={0.35} strokeWidth={mm(0.2)} />
        {present.map((k, i) => {
          const y = by + pad + row * i;
          return (
            <g key={k.kind}>
              <rect x={bx + pad} y={y} width={sw} height={mm(2.6)} rx={mm(0.3)}
                fill={k.fill} stroke={k.dark ? "none" : SEAL} strokeOpacity={0.45} strokeWidth={mm(0.15)} />
              <text x={bx + pad + sw + mm(1.5)} y={y + mm(2.2)} fontFamily={FONT_LAB}
                fontSize={mm(2.3)} fill={INK} fillOpacity={0.8}>
                {k.name}
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

  function plan(interactive: boolean) {
    return (
      <>
        {/* street along the bottom edge */}
        <rect x={-mL} y={lotD} width={vbW} height={mB} fill="#E9ECE6" />
        <text x={lotW / 2} y={lotD + mm(11.8)} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(3.2)} letterSpacing={mm(0.5)} fill={INK} fillOpacity={0.55}>
          {(street.trim() || "Street").toUpperCase()}
        </text>
        {/* the lot */}
        <rect x={0} y={0} width={lotW} height={lotD} fill="#FFFFFF" stroke={INK} strokeWidth={mm(0.5)} />
        {dimTexts()}
        {sel && setbackLines(sel)}
        {design.structures.map((s) => structureNode(s, interactive && !draw))}
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
        {legendBox()}
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

  return (
    <div>
      {/* lot setup */}
      <div className="card mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <label className="label">Site address</label>
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
            <label className="label">Street name (frontage)</label>
            <input className="field" value={street} placeholder="e.g. Wandoo Rise"
              onChange={(e) => {
                const v = e.target.value;
                streetEditedRef.current = v.trim() !== "";
                setDesign((p) => ({ ...p, street: v }));
              }}
              onBlur={() => {
                // Cleared by hand: fall back to deriving from the address.
                if (!street.trim()) {
                  streetEditedRef.current = false;
                  setDesign((p) => ({ ...p, street: deriveStreet(p.address) }));
                }
              }} />
          </div>
          <MetresField label="Lot width (m)" value={lotW} onCommit={(n) => setLot({ lotW: n })} />
          <MetresField label="Lot depth (m)" value={lotD} onCommit={(n) => setLot({ lotD: n })} />
        </div>
        <p className="mt-2.5 text-[12.5px] text-ink/50">
          Lots stay rectangular in this version, street frontage along the
          bottom — structures can be rectangles, L-shapes, or any outline you
          draw. The street name fills itself from the address; type over it if
          your frontage is a different street. Your design saves automatically
          in this browser, per address.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[290px,minmax(0,1fr)]">
        {/* toolbox + selected structure */}
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Add a structure</h2>
            <div className="grid grid-cols-2 gap-2">
              {STRUCTURE_PRESETS.map((p) => (
                <button key={p.kind} type="button" onClick={() => addStructure(p)}
                  className="rounded-md border border-rule bg-white px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash">
                  <span className="block text-[13.5px] font-medium">{p.label}</span>
                  <span className="block font-mono text-[11px] text-ink/45">{fmtM(p.w)} × {fmtM(p.d)} m</span>
                </button>
              ))}
              <button type="button" onClick={addLShape}
                className="rounded-md border border-rule bg-white px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash">
                <span className="block text-[13.5px] font-medium">L-shape</span>
                <span className="block font-mono text-[11px] text-ink/45">6 × 4 m, notched</span>
              </button>
              <button type="button" onClick={startDraw}
                className={`rounded-md border px-3 py-2 text-left transition hover:border-seal/50 hover:bg-wash ${draw ? "border-seal bg-wash" : "border-rule bg-white"}`}>
                <span className="block text-[13.5px] font-medium">Odd shape</span>
                <span className="block font-mono text-[11px] text-ink/45">tap its corners</span>
              </button>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Selected structure</h2>
            {sel ? (
              <div className="space-y-3">
                <div>
                  <label className="label">Label</label>
                  <input className="field" value={sel.label}
                    onChange={(e) => patchStructure(sel.id, { label: e.target.value })} />
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
                    <MetresField label="Notch width (m)" value={sel.notchW ?? sel.w / 2}
                      onCommit={(n) => patchStructure(sel.id, { notchW: n })} />
                    <MetresField label="Notch depth (m)" value={sel.notchD ?? sel.d / 2}
                      onCommit={(n) => patchStructure(sel.id, { notchD: n })} />
                  </div>
                )}
                <div className="flex justify-between font-mono text-[12.5px] text-ink/75">
                  <span className="text-ink/50">Footprint area</span>
                  <span>{fmtM(structureArea(sel))} m²</span>
                </div>
                <div>
                  <span className="label">Distance to boundaries</span>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[12.5px] text-ink/75">
                    {Object.entries(setbacks(sel, lotW, lotD)).map(([side, v]) => (
                      <div key={side} className="flex justify-between gap-2">
                        <dt className="capitalize text-ink/50">{side === "front" ? "front (street)" : side}</dt>
                        <dd>{fmtM2(v)} m</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <button type="button" onClick={rotateSelected} className="btn-ghost w-full">
                  Rotate 90°{sel.rot ? ` — at ${sel.rot}°` : ""}
                </button>
                <button type="button" onClick={removeSelected}
                  className="btn-ghost w-full !text-flag hover:!border-flag/40">
                  Remove structure
                </button>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink/55">
                Tap a structure on the plan to select it — drag to move (edges
                pull in line with neighbours; hold Alt to drag free), drag the
                square handles to resize, R to rotate, arrow keys to nudge
                (hold Shift for 1&nbsp;m steps), Delete to remove.
              </p>
            )}
          </div>

          <div className="card p-4">
            <h2 className="sectionhead !mb-2">Sheet</h2>
            <div className="space-y-2">
              <button type="button" className="btn-ghost w-full"
                onClick={() => setDesign((p) => ({ ...p, north: (p.north + 45) % 360 }))}>
                Rotate north — {north}°
              </button>
              <button type="button" className="btn w-full" onClick={() => window.print()}>
                Print / save as PDF
              </button>
              <button type="button" className="btn-ghost w-full"
                onClick={() => {
                  if (window.confirm("Clear every structure and start this plan again?")) {
                    setDesign((p) => ({ ...p, structures: [], north: 0 }));
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
            </p>
          </div>
        </div>

        {/* the canvas */}
        <div className="card p-4">
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
          <div ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Site plan drawing area"
            className="mx-auto select-none rounded-md" style={{ maxWidth: `${maxCanvasPx}px` }}>
            <svg ref={svgRef} viewBox={viewBox} role="img" aria-label="Site plan"
              style={{
                width: "100%", height: "auto", aspectRatio: `${vbW} / ${vbH}`,
                display: "block", touchAction: "none",
                cursor: draw ? "crosshair" : undefined,
              }}
              onPointerDown={(e) => {
                if (draw) { addDrawPoint(e); return; }
                setSelected(null);
              }}>
              {plan(true)}
            </svg>
          </div>
          <p className="mt-2 text-center text-[12px] text-ink/50">
            Select the proposed structure before printing to include its boundary distances on the sheet.
          </p>
        </div>
      </div>

      {/* The A4 sheet. Hidden on screen; the print stylesheet below shows this
          and nothing else. Sized in real millimetres so the stated scale is
          true on paper (print at 100%). */}
      <div id="site-plan-sheet" className="hidden">
        <svg viewBox={viewBox} aria-hidden="true"
          style={{ width: `${sheetWmm.toFixed(2)}mm`, height: `${sheetHmm.toFixed(2)}mm`, display: "block", margin: "0 auto" }}>
          {plan(false)}
        </svg>
        <div style={{ marginTop: "4mm", border: "0.5mm solid #2B3A31", color: INK, fontFamily: FONT_LAB }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "4mm", padding: "2.5mm 3.5mm", borderBottom: "0.3mm solid #2B3A31" }}>
            <span style={{ fontSize: "2.8mm", fontWeight: 700, letterSpacing: "0.5mm", textTransform: "uppercase", color: SEAL }}>Site plan</span>
            <strong style={{ fontSize: "4mm", fontWeight: 600 }}>{design.address.trim() || "Site address not entered"}</strong>
          </div>
          <div style={{ display: "flex" }}>
            {[
              ["Lot", `${fmtM(lotW)} m × ${fmtM(lotD)} m`],
              ["Street frontage", street.trim() || "—"],
              ["Scale", fits ? `1:${denom} (A4)` : "Reduced to fit A4 — use the scale bar"],
              ["Date", today],
            ].map(([k, v], i) => (
              <div key={k} style={{ flex: 1, padding: "2mm 3.5mm", borderLeft: i ? "0.3mm solid #2B3A31" : "none" }}>
                <div style={{ fontSize: "2.3mm", textTransform: "uppercase", letterSpacing: "0.4mm", opacity: 0.55 }}>{k}</div>
                <div style={{ fontSize: "3.2mm", fontFamily: FONT_NUM }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <p style={{ marginTop: "3mm", fontSize: "2.6mm", lineHeight: 1.5, color: INK, opacity: 0.75, fontFamily: FONT_LAB }}>
          Prepared by the applicant using the CFBA plan tool — boundaries and
          dimensions as entered by the applicant. Not a certified document.
        </p>
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
          body *:not(:has(#site-plan-sheet)):not(#site-plan-sheet):not(#site-plan-sheet *) {
            display: none !important;
          }
          body *:has(#site-plan-sheet) {
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
          #site-plan-sheet { display: block !important; }
          html, body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
