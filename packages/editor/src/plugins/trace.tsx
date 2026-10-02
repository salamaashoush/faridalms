import type { Point } from "@faridalms/domain/tracing";

import { tidyStroke } from "@faridalms/domain/tracing";
import { Check, RotateCcw, Undo2, X } from "lucide-react";
import { useRef, useState } from "react";

import { useEditorEnvironment } from "../context";

/** Evens out a hand-drawn line, so a mouse's jitter is not what children trace. */
function smooth(points: Point[]): Point[] {
  if (points.length < 3) return points;
  return points.map((point, index) => {
    const before = points[index - 1] ?? point;
    const after = points[index + 1] ?? point;
    return [
      (before[0] + point[0] * 2 + after[0]) / 4,
      (before[1] + point[1] * 2 + after[1]) / 4,
    ];
  });
}

const pointsOf = (stroke: readonly number[]) => {
  const out: string[] = [];
  for (let index = 0; index + 1 < stroke.length; index += 2)
    out.push(`${stroke[index]},${stroke[index + 1]}`);
  return out.join(" ");
};

const button =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50 max-md:h-10 [&_svg]:size-4";

/**
 * Where a teacher writes the letter or number children will trace, one
 * stroke at a time, in the order and direction they should form it.
 */
export function TracePad({
  strokes: initial,
  onDone,
  onClose,
}: {
  strokes: readonly number[][];
  onDone: (strokes: number[][]) => void;
  onClose: () => void;
}) {
  const { strings } = useEditorEnvironment();
  const [strokes, setStrokes] = useState<number[][]>([...initial]);
  const [drawing, setDrawing] = useState<Point[] | null>(null);
  const pad = useRef<SVGSVGElement>(null);

  const at = (event: React.PointerEvent): Point => {
    const box = pad.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
    ];
  };

  return (
    <div className="grid gap-3">
      <div className="flex items-start gap-2">
        <div className="grid flex-1 gap-0.5">
          <p className="text-sm leading-5 font-medium">
            {strings.questionDrawTrace}
          </p>
          <p className="text-xs leading-4 text-muted-foreground">
            {strings.questionDrawTraceHint}
          </p>
        </div>
        <button
          type="button"
          aria-label={strings.narrationClose}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground max-md:size-10"
          onClick={onClose}
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <svg
        ref={pad}
        viewBox="0 0 1 1"
        aria-hidden
        className="aspect-square w-full touch-none rounded-lg border bg-background"
        onPointerDown={(event) => {
          if (!event.isPrimary) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setDrawing([at(event)]);
        }}
        onPointerMove={(event) => {
          if (!drawing) return;
          setDrawing([...drawing, at(event)]);
        }}
        onPointerUp={() => {
          if (!drawing) return;
          setStrokes([...strokes, tidyStroke(smooth(drawing))]);
          setDrawing(null);
        }}
        onPointerCancel={() => setDrawing(null)}
      >
        {/* Writing lines, as on a child's page. */}
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1="0"
            x2="1"
            y1={y}
            y2={y}
            stroke="currentColor"
            strokeWidth={0.004}
            strokeDasharray={y === 0.5 ? "0.02 0.02" : undefined}
            className="text-muted-foreground/40"
          />
        ))}
        {strokes.map((stroke, index) => (
          <g key={index}>
            <polyline
              points={pointsOf(stroke)}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.04}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle
              cx={stroke[0]}
              cy={stroke[1]}
              r={0.035}
              className="fill-success"
            />
            <text
              x={stroke[0]}
              y={stroke[1]}
              dy={0.016}
              textAnchor="middle"
              fontSize={0.045}
              className="fill-white font-bold"
            >
              {index + 1}
            </text>
          </g>
        ))}
        {drawing ? (
          <polyline
            points={drawing.map(([x, y]) => `${x},${y}`).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.04}
            strokeLinecap="round"
            className="text-primary"
          />
        ) : null}
      </svg>
      <div className="-ms-2.5 flex flex-wrap items-center gap-1">
        <button
          type="button"
          className={button}
          disabled={strokes.length === 0}
          onClick={() => setStrokes(strokes.slice(0, -1))}
        >
          <Undo2 aria-hidden />
          {strings.questionTraceUndo}
        </button>
        <button
          type="button"
          className={button}
          disabled={strokes.length === 0}
          onClick={() => setStrokes([])}
        >
          <RotateCcw aria-hidden />
          {strings.questionTraceClear}
        </button>
        <button
          type="button"
          className={`${button} ms-auto bg-primary text-primary-foreground hover:bg-primary/90`}
          onClick={() => onDone(strokes)}
        >
          <Check aria-hidden />
          {strings.questionDone}
        </button>
      </div>
    </div>
  );
}
