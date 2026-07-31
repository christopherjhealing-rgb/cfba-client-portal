// Small line drawings for job cards. The type is inferred from the description
// first (which is what people actually write) and the class second. Anything
// unrecognised falls back to a neutral mark rather than guessing wrong — a
// carport drawn on a pool barrier job looks worse than no picture at all.

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
  { key: "dwelling", label: "New dwelling", words: ["dwelling", "residence", "house", "home", "ancillary"] },
];

export function classifyJob(description?: string, jobClass?: string) {
  const text = `${description || ""} ${jobClass || ""}`.toLowerCase();
  for (const r of RULES) {
    if (r.words.some((w) => text.includes(w))) return { key: r.key, label: r.label };
  }
  return { key: "generic" as ArtKey, label: jobClass?.replace(/^BA2 - /, "") || "Job" };
}

const ART: Record<ArtKey, React.ReactNode> = {
  patio: <><path d="M6 20h44" /><path d="M10 20 32 10l22 10" /><path d="M12 20v16M52 20v16" /><path d="M20 36h24v-8H20z" /></>,
  pergola: <><path d="M6 16h48M6 22h48" /><path d="M12 16v22M52 16v22" /><path d="M20 16v6M32 16v6M44 16v6" /></>,
  carport: <><path d="M6 18h48" /><path d="M10 18 32 8l22 10" /><path d="M12 18v20M52 18v20" /><path d="M20 38v-6h20v6" /><circle cx="24" cy="38" r="2.5" /><circle cx="38" cy="38" r="2.5" /></>,
  shed: <><path d="M8 22 32 10l24 12" /><path d="M12 22v18h40V22" /><path d="M26 40V28h12v12" /></>,
  deck: <><path d="M6 24h48v6H6z" /><path d="M10 30v10M54 30v10" /><path d="M6 36h20" /><path d="M18 24V14M30 24v-6" /></>,
  pool: <><rect x="8" y="18" width="44" height="20" rx="3" /><path d="M12 28c4-3 8 3 12 0s8 3 12 0 8 3 12 0" /><path d="M18 12v6M42 12v6" /></>,
  retaining: <><path d="M6 36h48" /><path d="M22 36V16h10v20" /><path d="M32 22h20M32 29h20" /><path d="M6 30h16" /></>,
  fence: <><path d="M8 18v22M20 18v22M32 18v22M44 18v22M56 18v22" /><path d="M6 24h52M6 32h52" /></>,
  dwelling: <><path d="M6 24 32 8l26 16" /><path d="M12 24v16h40V24" /><path d="M28 40V30h8v10" /><path d="M18 28h6v6h-6zM40 28h6v6h-6z" /></>,
  alterations: <><path d="M6 26 26 12l20 14" /><path d="M10 26v14h32V26" /><path d="M42 20h12v20H42z" strokeDasharray="4 3" /><path d="M20 40v-8h8v8" /></>,
  generic: <><rect x="10" y="14" width="40" height="26" rx="2" /><path d="M18 40V26h10v14" /><path d="M36 22h8M36 30h8" /></>,
};

export function JobArt({
  description, jobClass, tone = "seal",
}: {
  description?: string;
  jobClass?: string;
  tone?: "seal" | "amber";
}) {
  const { key, label } = classifyJob(description, jobClass);
  return (
    <div
      className={`flex w-[86px] shrink-0 flex-col items-center gap-1 rounded-lg border px-2 py-2.5 ${
        tone === "amber"
          ? "border-[#E9D7AC] bg-[#FBF6EA] text-brass"
          : "border-rule bg-wash text-seal"
      }`}
    >
      <svg viewBox="0 0 60 48" className="h-[34px] w-full" fill="none"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        strokeLinejoin="round" aria-hidden="true">
        {ART[key]}
      </svg>
      <span className="w-full truncate text-center font-display text-[8px] font-semibold uppercase tracking-[0.1em] text-ink/45">
        {label}
      </span>
    </div>
  );
}
