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

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { getLocale } from "~/i18n/runtime";

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

export interface Timed {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

const day = (iso: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );

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

/** When an event happens, in full: its days and, if timed, its hours. */
export function whenLabel(event: Timed) {
  if (event.startsOn === event.endsOn)
    return event.startTime
      ? `${weekdayDate(event.startsOn)}, ${timeLabel(event)}`
      : weekdayDate(event.startsOn);
  const from = event.startTime
    ? `${shortDate(event.startsOn)} ${event.startTime}`
    : shortDate(event.startsOn);
  const to = event.endTime
    ? `${shortDate(event.endsOn)} ${event.endTime}`
    : shortDate(event.endsOn);
  return m.ttTimeRange({ from, to });
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
