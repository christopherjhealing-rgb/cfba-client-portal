"use client";
// The site plan canvas. Everything is drawn in real metres — the SVG viewBox
// IS the lot — and annotation sizes come from paper millimetres via the
// chosen scale, so the screen view and the printed A4 sheet are the same
// drawing. Pure geometry lives in lib/site-plan.mjs; this file is state,
// pointers and SVG. The tool measures and labels — it never judges.
import { useEffect, useRef, useState } from "react";
import {
  DRAW_MARGIN_MM, STRUCTURE_PRESETS, clampToLot, defaultPlacement, fitScale,
  fmtM, fmtM2, mToMmOnPaper, mmOnPaperToM, parseMetres, scaleBarMetres,
  setbacks, snap,
} from "@/lib/site-plan.mjs";

interface Structure {
  id: string;
  kind: string;
  label: string;
  w: number;
  d: number;
  x: number;
  y: number;
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

const BLANK: Design = { address: "", street: "", lotW: 20, lotD: 40, north: 0, structures: [] };

const INK = "#101A15";
const SEAL = "#1E5B3C";
const BRASS = "#B07A18";
const FONT_LAB = "Inter, system-ui, sans-serif";
const FONT_NUM = "'IBM Plex Mono', ui-monospace, monospace";

const FILL: Record<string, string> = {
  dwelling: "#E7F0EA", patio: "#F0F4EE", shed: "#E7F0EA", pool: "#DCEDE9",
  carport: "#F0F4EE", retaining: "#2B3A31",
};

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
        .map((s) => ({
          id: typeof s.id === "string" ? s.id : uid(),
          kind: typeof s.kind === "string" ? s.kind : "shed",
          label: typeof s.label === "string" ? s.label : "Structure",
          w: dim(s.w, 3), d: dim(s.d, 3), x: pos(s.x), y: pos(s.y),
        }))
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
  const keyRef = useRef(designKey(companyId, ""));
  const svgRef = useRef<SVGSVGElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);

  // Restore the last design for this company; date is set client-side only so
  // the server render never disagrees with the browser's timezone.
  useEffect(() => {
    try {
      const last = localStorage.getItem(pointerKey(companyId));
      const raw = last && localStorage.getItem(last);
      if (last && raw) {
        setDesign(sanitise(JSON.parse(raw)));
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
        if (raw) setDesign({ ...sanitise(JSON.parse(raw)), address: design.address });
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

  const patchStructure = (id: string, patch: Partial<Structure>) =>
    setDesign((prev) => ({
      ...prev,
      structures: prev.structures.map((s) => {
        if (s.id !== id) return s;
        const n = { ...s, ...patch };
        return { ...n, ...clampToLot(n.x, n.y, n.w, n.d, prev.lotW, prev.lotD) };
      }),
    }));

  const setLot = (patch: Partial<Pick<Design, "lotW" | "lotD">>) =>
    setDesign((prev) => {
      const lot = { lotW: prev.lotW, lotD: prev.lotD, ...patch };
      return {
        ...prev, ...lot,
        structures: prev.structures.map((s) => ({
          ...s, ...clampToLot(s.x, s.y, s.w, s.d, lot.lotW, lot.lotD),
        })),
      };
    });

  function addStructure(preset: (typeof STRUCTURE_PRESETS)[number]) {
    const at = defaultPlacement(preset.w, preset.d, lotW, lotD, design.structures.length);
    const s: Structure = { id: uid(), kind: preset.kind, label: preset.label, w: preset.w, d: preset.d, ...at };
    setDesign((prev) => ({ ...prev, structures: [...prev.structures, s] }));
    setSelected(s.id);
    canvasRef.current?.focus({ preventScroll: true });
  }

  const removeSelected = () => {
    if (!sel) return;
    setDesign((prev) => ({ ...prev, structures: prev.structures.filter((s) => s.id !== sel.id) }));
    setSelected(null);
  };

  /** Pointer position in lot metres — the SVG keeps its viewBox aspect, so
   *  one uniform factor maps client px to drawing metres. */
  function toM(e: { clientX: number; clientY: number }) {
    const r = svgRef.current!.getBoundingClientRect();
    const k = vbW / r.width;
    return { x: -mL + (e.clientX - r.left) * k, y: -mT + (e.clientY - r.top) * k };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!sel) return;
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSelected(); return; }
    if (e.key === "Escape") { setSelected(null); return; }
    const step = e.shiftKey ? 1 : 0.1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
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
    const sb = setbacks(s, lotW, lotD);
    const cx = s.x + s.w / 2, cy = s.y + s.d / 2;
    const runs: { x1: number; y1: number; x2: number; y2: number; v: number; tx: number; ty: number }[] = [
      { x1: cx, y1: s.y, x2: cx, y2: 0, v: sb.rear, tx: cx + mm(1.2), ty: s.y / 2 },
      { x1: cx, y1: s.y + s.d, x2: cx, y2: lotD, v: sb.front, tx: cx + mm(1.2), ty: (s.y + s.d + lotD) / 2 },
      { x1: s.x, y1: cy, x2: 0, y2: cy, v: sb.left, tx: s.x / 2, ty: cy - mm(1.4) },
      { x1: s.x + s.w, y1: cy, x2: lotW, y2: cy, v: sb.right, tx: (s.x + s.w + lotW) / 2, ty: cy - mm(1.4) },
    ];
    return (
      <g>
        {runs.filter((r) => r.v > 0.004).map((r, i) => (
          <g key={i}>
            <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={BRASS}
              strokeWidth={mm(0.3)} strokeDasharray={`${mm(1.8)} ${mm(1.2)}`} />
            <text x={r.tx} y={r.ty} textAnchor={i < 2 ? "start" : "middle"}
              fontFamily={FONT_NUM} fontSize={mm(2.6)} fill={BRASS} style={halo}>
              {fmtM2(r.v)} m
            </text>
          </g>
        ))}
      </g>
    );
  }

  function structureNode(s: Structure, interactive: boolean) {
    const isSel = interactive && s.id === selected;
    const dark = s.kind === "retaining";
    const thin = s.d < mm(9);
    const cx = s.x + s.w / 2;
    const labelY = thin ? s.y - mm(4.4) : s.y + s.d / 2 - mm(0.8);
    const dimsY = thin ? s.y - mm(1.4) : s.y + s.d / 2 + mm(2.8);
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
          patchStructure(s.id, { x: snap(p.x - drag.dx, 0.05), y: snap(p.y - drag.dy, 0.05) });
        } : undefined}
        onPointerUp={interactive ? () => { dragRef.current = null; } : undefined}
        onPointerCancel={interactive ? () => { dragRef.current = null; } : undefined}
      >
        <rect x={s.x} y={s.y} width={s.w} height={s.d}
          rx={s.kind === "pool" ? Math.min(s.w, s.d) * 0.18 : 0}
          fill={isSel && !dark ? "#F6EEDA" : FILL[s.kind] || "#E7F0EA"}
          stroke={isSel ? BRASS : dark ? "#12332A" : SEAL}
          strokeWidth={isSel ? mm(0.55) : mm(0.35)} />
        <text x={cx} y={labelY} textAnchor="middle" fontFamily={FONT_LAB}
          fontWeight={600} fontSize={mm(2.9)} fill={INK} style={halo}>
          {s.label}
        </text>
        <text x={cx} y={dimsY} textAnchor="middle" fontFamily={FONT_NUM}
          fontSize={mm(2.5)} fill={INK} fillOpacity={0.75} style={halo}>
          {fmtM(s.w)} × {fmtM(s.d)} m
        </text>
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
        {design.structures.map((s) => structureNode(s, interactive))}
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
              onChange={(e) => setDesign((p) => ({ ...p, address: e.target.value }))}
              onBlur={commitAddress}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
          </div>
          <div>
            <label className="label">Street name (frontage)</label>
            <input className="field" value={street} placeholder="e.g. Wandoo Rise"
              onChange={(e) => setDesign((p) => ({ ...p, street: e.target.value }))} />
          </div>
          <MetresField label="Lot width (m)" value={lotW} onCommit={(n) => setLot({ lotW: n })} />
          <MetresField label="Lot depth (m)" value={lotD} onCommit={(n) => setLot({ lotD: n })} />
        </div>
        <p className="mt-2.5 text-[12.5px] text-ink/50">
          Rectangular lots in this early version, street frontage along the bottom.
          Your design saves automatically in this browser, per address.
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
                <div className="grid grid-cols-2 gap-2">
                  <MetresField label="Width (m)" value={sel.w} onCommit={(n) => patchStructure(sel.id, { w: n })} />
                  <MetresField label="Depth (m)" value={sel.d} onCommit={(n) => patchStructure(sel.id, { d: n })} />
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
                <button type="button" onClick={removeSelected}
                  className="btn-ghost w-full !text-flag hover:!border-flag/40">
                  Remove structure
                </button>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-ink/55">
                Tap a structure on the plan to select it — drag to move, arrow
                keys to nudge (hold Shift for 1&nbsp;m steps), Delete to remove.
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
          <div ref={canvasRef} tabIndex={0} onKeyDown={onKeyDown} aria-label="Site plan drawing area"
            className="mx-auto select-none rounded-md" style={{ maxWidth: `${maxCanvasPx}px` }}>
            <svg ref={svgRef} viewBox={viewBox} role="img" aria-label="Site plan"
              style={{ width: "100%", height: "auto", aspectRatio: `${vbW} / ${vbH}`, display: "block", touchAction: "none" }}
              onPointerDown={() => setSelected(null)}>
              {plan(true)}
            </svg>
          </div>
          <p className="mt-2 text-center text-[12px] text-ink/40">
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
          body * { visibility: hidden !important; }
          #site-plan-sheet, #site-plan-sheet * { visibility: visible !important; }
          #site-plan-sheet {
            display: block !important;
            position: absolute; left: 0; top: 0; width: 100%;
          }
          body { background: #fff !important; }
        }
      `}</style>
    </div>
  );
}
