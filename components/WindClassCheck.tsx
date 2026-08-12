"use client";
import { useMemo, useState } from "react";
import { Icon } from "./Icon";
import {
  REGIONS, TERRAIN, SHIELDING, TOPOGRAPHY,
  SLOPE_BANDS, LANDFORMS, POSITIONS,
  VEGETATION_NOT_SHIELDING, MAX_LANDFORM_HEIGHT_M,
  WIND_SOURCE, WIND_CAVEAT, WIND_REGULATOR_NOTE, REGION_MAP_LINKS,
  windClass, topographicClass,
} from "@/lib/wind.mjs";

type Opt = { key: string; label: string; short?: string; detail?: string; note?: string };

/**
 * Wind classification to AS 4055, from the four things that decide it.
 *
 * Deliberately shows nothing until all four are answered. A tool that displays
 * a class while you're still filling it in is a tool somebody screenshots
 * halfway through, and a wind class is a structural input — the wrong one on a
 * patio is a patio that doesn't hold.
 */
export function WindClassCheck() {
  const [region, setRegion] = useState("");
  const [terrain, setTerrain] = useState("");
  const [shielding, setShielding] = useState("");
  const [topography, setTopography] = useState("");

  // The optional landform helper, for anyone who doesn't know their T class.
  const [helper, setHelper] = useState(false);
  const [landform, setLandform] = useState("");
  const [slope, setSlope] = useState("");
  const [position, setPosition] = useState("");

  const derived = useMemo(
    () => topographicClass({ landform, slope, position }),
    [landform, slope, position]
  );

  const result = useMemo(
    () => windClass({ region, terrain, topography, shielding }),
    [region, terrain, topography, shielding]
  );

  const answered = !!(region && terrain && shielding && topography);
  const cyclonicRegion = VEGETATION_NOT_SHIELDING.includes(region);

  function useDerived() {
    if (derived.ok) { setTopography(derived.topography); setHelper(false); }
  }

  function reset() {
    setRegion(""); setTerrain(""); setShielding(""); setTopography("");
    setLandform(""); setSlope(""); setPosition(""); setHelper(false);
  }

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-seal"><Icon name="alert" size={16} /></span>
        <h2 className="font-display text-[15px] font-semibold">What&apos;s the wind classification?</h2>
      </div>
      <p className="mb-4 max-w-2xl text-[13.5px] leading-relaxed text-ink/65">
        Four things decide it: the wind region, how exposed the surrounding
        terrain is, how much shielding there is upwind, and whether the site
        sits on a hill or an escarpment. Answer all four and the classification
        is below.
      </p>

      <Choice label="Wind region" hint="Region A covers Perth and most of the south."
        options={REGIONS} value={region} onChange={setRegion} />

      {/* The region is the one input nobody can work out by looking around
          them, so the official source sits right beside it. */}
      <p className="-mt-3 mb-4 text-[12.5px] text-ink/60">
        Not sure which region?{" "}
        {REGION_MAP_LINKS.map((l, i) => (
          <span key={l.url}>
            {i > 0 && " · "}
            <a href={l.url} target="_blank" rel="noopener noreferrer"
              className="text-seal underline">{l.label}</a>
          </span>
        ))}
      </p>

      <Choice label="Terrain category" hint="What the wind flows over on its way to the site."
        options={TERRAIN} value={terrain} onChange={setTerrain} details />

      <Choice
        label="Shielding"
        hint={cyclonicRegion
          ? "What's upwind of the site. In Regions C and D, trees and vegetation do NOT count as shielding."
          : "What's upwind of the site."}
        warn={cyclonicRegion}
        options={SHIELDING} value={shielding} onChange={setShielding} details />

      {/* Topography: pick it, or work it out. */}
      <div className="mb-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
            Topographic classification
          </span>
          <button type="button" onClick={() => setHelper((h) => !h)}
            className="text-[13px] text-seal underline">
            {helper ? "Hide" : "Not sure? Work it out"}
          </button>
        </div>
        <p className="mt-1 text-[12.5px] text-ink/60">
          T0 for flat ground, which is most suburban blocks.
        </p>
        <Pills options={TOPOGRAPHY} value={topography} onChange={setTopography} />

        {helper && (
          <div className="mt-3 rounded-md border border-rule bg-wash p-4">
            <p className="text-[13px] leading-relaxed text-ink/70">
              Measure the <strong>maximum slope</strong> of the hill or
              escarpment itself — the steepest slope through its top half —
              not the slope of the block. Then say which third of its height
              the site sits in.
            </p>

            <Sub label="Is the site on a hill or an escarpment?"
              options={LANDFORMS} value={landform} onChange={(v) => {
                setLandform(v);
                if (v === "hill" && position === "plateau") setPosition("");
              }} />

            <Sub label="Maximum slope" options={SLOPE_BANDS} value={slope} onChange={setSlope} />

            {slope !== "flat" && slope !== "steeper" && (
              <Sub label="Where on it does the site sit?"
                options={POSITIONS.filter(
                  (p: Opt & { escarpmentOnly?: boolean }) =>
                    !p.escarpmentOnly || landform === "escarpment"
                )}
                value={position} onChange={setPosition} />
            )}

            <div className="mt-3 border-t border-rule pt-3">
              {derived.ok ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[13px] text-ink/70">
                    That&apos;s <strong className="text-seal">{derived.topography}</strong>
                    {derived.reason === "flat" && " — no topographic effect"}.
                  </span>
                  <button type="button" onClick={useDerived} className="btn-ghost">
                    Use {derived.topography}
                  </button>
                </div>
              ) : derived.reason === "too-steep" ? (
                <p className="text-[13px] text-flag">
                  Steeper than 1:3 (18.5°) is past the range of this method. That
                  site needs a full analysis to AS/NZS 1170.2 — send it to us and
                  we&apos;ll sort it out.
                </p>
              ) : (
                <p className="text-[13px] text-ink/60">
                  Answer the three above and the classification appears here.
                </p>
              )}
              <p className="mt-2 text-[12px] text-ink/60">
                Covers hills and escarpments up to {MAX_LANDFORM_HEIGHT_M} m high.
                Taller than that needs AS 4055 itself.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* The answer */}
      <div className="mt-5 border-t border-rule pt-4">
        {!answered ? (
          <p className="text-[13px] text-ink/60">
            Answer all four and the wind classification appears here.
          </p>
        ) : result.ok ? (
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                Wind classification
              </p>
              <p className="mt-1 flex items-baseline gap-3">
                <span className="font-display text-[34px] font-semibold leading-none text-seal">
                  {result.windClass}
                </span>
                <span className="text-[15px] text-ink/70">
                  {result.gust} &middot; {result.speed} m/s gust
                </span>
              </p>
              <p className="mt-1.5 text-[13px] text-ink/60">
                {result.cyclonic
                  ? "Cyclonic region — the classification carries cyclonic detailing requirements."
                  : "Non-cyclonic."}
              </p>
            </div>
            <button type="button" onClick={reset} className="btn-ghost">Start Again</button>
          </div>
        ) : (
          <div className="rounded-sm border-l-[3px] border-flag bg-[#FBECEC] px-4 py-3">
            <p className="text-[13.5px] font-medium text-ink">
              This combination is off the end of the method.
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink/70">
              The guide marks it <span className="font-mono">NA</span>{" "}
              — a site that exposed needs a full analysis to AS/NZS 1170.2
              rather than a classification off a table. Send us the job and
              we&apos;ll get engineering onto it.
            </p>
          </div>
        )}
      </div>

      <p className="mt-4 border-t border-rule pt-3 text-[12px] leading-relaxed text-ink/60">
        {WIND_SOURCE} {WIND_CAVEAT} {WIND_REGULATOR_NOTE}
      </p>
    </div>
  );
}

/** A labelled group of pills, with the definitions available but folded away —
 *  they're what makes the choice right, and also far too long to leave open. */
function Choice({
  label, hint, options, value, onChange, details, warn,
}: {
  label: string; hint?: string; options: readonly Opt[];
  value: string; onChange: (v: string) => void;
  details?: boolean; warn?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const chosen = options.find((o) => o.key === value);
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
          {label}
        </span>
        {details && (
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="text-[13px] text-seal underline">
            {open ? "Hide the definitions" : "What do these mean?"}
          </button>
        )}
      </div>
      {hint && <p className={`mt-1 text-[12.5px] ${warn ? "text-brass" : "text-ink/60"}`}>{hint}</p>}
      <Pills options={options} value={value} onChange={onChange} />
      {chosen?.detail && !open && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink/60">{chosen.detail}</p>
      )}
      {open && (
        <dl className="mt-2 space-y-2 rounded-md border border-rule bg-wash px-4 py-3">
          {options.map((o) => (
            <div key={o.key}>
              <dt className="text-[13px] font-medium text-ink/80">{o.label}</dt>
              <dd className="text-[12.5px] leading-relaxed text-ink/60">{o.detail || o.note}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function Pills({
  options, value, onChange,
}: {
  options: readonly Opt[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key} type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "" : o.key)}
            className={`rounded-md border px-3 py-1.5 text-left text-[13px] transition ${
              on
                ? "border-seal bg-[#EDF3EE] text-seal"
                : "border-rule bg-white text-ink/70 hover:border-seal/50"}`}>
            <span className="font-medium">{o.label}</span>
            {o.short && <span className="block text-[12px] text-ink/60">{o.short}</span>}
            {!o.short && o.note && <span className="block text-[12px] text-ink/60">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Sub({
  label, options, value, onChange,
}: {
  label: string; options: readonly Opt[]; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="mt-3">
      <span className="text-[13px] font-medium text-ink/75">{label}</span>
      <Pills options={options} value={value} onChange={onChange} />
    </div>
  );
}
