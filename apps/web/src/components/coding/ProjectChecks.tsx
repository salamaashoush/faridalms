import type { ScratchFeature } from "@faridalms/domain/scratch-project";

import { Circle, CircleCheck } from "lucide-react";

import * as m from "~/i18n/messages";
import { formatNumber } from "~/utils/datetime";

import { featureNames } from "./scratch-checks";

/**
 * What a coding question asks every project to do, each ticked where the
 * student's last saved project does it. It is a list to work to and to
 * mark beside: it gives no points, since a project can have every block
 * asked for and still not work.
 */
export function ProjectChecks({
  asked,
  has,
}: {
  asked: readonly ScratchFeature[];
  /** What the saved project was found to have; none where no save was read. */
  has: readonly string[] | null | undefined;
}) {
  if (asked.length === 0) return null;
  const names = featureNames();
  const met = asked.filter((feature) => has?.includes(feature)).length;
  return (
    <section className="grid gap-1.5">
      <h4 className="text-sm leading-5 font-semibold">
        {m.scratchChecksTitle()}
      </h4>
      <ul className="grid gap-1">
        {asked.map((feature) => {
          const done = has?.includes(feature) ?? false;
          return (
            <li
              key={feature}
              className="flex items-start gap-2 text-sm leading-5"
            >
              {done ? (
                <CircleCheck
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-success"
                />
              ) : (
                <Circle
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              )}
              <span>{names[feature]}</span>
              {has ? (
                <span className="sr-only">
                  {done ? m.scratchCheckMet() : m.scratchCheckUnmet()}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] leading-[18px] text-muted-foreground">
        {has
          ? m.scratchChecksCount({
              met: formatNumber(met),
              total: formatNumber(asked.length),
            })
          : m.scratchChecksUnread()}
      </p>
    </section>
  );
}
