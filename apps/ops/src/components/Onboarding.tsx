import type { OperatorItem } from "@faridalms/domain/onboarding";

import {
  isOperatorItem,
  ONBOARDING_SOURCE,
} from "@faridalms/domain/onboarding";
import { Checkbox } from "@faridalms/ui/checkbox";
import { cn } from "@faridalms/ui/cn";
import { Progress } from "@faridalms/ui/progress";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { SchoolHealth } from "../server/health";

import { attempt } from "../actions";
import {
  formatShortWhen,
  formatWhen,
  ONBOARDING_ITEM_NAMES,
  ONBOARDING_PHASES,
} from "../format";
import { useMay } from "../may";
import { markOnboardingStep } from "../server/directory";

const SOURCE_HINT = {
  measured: "seen in its data",
  billing: "from billing",
  operator: "ticked by us",
} as const;

interface StepCheckProps {
  schoolId: string;
  item: OperatorItem;
  done: boolean;
}

/** One of an operator's own steps, ticked off where it is listed. */
function StepCheck({ schoolId, item, done }: StepCheckProps) {
  const router = useRouter();
  const mark = useServerFn(markOnboardingStep);
  const [saving, setSaving] = useState(false);
  return (
    <Checkbox
      checked={done}
      disabled={saving}
      aria-label={ONBOARDING_ITEM_NAMES[item]}
      onCheckedChange={async (checked) => {
        setSaving(true);
        const failed = await attempt(
          () => mark({ data: { schoolId, item, done: checked } }),
          "The step could not be changed.",
        );
        if (failed) toast.error(failed);
        else await router.invalidate();
        setSaving(false);
      }}
    />
  );
}

/** Who takes a step not yet taken. */
const WHO_TAKES = {
  measured: "The school",
  billing: "Billing",
  operator: "Us",
} as const;

export interface OnboardingStepsProps {
  schoolId: string;
  health: SchoolHealth;
  /** When its cell last reported its data, or null before it ever has. */
  measuredAt: string | null;
}

/**
 * The school's first steps in the phases a school takes them: each phase's
 * progress, and in it each step with the day it was taken or who takes it
 * next. The operator's own steps are ticked off in place.
 */
export function OnboardingSteps({
  schoolId,
  health,
  measuredAt,
}: OnboardingStepsProps) {
  const mayTick = useMay("tenants");
  const { applies, reached } = health.onboarding;
  return (
    <div className="@container grid gap-3">
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {`Its cell checks its data once a day, ${
          measuredAt ? `last ${formatWhen(measuredAt)}` : "and has not yet"
        }. The school's administrators see the same steps on their Today page.`}
      </p>
      <div className="grid gap-4 @2xl:grid-cols-3">
        {ONBOARDING_PHASES.map((phase) => {
          const items = phase.items.filter((item) => applies.includes(item));
          if (items.length === 0) return null;
          const done = items.filter((item) => reached[item]).length;
          return (
            <section
              key={phase.title}
              aria-label={phase.title}
              className="grid content-start gap-3 rounded-lg border bg-card p-4"
            >
              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm leading-5 font-semibold">
                    {phase.title}
                  </h3>
                  <span className="text-[13px] leading-[18px] text-muted-foreground tabular-nums">
                    {done} of {items.length}
                  </span>
                </div>
                <Progress
                  value={(done / items.length) * 100}
                  aria-label={`${phase.title}: ${done} of ${items.length}`}
                />
              </div>
              <ul className="grid gap-2.5">
                {items.map((item) => {
                  const step = reached[item];
                  const source = ONBOARDING_SOURCE[item];
                  return (
                    <li key={item} className="flex items-start gap-2.5">
                      <span className="mt-0.5 grid size-4 shrink-0 place-items-center">
                        {mayTick && isOperatorItem(item) ? (
                          <StepCheck
                            schoolId={schoolId}
                            item={item}
                            done={Boolean(step)}
                          />
                        ) : step ? (
                          <Check
                            className="size-4 text-success"
                            aria-label="Done"
                          />
                        ) : (
                          <Circle
                            className="size-4 text-muted-foreground/50"
                            aria-label="Not yet"
                          />
                        )}
                      </span>
                      <span className="grid min-w-0">
                        <span
                          className={cn(
                            "text-sm leading-5",
                            !step && "text-muted-foreground",
                          )}
                        >
                          {ONBOARDING_ITEM_NAMES[item]}
                        </span>
                        <span className="text-[13px] leading-[18px] text-muted-foreground">
                          {step
                            ? `${formatShortWhen(step.at)} · ${SOURCE_HINT[source]}`
                            : WHO_TAKES[source]}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
