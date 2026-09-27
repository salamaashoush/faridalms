import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import * as m from "~/i18n/messages";

import { shiftDay } from "./format";

/**
 * Steps a page one school day at a time, or jumps to a date. Arrows follow
 * the reading direction, so "previous" points to the start side.
 */
export function DayNav({
  id,
  date,
  min,
  max,
  today,
  onChange,
}: {
  id: string;
  date: string;
  min: string;
  max: string;
  today: string;
  onChange: (date: string) => void;
}) {
  const previous = shiftDay(date, -1);
  const next = shiftDay(date, 1);
  const inRange = (day: string) => day >= min && day <= max;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.attPreviousDay()}
          disabled={!inRange(previous)}
          onClick={() => onChange(previous)}
        >
          <ChevronLeft className="rtl:rotate-180" aria-hidden />
        </Button>
        <label htmlFor={id} className="sr-only">
          {m.attDate()}
        </label>
        <Input
          id={id}
          type="date"
          className="w-40 max-md:h-10"
          value={date}
          min={min}
          max={max}
          onChange={(event) => {
            if (event.target.value && inRange(event.target.value))
              onChange(event.target.value);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="max-md:size-10"
          aria-label={m.attNextDay()}
          disabled={!inRange(next)}
          onClick={() => onChange(next)}
        >
          <ChevronRight className="rtl:rotate-180" aria-hidden />
        </Button>
      </div>
      {date !== today && inRange(today) ? (
        <Button
          type="button"
          variant="ghost"
          className="max-md:h-10"
          onClick={() => onChange(today)}
        >
          {m.attToday()}
        </Button>
      ) : null}
    </div>
  );
}
