import type { ReactElement } from "react";

import { useRender } from "@base-ui/react/use-render";
import { Check } from "lucide-react";

import { cn } from "../cn";

/** Where a step stands in the flow. */
export type StepState = "done" | "current" | "upcoming";

export interface StepNavItem {
  id: string;
  label: string;
  state: StepState;
  /** The link that opens the step, such as `<Link to="…" search={…} />`. */
  render: ReactElement;
}

export interface StepNavProps {
  /** Names the steps for screen readers, such as "Steps". */
  label: string;
  steps: StepNavItem[];
}

interface StepLinkProps {
  step: StepNavItem;
  index: number;
}

function StepLink({ step, index }: StepLinkProps) {
  return useRender({
    render: step.render,
    props: {
      "aria-current": step.state === "current" ? "step" : undefined,
      className: cn(
        "group flex min-h-10 items-center gap-2.5 rounded-md py-1.5 pe-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        step.state === "current"
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground",
      ),
      children: (
        <>
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
              step.state === "current" &&
                "border-primary bg-primary text-primary-foreground",
              step.state === "done" &&
                "border-primary/30 bg-primary/10 text-primary",
              step.state === "upcoming" && "bg-background",
            )}
          >
            {step.state === "done" ? <Check className="size-3.5" /> : index + 1}
          </span>
          <span className="whitespace-nowrap">
            <span className="sr-only">{index + 1}. </span>
            {step.label}
          </span>
        </>
      ),
    },
  });
}

/**
 * The steps of a flow kept as a draft, each one a link: the current step
 * marked, the ones before it ticked. On a phone the row scrolls sideways.
 */
export function StepNav({ label, steps }: StepNavProps) {
  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ol className="flex w-max items-center gap-1">
        {steps.map((step, index) => (
          <li key={step.id} className="flex items-center gap-1">
            {index > 0 ? (
              <span aria-hidden className="h-px w-4 bg-border sm:w-6" />
            ) : null}
            <StepLink step={step} index={index} />
          </li>
        ))}
      </ol>
    </nav>
  );
}
