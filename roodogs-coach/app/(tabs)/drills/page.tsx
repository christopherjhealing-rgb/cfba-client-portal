"use client";

import { useEffect, useState } from "react";
import { newId, storage } from "@/lib/storage";
import { SEED_DRILLS } from "@/lib/seedDrills";
import type { Board, Drill, DrillTag } from "@/lib/types";
import { BoardPreview } from "../board/BoardCanvas";
import DrillForm from "./DrillForm";
import { ALL_TAGS, TAG_BADGE_CLASSES, TAG_LABELS } from "./tags";

export default function DrillsPage() {
  const [drills, setDrills] = useState<Drill[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<DrillTag | "all">("all");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Read after mount (no localStorage on the server); seed the starter
  // library the first time the tab is opened.
  useEffect(() => {
    let stored = storage.getDrills();
    if (stored.length === 0) {
      stored = SEED_DRILLS;
      storage.setDrills(stored);
    }
    setDrills(stored);
    setBoards(storage.getBoards());
    setLoaded(true);
  }, []);

  function save(next: Drill[]) {
    setDrills(next);
    storage.setDrills(next);
  }

  function addDrill(data: Omit<Drill, "id">) {
    save([...drills, { id: newId(), ...data }]);
    setAdding(false);
  }

  function updateDrill(id: string, data: Omit<Drill, "id">) {
    save(drills.map((d) => (d.id === id ? { id, ...data } : d)));
    setEditingId(null);
  }

  const visible = drills
    .filter((d) => filter === "all" || d.tags.includes(filter))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Drills</h1>
          {loaded && (
            <p className="text-sm text-stone-500">
              {visible.length} {visible.length === 1 ? "drill" : "drills"}
              {filter !== "all" && ` · ${TAG_LABELS[filter]}`}
            </p>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="min-h-[48px] rounded-lg bg-pitch px-4 font-semibold text-white"
          >
            + Add drill
          </button>
        )}
      </header>

      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-2 pb-1">
          <button
            onClick={() => setFilter("all")}
            className={`min-h-[40px] rounded-full border px-3 text-sm font-medium ${
              filter === "all"
                ? "border-pitch bg-pitch text-white"
                : "border-stone-300 bg-white text-stone-600"
            }`}
          >
            All
          </button>
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              className={`min-h-[40px] rounded-full border px-3 text-sm font-medium ${
                filter === tag
                  ? "border-pitch bg-pitch text-white"
                  : "border-stone-300 bg-white text-stone-600"
              }`}
            >
              {TAG_LABELS[tag]}
            </button>
          ))}
        </div>
      </div>

      {adding && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 font-semibold">New drill</h2>
          <DrillForm
            boards={boards}
            submitLabel="Add to library"
            onSubmit={addDrill}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}

      {loaded && visible.length === 0 && !adding && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-10 text-center">
          <span className="text-3xl" aria-hidden>
            🏉
          </span>
          <p className="text-sm text-stone-500">
            No drills with this tag yet — add one or pick another tag.
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((drill) =>
          editingId === drill.id ? (
            <li
              key={drill.id}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <h2 className="mb-3 font-semibold">Edit drill</h2>
              <DrillForm
                initial={drill}
                boards={boards}
                submitLabel="Save"
                onSubmit={(data) => updateDrill(drill.id, data)}
                onCancel={() => setEditingId(null)}
              />
            </li>
          ) : (
            <li key={drill.id}>
              <button
                onClick={() => {
                  setEditingId(drill.id);
                  setAdding(false);
                }}
                className="flex w-full flex-col gap-1.5 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left shadow-sm active:bg-stone-50"
              >
                <span className="flex w-full items-baseline justify-between gap-3">
                  <span className="font-semibold">{drill.name}</span>
                  <span className="shrink-0 text-sm text-stone-500">
                    {drill.durationMins} min
                  </span>
                </span>
                {drill.tags.length > 0 && (
                  <span className="flex flex-wrap gap-1">
                    {drill.tags.map((tag) => (
                      <span
                        key={tag}
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${TAG_BADGE_CLASSES[tag]}`}
                      >
                        {TAG_LABELS[tag]}
                      </span>
                    ))}
                  </span>
                )}
                {drill.description && (
                  <span className="text-sm text-stone-600">
                    {drill.description}
                  </span>
                )}
                {drill.equipment && (
                  <span className="text-xs text-stone-400">
                    Gear: {drill.equipment}
                  </span>
                )}
                {(() => {
                  const board = drill.boardId
                    ? boards.find((b) => b.id === drill.boardId)
                    : undefined;
                  return board ? (
                    <BoardPreview
                      board={board}
                      className="mt-1 w-28 rounded-lg"
                    />
                  ) : null;
                })()}
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
