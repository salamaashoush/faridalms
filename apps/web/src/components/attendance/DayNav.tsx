import { addDays } from "@faridalms/domain/school";
import { Button } from "@faridalms/ui/button";
import { cn } from "@faridalms/ui/cn";
import { Input } from "@faridalms/ui/input";
import { ToolbarRow } from "@faridalms/ui/system/panel";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useContext } from "react";

import * as m from "~/i18n/messages";

export interface DayNavProps {
  id: string;
  date: string;
  /** The earliest day it steps to, as the first day of a class; none steps back freely. */
  min?: string | null;
  max: string;
  today: string;
  onChange: (date: string) => void;
}

/**
 * Steps a page one school day at a time, or jumps to a date. Arrows follow
 * the reading direction, so "previous" points to the start side.
 */
export function DayNav({ id, date, min, max, today, onChange }: DayNavProps) {
  const previous = addDays(date, -1);
  const next = addDays(date, 1);
  const inRange = (day: string) => (!min || day >= min) && day <= max;
  const compact = useContext(ToolbarRow);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "icon"}
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
          className={cn("w-40 max-md:h-10", compact && "h-8")}
          value={date}
          min={min ?? undefined}
          max={max}
          onChange={(event) => {
            if (event.target.value && inRange(event.target.value))
              onChange(event.target.value);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size={compact ? "icon-sm" : "icon"}
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
          size={compact ? "sm" : "default"}
          className="max-md:h-10"
          onClick={() => onChange(today)}
        >
          {m.attToday()}
        </Button>
      ) : null}
    </div>
  );
}
