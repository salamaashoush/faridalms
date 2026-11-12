import type { StaffAbsence } from "@faridalms/database/stores/cover";
import type { MeetingRow } from "@faridalms/database/stores/timetable";

import { isSchoolDay, periodsOn } from "@faridalms/database/stores/attendance";
import { classById, roomsOf } from "@faridalms/database/stores/classes";
import {
  absencesBetween,
  awayAt,
  changesOn,
  clearChange,
  coverCandidates,
  heldChange,
  insertAbsence,
  removeAbsence,
  setChange,
} from "@faridalms/database/stores/cover";
import {
  gridOwners,
  meetingsOn,
  yearTeachers,
} from "@faridalms/database/stores/timetable";
import {
  dayIn,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import { addDays } from "@faridalms/domain/school";
import {
  changeLessonSchema,
  clearChangeSchema,
  coverDaySchema,
  coverOptionsSchema,
  removeAbsenceSchema,
  staffAbsenceSchema,
} from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import { notify } from "../core/notify";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { gridOwnerOf, gridsOf, plannedElsewhere } from "../timetable/grids";

async function yearOn(context: UnitContext, day: string) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = years.find((row) => row.startsOn <= day && day < row.endsBefore);
  if (!year)
    throw new ORPCError("BAD_REQUEST", { message: "timetable.outside_year" });
  if (year.lifecycle === "closed")
    throw new ORPCError("BAD_REQUEST", { message: "academic_year.closed" });
  return year;
}

const lessonKey = (row: { classId: string; periodId: string }) =>
  `${row.classId}:${row.periodId}`;

function absenceView(row: StaffAbsence) {
  return {
    id: row.id,
    userId: row.userId,
    fullNameEn: row.fullNameEn,
    fullNameAr: row.fullNameAr,
    from: row.from,
    to: row.to,
    periodIds: row.periodIds,
    reason: row.reason,
    note: row.note,
  };
}

/** The lesson a class has in a period of a day, or none. */
async function lessonAt(
  context: UnitContext,
  input: { classId: string; periodId: string; on: string },
): Promise<MeetingRow | null> {
  const meetings = await meetingsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    on: input.on,
    days: [input.on],
    filter: { classIds: [input.classId] },
  });
  return (
    meetings.find(
      (row) => row.classId === input.classId && row.periodId === input.periodId,
    ) ?? null
  );
}

/**
 * Whether a class may have a lesson that day alone in a period: one its
 * bell schedule adds, which registers can be taken in.
 */
async function oneDaySlot(
  context: UnitContext,
  input: { yearId: string; periodId: string; on: string },
) {
  const periods = await periodsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    yearId: input.yearId,
    day: input.on,
  });
  return periods.some(
    (row) => row.id === input.periodId && row.scheduleId !== null,
  );
}

async function periodName(
  context: UnitContext,
  yearId: string,
  on: string,
  periodId: string,
) {
  const periods = await periodsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    yearId,
    day: on,
  });
  const period = periods.find((row) => row.id === periodId);
  return {
    periodName: period?.nameEn ?? period?.code,
    periodNameAr: period?.nameAr ?? period?.nameEn ?? period?.code,
  };
}

/**
 * A day's cover: who is away, the lessons they leave, every lesson changed
 * that day, each with its change, and the one-day lessons of the periods
 * its bell schedule adds, with the classes that can have one.
 */
export const day = readProcedure
  .input(coverDaySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = workingYear(years, context.today);
    if (!year) return { cover: null };
    const on = dayIn(year, input.on || context.today);
    const [periods, absences, changes, teachers, rooms, open, classes] =
      await Promise.all([
        periodsOn(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId: year.id,
          day: on,
        }),
        absencesBetween(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          from: on,
          to: on,
        }),
        changesOn(context.tx, {
          tenantId: context.tenantId,
          days: [on],
          filter: { schoolId: context.schoolId },
        }),
        yearTeachers(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId: year.id,
        }),
        roomsOf(context.tx, context.tenantId, context.schoolId),
        isSchoolDay(context.tx, {
          tenantId: context.tenantId,
          yearId: year.id,
          day: on,
        }),
        gridOwners(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId: year.id,
          except: await plannedElsewhere(context, year.id),
        }),
      ]);
    const [away, changed] = await Promise.all([
      absences.length === 0
        ? Promise.resolve([])
        : meetingsOn(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            on,
            days: [on],
            filter: { teacherIds: absences.map((row) => row.userId) },
          }),
      changes.length === 0
        ? Promise.resolve([])
        : meetingsOn(context.tx, {
            tenantId: context.tenantId,
            schoolId: context.schoolId,
            on,
            days: [on],
            filter: {
              classIds: [...new Set(changes.map((row) => row.classId))],
            },
          }),
    ]);
    const changeOf = new Map(changes.map((row) => [lessonKey(row), row]));
    const lessons = new Map<string, MeetingRow>();
    for (const row of away)
      if (row.teacherId && awayAt(absences, row.teacherId, on, row.periodId))
        lessons.set(lessonKey(row), row);
    for (const row of changed)
      if (changeOf.has(lessonKey(row))) lessons.set(lessonKey(row), row);
    const order = new Map(periods.map((row) => [row.id, row.sequence]));
    const grids = await gridsOf(context, [
      ...new Set([...lessons.values()].map((row) => row.classId)),
    ]);
    return {
      cover: {
        on,
        today: context.today,
        year: {
          id: year.id,
          startsOn: year.startsOn,
          lastDay: addDays(year.endsBefore, -1),
          closed: year.lifecycle === "closed",
        },
        open: open !== false,
        periods: periods
          .filter((row) => row.kind === "lesson" || row.scheduleId !== null)
          .map((row) => ({
            id: row.id,
            code: row.code,
            nameEn: row.nameEn,
            nameAr: row.nameAr,
            startTime: row.startTime,
            endTime: row.endTime,
            oneDay: row.scheduleId !== null,
          })),
        classes: periods.some((row) => row.scheduleId !== null)
          ? classes.map((row) => ({
              id: row.id,
              code: row.code,
              titleEn: row.titleEn,
              titleAr: row.titleAr,
            }))
          : [],
        absences: absences.map(absenceView),
        lessons: [...lessons.values()]
          .toSorted(
            (a, b) =>
              (order.get(a.periodId) ?? 0) - (order.get(b.periodId) ?? 0) ||
              (grids.get(a.classId)?.code ?? a.classCode).localeCompare(
                grids.get(b.classId)?.code ?? b.classCode,
              ),
          )
          .map((row) => {
            const change = changeOf.get(lessonKey(row)) ?? null;
            return {
              classId: row.classId,
              classCode: row.classCode,
              classTitleEn: row.classTitleEn,
              classTitleAr: row.classTitleAr,
              gridCode: grids.get(row.classId)?.code ?? row.classCode,
              gridTitleEn: grids.get(row.classId)?.titleEn ?? row.classTitleEn,
              gridTitleAr: grids.get(row.classId)?.titleAr ?? row.classTitleAr,
              periodId: row.periodId,
              teacherId: row.teacherId,
              teacherNameEn: row.teacherNameEn,
              teacherNameAr: row.teacherNameAr,
              roomId: row.roomId,
              roomCode: row.roomCode,
              roomNameEn: row.roomNameEn,
              roomNameAr: row.roomNameAr,
              away: row.teacherId
                ? awayAt(absences, row.teacherId, on, row.periodId)
                : false,
              oneDay: row.oneDay,
              change: change
                ? {
                    id: change.id,
                    coverId: change.coverId,
                    coverNameEn: change.coverNameEn,
                    coverNameAr: change.coverNameAr,
                    roomId: change.roomId,
                    roomCode: change.roomCode,
                    roomNameEn: change.roomNameEn,
                    roomNameAr: change.roomNameAr,
                    cancelled: change.cancelled,
                    note: change.note,
                  }
                : null,
            };
          }),
        teachers,
        rooms,
      },
    };
  });

/**
 * Who could cover a lesson, best first, and the rooms free in its period.
 */
export const options = readProcedure
  .input(coverOptionsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await yearOn(context, input.on);
    const lesson = await lessonAt(context, input);
    if (!lesson && !(await oneDaySlot(context, { ...input, yearId: year.id })))
      throw new ORPCError("NOT_FOUND");
    const [candidates, absences, rooms, meetings, changes] = await Promise.all([
      coverCandidates(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
        classId: input.classId,
        knownClassIds: [
          ...new Set([
            input.classId,
            await gridOwnerOf(context, input.classId),
          ]),
        ],
        periodId: input.periodId,
        day: input.on,
      }),
      absencesBetween(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from: input.on,
        to: input.on,
      }),
      roomsOf(context.tx, context.tenantId, context.schoolId),
      meetingsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        on: input.on,
        days: [input.on],
        filter: { schoolId: context.schoolId },
      }),
      changesOn(context.tx, {
        tenantId: context.tenantId,
        days: [input.on],
        filter: { schoolId: context.schoolId },
      }),
    ]);
    const moved = new Map(
      changes.map((row) => [`${row.classId}:${row.periodId}`, row]),
    );
    const taken = new Set<string>();
    for (const row of meetings) {
      if (row.periodId !== input.periodId || row.classId === input.classId)
        continue;
      const change = moved.get(`${row.classId}:${row.periodId}`);
      if (change?.cancelled) continue;
      const room = change?.roomId ?? row.roomId;
      if (room) taken.add(room);
    }
    for (const change of changes)
      if (
        change.periodId === input.periodId &&
        change.classId !== input.classId &&
        change.roomId
      )
        taken.add(change.roomId);
    return {
      candidates: candidates.filter(
        (row) => !awayAt(absences, row.userId, input.on, input.periodId),
      ),
      rooms: rooms.map((room) => ({ ...room, free: !taken.has(room.id) })),
    };
  });

/** Records a member of staff away, for whole days or some periods. */
export const setAbsence = writeProcedure
  .input(staffAbsenceSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await yearOn(context, input.from);
    if (input.to >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", { message: "timetable.outside_year" });
    const [teachers, periods] = await Promise.all([
      yearTeachers(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
      }),
      periodsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
        day: input.from,
      }),
    ]);
    if (!teachers.some((row) => row.userId === input.userId))
      throw new ORPCError("BAD_REQUEST", { message: "timetable.teacher" });
    const known = new Set(periods.map((row) => row.id));
    if (input.periodIds.some((id) => !known.has(id)))
      throw new ORPCError("BAD_REQUEST", { message: "timetable.no_period" });
    const id = await insertAbsence(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      userId: input.userId,
      from: input.from,
      to: input.to,
      periodIds: input.periodIds.length > 0 ? input.periodIds : null,
      reason: input.reason,
      note: input.note || null,
    });
    await audit(context, {
      action: "timetable.staff_absence",
      objectType: "staff_absence",
      objectId: id,
      details: {
        userId: input.userId,
        from: input.from,
        to: input.to,
        periods: input.periodIds.length,
      },
    });
    return { id };
  });

export const removeStaffAbsence = writeProcedure
  .input(removeAbsenceSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const removed = await removeAbsence(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      id: input.id,
    });
    if (!removed) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "timetable.staff_absence_removed",
      objectType: "staff_absence",
      objectId: input.id,
      details: { userId: removed.userId },
    });
    return { ok: true };
  });

/**
 * Covers, moves or cancels one lesson on one day, or gives a class a lesson
 * that day alone in a period its bell schedule adds, taken by whoever the
 * change names. The cover teacher is told, and so is anyone it was given to
 * before.
 */
export const changeLesson = writeProcedure
  .input(changeLessonSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await yearOn(context, input.on);
    const [classRow, lesson] = await Promise.all([
      classById(context.tx, context, input.classId),
      lessonAt(context, input),
    ]);
    if (!classRow || classRow.schoolYearId !== year.id)
      throw new ORPCError("NOT_FOUND");
    if (!lesson && !(await oneDaySlot(context, { ...input, yearId: year.id })))
      throw new ORPCError("NOT_FOUND");
    if ((!lesson || lesson.oneDay) && input.cancelled)
      throw new ORPCError("BAD_REQUEST", {
        message: "timetable.one_day_cancel",
      });
    const key = {
      tenantId: context.tenantId,
      classId: input.classId,
      periodId: input.periodId,
      day: input.on,
    };
    if ((await heldChange(context.tx, key)) !== input.expected)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const { previousCoverId } = await clearChange(context.tx, key);
    if (input.coverId) {
      if (input.coverId === lesson?.teacherId)
        throw new ORPCError("BAD_REQUEST", { message: "timetable.cover_own" });
      const [candidates, absences] = await Promise.all([
        coverCandidates(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId: year.id,
          classId: input.classId,
          knownClassIds: [
            ...new Set([
              input.classId,
              await gridOwnerOf(context, input.classId),
            ]),
          ],
          periodId: input.periodId,
          day: input.on,
        }),
        absencesBetween(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          from: input.on,
          to: input.on,
        }),
      ]);
      if (
        !candidates.some((row) => row.userId === input.coverId) ||
        awayAt(absences, input.coverId, input.on, input.periodId)
      )
        throw new ORPCError("CONFLICT", { message: "timetable.cover_busy" });
    }
    if (input.roomId) {
      const rooms = await roomsOf(
        context.tx,
        context.tenantId,
        context.schoolId,
      );
      if (!rooms.some((room) => room.id === input.roomId))
        throw new ORPCError("BAD_REQUEST", { message: "timetable.room" });
    }
    await setChange(context.tx, {
      ...key,
      schoolId: context.schoolId,
      yearId: year.id,
      coverId: input.coverId || null,
      roomId: input.roomId || null,
      cancelled: input.cancelled,
      note: input.note || null,
    });
    const names = {
      classId: classRow.id,
      className: classRow.titleEn ?? classRow.code,
      classNameAr: classRow.titleAr ?? classRow.titleEn ?? classRow.code,
      date: input.on,
      ...(await periodName(context, year.id, input.on, input.periodId)),
    };
    if (input.coverId && input.coverId !== previousCoverId)
      await notify(context, [input.coverId], {
        kind: "reminder",
        subject: { type: "class", id: classRow.id },
        params: { ...names, cover: true },
      });
    if (previousCoverId && previousCoverId !== input.coverId)
      await notify(context, [previousCoverId], {
        kind: "reminder",
        subject: { type: "class", id: classRow.id },
        params: { ...names, cover: true, cancelled: true },
      });
    await audit(context, {
      action: "timetable.lesson_change",
      objectType: "class",
      objectId: classRow.id,
      details: {
        date: input.on,
        periodId: input.periodId,
        coverId: input.coverId || null,
        roomId: input.roomId || null,
        cancelled: input.cancelled,
      },
    });
    return { ok: true };
  });

/** Puts a lesson back as the timetable has it for that day. */
export const clearLessonChange = writeProcedure
  .input(clearChangeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "timetable:manage");
    const year = await yearOn(context, input.on);
    const classRow = await classById(context.tx, context, input.classId);
    if (!classRow) throw new ORPCError("NOT_FOUND");
    const key = {
      tenantId: context.tenantId,
      classId: input.classId,
      periodId: input.periodId,
      day: input.on,
    };
    if ((await heldChange(context.tx, key)) !== input.expected)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const { previousCoverId } = await clearChange(context.tx, key);
    if (previousCoverId)
      await notify(context, [previousCoverId], {
        kind: "reminder",
        subject: { type: "class", id: classRow.id },
        params: {
          classId: classRow.id,
          className: classRow.titleEn ?? classRow.code,
          classNameAr: classRow.titleAr ?? classRow.titleEn ?? classRow.code,
          date: input.on,
          ...(await periodName(context, year.id, input.on, input.periodId)),
          cover: true,
          cancelled: true,
        },
      });
    await audit(context, {
      action: "timetable.lesson_change_cleared",
      objectType: "class",
      objectId: classRow.id,
      details: { date: input.on, periodId: input.periodId },
    });
    return { ok: true };
  });
