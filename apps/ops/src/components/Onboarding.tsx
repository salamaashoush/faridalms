import type { OperatorItem } from "@faridalms/domain/onboarding";

import {
  isOperatorItem,
  ONBOARDING_SOURCE,
} from "@faridalms/domain/onboarding";
import { Button } from "@faridalms/ui/button";
import { Progress } from "@faridalms/ui/progress";
import { RecordList, RecordSection } from "@faridalms/ui/system/record-page";
import { StatusText } from "@faridalms/ui/system/status";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Circle } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import type { SchoolHealth } from "../server/health";

import { attempt } from "../actions";
import {
  formatWhen,
  HEALTH_REASON_NAMES,
  ONBOARDING_ITEM_NAMES,
} from "../format";
import { useMay } from "../may";
import { markOnboardingStep } from "../server/directory";
import { HEALTH_TONE, HealthBadge } from "./Health";

const SOURCE_HINT = {
  measured: "Seen in its data",
  billing: "From billing",
  operator: "Ticked by an operator",
} as const;

interface TickProps {
  schoolId: string;
  item: OperatorItem;
  done: boolean;
}

function Tick({ schoolId, item, done }: TickProps) {
  const router = useRouter();
  const mark = useServerFn(markOnboardingStep);
  const [saving, setSaving] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant={done ? "ghost" : "outline"}
      disabled={saving}
      aria-label={`${done ? "Untick" : "Tick off"} ${ONBOARDING_ITEM_NAMES[item]}`}
      onClick={async () => {
        setSaving(true);
        const failed = await attempt(
          () => mark({ data: { schoolId, item, done: !done } }),
          "The step could not be changed.",
        );
        if (failed) toast.error(failed);
        else await router.invalidate();
        setSaving(false);
      }}
    >
      {done ? "Untick" : "Done"}
    </Button>
  );
}

export interface HealthSectionProps {
  health: SchoolHealth;
}

/** How the school is doing, and why when it is not well. */
export function HealthSection({ health }: HealthSectionProps) {
  return (
    <RecordSection title="Health" action={<HealthBadge level={health.level} />}>
      {health.reasons.length ? (
        <ul className="grid gap-2">
          {health.reasons.map((reason) => (
            <li key={reason}>
              <StatusText tone={HEALTH_TONE[health.level]}>
                {HEALTH_REASON_NAMES[reason]}
              </StatusText>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm leading-5 text-muted-foreground">
          Busy through the week, its bills paid and its steps under way.
        </p>
      )}
    </RecordSection>
  );
}

export interface OnboardingSectionProps {
  schoolId: string;
  health: SchoolHealth;
  /** When its cell last reported its data, or null before it ever has. */
  measuredAt: string | null;
}

/**
 * How far through its first steps the school is: each step with the day it
 * was first taken, and the operator's own steps to tick off.
 */
export function OnboardingSection({
  schoolId,
  health,
  measuredAt,
}: OnboardingSectionProps) {
  const mayTick = useMay("tenants");
  const { applies, reached, stalled } = health.onboarding;
  const done = applies.filter((item) => reached[item]).length;
  return (
    <RecordSection
      title="Onboarding"
      description={`Its cell checks its data once a day, ${
        measuredAt ? `last ${formatWhen(measuredAt)}` : "and has not yet"
      }; the school's administrators see the same list on their Today page as it stands now.`}
    >
      <div className="mb-4 grid gap-2">
        <div className="flex items-baseline justify-between gap-3 text-sm leading-5">
          <span className="font-medium tabular-nums">
            {done} of {applies.length} steps taken
          </span>
          {stalled ? (
            <StatusText tone="warning">None in the last fortnight</StatusText>
          ) : null}
        </div>
        <Progress
          value={applies.length ? (done / applies.length) * 100 : 0}
          aria-label={`${done} of ${applies.length} steps taken`}
        />
      </div>
      <RecordList>
        {applies.map((item) => {
          const step = reached[item];
          return (
            <li
              key={item}
              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
            >
              <span className="flex min-w-0 items-start gap-3">
                {step ? (
                  <Check
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                    aria-hidden
                  />
                )}
                <span className="grid">
                  <span
                    className={
                      step
                        ? "text-sm leading-5"
                        : "text-sm leading-5 text-muted-foreground"
                    }
                  >
                    {ONBOARDING_ITEM_NAMES[item]}
                  </span>
                  <span className="text-[13px] leading-[18px] text-muted-foreground">
                    {step
                      ? `${formatWhen(step.at)} · ${SOURCE_HINT[ONBOARDING_SOURCE[item]]}`
                      : "Not yet"}
                  </span>
                </span>
              </span>
              {mayTick && isOperatorItem(item) ? (
                <Tick schoolId={schoolId} item={item} done={Boolean(step)} />
              ) : null}
            </li>
          );
        })}
      </RecordList>
    </RecordSection>
  );
}
