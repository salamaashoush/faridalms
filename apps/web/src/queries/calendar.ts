import type { RangeQuery } from "@faridalms/domain/calendar";

import { queryOptions } from "@tanstack/react-query";

import {
  getCalendarEvent,
  getCalendarOptions,
  getCalendarRange,
} from "~/server/calendar";

export const calendarRangeQuery = (range: RangeQuery) =>
  queryOptions({
    queryKey: ["calendar", "range", range],
    queryFn: () => getCalendarRange({ data: range }),
    placeholderData: (previous) => previous,
  });

export const calendarOptionsQuery = queryOptions({
  queryKey: ["calendar", "options"],
  queryFn: () => getCalendarOptions(),
});

export const calendarEventQuery = (id: string) =>
  queryOptions({
    queryKey: ["calendar", "event", id],
    queryFn: () => getCalendarEvent({ data: { id } }),
  });
