"use client";

import { useState } from "react";
import type { Drill, DrillTag } from "@/lib/types";
import { ALL_TAGS, TAG_LABELS } from "./tags";

export default function DrillForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Drill;
  submitLabel: string;
  onSubmit: (drill: Omit<Drill, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [tags, setTags] = useState<DrillTag[]>(initial?.tags ?? []);
  const [durationMins, setDurationMins] = useState(
    initial ? String(initial.durationMins) : "10"
  );
  const [equipment, setEquipment] = useState(initial?.equipment ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");

  const trimmedName = name.trim();
  const duration = Number(durationMins);
  const valid = trimmedName.length > 0 && Number.isFinite(duration) && duration > 0;

  function toggleTag(tag: DrillTag) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({
          name: trimmedName,
          tags,
          durationMins: Math.round(duration),
          equipment: equipment.trim(),
          description: description.trim(),
        });
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1 text-sm font-medium">
        Name
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Corner Ball"
          className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <fieldset className="flex flex-col gap-1 text-sm font-medium">
        <legend className="mb-1">Tags</legend>
        <div className="flex flex-wrap gap-2">
          {ALL_TAGS.map((tag) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={on}
                className={`min-h-[40px] rounded-full border px-3 text-sm font-medium ${
                  on
                    ? "border-pitch bg-pitch text-white"
                    : "border-stone-300 bg-white text-stone-600"
                }`}
              >
                {TAG_LABELS[tag]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Duration (minutes)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={durationMins}
          onChange={(e) => setDurationMins(e.target.value)}
          className="min-h-[48px] w-28 rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Equipment <span className="font-normal text-stone-400">(optional)</span>
        <input
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
          placeholder="e.g. Cones, 1 ball per pair"
          className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Description
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="How it runs, coaching points, how to make it harder or easier"
          rows={3}
          className="rounded-lg border border-stone-300 px-3 py-2 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
        />
      </label>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!valid}
          className="min-h-[48px] flex-1 rounded-lg bg-pitch font-semibold text-white disabled:opacity-40"
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
