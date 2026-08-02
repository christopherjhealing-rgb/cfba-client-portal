// Line-art job icons in soft circles — drawn to match the CFBA icon set
// (single-weight strokes, rounded joins). The type is inferred from the
// description first (which is what people actually write) and the class
// second. Anything unrecognised falls back to the neutral folder rather than
// guessing wrong — a carport drawn on a pool barrier job looks worse than no
// picture at all.

type ArtKey =
  | "patio" | "shed" | "carport" | "pergola" | "deck" | "pool"
  | "retaining" | "fence" | "dwelling" | "alterations" | "generic";

const RULES: { key: ArtKey; label: string; words: string[] }[] = [
  { key: "carport", label: "Carport", words: ["carport"] },
  { key: "pergola", label: "Pergola", words: ["pergola", "gazebo"] },
  { key: "patio", label: "Patio", words: ["patio", "verandah", "veranda", "alfresco", "awning", "canopy"] },
  { key: "shed", label: "Shed", words: ["shed", "garage", "workshop", "outbuilding"] },
  { key: "deck", label: "Deck", words: ["deck", "decking"] },
  { key: "pool", label: "Pool", words: ["pool", "spa", "barrier"] },
  { key: "retaining", label: "Retaining", words: ["retaining", "retain"] },
  { key: "fence", label: "Fence", words: ["fence", "fencing", "wall to boundary"] },
  { key: "alterations", label: "Alterations", words: ["alteration", "addition", "extension", "renovation", "reno", "convert"] },
  { key: "dwelling", label: "New Dwelling", words: ["dwelling", "residence", "house", "home", "ancillary"] },
];

export function classifyJob(description?: string, jobClass?: string) {
  const text = `${description || ""} ${jobClass || ""}`.toLowerCase();
  for (const r of RULES) {
    if (r.words.some((w) => text.includes(w))) return { key: r.key, label: r.label };
  }
  return { key: "generic" as ArtKey, label: jobClass?.replace(/^BA2 - /, "") || "Job" };
}

const ART: Record<ArtKey, React.ReactNode> = {
  patio: <>
    <path d="M7 17 24 9l17 8" /><path d="M11 17v20M37 17v20" /><path d="M8 37h32" />
    <path d="M20 28h8M24 28v9M21 37h6" />
    <path d="M16 26v11M16 31h4v6" /><path d="M32 26v11M32 31h-4v6" />
  </>,
  shed: <>
    <path d="M6 18 24 8l18 10" /><path d="M9 18v19M39 18v19" /><path d="M6 37h36" />
    <path d="M15 37V20h18v17" /><path d="M15 24h18M15 28h18M15 32h18" />
  </>,
  generic: <path d="M7 34V15a2 2 0 0 1 2-2h9l3 3h17a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" />,
  pool: <>
    <path d="M10 27c-2-6 3-12 10-12 5 0 6 3 11 3 6 0 10 3 9 8-1 6-7 9-13 8-4-.7-7 1-10 0-4-1-6-3-7-7z" />
    <path d="M33.5 12v9M38 12v9M33.5 14.5h4.5M33.5 18h4.5" />
    <path d="M16 25c2-2 4 2 6 0M19 30c2-2 4 2 6 0" />
  </>,
  retaining: <>
    <path d="M8 36V20h32v16z" /><path d="M8 25.3h32M8 30.7h32" />
    <path d="M19 20v5.3M30 20v5.3" /><path d="M14 25.3v5.4M25 25.3v5.4M35 25.3v5.4" />
    <path d="M19 30.7v5.3M30 30.7v5.3" /><path d="M5 36h38" />
  </>,
  carport: <>
    <path d="M7 14h34v4H7z" /><path d="M10 18v19M38 18v19" /><path d="M7 37h34" />
    <path d="M15 35v-4c0-1.2.8-2 2-2h1.5l3-4h5l3 4H31c1.2 0 2 .8 2 2v4" />
    <path d="M15 35h18" /><circle cx="19.5" cy="35.2" r="2" /><circle cx="28.5" cy="35.2" r="2" />
  </>,
  pergola: <>
    <path d="M7 15h34M7 20h34" /><path d="M11 20v17M37 20v17" />
    <path d="M16 15v5M22 15v5M28 15v5M34 15v5" /><path d="M8 37h32" />
  </>,
  deck: <>
    <path d="M8 26h32v5H8z" /><path d="M14 26v5M20 26v5M26 26v5M32 26v5" />
    <path d="M11 31v6M24 31v6M37 31v6" /><path d="M8 37h32" />
  </>,
  fence: <>
    <path d="M10 18v16M17 18v16M24 18v16M31 18v16M38 18v16" />
    <path d="M7 22h34M7 30h34" />
  </>,
  dwelling: <>
    <path d="M6 22 24 9l18 13" /><path d="M10 22v15h28V22" /><path d="M6 37h36" />
    <path d="M21 37v-9h6v9" /><path d="M14 26h4v4h-4zM30 26h4v4h-4z" />
  </>,
  alterations: <>
    <path d="M6 24 20 13l14 11" /><path d="M9 24v13h22V24" /><path d="M6 37h38" />
    <path d="M31 19h11v18H31" strokeDasharray="3.5 3" /><path d="M16 37v-7h6v7" />
  </>,
};

export function JobArt({
  description, jobClass, tone = "seal", size = "full",
}: {
  description?: string;
  jobClass?: string;
  tone?: "seal" | "amber";
  /** "sm" renders just the circular tile at list-row height, no label. */
  size?: "full" | "sm";
}) {
  const { key, label } = classifyJob(description, jobClass);
  if (size === "sm") {
    return (
      <div
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border ${
          tone === "amber"
            ? "border-[#E9D7AC] bg-[#FBF6EA] text-brass"
            : "border-rule bg-wash text-seal"
        }`}
      >
        <svg viewBox="0 0 48 48" className="h-[23px] w-[23px]" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true">
          {ART[key]}
        </svg>
      </div>
    );
  }
  return (
    <div className="flex w-[86px] shrink-0 flex-col items-center gap-1.5">
      <div
        className={`grid h-[60px] w-[60px] place-items-center rounded-full border ${
          tone === "amber"
            ? "border-[#E9D7AC] bg-[#FBF6EA] text-brass"
            : "border-rule bg-wash text-seal"
        }`}
      >
        <svg viewBox="0 0 48 48" className="h-[38px] w-[38px]" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true">
          {ART[key]}
        </svg>
      </div>
      <span className="w-full truncate text-center font-display text-[8px] font-semibold uppercase tracking-[0.1em] text-ink/45">
        {label}
      </span>
    </div>
  );
}
