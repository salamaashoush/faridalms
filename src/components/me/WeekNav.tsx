import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import * as m from "~/i18n/messages";

import { formatDate } from "./format";

export function WeekNav({
  weekNumber,
  startsOn,
  endsOn,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  weekNumber: number;
  startsOn: string;
  endsOn: string;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold">
          {m.assignmentsWeek({ number: weekNumber })}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {m.assignmentsWeekRange({
            from: formatDate(startsOn),
            to: formatDate(endsOn),
          })}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!hasPrevious}
          onClick={onPrevious}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
          {m.commonPreviousWeek()}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!hasNext}
          onClick={onNext}
        >
          {m.commonNextWeek()}
          <ChevronRight className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
