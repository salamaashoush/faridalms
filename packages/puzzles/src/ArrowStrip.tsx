import type { LucideIcon } from "lucide-react";

import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Delete,
  Trash2,
} from "lucide-react";

import type { Heading } from "./level";
import type { Program } from "./program";
import type { Place } from "./run";
import type { PuzzleStrings } from "./strings";

const ICONS: Record<Heading, LucideIcon> = {
  north: ArrowUp,
  east: ArrowRight,
  south: ArrowDown,
  west: ArrowLeft,
};

/** Where each arrow sits on the pad: a cross, as on a game controller. */
const PAD: Record<Heading, string> = {
  north: "col-start-2 row-start-1",
  west: "col-start-1 row-start-2",
  east: "col-start-3 row-start-2",
  south: "col-start-2 row-start-3",
};

/**
 * A program as a young child builds it: a row of arrows, added by pressing
 * the four arrows of a pad. The arrows point where the hero will step on
 * the board, so the pad is never mirrored. A step is taken out by pressing
 * it, the last one with the undo key.
 */
export function ArrowStrip({
  program,
  onChange,
  limit,
  at,
  strings,
}: {
  program: Program;
  /** Absent where the program is only read. */
  onChange?: (program: Program) => void;
  limit: number | null;
  /** The step being carried out as the run plays. */
  at: Place | null;
  strings: PuzzleStrings;
}) {
  const steps = program.flatMap((step) => (step.op === "go" ? [step.to] : []));
  const full = limit !== null && steps.length >= limit;
  const set = (next: readonly Heading[]) =>
    onChange?.(next.map((to) => ({ op: "go", to })));
  return (
    <div className="grid gap-4">
      {steps.length === 0 ? (
        <p className="flex min-h-14 items-center rounded-lg border border-dashed px-4 text-base leading-6 text-muted-foreground">
          {strings.noSteps}
        </p>
      ) : (
        <ol
          aria-label={strings.steps}
          className="flex min-h-14 flex-wrap gap-2 rounded-lg border bg-muted/30 p-2"
        >
          {steps.map((to, index) => {
            const Icon = ICONS[to];
            const running = at?.[0] === index;
            const chip = cn(
              "flex size-10 items-center justify-center rounded-md border bg-card text-foreground",
              running && "border-primary bg-primary text-primary-foreground",
            );
            return (
              <li
                // A step is nothing but its arrow and its place in the row.
                key={`${index}:${to}`}
                data-step={to}
                aria-current={running || undefined}
              >
                {onChange ? (
                  <button
                    type="button"
                    aria-label={strings.removeStep(
                      index + 1,
                      strings.arrows[to],
                    )}
                    className={cn(
                      chip,
                      "outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                    )}
                    onClick={() => set(steps.toSpliced(index, 1))}
                  >
                    <Icon aria-hidden className="size-5" />
                  </button>
                ) : (
                  <span className={chip}>
                    <Icon aria-hidden className="size-5" />
                    <span className="sr-only">{strings.arrows[to]}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {onChange ? (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div dir="ltr" className="grid grid-cols-3 grid-rows-3 gap-1.5">
            {(Object.keys(PAD) as Heading[]).map((to) => {
              const Icon = ICONS[to];
              return (
                <Button
                  key={to}
                  type="button"
                  variant="outline"
                  aria-label={strings.arrows[to]}
                  disabled={full}
                  className={cn("size-14 select-none", PAD[to])}
                  onClick={() => set([...steps, to])}
                >
                  <Icon aria-hidden className="size-7" />
                </Button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-12"
              disabled={steps.length === 0}
              onClick={() => set(steps.slice(0, -1))}
            >
              <Delete aria-hidden />
              {strings.undo}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              disabled={steps.length === 0}
              onClick={() => set([])}
            >
              <Trash2 aria-hidden />
              {strings.clear}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
