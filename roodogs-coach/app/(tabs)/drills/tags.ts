import type { DrillTag } from "@/lib/types";

export const ALL_TAGS: DrillTag[] = [
  "warmup",
  "passing",
  "tackling",
  "evasion",
  "rucking",
  "fitness",
  "fun",
];

export const TAG_LABELS: Record<DrillTag, string> = {
  warmup: "Warm-up",
  passing: "Passing",
  tackling: "Tackling",
  evasion: "Evasion",
  rucking: "Rucking",
  fitness: "Fitness",
  fun: "Fun",
};

export const TAG_BADGE_CLASSES: Record<DrillTag, string> = {
  warmup: "bg-amber-100 text-amber-800",
  passing: "bg-sky-100 text-sky-800",
  tackling: "bg-rose-100 text-rose-800",
  evasion: "bg-violet-100 text-violet-800",
  rucking: "bg-orange-100 text-orange-800",
  fitness: "bg-lime-100 text-lime-800",
  fun: "bg-pink-100 text-pink-800",
};
