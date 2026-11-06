import { cn } from "@faridalms/ui/cn";
import { useId } from "react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

/** Labelled ticks at most, so a phone's line stays readable. */
const MAX_LABELS = 11;

/** The places of a line, rounded to its step so floating sums never show. */
function placesOf(from: number, to: number, step: number) {
  const decimals = (String(step).split(".")[1] ?? "").length;
  const count = Math.round((to - from) / step);
  return Array.from({ length: count + 1 }, (_, index) =>
    Number((from + index * step).toFixed(decimals)),
  );
}

/**
 * How many steps apart labels stand: the fewest that fit, landing on both
 * ends where the steps divide evenly.
 */
function labelEvery(steps: number) {
  for (let every = 1; every <= steps; every++)
    if (steps % every === 0 && steps / every + 1 <= MAX_LABELS) return every;
  return Math.ceil((steps + 1) / MAX_LABELS);
}

export interface NumberLineProps {
  line: { from: number; to: number; step: number };
  value: number | null;
  onChange: (value: number) => void;
  disabled: boolean;
  /** Whether the placed answer was right, once checked. */
  mark: "right" | "wrong" | null;
}

/**
 * A number line a student places their answer on, from `from` to `to` in
 * steps: a range control the keyboard moves a step at a time, over ticks
 * labelled as the space allows. A line reads left to right in either
 * language, as number lines are printed.
 */
export function NumberLine({
  line,
  value,
  onChange,
  disabled,
  mark,
}: NumberLineProps) {
  const id = useId();
  const places = placesOf(line.from, line.to, line.step);
  const every = labelEvery(places.length - 1);
  const at = value ?? line.from;
  const share = ((at - line.from) / (line.to - line.from)) * 100;
  return (
    <div dir="ltr" className="grid gap-1 px-2">
      <label htmlFor={id} className="sr-only">
        {m.lrnNumberLine({
          from: formatNumber(line.from),
          to: formatNumber(line.to),
        })}
      </label>
      <div className="relative h-10 rounded-md has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ring">
        <div
          aria-hidden
          className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-foreground/60"
        />
        {places.map((place, index) => (
          <span
            key={place}
            aria-hidden
            className={cn(
              "absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/60",
              index % every === 0 ? "h-4" : "h-2",
            )}
            style={{ left: `${(index / (places.length - 1)) * 100}%` }}
          />
        ))}
        {value === null ? null : (
          <span
            aria-hidden
            className={cn(
              "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow",
              mark === "right"
                ? "bg-success"
                : mark === "wrong"
                  ? "bg-destructive"
                  : "bg-primary",
            )}
            style={{ left: `${share}%` }}
          />
        )}
        <input
          id={id}
          type="range"
          min={line.from}
          max={line.to}
          step={line.step}
          value={at}
          disabled={disabled}
          aria-valuetext={
            value === null ? m.lrnNumberLinePlace() : formatNumber(at)
          }
          onChange={(event) => onChange(Number(event.target.value))}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>
      <div
        aria-hidden
        className="relative h-5 text-xs text-muted-foreground tabular-nums"
      >
        {places.map((place, index) =>
          index % every === 0 ? (
            <span
              key={place}
              className="absolute -translate-x-1/2"
              style={{ left: `${(index / (places.length - 1)) * 100}%` }}
            >
              {formatNumber(place)}
            </span>
          ) : null,
        )}
      </div>
      <output htmlFor={id} className="text-sm leading-5">
        {value === null
          ? m.lrnNumberLinePlace()
          : m.lrnNumberLinePlaced({ value: formatNumber(at) })}
      </output>
    </div>
  );
}

export interface NumberLineDrawingProps {
  line: { from: number; to: number; step: number };
  value: number | null;
}

/** A number line as paper prints it: its ticks and labels, and the answer once shown. */
export function NumberLineDrawing({ line, value }: NumberLineDrawingProps) {
  const places = placesOf(line.from, line.to, line.step);
  const every = labelEvery(places.length - 1);
  const at = (place: number) =>
    `${((place - line.from) / (line.to - line.from)) * 100}%`;
  return (
    <div dir="ltr" className="px-3 pt-2 pb-1">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px bg-neutral-700" />
        {places.map((place, index) => (
          <span
            key={place}
            className={cn(
              "absolute top-1/2 w-px -translate-x-1/2 -translate-y-1/2 bg-neutral-700",
              index % every === 0 ? "h-3" : "h-1.5",
            )}
            style={{ left: at(place) }}
          />
        ))}
        {value === null ? null : (
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900"
            style={{ left: at(value) }}
          />
        )}
      </div>
      <div className="relative h-4 text-[0.75em] tabular-nums">
        {places.map((place, index) =>
          index % every === 0 ? (
            <span
              key={place}
              className="absolute -translate-x-1/2"
              style={{ left: at(place) }}
            >
              {formatNumber(place)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}
