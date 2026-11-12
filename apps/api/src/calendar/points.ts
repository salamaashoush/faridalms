import type { UnitContext } from "../core/context";
import type { ModuleScope } from "../core/extension";

import { point } from "../core/extension";

/** Something a module keeps that stands in the calendar beside the school's events. */
export interface CalendarEntry {
  id: string;
  titleEn: string | null;
  titleAr: string | null;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  cancelled: boolean;
  /** The record it opens, by the module's own key and what kind of thing it is there. */
  origin: { key: string; id: string; kind: string };
}

/**
 * A module's things in the calendar, under one category of their own: the
 * tours and interviews admissions books, say. `shows` says whether the
 * viewer sees the category at all, whether or not anything falls in the
 * window, so its filter is offered to those who keep such things.
 */
export interface CalendarSource {
  category: string;
  shows(context: UnitContext): boolean;
  between(
    context: UnitContext,
    input: { from: string; to: string },
  ): Promise<CalendarEntry[]>;
}

export const calendarSources = point<CalendarSource>("calendar sources");

/** One entry of a person's calendar feed, written out for calendar apps. */
export interface FeedEntry {
  id: string;
  title: string;
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  description: string;
  cancelled: boolean;
  version: number;
  url: string;
}

/** What a module adds to a person's calendar feed: their lessons, say. */
export interface FeedSource {
  entriesFor(
    scope: ModuleScope,
    input: {
      userId: string;
      today: string;
      locale: "en" | "ar";
      origin: string;
    },
  ): Promise<FeedEntry[]>;
}

export const feedSources = point<FeedSource>("feed sources");
