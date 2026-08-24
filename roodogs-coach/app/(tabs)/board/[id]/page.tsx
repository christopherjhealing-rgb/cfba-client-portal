"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { newId, storage } from "@/lib/storage";
import type {
  Board,
  BoardMovement,
  BoardToken,
  MovementType,
  TokenType,
} from "@/lib/types";
import {
  MOVEMENT_STYLE,
  MovementGlyph,
  PITCH_H,
  PITCH_W,
  Pitch,
  TOKEN_LABELS,
  TokenGlyph,
} from "../BoardCanvas";

type Mode =
  | { kind: "move" }
  | { kind: "erase" }
  | { kind: "place"; token: TokenType }
  | { kind: "draw"; movement: MovementType };

const TOKEN_TYPES: TokenType[] = [
  "player",
  "opponent",
  "cone",
  "hurdle",
  "bag",
  "ball",
];

const MOVEMENT_TYPES: MovementType[] = [
  "run",
  "pass",
  "kick",
  "tackle",
  "jump",
];

interface Snapshot {
  tokens: BoardToken[];
  movements: BoardMovement[];
}

export default function BoardEditorPage() {
  const params = useParams<{ id: string }>();
  const boardId = params.id;

  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<Mode>({ kind: "move" });
  const [undoStack, setUndoStack] = useState<Snapshot[]>([]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragTokenId = useRef<string | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [preview, setPreview] = useState<BoardMovement | null>(null);

  useEffect(() => {
    setBoard(storage.getBoards().find((b) => b.id === boardId) ?? null);
    setLoaded(true);
  }, [boardId]);

  function persist(updated: Board) {
    const stamped = { ...updated, updatedMs: Date.now() };
    setBoard(stamped);
    storage.setBoards(
      storage.getBoards().map((b) => (b.id === stamped.id ? stamped : b))
    );
  }

  /** Apply a change to tokens/movements, recording undo history. */
  function commit(change: (b: Board) => Partial<Snapshot>) {
    if (!board) return;
    setUndoStack((prev) => [
      ...prev.slice(-49),
      {
        tokens: board.tokens.map((t) => ({ ...t })),
        movements: board.movements.map((m) => ({
          ...m,
          points: m.points.map((p) => ({ ...p })),
        })),
      },
    ]);
    persist({ ...board, ...change(board) });
  }

  function undo() {
    if (!board || undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    persist({ ...board, tokens: last.tokens, movements: last.movements });
  }

  function toPitch(e: React.PointerEvent): { x: number; y: number } {
    const rect = svgRef.current!.getBoundingClientRect();
    return {
      x: Math.min(PITCH_W, Math.max(0, ((e.clientX - rect.left) / rect.width) * PITCH_W)),
      y: Math.min(PITCH_H, Math.max(0, ((e.clientY - rect.top) / rect.height) * PITCH_H)),
    };
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (!board) return;
    const p = toPitch(e);
    if (mode.kind === "place") {
      const label =
        mode.token === "player"
          ? String(board.tokens.filter((t) => t.type === "player").length + 1)
          : undefined;
      commit((b) => ({
        tokens: [
          ...b.tokens,
          { id: newId(), type: mode.token, x: p.x, y: p.y, label },
        ],
      }));
    } else if (mode.kind === "draw") {
      drawStart.current = p;
      svgRef.current?.setPointerCapture(e.pointerId);
    }
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!board) return;
    const p = toPitch(e);
    if (dragTokenId.current) {
      // move without recording history every pixel — snapshot was taken on grab
      persist({
        ...board,
        tokens: board.tokens.map((t) =>
          t.id === dragTokenId.current ? { ...t, x: p.x, y: p.y } : t
        ),
      });
    } else if (drawStart.current && mode.kind === "draw") {
      setPreview({
        id: "preview",
        type: mode.movement,
        points: [drawStart.current, p],
      });
    }
  }

  function onCanvasPointerUp(e: React.PointerEvent) {
    if (dragTokenId.current) {
      dragTokenId.current = null;
      return;
    }
    if (drawStart.current && mode.kind === "draw" && board) {
      const p = toPitch(e);
      const start = drawStart.current;
      drawStart.current = null;
      setPreview(null);
      const dist = Math.hypot(p.x - start.x, p.y - start.y);
      if (dist >= 4) {
        commit((b) => ({
          movements: [
            ...b.movements,
            { id: newId(), type: mode.movement, points: [start, p] },
          ],
        }));
      }
    }
  }

  function onTokenPointerDown(e: React.PointerEvent, token: BoardToken) {
    if (mode.kind === "move") {
      e.stopPropagation();
      // snapshot once at grab time so the whole drag is one undo step
      commit((b) => ({ tokens: b.tokens }));
      dragTokenId.current = token.id;
      svgRef.current?.setPointerCapture(e.pointerId);
    } else if (mode.kind === "erase") {
      e.stopPropagation();
      commit((b) => ({ tokens: b.tokens.filter((t) => t.id !== token.id) }));
    }
    // in place/draw modes let the event fall through to the canvas
  }

  function onMovementPointerDown(e: React.PointerEvent, movement: BoardMovement) {
    if (mode.kind === "erase") {
      e.stopPropagation();
      commit((b) => ({
        movements: b.movements.filter((m) => m.id !== movement.id),
      }));
    }
  }

  function clearBoard() {
    if (!board) return;
    if (!window.confirm("Clear everything off this board?")) return;
    commit(() => ({ tokens: [], movements: [] }));
  }

  if (!loaded) return null;

  if (!board) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 pt-24 text-center">
        <p className="font-semibold">Board not found</p>
        <Link href="/board" className="font-medium text-pitch underline">
          Back to the whiteboard
        </Link>
      </div>
    );
  }

  const toolChip = (active: boolean) =>
    `flex min-h-[48px] min-w-[52px] flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 text-[10px] font-medium ${
      active
        ? "border-pitch bg-pitch text-white"
        : "border-stone-300 bg-white text-stone-600"
    }`;

  return (
    <div className="flex flex-col gap-3 px-4 pt-4">
      <header className="flex items-center gap-2">
        <Link href="/board" className="min-h-[44px] shrink-0 py-2 text-sm text-stone-500">
          ‹ Boards
        </Link>
        <input
          value={board.name}
          onChange={(e) => persist({ ...board, name: e.target.value })}
          aria-label="Board name"
          className="min-h-[44px] w-full min-w-0 rounded-lg border border-transparent px-2 font-semibold outline-none focus:border-stone-300"
        />
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="min-h-[44px] shrink-0 rounded-lg border border-stone-300 bg-white px-3 text-sm font-semibold text-stone-600 disabled:opacity-40"
        >
          Undo
        </button>
      </header>

      {/* palette */}
      <div className="-mx-4 overflow-x-auto px-4">
        <div className="flex w-max gap-1.5">
          <button
            onClick={() => setMode({ kind: "move" })}
            className={toolChip(mode.kind === "move")}
          >
            <span className="text-base leading-none" aria-hidden>✋</span>
            Move
          </button>
          {TOKEN_TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setMode({ kind: "place", token: t })}
              className={toolChip(mode.kind === "place" && mode.token === t)}
            >
              <svg viewBox="-5 -5 10 10" className="h-5 w-5">
                <TokenGlyph token={{ id: "icon", type: t, x: 0, y: 0, label: "1" }} />
              </svg>
              {TOKEN_LABELS[t]}
            </button>
          ))}
          {MOVEMENT_TYPES.map((m) => (
            <button
              key={m}
              onClick={() => setMode({ kind: "draw", movement: m })}
              className={toolChip(mode.kind === "draw" && mode.movement === m)}
            >
              <svg viewBox="0 0 24 12" className="h-5 w-6 rounded bg-pitch-dark">
                <line
                  x1={3}
                  y1={6}
                  x2={17}
                  y2={6}
                  stroke={MOVEMENT_STYLE[m].color}
                  strokeWidth={2}
                  strokeDasharray={MOVEMENT_STYLE[m].dash
                    ?.split(" ")
                    .map((n) => Number(n) * 1.8)
                    .join(" ")}
                />
                <polygon points="21,6 16,3.5 16,8.5" fill={MOVEMENT_STYLE[m].color} />
              </svg>
              {MOVEMENT_STYLE[m].label}
            </button>
          ))}
          <button
            onClick={() => setMode({ kind: "erase" })}
            className={toolChip(mode.kind === "erase")}
          >
            <span className="text-base leading-none" aria-hidden>🧽</span>
            Erase
          </button>
        </div>
      </div>

      <p className="text-center text-xs text-stone-400">
        {mode.kind === "move" && "Drag anything to move it."}
        {mode.kind === "place" && `Tap the pitch to place a ${TOKEN_LABELS[mode.token].toLowerCase()}.`}
        {mode.kind === "draw" && `Drag on the pitch to draw a ${MOVEMENT_STYLE[mode.movement].label.toLowerCase()} arrow.`}
        {mode.kind === "erase" && "Tap anything to rub it out."}
      </p>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${PITCH_W} ${PITCH_H}`}
        className="w-full touch-none select-none rounded-xl shadow-sm"
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        data-testid="board-canvas"
      >
        <Pitch />
        {board.movements.map((m) => (
          <MovementGlyph
            key={m.id}
            movement={m}
            onPointerDown={(e) => onMovementPointerDown(e, m)}
          />
        ))}
        {preview && <MovementGlyph movement={preview} preview />}
        {board.tokens.map((t) => (
          <g
            key={t.id}
            transform={`translate(${t.x} ${t.y})`}
            onPointerDown={(e) => onTokenPointerDown(e, t)}
          >
            {/* generous invisible hit area for cold thumbs */}
            <circle r={6} fill="transparent" />
            <TokenGlyph token={t} />
          </g>
        ))}
      </svg>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500">
        {MOVEMENT_TYPES.map((m) => (
          <span key={m} className="flex items-center gap-1.5">
            <svg viewBox="0 0 24 8" className="h-2.5 w-7 rounded-sm bg-pitch-dark">
              <line
                x1={2}
                y1={4}
                x2={22}
                y2={4}
                stroke={MOVEMENT_STYLE[m].color}
                strokeWidth={2}
                strokeDasharray={MOVEMENT_STYLE[m].dash
                  ?.split(" ")
                  .map((n) => Number(n) * 1.8)
                  .join(" ")}
              />
            </svg>
            {MOVEMENT_STYLE[m].label}
          </span>
        ))}
      </div>

      <button
        onClick={clearBoard}
        className="min-h-[44px] w-fit self-center rounded-lg px-3 text-sm font-medium text-rose-600"
      >
        Clear board
      </button>
    </div>
  );
}
