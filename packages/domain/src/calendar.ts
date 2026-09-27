import * as v from "valibot";

import type { IsoWeekday } from "./timetable";

import { audienceSchema } from "./announcements";
import { contentDocumentSchema } from "./content";
import { addDays, daysBetween, shiftMonth, zonedInstant } from "./school";
import { isoWeekday } from "./timetable";

export const CALENDAR_CATEGORIES = [
  "general",
  "meeting",
  "trip",
  "performance",
  "sport",
  "exam",
  "celebration",
] as const;
export type CalendarCategory = (typeof CALENDAR_CATEGORIES)[number];

/** The longest window one request reads: six weeks of a month grid, with room. */
export const MAX_RANGE_DAYS = 120;

const id = v.pipe(v.string(), v.uuid());
const optionalId = v.optional(v.union([v.literal(""), id]), "");
const isoDate = v.pipe(v.string(), v.isoDate());
const clock = v.union([v.literal(""), v.pipe(v.string(), v.isoTime())]);

export const rangeQuerySchema = v.pipe(
  v.object({
    from: isoDate,
    to: isoDate,
    /** A family's view narrowed to one child's classes and grade. */
    child: optionalId,
  }),
  v.check(
    (range) =>
      range.to >= range.from &&
      daysBetween(range.from, range.to) <= MAX_RANGE_DAYS,
    "calendar.range",
  ),
);
export type RangeQuery = v.InferOutput<typeof rangeQuerySchema>;

export const saveEventSchema = v.pipe(
  v.object({
    id: optionalId,
    expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    titleEn: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    titleAr: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    category: v.picklist(CALENDAR_CATEGORIES),
    startsOn: isoDate,
    endsOn: isoDate,
    allDay: v.boolean(),
    startTime: clock,
    endTime: clock,
    location: v.pipe(v.string(), v.trim(), v.maxLength(200)),
    provisional: v.boolean(),
    audiences: v.pipe(v.array(audienceSchema), v.minLength(1), v.maxLength(20)),
    description: contentDocumentSchema,
    /** Tell a published event's audience about this change. */
    sendUpdate: v.optional(v.boolean(), false),
    /** Also shown on the school's website; the office decides. */
    public: v.optional(v.boolean(), false),
  }),
  v.forward(
    v.check(
      (input) => input.titleEn !== "" || input.titleAr !== "",
      "calendar.title_needed",
    ),
    ["titleEn"],
  ),
  v.forward(
    v.check((input) => input.endsOn >= input.startsOn, "calendar.ends_before"),
    ["endsOn"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.allDay || (input.startTime !== "" && input.endTime !== ""),
      "calendar.times_needed",
    ),
    ["startTime"],
  ),
  v.forward(
    v.check(
      (input) =>
        input.allDay ||
        input.endsOn > input.startsOn ||
        input.endTime > input.startTime,
      "calendar.ends_before",
    ),
    ["endTime"],
  ),
);
export type SaveEvent = v.InferOutput<typeof saveEventSchema>;

export const eventRefSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
});

export const publishEventSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  /** Tell the audience now, or let it appear quietly. */
  notify: v.boolean(),
});

interface Planned {
  startsOn: string;
  endsOn: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  audiences: readonly { scope: string; classId?: string; gradeId?: string }[];
}

const audienceKey = (audiences: Planned["audiences"]) =>
  audiences
    .map((one) => `${one.scope}:${one.classId ?? ""}:${one.gradeId ?? ""}`)
    .toSorted()
    .join("|");

/**
 * Whether an edit changes when, where or for whom, the changes people must
 * hear about; a new title or description alone can go quietly.
 */
export function materialChange(before: Planned, after: Planned): boolean {
  return (
    before.startsOn !== after.startsOn ||
    before.endsOn !== after.endsOn ||
    (before.startTime ?? "") !== (after.startTime ?? "") ||
    (before.endTime ?? "") !== (after.endTime ?? "") ||
    (before.location ?? "") !== (after.location ?? "") ||
    audienceKey(before.audiences) !== audienceKey(after.audiences)
  );
}

export const cancelEventSchema = v.object({
  id,
  expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(1)),
  cancelled: v.boolean(),
});

/** Whole weeks covering a month, starting on the school's first weekday. */
export function monthWeeks(month: string, weekStart: IsoWeekday): string[][] {
  const first = `${month}-01`;
  const lead = (isoWeekday(first) - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  const next = `${shiftMonth(month, 1)}-01`;
  const weeks: string[][] = [];
  for (let day = start; day < next; day = addDays(day, 7))
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(day, index)));
  return weeks;
}

/** Whether an event falls on a day, counting every day of one spanning several. */
export function onDay(
  event: { startsOn: string; endsOn: string },
  day: string,
): boolean {
  return event.startsOn <= day && day <= event.endsOn;
}

interface IcsEvent {
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
}

const icsText = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

const icsDate = (iso: string) => iso.replaceAll("-", "");
const icsInstant = (at: Date) =>
  `${at.toISOString().replaceAll(/[-:]/g, "").slice(0, 15)}Z`;

/** RFC 5545 folds lines longer than 75 octets onto continuation lines. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const width = new TextEncoder().encode(char).length;
    if (size + width > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += width;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

interface IcsOptions {
  timeZone: string;
  stamp: Date;
  /** Put before a cancelled event's title: some calendar apps ignore its status. */
  cancelledLabel?: string;
  /** Where the event can be read in the app. */
  urlOf?: (id: string) => string;
}

function vevent(event: IcsEvent, input: IcsOptions): string[] {
  const when =
    event.startTime && event.endTime
      ? [
          `DTSTART:${icsInstant(zonedInstant(event.startsOn, event.startTime, input.timeZone))}`,
          `DTEND:${icsInstant(zonedInstant(event.endsOn, event.endTime, input.timeZone))}`,
        ]
      : [
          `DTSTART;VALUE=DATE:${icsDate(event.startsOn)}`,
          `DTEND;VALUE=DATE:${icsDate(addDays(event.endsOn, 1))}`,
        ];
  const title =
    event.cancelled && input.cancelledLabel
      ? `${input.cancelledLabel}: ${event.title}`
      : event.title;
  return [
    "BEGIN:VEVENT",
    `UID:${event.id}@farida-lms`,
    `DTSTAMP:${icsInstant(input.stamp)}`,
    `SEQUENCE:${event.version}`,
    ...when,
    `SUMMARY:${icsText(title)}`,
    ...(event.location ? [`LOCATION:${icsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${icsText(event.description)}`] : []),
    ...(input.urlOf ? [`URL:${input.urlOf(event.id)}`] : []),
    `STATUS:${event.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
  ];
}

const HEAD = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Farida LMS//Calendar//EN",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
];

const file = (lines: string[]) => `${lines.map(fold).join("\r\n")}\r\n`;

/**
 * One event as an iCalendar file. Timed events are written in UTC from the
 * school's wall clock, so every calendar app places them at the same instant
 * without needing the zone's rules.
 */
export function eventIcs(event: IcsEvent, input: IcsOptions): string {
  return file([...HEAD, ...vevent(event, input), "END:VCALENDAR"]);
}

/**
 * A person's whole calendar as one subscribable file: the events that reach
 * them and the days the school is shut, as all-day entries that do not
 * block time. Apps poll it on their own schedule, hours apart.
 */
export function calendarIcs(
  input: IcsOptions & {
    name: string;
    events: IcsEvent[];
    days: { day: string; title: string }[];
  },
): string {
  const days = input.days.flatMap((day) => [
    "BEGIN:VEVENT",
    `UID:day-${day.day}@farida-lms`,
    `DTSTAMP:${icsInstant(input.stamp)}`,
    `DTSTART;VALUE=DATE:${icsDate(day.day)}`,
    `DTEND;VALUE=DATE:${icsDate(addDays(day.day, 1))}`,
    `SUMMARY:${icsText(day.title)}`,
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ]);
  return file([
    ...HEAD,
    `NAME:${icsText(input.name)}`,
    `X-WR-CALNAME:${icsText(input.name)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
    "X-PUBLISHED-TTL:PT6H",
    ...input.events.flatMap((event) => vevent(event, input)),
    ...days,
    "END:VCALENDAR",
  ]);
}

/** Day meanings on which lessons are held; everything else keeps the school shut. */
export const SCHOOL_DAY_MEANINGS: readonly string[] = [
  "instructional_day",
  "exam_day",
  "early_dismissal",
  "make_up_day",
];

/**
 * What a range of days can be marked as. `normal` puts each day back to a
 * school day or a weekend by the school's week; a make-up day may land on a
 * weekend, every other kind leaves weekends as they are.
 */
export const DAY_KINDS = [
  "normal",
  "public_holiday",
  "school_holiday",
  "exam_day",
  "teacher_only_day",
  "early_dismissal",
  "make_up_day",
  "weather_closure",
  "emergency_closure",
  "other",
] as const;
export type DayKind = (typeof DAY_KINDS)[number];

/** The longest range one change marks: a whole school year. */
export const MAX_PAINT_DAYS = 366;

const note = v.pipe(v.string(), v.trim(), v.maxLength(200));

export const paintDaysSchema = v.pipe(
  v.object({
    yearId: id,
    from: isoDate,
    to: isoDate,
    kind: v.picklist(DAY_KINDS),
    noteEn: note,
    noteAr: note,
    provisional: v.boolean(),
  }),
  v.forward(
    v.check(
      (input) =>
        input.to >= input.from &&
        daysBetween(input.from, input.to) < MAX_PAINT_DAYS,
      "calendar.range",
    ),
    ["to"],
  ),
);
export type PaintDays = v.InferOutput<typeof paintDaysSchema>;

export const targetDaysSchema = v.object({
  yearId: id,
  target: v.nullable(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(366)),
  ),
});

/** How many of a year's days hold lessons. */
export const schoolDayCount = (days: readonly { meaning: string }[]) =>
  days.filter((day) => SCHOOL_DAY_MEANINGS.includes(day.meaning)).length;
