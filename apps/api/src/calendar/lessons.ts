import type { CellTransaction } from "@faridalms/database/context";
import type { LessonChange } from "@faridalms/database/stores/cover";
import type { MeetingRow } from "@faridalms/database/stores/timetable";

import { periodsOn } from "@faridalms/database/stores/attendance";
import { changesOn } from "@faridalms/database/stores/cover";
import {
  meetingsOn,
  studentGroups,
} from "@faridalms/database/stores/timetable";
import {
  calendarDays,
  schoolWeek,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import { SCHOOL_DAY_MEANINGS } from "@faridalms/domain/calendar";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";

/** How far a feed's lessons reach: last week, and the weeks ahead. */
const BACK_DAYS = 7;
const AHEAD_DAYS = 42;

const WORDS = {
  en: { cover: "Cover", coveredBy: "Covered by", room: "Room changed" },
  ar: { cover: "تغطية", coveredBy: "يغطيها", room: "تغيّرت القاعة" },
} as const;

const key = (row: { classId: string; periodId: string }, day: string) =>
  `${row.classId}:${row.periodId}:${day}`;

export interface FeedLesson {
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

/**
 * A person's lessons for their calendar feed, day by day as they are held:
 * a student's classes, and a teacher's own lessons with those they cover.
 * Cancelled lessons stay in the feed as cancelled, so apps remove them.
 */
export async function feedLessons(
  tx: CellTransaction,
  input: {
    tenantId: string;
    schoolId: string;
    userId: string;
    today: string;
    locale: "en" | "ar";
    origin: string;
  },
): Promise<FeedLesson[]> {
  const year = workingYear(
    await schoolYears(tx, input.tenantId, input.schoolId),
    input.today,
  );
  if (!year) return [];
  const from = addDays(input.today, -BACK_DAYS);
  const to = addDays(input.today, AHEAD_DAYS);
  const [week, marked, periods, groups] = await Promise.all([
    schoolWeek(tx, input.tenantId, input.schoolId),
    calendarDays(tx, { tenantId: input.tenantId, yearId: year.id, from, to }),
    periodsOn(tx, {
      tenantId: input.tenantId,
      schoolId: input.schoolId,
      yearId: year.id,
      day: input.today < year.startsOn ? year.startsOn : input.today,
    }),
    studentGroups(tx, {
      tenantId: input.tenantId,
      studentId: input.userId,
      on: input.today,
    }),
  ]);
  const shut = new Set(
    marked
      .filter((row) => !SCHOOL_DAY_MEANINGS.includes(row.meaning))
      .map((row) => row.day),
  );
  const days: string[] = [];
  for (let day = from; day <= to; day = addDays(day, 1))
    if (
      day >= year.startsOn &&
      day < year.endsBefore &&
      !week.weekendDays.includes(isoWeekday(day)) &&
      !shut.has(day)
    )
      days.push(day);
  if (days.length === 0) return [];
  const learner = groups.groupIds.length > 0 || groups.classIds.length > 0;
  const [taught, learnt, covers] = await Promise.all([
    meetingsOn(tx, {
      tenantId: input.tenantId,
      on: input.today,
      days,
      filter: { teacherId: input.userId },
    }),
    learner
      ? meetingsOn(tx, {
          tenantId: input.tenantId,
          on: input.today,
          days,
          filter: groups,
        })
      : Promise.resolve([]),
    changesOn(tx, {
      tenantId: input.tenantId,
      days,
      filter: { coverId: input.userId },
    }),
  ]);
  const covered = covers.length
    ? await meetingsOn(tx, {
        tenantId: input.tenantId,
        on: input.today,
        days,
        filter: {
          groupIds: [],
          classIds: [...new Set(covers.map((row) => row.classId))],
        },
      })
    : [];
  const own = [...taught, ...learnt];
  const changes = await changesOn(tx, {
    tenantId: input.tenantId,
    days,
    filter: { classIds: [...new Set(own.map((row) => row.classId))] },
  });
  const changeOf = new Map(changes.map((row) => [key(row, row.day), row]));
  const coverOf = new Map(covers.map((row) => [key(row, row.day), row]));
  const periodOf = new Map(periods.map((row) => [row.id, row]));
  const ar = input.locale === "ar";
  const pick = (en: string | null, other: string | null) =>
    (ar ? (other ?? en) : (en ?? other)) ?? "";
  const words = WORDS[input.locale];
  const lesson = (
    row: MeetingRow,
    change: LessonChange | undefined,
    cover: boolean,
  ): FeedLesson | null => {
    const period = periodOf.get(row.periodId);
    if (!period?.startTime || !period.endTime) return null;
    // A teacher away for a lesson someone covers has nothing on then.
    if (
      !cover &&
      change?.coverId &&
      change.coverId !== input.userId &&
      row.teacherId === input.userId
    )
      return null;
    const title = pick(row.classTitleEn, row.classTitleAr) || row.classCode;
    const room = change?.roomId
      ? pick(change.roomNameEn, change.roomNameAr) || change.roomCode
      : pick(row.roomNameEn, row.roomNameAr) || row.roomCode;
    const teacher = change?.coverId
      ? `${words.coveredBy} ${pick(change.coverNameEn, change.coverNameAr)}`
      : pick(row.teacherNameEn, row.teacherNameAr);
    return {
      id: `lesson-${row.classId}-${row.periodId}-${row.on}`,
      title: cover ? `${words.cover}: ${title}` : title,
      startsOn: row.on,
      endsOn: row.on,
      startTime: period.startTime,
      endTime: period.endTime,
      location: room,
      description: [teacher, change?.roomId ? words.room : null, change?.note]
        .filter(Boolean)
        .join("\n"),
      cancelled: change?.cancelled ?? false,
      version: change ? 1 : 0,
      url: `${input.origin}/${learner ? "me" : "teach"}/timetable`,
    };
  };
  const seen = new Set<string>();
  const lessons: FeedLesson[] = [];
  for (const row of own) {
    const id = key(row, row.on);
    if (seen.has(id)) continue;
    seen.add(id);
    const made = lesson(row, changeOf.get(id), false);
    if (made) lessons.push(made);
  }
  for (const row of covered) {
    const change = coverOf.get(key(row, row.on));
    if (!change) continue;
    const made = lesson(row, change, true);
    if (made) lessons.push(made);
  }
  return lessons;
}
