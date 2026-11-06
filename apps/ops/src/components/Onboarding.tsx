import type { OperatorItem } from "@faridalms/domain/onboarding";

import {
  isOperatorItem,
  ONBOARDING_SOURCE,
} from "@faridalms/domain/onboarding";
import { Button } from "@faridalms/ui/button";
import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import type { SchoolHealth } from "../server/health";

import { failure } from "../actions";
import {
  formatWhen,
  HEALTH_REASON_NAMES,
  ONBOARDING_ITEM_NAMES,
} from "../format";
import { useMay } from "../may";
import { markOnboardingStep } from "../server/directory";
import { HealthBadge } from "./Health";

const SOURCE_HINT = {
  measured: "Seen in its data",
  billing: "From billing",
  operator: "Ticked by an operator",
} as const;

function Tick({
  schoolId,
  item,
  done,
}: {
  schoolId: string;
  item: OperatorItem;
  done: boolean;
}) {
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
        try {
          const out = await mark({
            data: { schoolId, item, done: !done },
          });
          if (out.ok) await router.invalidate();
          else toast.error(out.message);
        } catch (error) {
          const said = failure(error, "The step could not be changed.");
          if (said) toast.error(said);
        } finally {
          setSaving(false);
        }
      }}
    >
      {done ? "Untick" : "Done"}
    </Button>
  );
}

/**
 * How a school is doing and how far through its first steps it is: each
 * step with the day it was first taken, and the operator's own steps to
 * tick off.
 */
export function SchoolOnboarding({
  schoolId,
  health,
  measuredAt,
}: {
  schoolId: string;
  health: SchoolHealth;
  /** When its cell last reported its data, or null before it ever has. */
  measuredAt: string | null;
}) {
  const mayTick = useMay("tenants");
  const { applies, reached, stalled } = health.onboarding;
  const done = applies.filter((item) => reached[item]).length;
  return (
    <>
      <section aria-label="Health" className="grid gap-2">
        <h2 className="text-base font-semibold">Health</h2>
        <HealthBadge level={health.level} />
        {health.reasons.length ? (
          <ul className="list-disc ps-5 text-sm text-muted-foreground">
            {health.reasons.map((reason) => (
              <li key={reason}>{HEALTH_REASON_NAMES[reason]}</li>
            ))}
          </ul>
        ) : null}
      </section>
      <section aria-label="Onboarding" className="grid max-w-3xl gap-3">
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Onboarding</h2>
          <p className="text-sm text-muted-foreground">
            {done} of {applies.length} steps taken
            {stalled ? ", none in the last fortnight" : ""}. Its cell checks its
            data once a day,{" "}
            {measuredAt ? `last ${formatWhen(measuredAt)}` : "and has not yet"};
            the school's administrators see the same list on their Today page as
            it stands now.
          </p>
        </div>
        <ul className="divide-y rounded-lg border text-sm">
          {applies.map((item) => {
            const step = reached[item];
            return (
              <li
                key={item}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
              >
                <span className="grid">
                  <span className={step ? "" : "text-muted-foreground"}>
                    {ONBOARDING_ITEM_NAMES[item]}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {step
                      ? `${formatWhen(step.at)} · ${SOURCE_HINT[ONBOARDING_SOURCE[item]]}`
                      : "Not yet"}
                  </span>
                </span>
                {mayTick && isOperatorItem(item) ? (
                  <Tick schoolId={schoolId} item={item} done={Boolean(step)} />
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}
