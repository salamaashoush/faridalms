import { Button } from "@faridalms/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

import * as m from "~/i18n/messages";

import { formatDate } from "./format";

export interface WeekNavProps {
  week: { number: number; startsOn: string; endsOn: string };
  weeks: { number: number }[];
  onSelect: (week: number) => void;
}

export function weekBounds(
  week: { number: number },
  weeks: { number: number }[],
) {
  const numbers = weeks.map((row) => row.number);
  return {
    first: numbers.length > 0 ? Math.min(...numbers) : week.number,
    last: numbers.length > 0 ? Math.max(...numbers) : week.number,
  };
}

export function WeekNav({ week, weeks, onSelect }: WeekNavProps) {
  const { first, last } = weekBounds(week, weeks);

  return (
    <nav className="flex items-center gap-3" aria-label={m.familyWeekNav()}>
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={m.commonPreviousWeek()}
        disabled={week.number <= first}
        onClick={() => {
          onSelect(week.number - 1);
        }}
      >
        <ChevronLeft className="rtl:rotate-180" aria-hidden />
      </Button>

      <div className="min-w-40 text-center">
        <p className="text-sm font-medium">
          {m.assignmentsWeek({ number: week.number })}
        </p>
        <p className="text-xs text-muted-foreground">
          {m.assignmentsWeekRange({
            from: formatDate(week.startsOn),
            to: formatDate(week.endsOn),
          })}
        </p>
      </div>

      <Button
        variant="outline"
        size="icon-sm"
        aria-label={m.commonNextWeek()}
        disabled={week.number >= last}
        onClick={() => {
          onSelect(week.number + 1);
        }}
      >
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
    </nav>
  );
}
