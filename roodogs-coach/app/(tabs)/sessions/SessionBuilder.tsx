"use client";

import { useState } from "react";
import type { Drill, Session } from "@/lib/types";
import { TAG_BADGE_CLASSES, TAG_LABELS } from "../drills/tags";

export const TARGET_MINS = 60;

export default function SessionBuilder({
  initial,
  drills,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Session;
  drills: Drill[];
  submitLabel: string;
  onSubmit: (data: Omit<Session, "id">) => void;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(
    initial?.date ?? new Date().toISOString().slice(0, 10)
  );
  const [drillIds, setDrillIds] = useState<string[]>(initial?.drillIds ?? []);
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const byId = new Map(drills.map((d) => [d.id, d]));
  const chosen = drillIds
    .map((id) => byId.get(id))
    .filter((d): d is Drill => d !== undefined);
  const totalMins = chosen.reduce((sum, d) => sum + d.durationMins, 0);
  const available = drills
    .filter((d) => !drillIds.includes(d.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  function move(index: number, delta: -1 | 1) {
    const next = [...drillIds];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDrillIds(next);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ date, drillIds, notes: notes.trim() });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <div
        className={`sticky top-0 z-10 rounded-lg px-3 py-2 text-sm font-semibold ${
          totalMins > TARGET_MINS + 10
            ? "bg-amber-100 text-amber-800"
            : "bg-emerald-100 text-emerald-900"
        }`}
      >
        {totalMins} min planned · aiming for about {TARGET_MINS}
      </div>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Session plan</h3>
        {chosen.length === 0 && (
          <p className="rounded-lg border border-dashed border-stone-300 px-3 py-4 text-center text-sm text-stone-500">
            Nothing picked yet — tap drills below to build the session.
          </p>
        )}
        <ul className="flex flex-col gap-1.5">
          {chosen.map((drill, i) => (
            <li
              key={drill.id}
              className="flex items-center gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {i + 1}. {drill.name}
                </span>
                <span className="text-xs text-stone-500">
                  {drill.durationMins} min
                </span>
              </span>
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${drill.name} earlier`}
                className="min-h-[44px] min-w-[44px] rounded-lg text-stone-500 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === chosen.length - 1}
                aria-label={`Move ${drill.name} later`}
                className="min-h-[44px] min-w-[44px] rounded-lg text-stone-500 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() =>
                  setDrillIds(drillIds.filter((id) => id !== drill.id))
                }
                aria-label={`Remove ${drill.name}`}
                className="min-h-[44px] min-w-[44px] rounded-lg font-semibold text-rose-600"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-1.5">
        <h3 className="text-sm font-medium">Drill library</h3>
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto pr-1">
          {available.map((drill) => (
            <li key={drill.id}>
              <button
                type="button"
                onClick={() => setDrillIds([...drillIds, drill.id])}
                className="flex min-h-[48px] w-full items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-left active:bg-stone-50"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {drill.name}
                  </span>
                  <span className="flex flex-wrap gap-1 pt-0.5">
                    {drill.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-1.5 text-[10px] font-medium ${TAG_BADGE_CLASSES[tag]}`}
                      >
                        {TAG_LABELS[tag]}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="shrink-0 text-sm text-stone-500">
                  + {drill.durationMins} min
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes <span className="font-normal text-stone-400">(optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Focus for the night, who to keep an eye on…"
          rows={2}
          className="rounded-lg border border-stone-300 px-3 py-2 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          className="min-h-[48px] flex-1 rounded-lg bg-pitch font-semibold text-white"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-[48px] rounded-lg border border-stone-300 px-4 font-medium text-stone-600"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
