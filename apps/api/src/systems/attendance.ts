import type {
  Descriptor,
  PeriodRow,
} from "@faridalms/database/stores/attendance";
import type { Scope } from "@faridalms/database/stores/students";
import type { SchoolYear } from "@faridalms/database/stores/years";
import type { AttendanceMeaning } from "@faridalms/domain/attendance";

import {
  absencesBetween,
  AttendanceConflict,
  attendanceCodes,
  attendanceReport,
  classAttendance,
  dayBoard,
  excuseMarks,
  isSchoolDay,
  marksOf,
  otherMarksOn,
  periodsOn,
  registerFor,
  saveSettings as writeSettings,
  settingsOf,
  studentAttendance,
  writeRegister,
} from "@faridalms/database/stores/attendance";
import {
  classById,
  classesTaughtBy,
  reachesClass,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { meetingsOn } from "@faridalms/database/stores/timetable";
import {
  dayIn,
  holdYear,
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  absencesQuerySchema,
  attendanceSettingsSchema,
  dayQuerySchema,
  emptyCounts,
  excuseSchema,
  isChronic,
  registerQuerySchema,
  registerState,
  reportQuerySchema,
  saveRegisterSchema,
  summarise,
  teacherMayEdit,
} from "@faridalms/domain/attendance";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/timetable";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const id = v.pipe(v.string(), v.uuid());

function teachingScope(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "attendance:manage"),
  };
}

function studentScope(context: UnitContext): Scope {
  return {
    ...teachingScope(context),
    schoolWide:
      can(context, "attendance:manage") || can(context, "classes:manage"),
  };
}

async function years(context: UnitContext) {
  return schoolYears(context.tx, context.tenantId, context.schoolId);
}

function lastDay(year: SchoolYear) {
  return addDays(year.endsBefore, -1);
}

function descriptorView(row: Descriptor) {
  return {
    id: row.id,
    code: row.code,
    meaning: row.meaning,
    labelEn: row.labelEn,
    labelAr: row.labelAr,
  };
}

function codesView(codes: { categories: Descriptor[]; reasons: Descriptor[] }) {
  return {
    categories: codes.categories.map(descriptorView),
    reasons: codes.reasons.map(descriptorView),
  };
}

function periodView(period: PeriodRow) {
  return {
    id: period.id,
    code: period.code,
    nameEn: period.nameEn,
    nameAr: period.nameAr,
    sequence: period.sequence,
    startTime: period.startTime,
    endTime: period.endTime,
    official: period.official,
  };
}

/** The register's year, or not found; a date outside it is refused. */
async function yearOfClass(
  context: UnitContext,
  schoolYearId: string,
  day: string,
) {
  const year = (await years(context)).find((row) => row.id === schoolYearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  if (day < year.startsOn || day >= year.endsBefore)
    throw new ORPCError("BAD_REQUEST", {
      message: "attendance.outside_year",
    });
  return year;
}

/** Which period a register opens in when none is named. */
function defaultPeriod(periods: PeriodRow[], classType: string) {
  return (
    (classType === "homeroom"
      ? periods.find((period) => period.official)
      : periods.find((period) => period.kind === "lesson")) ?? periods[0]
  );
}

async function editability(
  context: UnitContext,
  year: SchoolYear,
  day: string,
): Promise<
  | { editable: true }
  | {
      editable: false;
      reason: "closed" | "future" | "window" | "not_school_day";
    }
> {
  if (year.lifecycle === "closed") return { editable: false, reason: "closed" };
  if (day > context.today) return { editable: false, reason: "future" };
  if (
    (await isSchoolDay(context.tx, {
      tenantId: context.tenantId,
      yearId: year.id,
      day,
    })) === false
  )
    return { editable: false, reason: "not_school_day" };
  if (can(context, "attendance:manage")) return { editable: true };
  const rules = await settingsOf(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  return teacherMayEdit(day, context.today, rules.teacherEditDays)
    ? { editable: true }
    : { editable: false, reason: "window" };
}

/** A teacher's classes on a day, with the registers already taken in them. */
export const day = readProcedure
  .input(dayQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record");
    const year = workingYear(await years(context), context.today);
    if (!year)
      return {
        date: input.date || context.today,
        today: context.today,
        year: null,
        periods: [],
        classes: [],
        expected: [],
        registers: [],
      };
    const date = input.date || dayIn(year, context.today);
    const on = dayIn(year, date);
    const [classes, periods] = await Promise.all([
      classesTaughtBy(context.tx, context, {
        userId: context.actor.userId,
        yearId: year.id,
        on,
      }),
      periodsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        yearId: year.id,
        day: on,
      }),
    ]);
    const board = await dayBoard(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: on,
      officialPeriodId: periods.find((period) => period.official)?.id ?? null,
    });
    const taught = new Set(classes.map((row) => row.id));
    return {
      date: on,
      today: context.today,
      year: {
        id: year.id,
        startsOn: year.startsOn,
        lastDay: lastDay(year),
        closed: year.lifecycle === "closed",
      },
      periods: periods.map(periodView),
      classes: classes.map((row) => ({
        id: row.id,
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        classType: row.classType,
        students: row.students,
      })),
      expected: board
        .filter((row) => taught.has(row.classId))
        .map((row) => ({ classId: row.classId, periodId: row.periodId })),
      registers: board
        .filter((row) => taught.has(row.classId) && row.registerId)
        .map((row) => ({
          classId: row.classId,
          periodId: row.periodId,
          state: row.state,
          counts: row.counts,
          students: row.students,
        })),
    };
  });

/** One class's register for one period of a day, ready to mark. */
export const register = readProcedure
  .input(registerQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record", "attendance:manage");
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !(await teachesClass(context.tx, teachingScope(context), classRow.id))
    )
      throw new ORPCError("NOT_FOUND");
    const year = await yearOfClass(context, classRow.schoolYearId, input.date);
    const periods = await periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: input.date,
    });
    const meets = input.periodId
      ? []
      : (
          await meetingsOn(context.tx, {
            tenantId: context.tenantId,
            on: input.date,
            filter: { groupIds: [], classIds: [classRow.id] },
          })
        ).filter((row) => row.weekday === isoWeekday(input.date));
    const period = input.periodId
      ? periods.find((row) => row.id === input.periodId)
      : (periods.find((row) =>
          meets.some((meeting) => meeting.periodId === row.id),
        ) ?? defaultPeriod(periods, classRow.classType));
    if (!period)
      throw new ORPCError("BAD_REQUEST", { message: "attendance.no_period" });
    const [roster, existing, codes, access] = await Promise.all([
      rosterOf(context.tx, context.tenantId, classRow.id, input.date),
      registerFor(context.tx, {
        tenantId: context.tenantId,
        classId: classRow.id,
        day: input.date,
        periodId: period.id,
      }),
      attendanceCodes(context.tx, context.tenantId),
      editability(context, year, input.date),
    ]);
    const [students, marks, earlier] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      existing
        ? marksOf(context.tx, {
            tenantId: context.tenantId,
            registerId: existing.id,
            day: input.date,
          })
        : Promise.resolve([]),
      otherMarksOn(context.tx, {
        tenantId: context.tenantId,
        day: input.date,
        studentIds: roster,
        excludeRegisterId: existing?.id ?? null,
      }),
    ]);
    const onRoster = new Set(roster);
    return {
      class: {
        id: classRow.id,
        code: classRow.code,
        titleEn: classRow.titleEn,
        titleAr: classRow.titleAr,
        classType: classRow.classType,
      },
      date: input.date,
      today: context.today,
      year: { startsOn: year.startsOn, lastDay: lastDay(year) },
      period: periodView(period),
      periods: periods.map(periodView),
      register: existing
        ? {
            version: existing.version,
            state: existing.state,
            recordedByNameEn: existing.recordedByNameEn,
            recordedByNameAr: existing.recordedByNameAr,
            submittedAt: existing.submittedAt,
            updatedAt: existing.updatedAt,
          }
        : null,
      students: students.map((row) => ({
        id: row.id,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
      })),
      marks: marks.map((mark) => ({
        studentId: mark.studentId,
        meaning: mark.meaning,
        reasonId: mark.reasonId,
        minutes: mark.minutes,
        note: mark.note,
        onRoster: onRoster.has(mark.studentId),
      })),
      earlier,
      ...codesView(codes),
      access,
    };
  });

export const save = writeProcedure
  .input(saveRegisterSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record", "attendance:manage");
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !(await teachesClass(context.tx, teachingScope(context), classRow.id))
    )
      throw new ORPCError("NOT_FOUND");
    const lifecycle = await holdYear(
      context.tx,
      context.tenantId,
      classRow.schoolYearId,
    );
    if (!lifecycle) throw new ORPCError("NOT_FOUND");
    const year = await yearOfClass(context, classRow.schoolYearId, input.date);
    const access = await editability(context, year, input.date);
    if (!access.editable)
      throw new ORPCError("CONFLICT", {
        message: `attendance.${access.reason}`,
      });
    const periods = await periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: input.date,
    });
    if (!periods.some((period) => period.id === input.periodId))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.no_period" });
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      input.date,
    );
    const onRoster = new Set(roster);
    if (input.marks.some((mark) => !onRoster.has(mark.studentId)))
      throw new ORPCError("CONFLICT", { message: "attendance.not_roster" });
    const codes = await attendanceCodes(context.tx, context.tenantId);
    const reasons = new Set(codes.reasons.map((row) => row.id));
    if (
      input.marks.some((mark) => mark.reasonId && !reasons.has(mark.reasonId))
    )
      throw new ORPCError("BAD_REQUEST", { message: "attendance.reason" });
    const categoryOf = (meaning: AttendanceMeaning) => {
      const row = codes.categories.find((entry) => entry.meaning === meaning);
      if (!row) throw new Error(`No attendance category means ${meaning}`);
      return row.id;
    };
    const state = registerState(
      roster,
      new Set(input.marks.map((mark) => mark.studentId)),
    );
    try {
      const saved = await writeRegister(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        classId: classRow.id,
        classType: classRow.classType,
        yearId: year.id,
        periodId: input.periodId,
        day: input.date,
        expectedVersion: input.expectedVersion,
        state,
        marks: input.marks,
        categoryOf,
        actorId: context.actor.userId,
      });
      await audit(context, {
        action:
          input.expectedVersion === 0
            ? "attendance.register_take"
            : "attendance.register_update",
        objectType: "attendance_register",
        objectId: saved.id,
        details: {
          classId: classRow.id,
          date: input.date,
          periodId: input.periodId,
          state,
          marked: input.marks.length,
        },
      });
      await Promise.all(
        saved.changes
          .filter((entry) => entry.before)
          .map((change) =>
            audit(context, {
              action: "attendance.mark_change",
              objectType: "attendance_register",
              objectId: saved.id,
              subjectUserId: change.studentId,
              studentUserId: change.studentId,
              change: {
                table: "core.attendance_events",
                before: change.before,
                after: change.after,
              },
            }),
          ),
      );
      return { version: saved.version, state };
    } catch (error) {
      if (error instanceof AttendanceConflict)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    }
  });

/** Every register of a school day, for the office. */
export const board = readProcedure
  .input(dayQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const year = workingYear(await years(context), context.today);
    if (!year)
      return {
        date: input.date || context.today,
        today: context.today,
        year: null,
        rows: [],
      };
    const date = dayIn(year, input.date || context.today);
    const periods = await periodsOn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: date,
    });
    const rows = await dayBoard(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      day: date,
      officialPeriodId: periods.find((period) => period.official)?.id ?? null,
    });
    return {
      date,
      today: context.today,
      year: { startsOn: year.startsOn, lastDay: lastDay(year) },
      schoolDay: await isSchoolDay(context.tx, {
        tenantId: context.tenantId,
        yearId: year.id,
        day: date,
      }),
      rows,
    };
  });

/** Absences and late arrivals to follow up, unexplained first. */
export const absences = readProcedure
  .input(absencesQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const year = workingYear(await years(context), context.today);
    const to = input.to || context.today;
    const from = input.from || addDays(to, -6);
    if (from > to)
      throw new ORPCError("BAD_REQUEST", { message: "attendance.range" });
    const [rows, codes] = await Promise.all([
      absencesBetween(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        from,
        to,
        unexplainedOnly: input.show === "unexplained",
        q: input.q,
        limit: 500,
      }),
      attendanceCodes(context.tx, context.tenantId),
    ]);
    return {
      from,
      to,
      today: context.today,
      year: year ? { startsOn: year.startsOn, lastDay: lastDay(year) } : null,
      rows,
      reasons: codesView(codes).reasons,
    };
  });

export const excuse = writeProcedure
  .input(excuseSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const codes = await attendanceCodes(context.tx, context.tenantId);
    if (!codes.reasons.some((row) => row.id === input.reasonId))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.reason" });
    const excused = codes.categories.find((row) => row.meaning === "excused");
    if (!excused) throw new Error("No attendance category means excused");
    const changed = await excuseMarks(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      marks: input.marks,
      reasonId: input.reasonId,
      note: input.note,
      excusedCategoryId: excused.id,
      actorId: context.actor.userId,
    });
    await Promise.all(
      changed.map((row) =>
        audit(context, {
          action: "attendance.excuse",
          objectType: "attendance_event",
          objectId: row.id,
          subjectUserId: row.studentId,
          studentUserId: row.studentId,
          details: { date: row.date, reasonId: input.reasonId },
          change: {
            table: "core.attendance_events",
            before: { meaning: row.before },
            after: { meaning: row.after },
          },
        }),
      ),
    );
    return { excused: changed.length };
  });

/** Daily attendance by student or by homeroom over a term or the year. */
export const report = readProcedure
  .input(reportQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const year = workingYear(await years(context), context.today);
    const rules = await settingsOf(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    if (!year)
      return {
        terms: [],
        periodId: "",
        from: context.today,
        to: context.today,
        chronicPercent: rules.chronicPercent,
        rows: [],
      };
    const terms = await termsOf(context.tx, context.tenantId, year.id);
    const term = terms.find((row) => row.id === input.periodId);
    if (input.periodId && !term) throw new ORPCError("NOT_FOUND");
    const from = term?.startsOn ?? year.startsOn;
    const last = addDays(term?.endsBefore ?? year.endsBefore, -1);
    const to = last < context.today ? last : context.today;
    const rows = await attendanceReport(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
      from,
      to,
      by: input.by,
      q: input.q,
    });
    return {
      terms: terms.map((row) => ({
        id: row.id,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
      })),
      periodId: term?.id ?? "",
      from,
      to,
      chronicPercent: rules.chronicPercent,
      rows: rows.map((row) => {
        const summary = summarise(row.counts);
        return Object.assign(row, {
          summary,
          chronic:
            input.by === "student" && isChronic(summary, rules.chronicPercent),
        });
      }),
    };
  });

export const settings = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "attendance:manage");
  return settingsOf(context.tx, context.tenantId, context.schoolId);
});

export const saveSettings = writeProcedure
  .input(attendanceSettingsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    try {
      const version = await writeSettings(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        ...input,
      });
      await audit(context, {
        action: "attendance.settings_update",
        objectType: "attendance_settings",
        details: {
          teacherEditDays: input.teacherEditDays,
          noticeDelayMinutes: input.noticeDelayMinutes,
          chronicPercent: input.chronicPercent,
        },
      });
      return { version };
    } catch (error) {
      if (error instanceof AttendanceConflict)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    }
  });

/**
 * A student's attendance this year: their own, a child's for the family, or
 * any student staff reach.
 */
export const student = readProcedure
  .input(v.object({ studentId: v.optional(id) }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:read");
    const studentId = input.studentId ?? context.actor.userId;
    if (
      studentId !== context.actor.userId &&
      !(await isVisibleStudent(context.tx, studentScope(context), studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const year = workingYear(await years(context), context.today);
    const rules = await settingsOf(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    if (!year)
      return {
        year: null,
        summary: summarise(emptyCounts()),
        chronic: false,
        chronicPercent: rules.chronicPercent,
        marks: [],
        reasons: [],
      };
    const last = lastDay(year);
    const [found, codes] = await Promise.all([
      studentAttendance(context.tx, {
        tenantId: context.tenantId,
        studentId,
        from: year.startsOn,
        to: last < context.today ? last : context.today,
      }),
      attendanceCodes(context.tx, context.tenantId),
    ]);
    const summary = summarise(found.counts);
    return {
      year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
      summary,
      chronic: isChronic(summary, rules.chronicPercent),
      chronicPercent: rules.chronicPercent,
      marks: found.marks,
      reasons: codesView(codes).reasons,
    };
  });

/** Each student's marks in one class, for the class record. */
export const classSummary = readProcedure
  .input(v.object({ classId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:read");
    const classRow = await classById(context.tx, context, input.classId);
    if (!classRow) throw new ORPCError("NOT_FOUND");
    const year = (await years(context)).find(
      (row) => row.id === classRow.schoolYearId,
    );
    if (!year) throw new ORPCError("NOT_FOUND");
    const on = dayIn(year, context.today);
    if (
      !(await teachesClass(context.tx, teachingScope(context), classRow.id)) &&
      !(await reachesClass(context.tx, studentScope(context), classRow.id, on))
    )
      throw new ORPCError("NOT_FOUND");
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      on,
    );
    const [names, found] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      classAttendance(context.tx, {
        tenantId: context.tenantId,
        classId: classRow.id,
        studentIds: roster,
      }),
    ]);
    const counts = new Map(
      found.students.map((row) => [row.studentId, row.counts]),
    );
    return {
      registers: found.registers,
      canRecord:
        (can(context, "attendance:record") ||
          can(context, "attendance:manage")) &&
        year.lifecycle !== "closed" &&
        (await teachesClass(context.tx, teachingScope(context), classRow.id)),
      students: names.map((row) => {
        const summary = summarise(counts.get(row.id) ?? emptyCounts());
        return {
          id: row.id,
          fullNameEn: row.fullNameEn,
          fullNameAr: row.fullNameAr,
          summary,
        };
      }),
    };
  });
