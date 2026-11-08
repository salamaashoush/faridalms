import { useId, useState } from "react";

import { cn } from "../cn";
import { useDesignSystem } from "./provider";

export interface TrendPoint {
  id: string;
  /** Where the point falls along the line, as a time. */
  at: string;
  value: number;
  /** What the point is, said in its tooltip and to screen readers. */
  label: string;
}

export interface TrendReference {
  /** Names the line where it ends, as the legend would. */
  label: string;
  /** The reference's value at each point's time, or null where it has none. */
  valueAt: (point: TrendPoint) => number | null;
}

export interface TrendChartProps {
  /** Names the chart; its points are listed for screen readers under it. */
  label: string;
  points: readonly TrendPoint[];
  /** A dashed line to read the points against, such as a norm. */
  reference?: TrendReference;
  className?: string;
}

const WIDTH = 640;
const HEIGHT = 200;
const PAD = { top: 16, end: 16, bottom: 24, start: 40 };

/**
 * One measure over time as a thin line with its points, and optionally a
 * dashed line to read it against. Each point says what it is when hovered
 * or focused, and the points are listed for screen readers; the page shows
 * the same figures in a table beside it.
 */
export function TrendChart({
  label,
  points,
  reference,
  className,
}: TrendChartProps) {
  const id = useId();
  const { direction, formatNumber } = useDesignSystem();
  const [active, setActive] = useState<string | null>(null);
  if (points.length === 0) return null;
  const times = points.map((point) => Date.parse(point.at));
  const first = Math.min(...times);
  const last = Math.max(...times);
  const references = reference
    ? points.map((point) => reference.valueAt(point))
    : [];
  const highest = Math.max(
    10,
    ...points.map((point) => point.value),
    ...references.filter((value): value is number => value !== null),
  );
  const top = Math.ceil(highest / 10) * 10;
  const span = last - first || 1;
  const rtl = direction === "rtl";
  const xOf = (time: number) => {
    const share = points.length === 1 ? 0.5 : (time - first) / span;
    const along = PAD.start + share * (WIDTH - PAD.start - PAD.end);
    return rtl ? WIDTH - along : along;
  };
  const yOf = (value: number) =>
    HEIGHT - PAD.bottom - (value / top) * (HEIGHT - PAD.top - PAD.bottom);
  const path = (values: readonly (number | null)[]) =>
    values
      .map((value, index) =>
        value === null
          ? null
          : `${xOf(times[index] ?? first)},${yOf(value)}`,
      )
      .filter(Boolean)
      .join(" ");
  const shown = points.find((point) => point.id === active);
  const ticks = [0, top / 2, top];
  return (
    <figure className={cn("grid gap-2", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby={`${id}-label`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.start}
              x2={WIDTH - PAD.end}
              y1={yOf(tick)}
              y2={yOf(tick)}
              className="stroke-border"
              strokeWidth={1}
            />
            <text
              x={rtl ? WIDTH - PAD.start + 8 : PAD.start - 8}
              y={yOf(tick)}
              dy="0.35em"
              textAnchor={rtl ? "start" : "end"}
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {formatNumber(tick)}
            </text>
          </g>
        ))}
        {reference && references.some((value) => value !== null) ? (
          <polyline
            points={path(references)}
            fill="none"
            strokeWidth={2}
            strokeDasharray="6 4"
            className="stroke-muted-foreground"
          />
        ) : null}
        <polyline
          points={path(points.map((point) => point.value))}
          fill="none"
          strokeWidth={2}
          strokeLinejoin="round"
          className="stroke-primary"
        />
        {points.map((point, index) => (
          <circle
            key={point.id}
            cx={xOf(times[index] ?? first)}
            cy={yOf(point.value)}
            r={point.id === active ? 6 : 4}
            strokeWidth={2}
            className="fill-primary stroke-background"
            tabIndex={0}
            aria-label={point.label}
            onPointerEnter={() => setActive(point.id)}
            onPointerLeave={() => setActive(null)}
            onFocus={() => setActive(point.id)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>
      <figcaption
        id={`${id}-label`}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] leading-[18px] text-muted-foreground"
      >
        <span className="font-medium text-foreground">{label}</span>
        {reference ? (
          <span className="inline-flex items-center gap-1.5">
            <svg aria-hidden viewBox="0 0 16 2" className="h-0.5 w-4">
              <line
                x1={0}
                x2={16}
                y1={1}
                y2={1}
                strokeWidth={2}
                strokeDasharray="4 3"
                className="stroke-muted-foreground"
              />
            </svg>
            {reference.label}
          </span>
        ) : null}
        <span aria-live="polite" className="tabular-nums">
          {shown?.label ?? ""}
        </span>
      </figcaption>
    </figure>
  );
}
