/**
 * Tracing a letter or number: the teacher writes it once, stroke by stroke,
 * in the school's own handwriting scheme, and each stroke a child makes is
 * held against the teacher's. Development Matters asks for the start point
 * and direction of a letter before its size, so a stroke counts when it
 * starts near the model's start, ends near its end and keeps close to its
 * path between, with room for small hands.
 */

/** A stroke as points across a square from 0 to 1: x, y, x, y and so on. */
export type Stroke = number[];

export const MAX_STROKES = 8;
export const MAX_STROKE_POINTS = 200;

const SAMPLES = 32;

/** How far a stroke may stray, as a share of the square's side. */
const NEAR_START = 0.16;
const NEAR_END = 0.2;
const NEAR_PATH = 0.12;

export type Point = [number, number];

const pointsOf = (stroke: Stroke): Point[] => {
  const points: Point[] = [];
  for (let index = 0; index + 1 < stroke.length; index += 2)
    points.push([stroke[index] ?? 0, stroke[index + 1] ?? 0]);
  return points;
};

const gap = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The stroke as so many points evenly spaced along it. */
export function resample(stroke: Stroke, count = SAMPLES): Point[] {
  const points = pointsOf(stroke);
  const first = points[0];
  if (!first) return [];
  if (points.length === 1) return Array.from({ length: count }, () => first);
  let length = 0;
  for (let index = 1; index < points.length; index++)
    length += gap(points[index - 1] ?? first, points[index] ?? first);
  if (length === 0) return Array.from({ length: count }, () => first);
  const step = length / (count - 1);
  const out: Point[] = [first];
  let carried = 0;
  for (let index = 1; index < points.length; index++) {
    let from = points[index - 1] ?? first;
    const to = points[index] ?? first;
    let left = gap(from, to);
    while (carried + left >= step && out.length < count) {
      const share = (step - carried) / left;
      const at: Point = [
        from[0] + (to[0] - from[0]) * share,
        from[1] + (to[1] - from[1]) * share,
      ];
      out.push(at);
      left -= step - carried;
      from = at;
      carried = 0;
    }
    carried += left;
  }
  const last = points.at(-1) ?? first;
  while (out.length < count) out.push(last);
  return out;
}

/** Whether a child's stroke follows the model's: its start, its end and its way between. */
export function strokeMatches(model: Stroke, drawn: Stroke): boolean {
  const a = resample(model);
  const b = resample(drawn);
  const start = a[0];
  const end = a.at(-1);
  if (!start || !end || b.length === 0) return false;
  if (gap(start, b[0] ?? start) > NEAR_START) return false;
  if (gap(end, b.at(-1) ?? end) > NEAR_END) return false;
  // A dot or a short tap is its own model: start and end are enough.
  const total = a.reduce(
    (sum, point, index) =>
      sum + (index ? gap(a[index - 1] ?? point, point) : 0),
    0,
  );
  if (total < NEAR_START) return true;
  const away =
    a.reduce((sum, point, index) => sum + gap(point, b[index] ?? point), 0) /
    a.length;
  return away <= NEAR_PATH;
}

/** Each model stroke against the child's stroke of the same place, by stroke number. */
export function traceResults(
  model: readonly Stroke[],
  drawn: readonly Stroke[],
): Record<string, boolean> {
  return Object.fromEntries(
    model.map((stroke, index) => {
      const answer = drawn[index];
      return [
        `stroke-${index + 1}`,
        answer !== undefined && strokeMatches(stroke, answer),
      ];
    }),
  );
}

/** A stroke kept short and on the square, so stored traces stay small. */
export function tidyStroke(points: Point[], limit = 64): Stroke {
  const origin: Point = [0, 0];
  const kept: Point[] =
    points.length <= limit
      ? points
      : Array.from(
          { length: limit },
          (_, index) =>
            points[Math.round((index * (points.length - 1)) / (limit - 1))] ??
            origin,
        );
  return kept.flatMap(([x, y]) => [
    Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000,
    Math.round(Math.min(1, Math.max(0, y)) * 1000) / 1000,
  ]);
}
