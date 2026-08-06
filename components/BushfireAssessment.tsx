"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";
import { balVerdict, BAL_RATINGS } from "@/lib/bushfire.mjs";

// The bushfire helper on Lodge a Job. When the site sits in a designated Bush
// Fire Prone Area, a few questions settle what a Class 10 structure actually
// needs — distance from the house, patio/carport vs shed, the house's age, and
// (for a newer house) its BAL rating. The conclusion shows inline and is filed
// with the lodgement (onResult): a summary line for the office, and the BAL
// column label to stamp on the card. The rule lives in lib/bushfire.mjs
// (balVerdict), tested; this is only the asking.

type Distance = "near" | "far" | null;
type Kind = "patio" | "shed" | null;
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

export function BushfireAssessment({
  onResult,
}: {
  onResult?: (r: { summary: string; bal: string | null } | null) => void;
}) {
  const [distance, setDistance] = useState<Distance>(null);
  const [kind, setKind] = useState<Kind>(null);
  const [age, setAge] = useState<Age>(null);
  const [rating, setRating] = useState<string>("");

  // Changing an answer clears the ones downstream of it, so a half-answered
  // path can never leave a stale verdict showing.
  const pickDistance = (d: Distance) => { setDistance(d); setKind(null); setAge(null); setRating(""); };
  const pickKind = (k: Kind) => { setKind(k); setAge(null); setRating(""); };
  const pickAge = (a: Age) => { setAge(a); setRating(""); };

  const verdict = balVerdict({ distance, kind, age, rating: rating || null });

  // File the conclusion with the lodgement (or clear it if unanswered).
  useEffect(() => {
    onResult?.(verdict ? { summary: verdict.summary, bal: verdict.mondayBal } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verdict?.summary, verdict?.mondayBal]);

  const tone = verdict ? TONE[verdict.tone] : null;

  return (
    <div className="mt-2 rounded-lg border-l-[3px] border-brass bg-[#FBF4E6] px-4 py-3 text-[13px] leading-relaxed text-ink/80">
      <div className="flex items-center gap-2 font-semibold text-ink">
        <span className="text-brass"><Icon name="alert" size={15} /></span>
        This lot is in a designated Bush Fire Prone Area
      </div>
      <p className="mt-1.5">
        A couple of quick questions and we&apos;ll tell you exactly what — if anything —
        your Class&nbsp;10 structure needs. None of this stops you lodging.
      </p>

      <Question label="How far is the structure from the house?">
        <Choice label="Within 6 m" active={distance === "near"} onClick={() => pickDistance("near")} />
        <Choice label="6 m or more" active={distance === "far"} onClick={() => pickDistance("far")} />
      </Question>

      {distance === "near" && (
        <Question label="What are you building?">
          <Choice label="Patio or carport" active={kind === "patio"} onClick={() => pickKind("patio")} />
          <Choice label="Shed" active={kind === "shed"} onClick={() => pickKind("shed")} />
        </Question>
      )}

      {distance === "near" && kind === "patio" && (
        <Question label="Was the house built before 2016?">
          <Choice label="Yes, before 2016" active={age === "pre2016"} onClick={() => pickAge("pre2016")} />
          <Choice label="No / 2016 or later" active={age === "post2016"} onClick={() => pickAge("post2016")} />
          <Choice label="Not sure" active={age === "unsure"} onClick={() => pickAge("unsure")} />
        </Question>
      )}

      {distance === "near" && kind === "patio" && age === "post2016" && (
        <div className="mt-3">
          <p className="mb-1.5 text-[13px] font-medium text-ink/80">
            What&apos;s the house&apos;s BAL rating? <span className="font-normal text-ink/50">(from its BAL report or CDC, if you have it)</span>
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

      {verdict && tone && (
        <div className={`mt-3 flex gap-2.5 rounded-lg border ${tone.border} ${tone.bg} px-3 py-2.5`}>
          <span className="mt-0.5 shrink-0 text-ink/60"><Icon name={tone.icon} size={15} /></span>
          <div>
            <p className="font-semibold text-ink">{verdict.headline}</p>
            <p className="mt-0.5 text-ink/75">{verdict.detail}</p>
          </div>
        </div>
      )}
    </div>
  );
}
