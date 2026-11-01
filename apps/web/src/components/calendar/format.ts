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

/** The time of an event within its day, or that it runs all day. */
export function timeLabel(event: Timed) {
  return event.startTime && event.endTime
    ? m.ttTimeRange({ from: event.startTime, to: event.endTime })
    : m.calAllDay();
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
