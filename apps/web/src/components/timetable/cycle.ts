import type { CycleKind } from "@faridalms/domain/timetable";

import * as m from "~/i18n/messages";
import { formatNumber, formatWeekday } from "~/utils/datetime";

export interface CycleShape {
  kind: CycleKind;
  length: number;
}

const WEEK_LETTER = [m.ttWeekA, m.ttWeekB, m.ttWeekC, m.ttWeekD];

/** The letter a week of a cycle goes by: A, B, C or D. */
export function weekLetter(week: number): string {
  return WEEK_LETTER[week]?.() ?? formatNumber(week + 1);
}

/**
 * A day of a timetable's cycle as people say it: the weekday in an
 * ordinary week, the weekday and its week in A/B weeks, "Day 3" in a cycle
 * of days.
 */
export function cycleDayLabel(
  cycle: CycleShape | null,
  day: number,
  width: "long" | "short" = "long",
): string {
  if (cycle?.kind === "days")
    return m.ttCycleDay({ number: formatNumber(day) });
  const weekday = formatWeekday(((day - 1) % 7) + 1, width);
  if (!cycle || cycle.length === 1) return weekday;
  return m.ttCycleWeekday({
    day: weekday,
    week: weekLetter(Math.floor((day - 1) / 7)),
  });
}

/** How a timetable repeats, in a phrase. */
export function cycleName(cycle: CycleShape): string {
  if (cycle.kind === "days")
    return m.ttCycleOfDays({
      count: cycle.length,
      value: formatNumber(cycle.length),
    });

  if (cycle.length === 1) return m.ttCycleWeekly();
  return m.ttCycleOfWeeks({
    weeks: Array.from({ length: cycle.length }, (_, week) =>
      weekLetter(week),
    ).join(m.ttWeekJoin()),
  });
}

/** The week of the cycle a dated week sits in, when its timetable repeats over weeks. */
export function weekOfCycle(
  dates: readonly { cycleDay?: number | null; cycle?: CycleShape | null }[],
): string | null {
  const day = dates.find(
    (row) =>
      row.cycleDay != null &&
      row.cycle?.kind === "weeks" &&
      row.cycle.length > 1,
  );
  if (!day?.cycleDay) return null;
  return m.ttWeekOfCycle({
    week: weekLetter(Math.floor((day.cycleDay - 1) / 7)),
  });
}
