"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { balVerdict, BAL_RATINGS, type BalVerdict } from "@/lib/bushfire.mjs";

// The bushfire questions on Lodge a Job. Shown only when the lot is in a
// designated Bush Fire Prone Area AND the job's own item rows include a
// Class 10a building — the structures come from what the client already told
// us (balKinds in lib/bushfire.mjs), so nothing here asks what the form knows.
// It sits just above the Lodge button and the form won't lodge until it's
// answered: the office needs the outcome on the job, not a blank.
//
// onResult fires with the conclusion — a summary line for the office notes and
// the BAL column label to stamp on the card — or null while unanswered, which
// is what the form's gating reads. The rule itself lives in lib/bushfire.mjs
// (balVerdict), tested; this is only the asking.

type Distance = "near" | "far" | null;
type Age = "pre2016" | "post2016" | "unsure" | null;

/** The value sent is the exact board label ("LOW", "12.5", …); the client sees
 *  proper BAL notation. */
const RATING_LABEL: Record<string, string> = {
  LOW: "BAL-Low", "12.5": "BAL-12.5", "19": "BAL-19",
  "29": "BAL-29", "40": "BAL-40", FZ: "BAL-FZ",
};

const TONE: Record<string, { border: string; bg: string; icon: "check" | "alert" | "help" }> = {
  clear: { border: "border-seal/40", bg: "bg-[#EDF3EE]", icon: "check" },
  action: { border: "border-brass", bg: "bg-[#FBF4E6]", icon: "alert" },
  info: { border: "border-rule", bg: "bg-wash", icon: "help" },
};

function Choice({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg border px-3 py-2 text-[13px] font-medium transition ${
        active
          ? "border-seal bg-seal text-white"
          : "border-rule bg-white text-ink/75 hover:border-seal/40"
      }`}
    >
      {label}
    </button>
  );
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[13px] font-medium text-ink/80">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function VerdictBox({ v }: { v: BalVerdict }) {
  const tone = TONE[v.tone];
  return (
    <div className={`mt-3 flex gap-2.5 rounded-lg border ${tone.border} ${tone.bg} px-3 py-2.5`}>
      <span className="mt-0.5 shrink-0 text-ink/60"><Icon name={tone.icon} size={15} /></span>
      <div>
        <p className="font-semibold text-ink">{v.headline}</p>
        <p className="mt-0.5 text-ink/75">{v.detail}</p>
      </div>
    </div>
  );
}

export function BushfireAssessment({
  patio, shed, onResult,
}: {
  /** Which BAL-relevant structures the job's rows contain (balKinds). */
  patio: boolean;
  shed: boolean;
  /** `needs` is what the verdict obliges the client to ATTACH before lodging:
   *  a shed within 6 m needs its own new BAL report; a post-2016 patio or
   *  carport needs evidence of the house's rating. Null = nothing required
   *  (far, exempt, or age-unknown — the office confirms those). */
  onResult?: (r: { summary: string; bal: string | null; needs: "shed-report" | "evidence" | null } | null) => void;
}) {
  const [distance, setDistance] = useState<Distance>(null);
  const [age, setAge] = useState<Age>(null);
  const [rating, setRating] = useState<string>("");

  // The rows can change under an open form — a patio row swapped for a shed
  // mid-answer. Start the questions over rather than carry answers across.
  useEffect(() => {
    setDistance(null); setAge(null); setRating("");
  }, [patio, shed]);

  const pickDistance = (d: Distance) => { setDistance(d); setAge(null); setRating(""); };
  const pickAge = (a: Age) => { setAge(a); setRating(""); };

  // One verdict per structure the job actually has. Far ends it for everything.
  const farV = distance === "far" ? balVerdict({ distance: "far" }) : null;
  const shedV = distance === "near" && shed ? balVerdict({ distance: "near", kind: "shed" }) : null;
  const patioV = distance === "near" && patio
    ? balVerdict({ distance: "near", kind: "patio", age, rating: rating || null })
    : null;

  // Answered when every structure present has its verdict. The patio path is
  // the only one that can still be waiting (on the house-age answer).
  const done = distance === "far" || (distance === "near" && (!patio || !!patioV));
  const parts = farV ? [farV] : [shedV, patioV].filter((v): v is BalVerdict => !!v);
  const summary = done ? parts.map((p) => p.summary).join(" ") : null;
  const bal = done ? (patioV?.mondayBal ?? null) : null;
  // What must be attached before this can lodge (owner's rule, Aug 2026):
  // a shed's own new report outranks patio evidence when both are present.
  const needs: "shed-report" | "evidence" | null = !done ? null
    : shedV?.tone === "action" ? "shed-report"
    : patioV?.tone === "action" ? "evidence"
    : null;

  useEffect(() => {
    onResult?.(summary ? { summary, bal, needs } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary, bal, needs]);

  const things = [patio && "patio or carport", shed && "shed"].filter(Boolean).join(" and ");

  return (
    <div className="mt-6 rounded-lg border-l-[3px] border-brass bg-[#FBF4E6] px-4 py-3 text-[13px] leading-relaxed text-ink/80">
      <div className="flex items-center gap-2 font-semibold text-ink">
        <span className="text-brass"><Icon name="alert" size={15} /></span>
        This lot is in a designated Bush Fire Prone Area
      </div>
      <p className="mt-1.5">
        Because this job includes a {things}, we need one or two quick answers
        before it can be lodged — they tell us whether a BAL (Bushfire Attack
        Level) rating applies.
      </p>

      <Question label={
        patio && shed
          ? "Will any of it be within 6 m of the house?"
          : patio
            ? "Will the patio or carport be within 6 m of the house?"
            : "Will the shed be within 6 m of the house?"
      }>
        <Choice label="Within 6 m" active={distance === "near"} onClick={() => pickDistance("near")} />
        <Choice label="6 m or more away" active={distance === "far"} onClick={() => pickDistance("far")} />
      </Question>

      {distance === "near" && patio && (
        <Question label="Was the house built before 2016?">
          <Choice label="Yes, before 2016" active={age === "pre2016"} onClick={() => pickAge("pre2016")} />
          <Choice label="No / 2016 or later" active={age === "post2016"} onClick={() => pickAge("post2016")} />
          <Choice label="Not sure" active={age === "unsure"} onClick={() => pickAge("unsure")} />
        </Question>
      )}

      {distance === "near" && patio && age === "post2016" && (
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] font-medium text-ink/80">
            What&apos;s the house&apos;s BAL rating? <span className="font-normal text-ink/60">(from its BAL report or CDC, if you have it)</span>
          </p>
          <select
            value={rating}
            onChange={(e) => setRating(e.target.value)}
            className="field max-w-[220px] text-[14px]"
          >
            <option value="">Select a rating…</option>
            {BAL_RATINGS.map((r) => (
              <option key={r} value={r}>{RATING_LABEL[r] || r}</option>
            ))}
          </select>
        </div>
      )}

      {farV && <VerdictBox v={farV} />}
      {shedV && <VerdictBox v={shedV} />}
      {patioV && <VerdictBox v={patioV} />}
    </div>
  );
}
