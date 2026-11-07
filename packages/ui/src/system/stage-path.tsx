import { cn } from "../cn";
import { Check } from "lucide-react";

/** One stage of a path, in the order a record moves through them. */
export interface PathStage<T extends string> {
  value: T;
  label: string;
}

export interface StagePathProps<T extends string> {
  /** Names the path for screen readers, such as "Pipeline". */
  label: string;
  stages: readonly PathStage<T>[];
  /** Where the record stands, or null once it has left the path. */
  current: T | null;
  /**
   * Said in place of the path's end when the record left it without
   * reaching it, such as a lead that was lost, with the stage it left at.
   */
  left?: { label: string; at: T | null };
}

/**
 * Where a record stands along the stages it moves through (Salesforce's
 * path): the stages behind it ticked, its own filled, those ahead plain.
 * A record that left the path early shows where it left and why. Moving
 * it is an action elsewhere; the path only reads.
 */
export function StagePath<T extends string>({
  label,
  stages,
  current,
  left,
}: StagePathProps<T>) {
  const reached = current ?? left?.at ?? null;
  const index = reached
    ? stages.findIndex((stage) => stage.value === reached)
    : -1;
  return (
    <ol
      aria-label={label}
      className="flex w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {stages.map((stage, position) => {
        const done = position < index || (position === index && !current);
        const here = position === index && current !== null;
        return (
          <li
            key={stage.value}
            aria-current={here ? "step" : undefined}
            className={cn(
              "flex h-9 min-w-28 flex-1 items-center justify-center gap-1.5 px-3 text-[13px] leading-[18px] font-medium whitespace-nowrap first:rounded-s-md last:rounded-e-md",
              here
                ? "bg-primary text-primary-foreground"
                : done
                  ? "bg-primary/12 text-primary"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {done ? <Check aria-hidden className="size-3.5" /> : null}
            {stage.label}
          </li>
        );
      })}
      {left ? (
        <li
          aria-current="step"
          className="flex h-9 min-w-28 flex-1 items-center justify-center rounded-e-md bg-destructive/12 px-3 text-[13px] leading-[18px] font-medium whitespace-nowrap text-destructive"
        >
          {left.label}
        </li>
      ) : null}
    </ol>
  );
}
