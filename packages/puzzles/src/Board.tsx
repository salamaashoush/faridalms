import type { ReactNode } from "react";

import { cn } from "@faridalms/ui/cn";
import { createElement, useMemo } from "react";

import type { Heading, Level } from "./level";
import type { Frame } from "./playback";
import type { Shape } from "./scene";
import type { PuzzleStrings } from "./strings";

import { HEADINGS } from "./level";
import { CELL, HERO, centreOf, sceneOf } from "./scene";

type Grid = Pick<Level, "cols" | "rows" | "walls" | "gems" | "start" | "goal">;

const camel = (name: string) =>
  name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());

function drawn(shapes: readonly Shape[], prefix: string): ReactNode[] {
  return shapes.map((shape, index) =>
    createElement(shape.tag, {
      key: `${prefix}-${index}`,
      className: shape.className,
      ...Object.fromEntries(
        Object.entries(shape.attrs).map(([name, value]) => [
          camel(name),
          value,
        ]),
      ),
    }),
  );
}

/** How far the hero lurches into a wall it cannot pass. */
const NUDGE = 9;
const LURCH: Record<Heading, readonly [number, number]> = {
  north: [0, -NUDGE],
  east: [NUDGE, 0],
  south: [0, NUDGE],
  west: [-NUDGE, 0],
};

const headingOf = (angle: number): Heading =>
  HEADINGS[(((Math.round(angle / 90) % 4) + 4) % 4) as 0 | 1 | 2 | 3];

/**
 * A puzzle's grid with the hero on it, as one frame of a run has it. The
 * picture is for the eye; the same grid is set out as a table for a reader
 * who cannot see it, square by square. East is always to the right, in
 * Arabic too, since the arrows a child presses point the way they move.
 */
export function Board({
  level,
  frame,
  ms,
  strings,
  className,
}: {
  level: Grid;
  frame: Frame;
  /** How long the hero takes to reach where this frame has it. */
  ms: number;
  /**
   * The words the grid is set out in for a reader who cannot see it. Left
   * out where the board is only a picture inside something that already
   * says what it is, as a button does.
   */
  strings?: PuzzleStrings;
  className?: string;
}) {
  const scene = useMemo(() => sceneOf(level), [level]);
  const [x, y] = centreOf(level, frame.cell);
  const [lurchX, lurchY] = frame.nudge ? LURCH[frame.nudge] : [0, 0];
  const taken = new Set(frame.taken);
  const holds = (words: PuzzleStrings, at: number) =>
    at === frame.cell
      ? words.square.hero(words.headings[headingOf(frame.angle)])
      : level.walls.includes(at)
        ? words.square.wall
        : at === level.goal
          ? words.square.goal
          : level.gems.includes(at) && !taken.has(at)
            ? words.square.gem
            : words.square.open;
  return (
    <figure
      dir="ltr"
      data-puzzle-board=""
      className={cn("mx-auto w-full", className)}
      style={{ maxWidth: level.cols * CELL * 1.4 }}
    >
      <svg
        aria-hidden
        viewBox={`0 0 ${scene.width} ${scene.height}`}
        className="block h-auto w-full rounded-lg bg-muted/40"
      >
        {drawn(scene.squares, "square")}
        {drawn(scene.goal, "goal")}
        {scene.gems.map((gem) => (
          <g
            key={gem.cell}
            className={cn(
              "transition-opacity duration-200",
              taken.has(gem.cell) && "opacity-0",
            )}
          >
            {drawn(gem.shapes, "gem")}
          </g>
        ))}
        <g
          data-puzzle-hero=""
          style={{
            transform: `translate(${x + lurchX}px, ${y + lurchY}px) rotate(${frame.angle}deg)`,
            transition: ms > 0 ? `transform ${ms}ms ease-in-out` : undefined,
          }}
        >
          {drawn(HERO, "hero")}
        </g>
      </svg>
      {strings ? (
        <table className="sr-only">
          <caption>{strings.board(level.cols, level.rows)}</caption>
          <tbody>
            {Array.from({ length: level.rows }, (_row, row) => (
              <tr key={row}>
                {Array.from({ length: level.cols }, (_cell, column) => (
                  <td key={column}>
                    {holds(strings, row * level.cols + column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </figure>
  );
}
