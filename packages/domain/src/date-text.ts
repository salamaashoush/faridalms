// Dates, times and lists written the same way by every engine.
//
// A page is drawn twice: by the server's runtime and again by the reader's
// browser, each with its own copy of ICU. Those copies disagree: Apple's
// joins a date to a time with "at" where Chrome's writes a comma, puts a
// no-break space before "PM", shortens Arabic weekdays and adds isolation
// marks around list items, and Node's sets ranges with thin spaces. React
// throws away a server page whose text differs from the browser's. So the
// names here are fixed tables and the patterns are ours; Intl only says
// which day an instant falls on in another calendar, as numbers.

import { zonedLocal } from "./school";

/** The languages dates are written in. */
export type DateLanguage = "en" | "ar";

/** Whose digits a date is written in. */
export type DateDigits = "latn" | "arab";

/** How a locale tag writes dates: `ar-u-nu-arab` is Arabic in Arabic-Indic digits. */
export interface DateWriting {
  language: DateLanguage;
  digits: DateDigits;
}

/** How a calendar day is written, from the fullest to its number alone. */
export type DayStyle =
  | "medium"
  | "weekday"
  | "full"
  | "dayMonth"
  | "short"
  | "day";

/** How an instant is written on a clock. */
export type InstantStyle =
  | "full"
  | "stamp"
  | "medium"
  | "date"
  | "short"
  | "time";

/** A second calendar a school may show beside the Gregorian one. */
export type HijriCalendar = "islamic-umalqura" | "islamic-civil";

/** How a day in the Hijri calendar is written. */
export type HijriStyle = "short" | "dayMonth" | "full";

interface Names {
  months: { long: readonly string[]; short: readonly string[] };
  /** Sunday first, as `Date#getUTCDay` counts. */
  weekdays: { long: readonly string[]; short: readonly string[] };
  hijri: { long: readonly string[]; short: readonly string[] };
  hijriEra: string;
  dayPeriods: readonly [string, string];
  /** Between the parts of a date or a date and its time: ", " or "، ". */
  comma: string;
  and: string;
  or: string;
}

const ARABIC_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
] as const;

const ARABIC_WEEKDAYS = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
] as const;

const ARABIC_HIJRI = [
  "محرم",
  "صفر",
  "ربيع الأول",
  "ربيع الآخر",
  "جمادى الأولى",
  "جمادى الآخرة",
  "رجب",
  "شعبان",
  "رمضان",
  "شوال",
  "ذو القعدة",
  "ذو الحجة",
] as const;

// CLDR's names, as the platform's ICU wrote them when these were taken.
// Arabic has no short forms, so its short names are its long ones.
const NAMES: Record<DateLanguage, Names> = {
  en: {
    months: {
      long: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ],
      short: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
    },
    weekdays: {
      long: [
        "Sunday",
        "Monday",
        "Tuesday",
        "Wednesday",
        "Thursday",
        "Friday",
        "Saturday",
      ],
      short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    },
    hijri: {
      long: [
        "Muharram",
        "Safar",
        "Rabiʻ I",
        "Rabiʻ II",
        "Jumada I",
        "Jumada II",
        "Rajab",
        "Shaʻban",
        "Ramadan",
        "Shawwal",
        "Dhuʻl-Qiʻdah",
        "Dhuʻl-Hijjah",
      ],
      short: [
        "Muh.",
        "Saf.",
        "Rab. I",
        "Rab. II",
        "Jum. I",
        "Jum. II",
        "Raj.",
        "Sha.",
        "Ram.",
        "Shaw.",
        "Dhuʻl-Q.",
        "Dhuʻl-H.",
      ],
    },
    hijriEra: "AH",
    dayPeriods: ["AM", "PM"],
    comma: ", ",
    and: "and",
    or: "or",
  },
  ar: {
    months: { long: ARABIC_MONTHS, short: ARABIC_MONTHS },
    weekdays: { long: ARABIC_WEEKDAYS, short: ARABIC_WEEKDAYS },
    hijri: { long: ARABIC_HIJRI, short: ARABIC_HIJRI },
    hijriEra: "هـ",
    dayPeriods: ["ص", "م"],
    comma: "، ",
    and: "و",
    or: "أو",
  },
};

/** Between the two ends of a range. */
const DASH = " – ";
/** Keeps an Arabic numeric date's parts in order inside right-to-left text. */
const RLM = "‏";
const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";

/** How a locale tag writes dates; Arabic with no digits named uses its own. */
export function writingOf(locale: string): DateWriting {
  const language: DateLanguage = /^ar\b/.test(locale) ? "ar" : "en";
  const named = /-nu-(\w+)/.exec(locale)?.[1];
  const digits: DateDigits =
    named === "arab" || (named === undefined && language === "ar")
      ? "arab"
      : "latn";
  return { language, digits };
}

const inDigits = (text: string, digits: DateDigits) =>
  digits === "arab"
    ? text.replace(/[0-9]/g, (digit) => ARABIC_INDIC[Number(digit)] ?? digit)
    : text;

const twoDigits = (value: number) => String(value).padStart(2, "0");

/** A day as numbers, its weekday counted from Sunday. */
interface Day {
  year: number;
  month: number;
  day: number;
  weekday: number;
}

/** A `YYYY-MM-DD` day (or the day of a longer ISO string) as numbers. */
function dayOf(isoDate: string): Day {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  return {
    year,
    month,
    day,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** A day's parts in one language, ready to set in a pattern. */
interface DayParts {
  day: number;
  /** The day and month as two digits, for a numeric date. */
  dd: string;
  mm: string;
  year: number;
  month: string;
  shortMonth: string;
  weekday: string;
}

const DAY_PATTERNS: Record<
  DateLanguage,
  Record<DayStyle, (parts: DayParts) => string>
> = {
  en: {
    medium: (p) => `${p.shortMonth} ${p.day}, ${p.year}`,
    weekday: (p) => `${p.weekday}, ${p.month} ${p.day}`,
    full: (p) => `${p.month} ${p.day}, ${p.year}`,
    dayMonth: (p) => `${p.month} ${p.day}`,
    short: (p) => `${p.shortMonth} ${p.day}`,
    day: (p) => String(p.day),
  },
  ar: {
    medium: (p) => `${p.dd}${RLM}/${p.mm}${RLM}/${p.year}`,
    weekday: (p) => `${p.weekday}، ${p.day} ${p.month}`,
    full: (p) => `${p.day} ${p.month} ${p.year}`,
    dayMonth: (p) => `${p.day} ${p.month}`,
    short: (p) => `${p.day} ${p.shortMonth}`,
    day: (p) => String(p.day),
  },
};

function writeDay(day: Day, style: DayStyle, language: DateLanguage) {
  const names = NAMES[language];
  return DAY_PATTERNS[language][style]({
    day: day.day,
    dd: twoDigits(day.day),
    mm: twoDigits(day.month),
    year: day.year,
    month: names.months.long[day.month - 1] ?? "",
    shortMonth: names.months.short[day.month - 1] ?? "",
    weekday: names.weekdays.long[day.weekday] ?? "",
  });
}

/** A calendar day (a `date` column, `YYYY-MM-DD`), the same in every zone. */
export function formatDayIn(
  isoDate: string,
  style: DayStyle,
  locale: string,
): string {
  const { language, digits } = writingOf(locale);
  return inDigits(writeDay(dayOf(isoDate), style, language), digits);
}

// How each style reads with its year dropped, for the first end of a range
// in one year, and with one added, for ends in different years.
const WITHOUT_YEAR: Record<DayStyle, DayStyle> = {
  medium: "short",
  full: "dayMonth",
  weekday: "weekday",
  dayMonth: "dayMonth",
  short: "short",
  day: "day",
};
const WITH_YEAR: Record<DayStyle, DayStyle> = {
  medium: "medium",
  full: "full",
  weekday: "weekday",
  dayMonth: "full",
  short: "medium",
  day: "medium",
};
const HAS_YEAR = new Set<DayStyle>(["medium", "full"]);

/**
 * Two calendar days as one span, sharing what they share: "Sep 7 – 25, 2026",
 * "7 – 25 سبتمبر 2026", "Dec 28, 2026 – Jan 2, 2027".
 */
export function formatDayRangeIn(
  first: string,
  last: string,
  style: DayStyle,
  locale: string,
): string {
  if (first.slice(0, 10) === last.slice(0, 10))
    return formatDayIn(first, style, locale);
  const { language, digits } = writingOf(locale);
  const names = NAMES[language];
  const ar = language === "ar";
  const from = dayOf(first);
  const to = dayOf(last);
  const write = (day: Day, as: DayStyle) => writeDay(day, as, language);
  const yearly = (day: Day, as: DayStyle) =>
    as === "weekday"
      ? `${write(day, as)}${ar ? " " : ", "}${day.year}`
      : write(day, WITH_YEAR[as]);
  if (from.year !== to.year)
    return inDigits(
      `${yearly(from, style)}${DASH}${yearly(to, style)}`,
      digits,
    );
  const sameMonth = from.month === to.month;
  // Day numbers alone would not say which months they fall in.
  const bare = style === "day" && !sameMonth ? "short" : WITHOUT_YEAR[style];
  const year = HAS_YEAR.has(style)
    ? ar
      ? ` ${from.year}`
      : `, ${from.year}`
    : "";
  let span: string;
  if (bare === "day") span = `${from.day}${DASH}${to.day}`;
  else if (!sameMonth || style === "weekday")
    span =
      ar && sameMonth
        ? `${names.weekdays.long[from.weekday]}${names.comma}${from.day}${DASH}${write(to, bare)}`
        : `${write(from, bare)}${DASH}${write(to, bare)}`;
  else {
    const month =
      (bare === "short" ? names.months.short : names.months.long)[
        from.month - 1
      ] ?? "";
    span = ar
      ? `${from.day}${DASH}${to.day} ${month}`
      : `${month} ${from.day}${DASH}${to.day}`;
  }
  return inDigits(`${span}${year}`, digits);
}

/** A time of day on a 12-hour clock face: "8:30 AM", "8:30 م". */
function writeClock(hour: number, minute: number, names: Names) {
  const face = hour % 12 === 0 ? 12 : hour % 12;
  const period = names.dayPeriods[hour < 12 ? 0 : 1];
  return `${face}:${twoDigits(minute)} ${period}`;
}

/** A time of day (a `time` column, `HH:MM` or `HH:MM:SS`). */
export function formatTimeIn(time: string, locale: string): string {
  const { language, digits } = writingOf(locale);
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return inDigits(writeClock(hours, minutes, NAMES[language]), digits);
}

/** An instant on a zone's clock, whatever the reader's own zone is. */
export function formatInstantIn(
  instant: string | Date,
  style: InstantStyle,
  timeZone: string,
  locale: string,
): string {
  const local = zonedLocal(instant, timeZone);
  const { language, digits } = writingOf(locale);
  const names = NAMES[language];
  const day = dayOf(local);
  const clock = writeClock(
    Number(local.slice(11, 13)),
    Number(local.slice(14, 16)),
    names,
  );
  const weekdays =
    language === "ar" ? names.weekdays.long : names.weekdays.short;
  const short = () => writeDay(day, "short", language);
  const medium = () => writeDay(day, "medium", language);
  const STYLES: Record<InstantStyle, () => string> = {
    full: () => [weekdays[day.weekday], short(), clock].join(names.comma),
    stamp: () => [short(), clock].join(names.comma),
    medium: () => [medium(), clock].join(names.comma),
    date: medium,
    short,
    time: () => clock,
  };
  return inDigits(STYLES[style](), digits);
}

/** A 24-hour wall-clock time, `HH:MM` from `HH:MM:SS`. */
const clock = (time: string | null) => time?.slice(0, 5) ?? "";

/** Days that may carry 24-hour wall-clock times of their own, such as an event's. */
export interface DaySpan {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
}

/**
 * A span of days, with its hours when timed, in full or short: "Monday,
 * September 14, 09:00 – 10:30", "Mon, Sep 14 – Wed, Sep 16".
 */
export function formatSpanIn(
  span: DaySpan,
  width: "long" | "short",
  locale: string,
): string {
  const { language, digits } = writingOf(locale);
  const names = NAMES[language];
  const ar = language === "ar";
  const from = dayOf(span.startsOn);
  const to = dayOf(span.endsOn);
  const timed = span.startTime !== null && span.endTime !== null;
  const months = width === "long" ? names.months.long : names.months.short;
  const weekdays =
    width === "long" || ar ? names.weekdays.long : names.weekdays.short;
  const day = (one: Day, year: boolean) => {
    const month = months[one.month - 1] ?? "";
    const weekday = weekdays[one.weekday] ?? "";
    return ar
      ? `${weekday}${names.comma}${one.day} ${month}${year ? ` ${one.year}` : ""}`
      : `${weekday}, ${month} ${one.day}${year ? `, ${one.year}` : ""}`;
  };
  const oneDay = span.startsOn.slice(0, 10) === span.endsOn.slice(0, 10);
  const years = from.year !== to.year;
  let text: string;
  if (oneDay)
    text = timed
      ? `${day(from, false)}${names.comma}${clock(span.startTime)}${DASH}${clock(span.endTime)}`
      : day(from, false);
  else if (timed)
    text = `${day(from, years)}${names.comma}${clock(span.startTime)}${DASH}${day(to, years)}${names.comma}${clock(span.endTime)}`;
  else if (ar && !years && from.month === to.month)
    text = `${weekdays[from.weekday]}${names.comma}${from.day}${DASH}${day(to, false)}`;
  else text = `${day(from, years)}${DASH}${day(to, years)}`;
  return inDigits(text, digits);
}

/** A month alone, `YYYY-MM` or a day in it: "Sep", or with its year "September 2026". */
export function formatMonthIn(
  isoMonth: string,
  width: "short" | "label",
  locale: string,
): string {
  const { language, digits } = writingOf(locale);
  const names = NAMES[language];
  const month = Number(isoMonth.slice(5, 7));
  return width === "short"
    ? (names.months.short[month - 1] ?? "")
    : inDigits(
        `${names.months.long[month - 1] ?? ""} ${isoMonth.slice(0, 4)}`,
        digits,
      );
}

/** An ISO weekday (1 for Monday, 7 for Sunday) named in a language. */
export function formatWeekdayIn(
  isoWeekday: number,
  width: "long" | "short",
  locale: string,
): string {
  const names = NAMES[writingOf(locale).language];
  const table = width === "long" ? names.weekdays.long : names.weekdays.short;
  return table[isoWeekday % 7] ?? "";
}

const hijriReaders = new Map<HijriCalendar, Intl.DateTimeFormat>();

/** A day in a Hijri calendar, as numbers; the calendar's arithmetic is Intl's. */
function hijriOf(isoDate: string, calendar: HijriCalendar) {
  let reader = hijriReaders.get(calendar);
  if (!reader) {
    reader = new Intl.DateTimeFormat(`en-u-ca-${calendar}-nu-latn`, {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      timeZone: "UTC",
    });
    hijriReaders.set(calendar, reader);
  }
  const parts = reader.formatToParts(
    new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`),
  );
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return { year: read("year"), month: read("month"), day: read("day") };
}

/** A Gregorian day as a Hijri calendar has it: "Rabiʻ II 3", "3 ربيع الآخر 1448 هـ". */
export function formatHijriIn(
  isoDate: string,
  calendar: HijriCalendar,
  style: HijriStyle,
  locale: string,
): string {
  const { language, digits } = writingOf(locale);
  const names = NAMES[language];
  const { year, month, day } = hijriOf(isoDate, calendar);
  const name =
    (style === "short" ? names.hijri.short : names.hijri.long)[month - 1] ?? "";
  const text =
    language === "ar"
      ? `${day} ${name}${style === "full" ? ` ${year} ${names.hijriEra}` : ""}`
      : `${name} ${day}${style === "full" ? `, ${year} ${names.hijriEra}` : ""}`;
  return inDigits(text, digits);
}

/**
 * Items as one phrase, "a, b, and c" or "a وb وc"; as choices, "a, b, or c"
 * and "a أو b أو c"; or as a plain run, "a, b, c" and "a، b، c". The items
 * are written as given, digits and all.
 */
export function formatListIn(
  items: readonly string[],
  type: "and" | "or" | "unit",
  locale: string,
): string {
  const names = NAMES[writingOf(locale).language];
  if (type === "unit") return items.join(names.comma);
  const word = type === "and" ? names.and : names.or;
  if (names === NAMES.ar)
    return items.join(type === "and" ? ` ${word}` : ` ${word} `);
  if (items.length <= 2) return items.join(` ${word} `);
  return `${items.slice(0, -1).join(", ")}, ${word} ${items.at(-1)}`;
}
