import type { Heading, Level } from "./level";

import { columnOf, rowOf } from "./level";

/** The side of one square, in the board's own units. */
export const CELL = 48;

/**
 * One drawn shape of a board. Shapes are plain data, so the lesson draws
 * them with React and the editor, which builds its own DOM, draws the very
 * same board.
 */
export interface Shape {
  tag: "rect" | "path" | "circle" | "polygon";
  className: string;
  attrs: Record<string, string | number>;
}

export interface Scene {
  width: number;
  height: number;
  squares: Shape[];
  goal: Shape[];
  gems: { cell: number; shapes: Shape[] }[];
}

type Grid = Pick<Level, "cols" | "rows" | "walls" | "gems" | "goal">;

/** The middle of a square on the board. */
export function centreOf(
  level: Pick<Level, "cols">,
  at: number,
): readonly [number, number] {
  return [
    columnOf(level, at) * CELL + CELL / 2,
    rowOf(level, at) * CELL + CELL / 2,
  ];
}

const points = (pairs: readonly (readonly [number, number])[]) =>
  pairs.map(([x, y]) => `${x},${y}`).join(" ");

function star(x: number, y: number, outer: number, inner: number): string {
  return points(
    Array.from({ length: 10 }, (_, tip) => {
      const reach = tip % 2 === 0 ? outer : inner;
      const angle = (Math.PI / 5) * tip - Math.PI / 2;
      return [
        Math.round((x + reach * Math.cos(angle)) * 100) / 100,
        Math.round((y + reach * Math.sin(angle)) * 100) / 100,
      ] as const;
    }),
  );
}

/** A board's floor, walls, goal and gems, laid out square by square. */
export function sceneOf(level: Grid): Scene {
  const walls = new Set(level.walls);
  const squares: Shape[] = Array.from(
    { length: level.cols * level.rows },
    (_, at) => ({
      tag: "rect",
      className: walls.has(at)
        ? "fill-foreground/70 stroke-background"
        : "fill-card stroke-border",
      attrs: {
        x: columnOf(level, at) * CELL + 1,
        y: rowOf(level, at) * CELL + 1,
        width: CELL - 2,
        height: CELL - 2,
        rx: 6,
      },
    }),
  );
  const [goalX, goalY] = centreOf(level, level.goal);
  return {
    width: level.cols * CELL,
    height: level.rows * CELL,
    squares,
    goal: [
      {
        tag: "rect",
        className: "fill-success/15 stroke-success",
        attrs: {
          x: goalX - CELL / 2 + 3,
          y: goalY - CELL / 2 + 3,
          width: CELL - 6,
          height: CELL - 6,
          rx: 5,
          "stroke-width": 2,
        },
      },
      {
        tag: "polygon",
        className: "fill-success",
        attrs: { points: star(goalX, goalY, 14, 6) },
      },
    ],
    gems: level.gems.map((at) => {
      const [x, y] = centreOf(level, at);
      return {
        cell: at,
        shapes: [
          {
            tag: "polygon",
            className: "fill-info stroke-info-foreground/30",
            attrs: {
              points: points([
                [x, y - 12],
                [x + 10, y],
                [x, y + 12],
                [x - 10, y],
              ]),
            },
          },
        ],
      };
    }),
  };
}

/**
 * The hero, drawn about the middle of its square and facing up the board:
 * a body, a nose that shows which way it faces, and two eyes.
 */
export const HERO: readonly Shape[] = [
  {
    tag: "polygon",
    className: "fill-primary",
    attrs: {
      points: points([
        [0, -19],
        [8, -9],
        [-8, -9],
      ]),
    },
  },
  {
    tag: "rect",
    className: "fill-primary",
    attrs: { x: -14, y: -12, width: 28, height: 26, rx: 8 },
  },
  {
    tag: "circle",
    className: "fill-primary-foreground",
    attrs: { cx: -6, cy: -3, r: 3.5 },
  },
  {
    tag: "circle",
    className: "fill-primary-foreground",
    attrs: { cx: 6, cy: -3, r: 3.5 },
  },
];

/** How far round the hero is turned to face each way, in degrees. */
export const TURNED: Record<Heading, number> = {
  north: 0,
  east: 90,
  south: 180,
  west: 270,
};
