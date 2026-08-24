"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { newId, storage } from "@/lib/storage";
import type { Board, BoardKind } from "@/lib/types";
import { BoardPreview } from "./BoardCanvas";

const KIND_LABELS: Record<BoardKind, string> = {
  drill: "Drill",
  game: "Training game",
  set_play: "Set play",
};

const KIND_BADGE: Record<BoardKind, string> = {
  drill: "bg-sky-100 text-sky-800",
  game: "bg-pink-100 text-pink-800",
  set_play: "bg-amber-100 text-amber-800",
};

const KINDS: BoardKind[] = ["drill", "game", "set_play"];

export default function BoardListPage() {
  const router = useRouter();
  const [boards, setBoards] = useState<Board[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<BoardKind | "all">("all");
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<BoardKind>("drill");

  useEffect(() => {
    setBoards(storage.getBoards());
    setLoaded(true);
  }, []);

  function save(next: Board[]) {
    setBoards(next);
    storage.setBoards(next);
  }

  function createBoard() {
    const board: Board = {
      id: newId(),
      name: name.trim() || "Untitled board",
      kind,
      tokens: [],
      movements: [],
      updatedMs: Date.now(),
    };
    save([...boards, board]);
    router.push(`/board/${board.id}`);
  }

  function duplicateBoard(board: Board) {
    const copy: Board = {
      ...board,
      id: newId(),
      name: `${board.name} copy`,
      tokens: board.tokens.map((t) => ({ ...t, id: newId() })),
      movements: board.movements.map((m) => ({
        ...m,
        id: newId(),
        points: m.points.map((p) => ({ ...p })),
      })),
      updatedMs: Date.now(),
    };
    save([...boards, copy]);
  }

  function deleteBoard(board: Board) {
    if (!window.confirm(`Delete "${board.name}"? This can't be undone.`)) return;
    save(boards.filter((b) => b.id !== board.id));
  }

  const visible = boards
    .filter((b) => filter === "all" || b.kind === filter)
    .sort((a, b) => b.updatedMs - a.updatedMs);

  return (
    <div className="flex flex-col gap-4 px-4 pt-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Whiteboard</h1>
          {loaded && visible.length > 0 && (
            <p className="text-sm text-stone-500">
              {visible.length} {visible.length === 1 ? "board" : "boards"}
            </p>
          )}
        </div>
        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="min-h-[48px] rounded-lg bg-pitch px-4 font-semibold text-white"
          >
            + New board
          </button>
        )}
      </header>

      <div className="flex gap-2">
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
        {KINDS.map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`min-h-[40px] rounded-full border px-3 text-sm font-medium ${
              filter === k
                ? "border-pitch bg-pitch text-white"
                : "border-stone-300 bg-white text-stone-600"
            }`}
          >
            {KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createBoard();
          }}
          className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <h2 className="font-semibold">New board</h2>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Name
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Warm-up grid, Tap and go"
              className="min-h-[48px] rounded-lg border border-stone-300 px-3 text-base outline-none focus:border-pitch focus:ring-1 focus:ring-pitch"
            />
          </label>
          <fieldset className="flex flex-col gap-1 text-sm font-medium">
            <legend className="mb-1">What&apos;s it for?</legend>
            <div className="flex gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  aria-pressed={kind === k}
                  className={`min-h-[44px] rounded-full border px-3 text-sm font-medium ${
                    kind === k
                      ? "border-pitch bg-pitch text-white"
                      : "border-stone-300 bg-white text-stone-600"
                  }`}
                >
                  {KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex gap-2">
            <button
              type="submit"
              className="min-h-[48px] flex-1 rounded-lg bg-pitch font-semibold text-white"
            >
              Open the board
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="min-h-[48px] rounded-lg border border-stone-300 px-4 font-medium text-stone-600"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loaded && visible.length === 0 && !creating && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-stone-300 bg-white px-6 py-12 text-center">
          <span className="text-4xl" aria-hidden>
            ✏️
          </span>
          <p className="font-semibold">Nothing on the whiteboard yet</p>
          <p className="text-sm text-stone-500">
            Sketch a drill, a training game or a set play — drag players,
            cones and tackle bags around and draw the runs and passes.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-1 min-h-[48px] rounded-lg bg-pitch px-5 font-semibold text-white"
          >
            Draw your first board
          </button>
        </div>
      )}

      <ul className="grid grid-cols-2 gap-3">
        {visible.map((board) => (
          <li
            key={board.id}
            className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
          >
            <Link href={`/board/${board.id}`} className="block active:bg-stone-50">
              <BoardPreview board={board} className="w-full" />
              <div className="flex flex-col gap-1 px-3 py-2">
                <span className="truncate text-sm font-semibold">
                  {board.name}
                </span>
                <span
                  className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${KIND_BADGE[board.kind]}`}
                >
                  {KIND_LABELS[board.kind]}
                </span>
              </div>
            </Link>
            <div className="flex justify-between border-t border-stone-100 px-1">
              <button
                onClick={() => duplicateBoard(board)}
                className="min-h-[44px] px-2 text-xs font-semibold text-pitch"
              >
                Duplicate
              </button>
              <button
                onClick={() => deleteBoard(board)}
                className="min-h-[44px] px-2 text-xs font-medium text-rose-600"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
