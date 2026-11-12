import type { ShownCategory } from "@faridalms/domain/calendar";

import { CALENDAR_CATEGORIES } from "@faridalms/domain/calendar";

import { useSlot } from "~/hooks/useSlot";

import { CATEGORY_LABEL, CATEGORY_MARK, eventTitle } from "./format";
import { calendarOrigins } from "./slots";

interface Titled {
  titleEn: string | null;
  titleAr: string | null;
  origin?: { key: string; id: string; kind: string } | null;
}

const own = (category: string): category is keyof typeof CATEGORY_LABEL =>
  (CALENDAR_CATEGORIES as readonly string[]).includes(category);

/**
 * How the calendar names and marks its categories and titles its entries:
 * the school's own kinds of event, and what the modules on keep there.
 */
export function useCalendarWords() {
  const origins = useSlot(calendarOrigins);
  const ofCategory = (category: ShownCategory) =>
    origins.find((origin) => origin.category === category);
  const ofEntry = (event: Titled) =>
    event.origin
      ? origins.find((origin) => origin.key === event.origin?.key)
      : undefined;
  return {
    label: (category: ShownCategory) =>
      own(category)
        ? CATEGORY_LABEL[category]()
        : (ofCategory(category)?.label() ?? category),
    mark: (category: ShownCategory) =>
      own(category)
        ? CATEGORY_MARK[category]
        : (ofCategory(category)?.mark ?? CATEGORY_MARK.general),
    title: (event: Titled) => {
      const origin = ofEntry(event);
      return origin && event.origin
        ? origin.title(event.origin.kind, eventTitle(event))
        : eventTitle(event);
    },
    linkOf: (event: Titled) => {
      const origin = ofEntry(event);
      return origin && event.origin ? origin.linkOf(event.origin) : null;
    },
  };
}
