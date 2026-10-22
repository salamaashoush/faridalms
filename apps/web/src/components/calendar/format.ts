import type { CalendarCategory } from "@faridalms/domain/calendar";
import type { LucideIcon } from "lucide-react";

import {
  Bus,
  CalendarDays,
  Music,
  PartyPopper,
  PencilLine,
  Trophy,
  Users,
} from "lucide-react";

import type { Locale } from "~/i18n/runtime";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";
import { numberLocale } from "~/utils/digits";

export const CATEGORY_LABEL: Record<CalendarCategory, () => string> = {
  general: m.calCatGeneral,
  meeting: m.calCatMeeting,
  trip: m.calCatTrip,
  performance: m.calCatPerformance,
  sport: m.calCatSport,
  exam: m.calCatExam,
  celebration: m.calCatCelebration,
};

/** Each kind's mark: an icon to read and a colour to scan, never the colour alone. */
export const CATEGORY_MARK: Record<
  CalendarCategory,
  { icon: LucideIcon; colour: string }
> = {
  general: {
    icon: CalendarDays,
    colour: "text-slate-500 dark:text-slate-400",
  },
  meeting: { icon: Users, colour: "text-sky-600 dark:text-sky-400" },
  trip: { icon: Bus, colour: "text-amber-600 dark:text-amber-400" },
  performance: { icon: Music, colour: "text-violet-600 dark:text-violet-400" },
  sport: { icon: Trophy, colour: "text-emerald-600 dark:text-emerald-400" },
  exam: { icon: PencilLine, colour: "text-rose-600 dark:text-rose-400" },
  celebration: {
    icon: PartyPopper,
    colour: "text-fuchsia-600 dark:text-fuchsia-400",
  },
};

/** An event's title in the reader's language, or the other when it has only one. */
export const eventTitle = (event: {
  titleEn: string | null;
  titleAr: string | null;
}) => inLocale(event.titleEn, event.titleAr);

export interface Timed {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

const day = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(numberLocale(), {
    ...options,
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

export function weekdayDate(iso: string) {
  return day(iso, { weekday: "long", day: "numeric", month: "long" });
}

export function shortDate(iso: string) {
  return day(iso, { day: "numeric", month: "short" });
}

/** The time of an event within its day, or that it runs all day. */
export function timeLabel(event: Timed) {
  return event.startTime && event.endTime
    ? m.ttTimeRange({ from: event.startTime, to: event.endTime })
    : m.calAllDay();
}

const instant = (date: string, time: string | null) =>
  new Date(`${date}T${time ?? "00:00"}:00Z`);

/**
 * When an event happens: its days and, if timed, its hours, in full or
 * short. The locale lays out the range, so Arabic reads it in its own order.
 */
export function whenLabel(
  event: Timed,
  style: "long" | "short" = "long",
  locale: Locale = getLocale(),
) {
  const timed = event.startTime !== null && event.endTime !== null;
  return new Intl.DateTimeFormat(numberLocale(locale), {
    weekday: style,
    day: "numeric",
    month: style,
    ...(timed
      ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }
      : undefined),
    timeZone: "UTC",
  }).formatRange(
    instant(event.startsOn, event.startTime),
    instant(event.endsOn, event.endTime),
  );
}

export function specialDayLabel(special: {
  labelEn: string | null;
  labelAr: string | null;
  noteEn: string | null;
  noteAr: string | null;
}) {
  return (
    inLocale(special.noteEn, special.noteAr) ||
    inLocale(special.labelEn, special.labelAr)
  );
}
