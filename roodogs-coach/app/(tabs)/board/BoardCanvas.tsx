"use client";

import type {
  Board,
  BoardMovement,
  BoardToken,
  MovementType,
  TokenType,
} from "@/lib/types";

// Pitch coordinate space — everything on a board is stored in these units.
export const PITCH_W = 100;
export const PITCH_H = 140;

export const MOVEMENT_STYLE: Record<
  MovementType,
  { color: string; dash?: string; label: string }
> = {
  run: { color: "#ffffff", label: "Run" },
  pass: { color: "#fde047", dash: "3 2", label: "Pass" },
  kick: { color: "#7dd3fc", dash: "1 2.2", label: "Kick" },
  tackle: { color: "#fb7185", label: "Tackle" },
  jump: { color: "#c4b5fd", dash: "3 2", label: "Jump" },
};

export const TOKEN_LABELS: Record<TokenType, string> = {
  player: "Player",
  opponent: "Defender",
  cone: "Cone",
  hurdle: "Hurdle",
  bag: "Tackle bag",
  ball: "Ball",
};

export function Pitch() {
  return (
    <g>
      <rect x={0} y={0} width={PITCH_W} height={PITCH_H} fill="#2f7a44" />
      <rect
        x={2}
        y={2}
        width={PITCH_W - 4}
        height={PITCH_H - 4}
        fill="none"
        stroke="#ffffff"
        strokeWidth={0.5}
        opacity={0.9}
      />
      {/* try lines */}
      <line x1={2} y1={14} x2={PITCH_W - 2} y2={14} stroke="#fff" strokeWidth={0.5} />
      <line x1={2} y1={PITCH_H - 14} x2={PITCH_W - 2} y2={PITCH_H - 14} stroke="#fff" strokeWidth={0.5} />
      {/* halfway */}
      <line x1={2} y1={PITCH_H / 2} x2={PITCH_W - 2} y2={PITCH_H / 2} stroke="#fff" strokeWidth={0.5} />
      {/* dashed lines either side of halfway */}
      <line x1={2} y1={42} x2={PITCH_W - 2} y2={42} stroke="#fff" strokeWidth={0.35} strokeDasharray="2 2" opacity={0.6} />
      <line x1={2} y1={PITCH_H - 42} x2={PITCH_W - 2} y2={PITCH_H - 42} stroke="#fff" strokeWidth={0.35} strokeDasharray="2 2" opacity={0.6} />
    </g>
  );
}

export function TokenGlyph({ token }: { token: BoardToken }) {
  switch (token.type) {
    case "player":
      return (
        <g>
          <circle r={3.4} fill="#ffffff" stroke="#14532d" strokeWidth={0.9} />
          {token.label && (
            <text
              textAnchor="middle"
              dy={1.2}
              fontSize={3.4}
              fontWeight={700}
              fill="#14532d"
            >
              {token.label}
            </text>
          )}
        </g>
      );
    case "opponent":
      return (
        <g stroke="#ef4444" strokeWidth={1.2} strokeLinecap="round">
          <line x1={-2.3} y1={-2.3} x2={2.3} y2={2.3} />
          <line x1={-2.3} y1={2.3} x2={2.3} y2={-2.3} />
        </g>
      );
    case "cone":
      return (
        <polygon
          points="0,-2.8 2.5,2.1 -2.5,2.1"
          fill="#fb923c"
          stroke="#ea580c"
          strokeWidth={0.4}
        />
      );
    case "hurdle":
      return (
        <rect
          x={-3.4}
          y={-1}
          width={6.8}
          height={2}
          rx={0.6}
          fill="#facc15"
          stroke="#ca8a04"
          strokeWidth={0.4}
        />
      );
    case "bag":
      return (
        <rect
          x={-1.7}
          y={-3.4}
          width={3.4}
          height={6.8}
          rx={1.5}
          fill="#3b82f6"
          stroke="#1d4ed8"
          strokeWidth={0.4}
        />
      );
    case "ball":
      return (
        <g transform="rotate(-30)">
          <ellipse rx={2.7} ry={1.7} fill="#a16207" stroke="#713f12" strokeWidth={0.4} />
          <line x1={-1.5} y1={0} x2={1.5} y2={0} stroke="#fef3c7" strokeWidth={0.35} />
        </g>
      );
  }
}

function arrowHeadPoints(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): string {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  const len = 3.2;
  const spread = 0.45;
  const p1 = `${toX - len * Math.cos(angle - spread)},${toY - len * Math.sin(angle - spread)}`;
  const p2 = `${toX - len * Math.cos(angle + spread)},${toY - len * Math.sin(angle + spread)}`;
  return `${toX},${toY} ${p1} ${p2}`;
}

export function MovementGlyph({
  movement,
  preview = false,
  onPointerDown,
}: {
  movement: BoardMovement;
  preview?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const pts = movement.points;
  if (pts.length < 2) return null;
  const start = pts[0];
  const end = pts[pts.length - 1];
  const style = MOVEMENT_STYLE[movement.type];

  let d: string;
  let arrowFrom = start;
  if (pts.length > 2) {
    // freehand: smooth curve through the sampled points
    d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
    }
    d += ` L ${end.x} ${end.y}`;
    arrowFrom = pts[pts.length - 2];
  } else if (movement.type === "jump") {
    // bow a straight jump so it reads as an arc
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - (dy / len) * len * 0.3;
    const cy = my + (dx / len) * len * 0.3;
    d = `M ${start.x} ${start.y} Q ${cx} ${cy} ${end.x} ${end.y}`;
    arrowFrom = { x: cx, y: cy };
  } else {
    d = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
  }

  const angle = Math.atan2(end.y - arrowFrom.y, end.x - arrowFrom.x);

  return (
    <g opacity={preview ? 0.6 : 1}>
      {/* fat invisible stroke so the arrow is easy to hit for erase */}
      {onPointerDown && (
        <path
          d={d}
          fill="none"
          stroke="transparent"
          strokeWidth={7}
          onPointerDown={onPointerDown}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={style.color}
        strokeWidth={1.1}
        strokeDasharray={style.dash}
        strokeLinecap="round"
        pointerEvents="none"
      />
      {movement.type === "tackle" ? (
        // a tackle ends in a T-bar, not an arrowhead
        <line
          x1={end.x - 2.2 * Math.sin(angle)}
          y1={end.y + 2.2 * Math.cos(angle)}
          x2={end.x + 2.2 * Math.sin(angle)}
          y2={end.y - 2.2 * Math.cos(angle)}
          stroke={style.color}
          strokeWidth={1.3}
          strokeLinecap="round"
          pointerEvents="none"
        />
      ) : (
        <polygon
          points={arrowHeadPoints(arrowFrom.x, arrowFrom.y, end.x, end.y)}
          fill={style.color}
          pointerEvents="none"
        />
      )}
    </g>
  );
}

/** Non-interactive thumbnail for board lists. */
export function BoardPreview({
  board,
  className,
}: {
  board: Board;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${PITCH_W} ${PITCH_H}`}
      className={className}
      role="img"
      aria-label={`Diagram: ${board.name}`}
    >
      <Pitch />
      {board.movements.map((m) => (
        <MovementGlyph key={m.id} movement={m} />
      ))}
      {board.tokens.map((t) => (
        <g key={t.id} transform={`translate(${t.x} ${t.y})`}>
          <TokenGlyph token={t} />
        </g>
      ))}
    </svg>
  );
}
