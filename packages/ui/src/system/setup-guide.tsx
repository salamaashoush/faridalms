import type { ReactElement, ReactNode } from "react";

import { useRender } from "@base-ui/react/use-render";
import { Check } from "lucide-react";
import { useId } from "react";

import { Button, buttonVariants } from "../button";
import { cn } from "../cn";
import { useDesignSystem } from "./provider";
import { StatusText } from "./status";

/** One thing to set up, done or not from what the organisation's data shows. */
export interface SetupGuideStep {
  id: string;
  title: string;
  /** What the step is and why it comes where it does, in a sentence or two. */
  description: string;
  done: boolean;
  /** Worth doing, but the setup is finished without it. */
  optional?: boolean;
  /** The link to where the step is taken, such as `<Link to="…" />`. */
  link?: ReactElement;
  /** Said instead of a link to someone who cannot take the step: who does. */
  note?: string;
}

export interface SetupGuideProps {
  title: string;
  steps: readonly SetupGuideStep[];
  /** Said once every step but the optional ones is done. */
  finished?: string;
  /** Hides the guide; offered only once it is finished. */
  onHide?: () => void;
  hiding?: boolean;
  /** Below the steps: what else is on the way, which the guide does not count. */
  children?: ReactNode;
}

interface StepLinkProps {
  step: SetupGuideStep & { link: ReactElement };
  next: boolean;
}

function StepLink({ step, next }: StepLinkProps) {
  const { strings } = useDesignSystem();
  const label = step.done
    ? strings.setupReview
    : next
      ? strings.setupStart
      : strings.setupOpen;
  return useRender({
    render: step.link,
    props: {
      className: cn(
        buttonVariants({ variant: next ? "default" : "outline", size: "sm" }),
        "max-md:h-10",
      ),
      // Every step has a link with the same word, so each is named for its step.
      "aria-label": `${label}: ${step.title}`,
      children: label,
    },
  });
}

/**
 * An organisation's first setup as an ordered list of steps, each ticked
 * from its own data and linked to the page that takes it, the next one
 * marked. It can be hidden only once everything but the optional steps is
 * done, so it cannot be put away half finished.
 */
export function SetupGuide({
  title,
  steps,
  finished,
  onHide,
  hiding = false,
  children,
}: SetupGuideProps) {
  const { strings, formatNumber } = useDesignSystem();
  const headingId = useId();
  const done = steps.filter((step) => step.done).length;
  const complete = steps.every((step) => step.done || step.optional);
  const next =
    steps.find((step) => !step.done && !step.optional) ??
    steps.find((step) => !step.done);
  const progress = strings.setupProgress(
    formatNumber(done),
    formatNumber(steps.length),
  );
  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-lg border bg-card"
    >
      <header className="grid gap-3 border-b px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="grid gap-0.5">
            <h2 id={headingId} className="text-base leading-6 font-semibold">
              {title}
            </h2>
            <p className="text-[13px] leading-[18px] text-muted-foreground">
              {complete && finished ? finished : progress}
            </p>
          </div>
          {complete && onHide ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="max-md:h-10"
              disabled={hiding}
              onClick={onHide}
            >
              {strings.setupHide}
            </Button>
          ) : null}
        </div>
        <div
          role="progressbar"
          aria-label={progress}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
            style={{
              width: `${steps.length ? (done / steps.length) * 100 : 0}%`,
            }}
          />
        </div>
      </header>
      <ol className="divide-y">
        {steps.map((step, index) => {
          const current = step.id === next?.id;
          return (
            <li
              key={step.id}
              aria-current={current ? "step" : undefined}
              className={cn(
                "grid grid-cols-[1.5rem_1fr] gap-x-3 gap-y-3 px-4 py-4 sm:grid-cols-[1.5rem_1fr_auto] sm:items-center",
                current && "bg-primary/5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-6 items-center justify-center self-start rounded-full border text-xs font-semibold tabular-nums",
                  step.done && "border-primary/30 bg-primary/10 text-primary",
                  current &&
                    !step.done &&
                    "border-primary bg-primary text-primary-foreground",
                  !step.done && !current && "bg-background",
                )}
              >
                {step.done ? (
                  <Check className="size-3.5" />
                ) : (
                  formatNumber(index + 1)
                )}
              </span>
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="text-sm leading-5 font-medium">
                    {step.title}
                  </h3>
                  <StatusText tone={step.done ? "success" : "neutral"}>
                    {step.done
                      ? strings.setupDone
                      : step.optional
                        ? strings.setupOptional
                        : strings.setupToDo}
                  </StatusText>
                </div>
                <p className="text-[13px] leading-[18px] text-muted-foreground">
                  {step.description}
                </p>
                {!step.link && step.note ? (
                  <p className="text-[13px] leading-[18px] text-muted-foreground">
                    {step.note}
                  </p>
                ) : null}
              </div>
              {step.link ? (
                <div className="col-start-2 sm:col-start-3">
                  <StepLink step={{ ...step, link: step.link }} next={current} />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
      {children ? <div className="border-t">{children}</div> : null}
    </section>
  );
}
