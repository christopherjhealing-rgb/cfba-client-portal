"use client";
import { useRouter, useSearchParams } from "next/navigation";

// A little sort dropdown for My Jobs. Navigates by query param so the order is
// server-rendered (and shareable in a link), and it carries the current
// filter and search across a change rather than dropping them.

export function SortControl({
  options, value, defaultKey,
}: {
  options: { key: string; label: string }[];
  value: string;
  defaultKey: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function pick(next: string) {
    const params = new URLSearchParams(sp?.toString() || "");
    if (next === defaultKey) params.delete("sort");
    else params.set("sort", next);
    const qs = params.toString();
    router.push(qs ? `/jobs?${qs}` : "/jobs");
  }

  return (
    <label className="flex shrink-0 items-center gap-2 text-[13px] text-ink/55">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={value}
        onChange={(e) => pick(e.target.value)}
        className="field h-9 w-auto py-1 pr-8 text-[14px]"
        aria-label="Sort jobs by"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
