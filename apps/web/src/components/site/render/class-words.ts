import type { SiteLocale } from "@faridalms/domain/site-sections";

import { classLength, classWhen } from "@faridalms/domain/site-classes";

import * as m from "~/i18n/messages";
import { formatDate, formatList } from "~/utils/datetime";
import { numberLocale } from "~/utils/digits";

/** A day as a reader of the site is told it, its year said only when it is not this one. */
const dayWords = (day: string, today: string, locale: SiteLocale) =>
  formatDate(
    day,
    today && day.slice(0, 4) === today.slice(0, 4) ? "dayMonth" : "full",
    locale,
  );

/**
 * When a class runs, in words: "Starts 6 December", or for one under way
 * "Running now, joins any time" or "Running now, until 20 March"; nothing
 * for one that has ended.
 */
export function classWhenWords(
  runs: { startsOn: string; endsOn: string | null },
  today: string,
  locale: SiteLocale,
): string {
  const t = { locale };
  const when = classWhen(runs, today);
  if (!when) return "";
  if (when.kind === "starts")
    return m.siteClassStarts({ date: dayWords(when.on, today, locale) }, t);
  return when.until
    ? m.siteClassRunningUntil({ date: dayWords(when.until, today, locale) }, t)
    : m.siteClassRunningOpen({}, t);
}

/** How long a class with an end runs: "10 weeks", "One week", "3 days". */
export function classLengthWords(
  runs: { startsOn: string; endsOn: string | null },
  locale: SiteLocale,
): string {
  const t = { locale };
  const length = classLength(runs);
  if (!length) return "";
  const count = "weeks" in length ? length.weeks : length.days;
  const value = new Intl.NumberFormat(numberLocale(locale)).format(count);
  return "weeks" in length
    ? m.siteClassWeeks({ count, value }, t)
    : m.siteClassDays({ count, value }, t);
}

/** Teachers' names as a list a reader says aloud: "Amal, Omar and Dina". */
export const teacherWords = (names: readonly string[], locale: SiteLocale) =>
  names.length
    ? m.siteClassWith({ names: formatList(names, locale) }, { locale })
    : "";
