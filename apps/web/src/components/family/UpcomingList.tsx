import { CalendarDays } from "lucide-react";

import {
  EVENT_CATEGORY_CLASS,
  EVENT_CATEGORY_LABEL,
} from "~/components/app/labels";
import { EmptyState, SectionCard } from "~/components/app/primitives";
import { Badge } from "~/components/ui/badge";
import * as m from "~/i18n/messages";

import { formatDate } from "./format";

export interface UpcomingEvent {
  id: string;
  title: string;
  category: "general" | "national_vacation" | "school_vacation";
  startsOn: string;
  endsOn: string;
  provisional: boolean;
}

export function UpcomingList({ events }: { events: UpcomingEvent[] }) {
  return (
    <SectionCard title={m.overviewUpcoming()}>
      {events.length === 0 ? (
        <EmptyState
          title={m.calendarNoEvents()}
          body={m.familyNoUpcoming()}
          icon={CalendarDays}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col items-start gap-2 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{event.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {event.startsOn === event.endsOn
                    ? formatDate(event.startsOn)
                    : m.familyEventRange({
                        from: formatDate(event.startsOn),
                        to: formatDate(event.endsOn),
                      })}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {event.provisional ? (
                  <Badge variant="outline">{m.commonProvisional()}</Badge>
                ) : null}
                <Badge className={EVENT_CATEGORY_CLASS[event.category]}>
                  {EVENT_CATEGORY_LABEL[event.category]()}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
