import type { CheckView, StudentBlock } from "@faridalms/domain/learning";
import type { Point, Stroke } from "@faridalms/domain/tracing";

import { strokeMatches, tidyStroke } from "@faridalms/domain/tracing";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { useMutation } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import * as m from "~/i18n/messages";
import { getMessageFromError } from "~/utils/error";

import type { CheckDriver } from "../Checks";

import { sayAloud } from "../ReadAloud";
import { hop, shake } from "./motion";
import { playSound } from "./sounds";
import { YoungOutcome } from "./YoungChoice";

type Tracing = Extract<StudentBlock, { type: "tracing" }>;

const pointsOf = (stroke: readonly number[]) => {
  const out: string[] = [];
  for (let index = 0; index + 1 < stroke.length; index += 2)
    out.push(`${stroke[index]},${stroke[index + 1]}`);
  return out.join(" ");
};

const calm = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface YoungTracingProps {
  block: Tracing;
  view: CheckView | undefined;
  driver: CheckDriver;
}

/**
 * Tracing a letter or number with a finger: the teacher's strokes show as a
 * wide road, the next one starting at a green dot. Each stroke the child
 * makes is checked as it ends, against where the teacher's starts, ends and
 * runs; a good one turns green and the next dot appears, a miss fades for
 * another go, and after two misses the stroke is shown being written.
 */
export function YoungTracing({ block, view, driver }: YoungTracingProps) {
  const settled = Boolean(view && (view.correct || view.revealed));
  const [done, setDone] = useState<Stroke[]>(
    view?.response?.type === "tracing" ? view.response.strokes : [],
  );
  // The line under the finger is drawn straight onto the board, a frame at
  // a time: kept in state, every move of the finger drew the whole board
  // again and the line fell behind the finger on a slow tablet.
  const [inking, setInking] = useState(false);
  const ink = useRef<Point[]>([]);
  const line = useRef<SVGPolylineElement>(null);
  const frame = useRef(0);
  const frameBox = useRef<DOMRect | null>(null);
  const [misses, setMisses] = useState(0);
  const [showing, setShowing] = useState(false);
  const board = useRef<SVGSVGElement>(null);
  const respond = useMutation({
    meta: { settlesAtOnce: true },
    mutationFn: (strokes: Stroke[]) =>
      driver.respond(block.id, { type: "tracing", strokes }),
    onSuccess: () => {
      playSound("right");
      hop(board.current?.parentElement);
      sayAloud(m.lrnYoungTraced(), null);
    },
    onError: (error) => toast.error(getMessageFromError(error)),
  });
  const current = settled ? block.strokes.length : done.length;
  const next = block.strokes[current];

  const at = (event: { clientX: number; clientY: number }): Point => {
    const box = frameBox.current;
    if (!box) return [0, 0];
    return [
      (event.clientX - box.left) / box.width,
      (event.clientY - box.top) / box.height,
    ];
  };
  const draw = () => {
    frame.current = 0;
    line.current?.setAttribute(
      "points",
      ink.current.map(([x, y]) => `${x},${y}`).join(" "),
    );
  };

  const watch = () => {
    setShowing(true);
    setTimeout(() => setShowing(false), calm() ? 800 : 1600);
  };

  const finish = (drawn: Point[]) => {
    setInking(false);
    if (!next) return;
    const stroke = tidyStroke(drawn);
    if (!strokeMatches(next, stroke)) {
      playSound("wrong");
      shake(board.current?.parentElement);
      const missed = misses + 1;
      setMisses(missed);
      // After two misses the stroke is written for the child to watch.
      if (missed >= 2) watch();
      return;
    }
    playSound("tap");
    setMisses(0);
    const traced = [...done, stroke];
    setDone(traced);
    if (traced.length === block.strokes.length) respond.mutate(traced);
  };

  return (
    <div className="grid justify-items-center gap-5">
      <div className="w-full max-w-[min(32rem,62vh)]">
        <svg
          ref={board}
          viewBox="0 0 1 1"
          // Tracing is the path itself, which WCAG 2.5.1 allows to need one.
          aria-hidden
          className="aspect-square w-full touch-none rounded-3xl border-2 bg-card select-none"
          onPointerDown={(event) => {
            if (!event.isPrimary || settled || respond.isPending || !next)
              return;
            event.currentTarget.setPointerCapture(event.pointerId);
            frameBox.current = event.currentTarget.getBoundingClientRect();
            ink.current = [at(event)];
            setInking(true);
            // The line is on the board by the next frame, and drawn then.
            frame.current = requestAnimationFrame(draw);
          }}
          onPointerMove={(event) => {
            if (!inking || !event.isPrimary) return;
            // A fast finger reports several places between two frames;
            // Safari before 18 gives only the last, which then serves.
            const between =
              "getCoalescedEvents" in event.nativeEvent
                ? event.nativeEvent.getCoalescedEvents()
                : [];
            for (const each of between.length > 0 ? between : [event])
              ink.current.push(at(each));
            if (!frame.current) frame.current = requestAnimationFrame(draw);
          }}
          onPointerUp={() => {
            if (inking) finish(ink.current);
          }}
          onPointerCancel={() => setInking(false)}
        >
          {[0.25, 0.5, 0.75].map((y) => (
            <line
              key={y}
              x1="0.03"
              x2="0.97"
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth={0.005}
              strokeDasharray={y === 0.5 ? "0.02 0.02" : undefined}
              className="text-muted-foreground/40"
            />
          ))}
          {block.strokes.map((stroke, index) => (
            <polyline
              key={`road-${index}`}
              points={pointsOf(stroke)}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.13}
              strokeLinecap="round"
              strokeLinejoin="round"
              className={cn(
                index < current
                  ? "text-success/25"
                  : "text-muted-foreground/15",
              )}
            />
          ))}
          {(settled ? block.strokes : done).map((stroke, index) => (
            <polyline
              key={`done-${index}`}
              points={pointsOf(stroke)}
              fill="none"
              stroke="currentColor"
              strokeWidth={0.05}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-success"
            />
          ))}
          {next && !settled ? (
            <>
              <polyline
                points={pointsOf(next)}
                fill="none"
                stroke="currentColor"
                strokeWidth={0.012}
                strokeDasharray="0.03 0.025"
                strokeLinecap="round"
                className="text-foreground/50"
              />
              {showing ? (
                <polyline
                  key={`watch-${current}-${misses}`}
                  points={pointsOf(next)}
                  pathLength={1}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={0.05}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1"
                  className="text-primary motion-safe:animate-[trace-draw_1.4s_ease-in-out_forwards]"
                />
              ) : null}
              <circle
                cx={next[0]}
                cy={next[1]}
                r={0.05}
                className="fill-success"
              />
              <text
                x={next[0]}
                y={next[1]}
                dy={0.02}
                textAnchor="middle"
                fontSize={0.06}
                className="fill-white font-bold"
              >
                {current + 1}
              </text>
            </>
          ) : null}
          {inking ? (
            <polyline
              ref={line}
              points=""
              fill="none"
              stroke="currentColor"
              strokeWidth={0.05}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-primary"
            />
          ) : null}
        </svg>
      </div>
      {settled ? null : (
        <Button
          type="button"
          variant="outline"
          className="h-14 rounded-full px-6 text-lg"
          onClick={watch}
        >
          <Eye aria-hidden className="size-5" />
          {m.lrnYoungWatchMe()}
        </Button>
      )}
      <output aria-live="polite">
        <YoungOutcome view={view} praise={m.lrnYoungTraced()} />
      </output>
    </div>
  );
}
