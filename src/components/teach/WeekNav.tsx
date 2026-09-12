import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

import { formatDate } from "./format";

export function WeekNav({
  week,
  weeks,
  onSelect,
}: {
  week: { number: number; startsOn: string; endsOn: string };
  weeks: { number: number }[];
  onSelect: (weekNumber: number) => void;
}) {
  const position = weeks.findIndex((entry) => entry.number === week.number);
  const previous = position > 0 ? weeks[position - 1] : undefined;
  const next = position >= 0 ? weeks[position + 1] : undefined;

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="icon-sm"
        aria-label={m.commonPreviousWeek()}
        disabled={!previous}
        onClick={() => {
          if (previous) {
            onSelect(previous.number);
          }
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
        disabled={!next}
        onClick={() => {
          if (next) {
            onSelect(next.number);
          }
        }}
      >
        <ChevronRight className="rtl:rotate-180" aria-hidden />
      </Button>
    </div>
  );
}
