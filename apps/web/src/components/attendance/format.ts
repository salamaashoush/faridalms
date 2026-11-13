import type {
  AttendanceMeaning,
  ContactOutcome,
  RegisterState,
} from "@faridalms/domain/attendance";
import type { Tone } from "@faridalms/ui/system/status";

import { inLocale } from "~/hooks/useCurrentUser";
import * as m from "~/i18n/messages";
import { formatInstant, schoolDayOf } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";

/** What a follow-up call came to. */
export const OUTCOME_LABEL: Record<ContactOutcome, () => string> = {
  reached: m.fupReachedCore,
  no_answer: m.fupNoAnswer,
  left_message: m.fupLeftMessage,
  messaged: m.fupMessaged,
};

export const MEANING_LABEL: Record<AttendanceMeaning, () => string> = {
  present: m.attPresent,
  absent: m.attAbsent,
  late: m.attLate,
  excused: m.attExcused,
  left_early: m.attLeftEarly,
};

/** One letter per mark for the register's buttons, in the reader's language. */
export const MEANING_SHORT: Record<AttendanceMeaning, () => string> = {
  present: m.attPresentShort,
  absent: m.attAbsentShort,
  late: m.attLateShort,
  excused: m.attExcusedShort,
  left_early: m.attLeftEarlyShort,
};

export const MEANING_TONE: Record<AttendanceMeaning, Tone> = {
  present: "success",
  absent: "danger",
  late: "warning",
  excused: "info",
  left_early: "warning",
};

export const STATE_LABEL: Record<RegisterState, () => string> = {
  not_started: m.attNotStarted,
  in_progress: m.attInProgress,
  submitted: m.attSubmitted,
};

export const STATE_TONE: Record<RegisterState, Tone> = {
  not_started: "neutral",
  in_progress: "warning",
  submitted: "success",
};

/** A register's state as a teacher's day names it. */
export const DAY_REGISTER: Record<
  RegisterState,
  { label: () => string; tone: Tone }
> = {
  not_started: { label: m.homeRegisterNotTaken, tone: "warning" },
  in_progress: { label: m.homeRegisterInProgress, tone: "info" },
  submitted: { label: m.homeRegisterTaken, tone: "success" },
};

export function labelOf(row: {
  labelEn: string | null;
  labelAr: string | null;
}) {
  return inLocale(row.labelEn, row.labelAr);
}

/** A share of sessions attended, to one decimal where it matters. */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat(numberLocale(), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(rate / 100);
}

/**
 * When a register was saved, on the school's clock: the time alone when it
 * was saved on the register's own day, otherwise the day too.
 */
export function formatSavedAt(iso: string, registerDay: string): string {
  return formatInstant(
    iso,
    schoolDayOf(iso) === registerDay ? "time" : "stamp",
  );
}

/** A mark as a family or office reads it: "Late, 12 minutes". */
export function markText(mark: {
  meaning: AttendanceMeaning;
  minutes: number | null;
}): string {
  const label = MEANING_LABEL[mark.meaning]();
  return mark.minutes === null
    ? label
    : m.attWithMinutes({
        mark: label,
        minutes: m.attMinutes({ count: mark.minutes }),
      });
}
