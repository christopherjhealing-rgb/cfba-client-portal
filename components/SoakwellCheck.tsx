"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import {
  SOAKWELLS, RATE_M3_PER_M2, RATE_MM_RETAINED,
  SOAKWELL_SOURCE, SOAKWELL_CAVEAT, SOAKWELL_SOIL_NOTE, SOAKWELL_SITE_PLAN,
  sizeNew, sizeExisting, sizeKey, sizeLabel, findSize,
  type SoakwellOption, type WellCount,
} from "@/lib/soakwell.mjs";

type Mode = "new" | "existing";

/**
 * Soakwell sizing, in the two shapes people actually arrive with.
 *
 * "New" is a structure going onto a lot with nothing to count — a patio, a
 * shed, a new house. "Existing" is the harder and more common one: an addition
 * to a lot that already has wells, where the council sizes storage against the
 * *whole* roof rather than the new part of it. Doing that second sum in your
 * head is where the mistake goes in, and it's a mistake that only shows up
 * when the plan comes back.
 *
 * Nothing appears until there's an area to work from. A calculator that shows
 * a volume while you're still typing is a calculator somebody screenshots
 * halfway through.
 */
export function SoakwellCheck() {
  const [mode, setMode] = useState<Mode>("new");

  // New work
  const [roof, setRoof] = useState("");
  const [paved, setPaved] = useState("");

  // Existing lot
  const [existingRoof, setExistingRoof] = useState("");
  const [proposedRoof, setProposedRoof] = useState("");
  const [existingPaved, setExistingPaved] = useState("");
  const [wells, setWells] = useState<{ key: string; count: number }[]>([]);

  const newResult = useMemo(
    () => sizeNew({ roofM2: n(roof), pavedM2: n(paved) }),
    [roof, paved]
  );

  const existingResult = useMemo(
    () => sizeExisting({
      existingRoofM2: n(existingRoof),
      proposedRoofM2: n(proposedRoof),
      pavedM2: n(existingPaved),
      existingWells: wells as WellCount[],
    }),
    [existingRoof, proposedRoof, existingPaved, wells]
  );

  function addWell(key: string) {
    if (!key) return;
    setWells((w) => {
      const at = w.findIndex((x) => x.key === key);
      if (at < 0) return [...w, { key, count: 1 }];
      return w.map((x, i) => (i === at ? { ...x, count: x.count + 1 } : x));
    });
  }

  function setCount(key: string, count: number) {
    setWells((w) =>
      count <= 0 ? w.filter((x) => x.key !== key)
                 : w.map((x) => (x.key === key ? { ...x, count } : x)));
  }

  function reset() {
    setRoof(""); setPaved("");
    setExistingRoof(""); setProposedRoof(""); setExistingPaved("");
    setWells([]);
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-seal"><Icon name="alert" size={16} /></span>
        <h2 className="font-display text-[15px] font-semibold">
          How much soakwell do I need?
        </h2>
      </div>
      <p className="mb-4 max-w-2xl text-[13.5px] leading-relaxed text-ink/65">
        Every square metre of new roof or paving has to hold its own stormwater
        on the lot. The rule is one multiplication —{" "}
        <span className="font-mono text-[12.5px]">area × {RATE_M3_PER_M2}</span>{" "}
        — then round <em>up</em> to the next standard well.
      </p>

      {/* Which question is being asked. These are different sums, not the same
          sum with an extra field, so they're a choice rather than a tick. */}
      <div className="mb-5 flex flex-wrap gap-2">
        <ModeTab on={mode === "new"} onClick={() => setMode("new")}
          title="New soakwells"
          sub="Nothing existing to count" />
        <ModeTab on={mode === "existing"} onClick={() => setMode("existing")}
          title="There are already soakwells"
          sub="Adding to a lot that has them" />
      </div>

      {mode === "new" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Area label="Proposed roof area" hint="The new structure only — patio, shed, extension."
              value={roof} onChange={setRoof} />
            <Area label="Paving that drains to it" hint="Optional. New hardstand going to the same wells."
              value={paved} onChange={setPaved} />
          </div>

          <Answer>
            {!newResult.ok ? (
              <Waiting>Put in the roof area and the sizing appears here.</Waiting>
            ) : (
              <>
                <Working rows={[
                  ["Area draining to the wells", `${fmt(newResult.area)} m²`],
                  [`× ${RATE_M3_PER_M2} (${RATE_MM_RETAINED} mm retained)`, ""],
                ]} />
                <Required volume={newResult.required} />
                <Options best={newResult.best} all={newResult.options} />
              </>
            )}
          </Answer>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Area label="Existing roof area" hint="What's already on the lot."
              value={existingRoof} onChange={setExistingRoof} />
            <Area label="Proposed roof area" hint="What you're adding."
              value={proposedRoof} onChange={setProposedRoof} />
            {/* Which side of the sum paving lands on doesn't change the total —
                the council sizes the whole catchment — but the breakdown shows
                it with the proposed area, so the hint says so. */}
            <Area label="Paving" hint="Optional. Counted with the proposed area."
              value={existingPaved} onChange={setExistingPaved} />
          </div>

          {/* The council sizes the whole catchment, and this is the sentence
              that stops somebody sizing only the new patio. */}
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink/55">
            Both, not just the new part — the council sizes storage against the
            whole roof, so an addition can reveal the house was never covered
            either.
          </p>

          <div className="mt-5">
            <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
              Soakwells already in the ground
            </span>
            <p className="mt-1 text-[12.5px] text-ink/50">
              Diameter × depth in millimetres. Add one for each size on the lot,
              then set how many of them there are.
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                className="field w-auto text-[13px]"
                value=""
                aria-label="Add an existing soakwell size"
                onChange={(e) => { addWell(e.target.value); e.target.value = ""; }}>
                <option value="">Add a size…</option>
                {SOAKWELLS.map((s) => (
                  <option key={sizeKey(s)} value={sizeKey(s)}>
                    {sizeLabel(s)} — {s.capacity} m³
                  </option>
                ))}
              </select>
              {wells.length > 0 && (
                <button type="button" className="btn-ghost" onClick={() => setWells([])}>
                  Clear
                </button>
              )}
            </div>

            {wells.length > 0 && (
              <ul className="mt-3 divide-y divide-rule rounded-md border border-rule">
                {wells.map((w) => {
                  const s = findSize(w.key);
                  if (!s) return null;
                  return (
                    <li key={w.key} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5">
                      <span className="text-[13.5px]">
                        <strong>{sizeLabel(s)}</strong>
                        <span className="ml-2 text-ink/55">{s.capacity} m³ each</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <button type="button" className="btn-ghost px-2.5 py-1"
                          aria-label={`One fewer ${sizeLabel(s)}`}
                          onClick={() => setCount(w.key, w.count - 1)}>−</button>
                        <span className="w-6 text-center font-mono text-[13px]">{w.count}</span>
                        <button type="button" className="btn-ghost px-2.5 py-1"
                          aria-label={`One more ${sizeLabel(s)}`}
                          onClick={() => setCount(w.key, w.count + 1)}>+</button>
                        <span className="ml-1 w-16 text-right font-mono text-[12.5px] text-ink/55">
                          {fmt(round2(s.capacity * w.count))} m³
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <Answer>
            {!existingResult.ok ? (
              <Waiting>
                Put in the existing and proposed roof areas and the answer appears here.
              </Waiting>
            ) : (
              <>
                <Working rows={[
                  ["Existing roof", `${fmt(existingResult.existingArea)} m²`],
                  ["Proposed roof and paving", `+ ${fmt(existingResult.proposedArea)} m²`],
                  ["Total draining to the wells", `${fmt(existingResult.area)} m²`],
                  [`× ${RATE_M3_PER_M2} (${RATE_MM_RETAINED} mm retained)`, ""],
                ]} />
                <Required volume={existingResult.required} />

                <dl className="mt-3 grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
                  <Line term="Already in the ground" val={`${fmt(existingResult.have)} m³`} />
                  <Line term={existingResult.covered ? "Spare" : "Short by"}
                    val={`${fmt(existingResult.covered ? existingResult.spare : existingResult.shortfall)} m³`}
                    strong={!existingResult.covered} />
                </dl>

                {existingResult.covered ? (
                  <div className="mt-4 rounded-sm border-l-[3px] border-seal bg-[#EDF3EE] px-4 py-3">
                    <p className="text-[13.5px] font-medium text-ink">
                      The existing soakwells cover the whole roof.
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
                      {existingResult.spare < 0.2
                        ? "Only just — with less than 0.2 m³ to spare it's worth checking the existing wells are sound and not silted up before relying on them."
                        : "Nothing new needed on these numbers. They still have to be shown on the site plan with the downpipes that feed them."}
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="mt-4 text-[13px] text-ink/70">
                      <strong>{fmt(existingResult.shortfall)} m³</strong> short — add:
                    </p>
                    <Options best={existingResult.best} all={existingResult.options} bare />
                  </>
                )}
              </>
            )}
          </Answer>
        </>
      )}

      {/* What the number doesn't tell you. Both of these change the answer from
          "buy these wells" to "this needs a different solution", so they sit
          with the result rather than in a footnote. */}
      <div className="mt-5 rounded-md border border-rule bg-wash px-4 py-3">
        <p className="text-[13px] font-medium text-ink/80">Before you dig</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink/65">{SOAKWELL_SOIL_NOTE}</p>
        <ul className="mt-2 space-y-1">
          {SOAKWELL_SITE_PLAN.map((line) => (
            <li key={line} className="relative pl-4 text-[12.5px] leading-relaxed text-ink/65">
              <span className="absolute left-0 top-0 text-ink/35">·</span>{line}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[12.5px] text-ink/55">
          The detail is in{" "}
          <a href="/info-sheets" className="text-seal underline">
            guidance note 11 — Stormwater &amp; Soak Wells
          </a>.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3">
        <p className="max-w-3xl text-[12px] leading-relaxed text-ink/45">
          {SOAKWELL_SOURCE} {SOAKWELL_CAVEAT}
        </p>
        <button type="button" onClick={reset} className="btn-ghost shrink-0">Start Again</button>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function ModeTab({
  on, onClick, title, sub,
}: { on: boolean; onClick: () => void; title: string; sub: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={`flex-1 rounded-md border px-3.5 py-2.5 text-left transition ${
        on ? "border-seal bg-[#EDF3EE] text-seal" : "border-rule bg-white text-ink/70 hover:border-seal/50"}`}>
      <span className="block text-[13.5px] font-medium">{title}</span>
      <span className="block text-[12px] text-ink/50">{sub}</span>
    </button>
  );
}

/** A square-metre field. Numeric, but typed as text so a half-entered "12." on
 *  a phone keypad doesn't get eaten mid-keystroke. */
function Area({
  label, hint, value, onChange,
}: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2">
        <input
          type="text" inputMode="decimal" value={value}
          placeholder="0"
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
          className="field w-full font-mono" />
        <span className="shrink-0 text-[13px] text-ink/55">m²</span>
      </span>
      <span className="mt-1 block text-[12px] text-ink/50">{hint}</span>
    </label>
  );
}

function Answer({ children }: { children: React.ReactNode }) {
  return <div className="mt-5 border-t border-rule pt-4">{children}</div>;
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink/50">{children}</p>;
}

/** The sum, shown rather than asserted — the reason anybody trusts the number
 *  at the bottom is that they can follow how it got there. */
function Working({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2">
      {rows.map(([term, val]) => <Line key={term} term={term} val={val} />)}
    </dl>
  );
}

function Line({
  term, val, strong,
}: { term: string; val: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-0.5">
      <dt className="text-ink/60">{term}</dt>
      <dd className={`font-mono ${strong ? "font-semibold text-flag" : "text-ink/80"}`}>{val}</dd>
    </div>
  );
}

function Required({ volume }: { volume: number }) {
  return (
    <p className="mt-3 flex flex-wrap items-baseline gap-3">
      <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/55">
        Storage required
      </span>
      <span className="font-display text-[30px] font-semibold leading-none text-seal">
        {fmt(volume)} m³
      </span>
      <span className="text-[13px] text-ink/55">{Math.round(volume * 1000)} litres</span>
    </p>
  );
}

/**
 * What to buy.
 *
 * The lead option is the fewest wells with the least waste; the rest are there
 * because the yard has what the yard has. Every one of them holds at least the
 * required volume — that's the sheet's "always round up" rule, applied by the
 * module rather than left as advice.
 */
function Options({
  best, all, bare,
}: { best: SoakwellOption | null; all: SoakwellOption[]; bare?: boolean }) {
  const [more, setMore] = useState(false);
  if (!best) {
    return (
      <div className="mt-3 rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-4 py-3">
        <p className="text-[13.5px] font-medium text-ink">
          That&apos;s past what standard soakwells will do.
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
          A catchment this size needs designed storage rather than a count of
          precast wells. Send us the job and we&apos;ll get engineering onto it.
        </p>
      </div>
    );
  }
  const rest = all.filter((o) => o !== best).slice(0, 6);
  return (
    <div className={bare ? "mt-2" : "mt-4"}>
      <div className="rounded-md border border-seal/40 bg-[#EDF3EE] px-4 py-3">
        <p className="font-display text-[19px] font-semibold text-seal">{best.label}</p>
        <p className="mt-0.5 text-[12.5px] text-ink/65">
          {fmt(best.total)} m³ total
          {best.excess > 0 && <> — {fmt(best.excess)} m³ more than needed</>}
        </p>
      </div>

      {rest.length > 0 && (
        <>
          <button type="button" onClick={() => setMore((m) => !m)}
            className="mt-2 text-[13px] text-seal underline">
            {more ? "Hide the alternatives" : "Other combinations that work"}
          </button>
          {more && (
            <ul className="mt-2 divide-y divide-rule rounded-md border border-rule">
              {rest.map((o) => (
                <li key={sizeKey(o.size) + o.count}
                  className="flex items-baseline justify-between gap-3 px-3.5 py-2">
                  <span className="text-[13px]">{o.label}</span>
                  <span className="font-mono text-[12.5px] text-ink/55">{fmt(o.total)} m³</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const n = (v: string) => {
  const x = parseFloat(v);
  return Number.isFinite(x) && x > 0 ? x : 0;
};

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Two decimals, but only when there are any — "2 m³" reads better than
 *  "2.00 m³" on a screen a builder is reading on site. */
const fmt = (x: number) => String(round2(x));
