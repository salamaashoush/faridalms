import type {
  Descriptor,
  MarkChange,
  RegisterRow,
} from "@faridalms/database/stores/attendance";
import type { ClassRow } from "@faridalms/database/stores/classes";
import type { AttendanceMeaning } from "@faridalms/domain/attendance";

import { changeOf } from "@faridalms/database/audit";
import {
  marksToExplain,
  reportsOn,
} from "@faridalms/database/stores/absence-reports";
import {
  absentUnexplainedOn,
  absencesBetween,
  AttendanceConflict,
  attendanceCodes,
  attendanceReport,
  checkInMark,
  classAttendance,
  dayRegisterOf,
  excuseMarks,
  markHistory,
  marksOf,
  openRegister,
  otherMarksOn,
  registerById,
  saveSettings as writeSettings,
  settingsOf,
  attendanceCounts,
  studentMarks,
  undoCheckIn as undoCheckInMark,
  writeRegister,
} from "@faridalms/database/stores/attendance";
import { findBadge } from "@faridalms/database/stores/badges";
import {
  classById,
  classesTaughtBy,
  rosterOf,
  teachersOn,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import { movementsOn } from "@faridalms/database/stores/front-desk";
import { noticeGuardians } from "@faridalms/database/stores/messages";
import { noticed, withdraw } from "@faridalms/database/stores/notifications";
import { schoolDay } from "@faridalms/database/stores/school-days";
import { facesOf } from "@faridalms/database/stores/students";
import {
  absencesQuerySchema,
  attendanceSettingsSchema,
  checkInSchema,
  dayQuerySchema,
  emptyCounts,
  excuseSchema,
  isChronic,
  minutesLate,
  registerQuerySchema,
  registerState,
  remindSchema,
  reportQuerySchema,
  saveRegisterSchema,
  studentAttendanceSchema,
  summarise,
  teacherMayEdit,
  undoCheckInSchema,
} from "@faridalms/domain/attendance";
import { paged, pageWindow } from "@faridalms/domain/paging";
import { addDays, dayWithin, spanHolds } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { RegisterPeriod } from "../attendance/plans";
import type { UnitContext } from "../core/context";

import { dayBoard } from "../attendance/board";
import { dailyClassIds } from "../attendance/daily-registers";
import {
  coveredOn,
  lessonsOn,
  periodsOf,
  periodsOn,
  registerIn,
  takenIn,
} from "../attendance/plans";
import { settlementOf } from "../classes/points";
import { notify } from "../core/notify";
import {
  audit,
  can,
  clockOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reachesClass, reachesStudent, teaches } from "../core/reach";
import { badgeHash } from "../core/session";
import { reportRange } from "../core/spans";

const id = v.pipe(v.string(), v.uuid());

/**
 * Whether the viewer takes this class's register on a day: a class they
 * teach, or a lesson they cover then. Covering gives only those periods.
 */
async function registerAccess(
  context: UnitContext,
  classId: string,
  date: string,
): Promise<{ periods: "all" | string[] }> {
  if (await teaches(context, "registers", classId)) return { periods: "all" };
  return {
    periods: (
      await coveredOn(context, { userId: context.actor.userId, day: date })
    )
      .filter((row) => row.classId === classId)
      .map((row) => row.periodId),
  };
}

/** Whether access to a class's registers reaches a period, or "" for its register of the whole day. */
const allows = (access: { periods: "all" | string[] }, periodId: string) =>
  access.periods === "all" ||
  (periodId !== "" && access.periods.includes(periodId));

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

function periodView(period: RegisterPeriod) {
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

/** A day of the class's own: a register on a day the class does not run is refused. */
function classDay(classRow: ClassRow, day: string) {
  if (!spanHolds(classRow.runs, { from: day, to: addDays(day, 1) }))
    throw new ORPCError("BAD_REQUEST", {
      message: "attendance.outside_class",
    });
}

/** The days a class runs over, as a register's day navigation reads them. */
const runsView = (classRow: ClassRow) => ({
  startsOn: classRow.runs.from,
  lastDay: classRow.runs.to === null ? null : addDays(classRow.runs.to, -1),
});

/**
 * Which period a register opens in when none is named: the official one for
 * a class owed a daily register, else the first lesson.
 */
function defaultPeriod(periods: RegisterPeriod[], daily: boolean) {
  return (
    (daily
      ? periods.find((period) => period.official)
      : periods.find((period) => period.kind === "lesson")) ?? periods[0]
  );
}

/**
 * The period a register is asked for in, checked against the day: a named
 * period the day holds, or none on a day that holds none.
 */
function askedPeriod(
  periods: RegisterPeriod[],
  periodId: string,
): RegisterPeriod | null {
  if (!periodId) {
    if (periods.length > 0)
      throw new ORPCError("BAD_REQUEST", {
        message: "attendance.period_required",
      });
    return null;
  }
  const period = periods.find((row) => row.id === periodId);
  if (!period)
    throw new ORPCError("BAD_REQUEST", { message: "attendance.no_period" });
  return period;
}

/** A class's register on a day, in a period or of the whole day, or null. */
async function registerOf(
  context: UnitContext,
  input: { classId: string; day: string; periodId: string },
): Promise<RegisterRow | null> {
  if (!input.periodId)
    return dayRegisterOf(context.tx, {
      tenantId: context.tenantId,
      classId: input.classId,
      day: input.day,
    });
  const registerId = await registerIn(context, input);
  return registerId
    ? registerById(context.tx, { tenantId: context.tenantId, id: registerId })
    : null;
}

const LOCKED = {
  closed: "attendance.closed",
  future: "attendance.future",
  window: "attendance.window",
  not_school_day: "attendance.not_school_day",
} as const;

async function editability(
  context: UnitContext,
  classId: string,
  day: string,
): Promise<
  | { editable: true }
  | {
      editable: false;
      reason: "closed" | "future" | "window" | "not_school_day";
    }
> {
  if (await settlementOf(context, classId))
    return { editable: false, reason: "closed" };
  if (day > context.today) return { editable: false, reason: "future" };
  if (
    !(
      await schoolDay(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day,
      })
    ).open
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

const oneDay = (day: string) => ({ from: day, to: addDays(day, 1) });

/** A teacher's classes on a day, with the registers already taken in them. */
export const day = readProcedure
  .input(dayQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record");
    const on = input.date || context.today;
    const [classes, periods, board, covers] = await Promise.all([
      classesTaughtBy(context.tx, context, {
        userId: context.actor.userId,
        on,
      }),
      periodsOn(context, on),
      dayBoard(context, on),
      coveredOn(context, { userId: context.actor.userId, day: on }),
    ]);
    const taught = new Set(classes.map((row) => row.id));
    const covering = new Set(
      covers.map((row) => `${row.classId}:${row.periodId}`),
    );
    const mine = (row: { classId: string; periodId: string }) =>
      taught.has(row.classId) || covering.has(`${row.classId}:${row.periodId}`);
    const covered = board.filter(
      (row) =>
        !taught.has(row.classId) &&
        covering.has(`${row.classId}:${row.periodId}`),
    );
    const coverClasses = [
      ...new Map(covered.map((row) => [row.classId, row])).values(),
    ];
    return {
      date: on,
      today: context.today,
      periods: periods.map(periodView),
      classes: [
        ...classes.map((row) => ({
          id: row.id,
          code: row.code,
          titleEn: row.titleEn,
          titleAr: row.titleAr,
          students: row.students,
        })),
        ...coverClasses.map((row) => ({
          id: row.classId,
          code: row.classCode,
          titleEn: row.classTitleEn,
          titleAr: row.classTitleAr,
          students: row.students,
        })),
      ],
      expected: board
        .filter((row) => mine(row) && (row.kind === "day" || row.periodId))
        .map((row) => ({
          classId: row.classId,
          periodId: row.periodId,
          cover: covering.has(`${row.classId}:${row.periodId}`),
        })),
      registers: board
        .filter((row) => mine(row) && row.registerId)
        .map((row) => ({
          classId: row.classId,
          periodId: row.periodId,
          state: row.state,
          counts: row.counts,
          students: row.students,
        })),
    };
  });

/** One class's register for one day, in one of its periods where the day has them, ready to mark. */
export const register = readProcedure
  .input(registerQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record", "attendance:manage");
    const classRow = await classById(context.tx, context, input.classId);
    if (!classRow) throw new ORPCError("NOT_FOUND");
    const taking = await registerAccess(context, classRow.id, input.date);
    if (
      taking.periods.length === 0 ||
      (input.periodId && !allows(taking, input.periodId))
    )
      throw new ORPCError("NOT_FOUND");
    classDay(classRow, input.date);
    const periods = await periodsOn(context, input.date);
    const meets = input.periodId
      ? []
      : (await lessonsOn(context, input.date)).filter(
          (row) => row.classId === classRow.id,
        );
    const period =
      periods.length === 0
        ? null
        : input.periodId
          ? periods.find((row) => row.id === input.periodId)
          : taking.periods === "all"
            ? (periods.find((row) =>
                meets.some((meeting) => meeting.periodId === row.id),
              ) ??
              defaultPeriod(
                periods,
                (await dailyClassIds(context, oneDay(input.date))).includes(
                  classRow.id,
                ),
              ))
            : periods.find((row) => allows(taking, row.id));
    if (period === undefined || (period === null && input.periodId))
      throw new ORPCError("BAD_REQUEST", { message: "attendance.no_period" });
    if (period === null && taking.periods !== "all")
      throw new ORPCError("NOT_FOUND");
    const [roster, existing, codes, access, settings] = await Promise.all([
      rosterOf(context.tx, context.tenantId, classRow.id, input.date),
      registerOf(context, {
        classId: classRow.id,
        day: input.date,
        periodId: period?.id ?? "",
      }),
      attendanceCodes(context.tx, context.tenantId),
      editability(context, classRow.id, input.date),
      settingsOf(context.tx, context.tenantId, context.schoolId),
    ]);
    const [students, marks, earlier] = await Promise.all([
      facesOf(context.tx, context.tenantId, roster),
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
    const [reports, movements, history, earlierPeriods] = await Promise.all([
      reportsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        studentIds: roster,
        day: input.date,
      }),
      movementsOn(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day: input.date,
        studentIds: roster,
      }),
      existing
        ? markHistory(context.tx, {
            tenantId: context.tenantId,
            registerId: existing.id,
          })
        : Promise.resolve([]),
      periodsOf(
        context,
        earlier.map((row) => row.registerId),
      ),
    ]);
    const onRoster = new Set(roster);
    return {
      class: {
        id: classRow.id,
        code: classRow.code,
        titleEn: classRow.titleEn,
        titleAr: classRow.titleAr,
      },
      date: input.date,
      today: context.today,
      runs: runsView(classRow),
      period: period ? periodView(period) : null,
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
      students: students
        .map((row) => ({
          id: row.id,
          fullNameEn: row.fullNameEn,
          fullNameAr: row.fullNameAr,
          firstEn: row.firstEn,
          firstAr: row.firstAr,
          photoFileId: row.photoFileId,
        }))
        .toSorted((a, b) =>
          (a.fullNameEn ?? a.fullNameAr ?? "").localeCompare(
            b.fullNameEn ?? b.fullNameAr ?? "",
          ),
        ),
      marks: marks.map((mark) => ({
        studentId: mark.studentId,
        meaning: mark.meaning,
        reasonId: mark.reasonId,
        minutes: mark.minutes,
        note: mark.note,
        via: mark.via,
        onRoster: onRoster.has(mark.studentId),
      })),
      checkIn: {
        touch: settings.checkInTouch,
        qr: settings.checkInQr,
        nfc: settings.checkInNfc,
      },
      lateness: {
        afterMinutes: settings.lateAfterMinutes,
        closesMinutes: settings.registerClosesMinutes,
      },
      earlier: earlier
        .map((row) => ({ row, period: earlierPeriods.get(row.registerId) }))
        .toSorted(
          (a, b) => (a.period?.sequence ?? 0) - (b.period?.sequence ?? 0),
        )
        .map(({ row, period: taken }) => ({
          studentId: row.studentId,
          meaning: row.meaning,
          periodNameEn: taken?.nameEn ?? null,
          periodNameAr: taken?.nameAr ?? null,
        })),
      reports: reports.map((row) => ({
        studentId: row.studentId,
        kind: row.kind,
        at: row.at,
        reasonId: row.reasonId,
        accepted: row.decision === "accepted",
      })),
      history,
      movements: movements.map((row) => ({
        studentId: row.studentId,
        direction: row.direction,
        at: row.at,
        reasonId: row.reasonId,
      })),
      ...codesView(codes),
      access,
    };
  });

/**
 * A class's register for a child who marks themselves in, on the class
 * screen run under the teacher's session: the class must be theirs, the
 * school must allow this way in, and the day must still be open to them.
 */
async function checkInRegister(
  context: UnitContext,
  input: { classId: string; date: string; periodId: string },
) {
  requireCapability(context, "attendance:record", "attendance:manage");
  const classRow = await classById(context.tx, context, input.classId);
  if (
    !classRow ||
    !allows(
      await registerAccess(context, classRow.id, input.date),
      input.periodId,
    )
  )
    throw new ORPCError("NOT_FOUND");
  classDay(classRow, input.date);
  const access = await editability(context, classRow.id, input.date);
  if (!access.editable)
    throw new ORPCError("CONFLICT", { message: LOCKED[access.reason] });
  const period = askedPeriod(
    await periodsOn(context, input.date),
    input.periodId,
  );
  const roster = await rosterOf(
    context.tx,
    context.tenantId,
    classRow.id,
    input.date,
  );
  return { classRow, roster, period };
}

/**
 * A child marks themselves in: present, noting how, and nothing else in the
 * register changes. The teacher marks the rest and saves, which confirms it.
 */
export const checkIn = writeProcedure
  .input(checkInSchema)
  .handler(async ({ input, context }) => {
    const settings = await settingsOf(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const allowed = {
      touch: settings.checkInTouch,
      qr: settings.checkInQr,
      nfc: settings.checkInNfc,
    }[input.via];
    if (!allowed)
      throw new ORPCError("FORBIDDEN", { message: "attendance.check_in_off" });
    const { classRow, roster, period } = await checkInRegister(context, input);
    const holder = input.badge
      ? await findBadge(context.tx, badgeHash(input.badge))
      : null;
    const studentId =
      input.via === "touch"
        ? input.studentId
        : holder?.accountState === "active"
          ? holder.userId
          : undefined;
    // A badge from another class reads as no badge at all.
    if (!studentId || !roster.includes(studentId))
      throw new ORPCError("NOT_FOUND", { message: "attendance.not_roster" });
    const [codes, clock] = await Promise.all([
      attendanceCodes(context.tx, context.tenantId),
      clockOf(context),
    ]);
    const start = period?.startTime;
    // Only today's arrivals have a time; a check-in on another day, or to a
    // register of the whole day, is on time.
    const late =
      input.date === context.today && start
        ? minutesLate(start, clock, settings.lateAfterMinutes)
        : null;
    const meaning = late === null ? "present" : "late";
    const category = codes.categories.find((row) => row.meaning === meaning);
    if (!category) throw new Error(`No attendance category means ${meaning}`);
    const registerId = await registerToMark(context, {
      classId: classRow.id,
      day: input.date,
      period,
    });
    const result = await checkInMark(context.tx, {
      tenantId: context.tenantId,
      registerId,
      day: input.date,
      studentId,
      categoryId: category.id,
      meaning,
      minutes: late,
      via: input.via,
      actorId: context.actor.userId,
    });
    if (result.added)
      await audit(context, {
        action: "attendance.check_in",
        objectType: "attendance_register",
        objectId: registerId,
        subjectUserId: studentId,
        studentUserId: studentId,
        details: { via: input.via, date: input.date, late },
      });
    return { studentId, added: result.added, late };
  });

/**
 * The register a mark goes in, opened in progress when the class has none
 * on that day in that period yet.
 */
async function registerToMark(
  context: UnitContext,
  input: { classId: string; day: string; period: RegisterPeriod | null },
): Promise<string> {
  const periodId = input.period?.id ?? "";
  const found = await registerOf(context, { ...input, periodId });
  if (found) return found.id;
  const opened = await openRegister(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    classId: input.classId,
    day: input.day,
    kind: input.period ? "period" : "day",
    daily: input.period?.official ?? true,
    state: "in_progress",
    actorId: context.actor.userId,
  });
  if (opened) {
    if (input.period)
      await takenIn(context, {
        registerId: opened.id,
        classId: input.classId,
        day: input.day,
        periodId,
      });
    return opened.id;
  }
  const raced = await registerOf(context, { ...input, periodId });
  if (!raced) throw new ORPCError("CONFLICT", { message: "conflict.version" });
  return raced.id;
}

/** Takes back a check-in made by mistake, unless the teacher changed it since. */
export const undoCheckIn = writeProcedure
  .input(undoCheckInSchema)
  .handler(async ({ input, context }) => {
    const { classRow, period } = await checkInRegister(context, input);
    const taken = await registerOf(context, {
      classId: classRow.id,
      day: input.date,
      periodId: period?.id ?? "",
    });
    const undone = taken
      ? await undoCheckInMark(context.tx, {
          tenantId: context.tenantId,
          registerId: taken.id,
          day: input.date,
          studentId: input.studentId,
          actorId: context.actor.userId,
        })
      : false;
    if (undone && taken)
      await audit(context, {
        action: "attendance.check_in_undo",
        objectType: "attendance_register",
        objectId: taken.id,
        subjectUserId: input.studentId,
        studentUserId: input.studentId,
      });
    return { undone };
  });

/**
 * Gives a register's unexplained marks the reasons families reported and
 * the office accepted. Returns every student whose family reported the day,
 * accepted or not yet decided, whom the absence notice then spares.
 */
async function applyReports(
  context: UnitContext,
  studentIds: readonly string[],
  takenOn: string,
): Promise<Set<string>> {
  const reports = await reportsOn(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    studentIds,
    day: takenOn,
  });
  const accepted = reports.filter((row) => row.decision === "accepted");
  if (accepted.length > 0) {
    const codes = await attendanceCodes(context.tx, context.tenantId);
    const excused = codes.categories.find((row) => row.meaning === "excused");
    if (!excused) throw new Error("No attendance category means excused");
    for (const report of accepted) {
      const marks = await marksToExplain(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        studentId: report.studentId,
        from: takenOn,
        to: takenOn,
        kind: report.kind,
        unexplained: true,
      });
      if (marks.length > 0)
        await excuseMarks(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          marks,
          reasonId: report.reasonId,
          note: "",
          excusedCategoryId: excused.id,
          actorId: context.actor.userId,
        });
    }
  }
  return new Set(reports.map((row) => row.studentId));
}

const missing = (mark: MarkChange["after"]) =>
  mark !== null && mark.meaning === "absent" && !mark.reasonId;

/**
 * Tells a student's families of a new unexplained absence, once a day, after
 * the school's notice delay so a teacher can correct a slip first. A
 * correction that leaves the day clear takes the notice back.
 */
async function noticeAbsences(
  context: UnitContext,
  classRow: ClassRow,
  takenOn: string,
  changes: readonly MarkChange[],
  reported: ReadonlySet<string>,
) {
  for (const change of changes)
    if (
      missing(change.before) &&
      !missing(change.after) &&
      !(await absentUnexplainedOn(context.tx, {
        tenantId: context.tenantId,
        studentId: change.studentId,
        day: takenOn,
      }))
    )
      await withdraw(context.tx, {
        tenantId: context.tenantId,
        subjectType: "student_absence",
        subjectId: change.studentId,
        key: { param: "date", value: takenOn },
      });
  const fresh = changes
    .filter(
      (change) =>
        missing(change.after) &&
        !missing(change.before) &&
        !reported.has(change.studentId),
    )
    .map((change) => change.studentId);
  if (fresh.length === 0) return;
  const [settings, names] = await Promise.all([
    settingsOf(context.tx, context.tenantId, context.schoolId),
    namesOf(context.tx, context.tenantId, fresh),
  ]);
  for (const student of names) {
    const subject = { type: "student_absence", id: student.id };
    if (
      await noticed(context.tx, {
        tenantId: context.tenantId,
        subjectType: subject.type,
        subjectId: subject.id,
        key: { param: "date", value: takenOn },
      })
    )
      continue;
    const guardians = await noticeGuardians(context.tx, {
      tenantId: context.tenantId,
      studentId: student.id,
      on: takenOn,
    });
    await notify(context, guardians, {
      kind: "absence",
      subject,
      params: {
        studentId: student.id,
        studentName: student.fullNameEn ?? student.fullNameAr ?? "",
        studentNameAr: student.fullNameAr ?? student.fullNameEn ?? "",
        className: classRow.titleEn ?? classRow.code,
        classNameAr: classRow.titleAr ?? classRow.titleEn ?? classRow.code,
        date: takenOn,
      },
      delayMinutes: settings.noticeDelayMinutes,
    });
  }
}

export const save = writeProcedure
  .input(saveRegisterSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:record", "attendance:manage");
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !allows(
        await registerAccess(context, classRow.id, input.date),
        input.periodId,
      )
    )
      throw new ORPCError("NOT_FOUND");
    classDay(classRow, input.date);
    const access = await editability(context, classRow.id, input.date);
    if (!access.editable)
      throw new ORPCError("CONFLICT", { message: LOCKED[access.reason] });
    const period = askedPeriod(
      await periodsOn(context, input.date),
      input.periodId,
    );
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
    const before = await registerOf(context, {
      classId: classRow.id,
      day: input.date,
      periodId: input.periodId,
    });
    try {
      const saved = await writeRegister(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        classId: classRow.id,
        existing: before,
        kind: period ? "period" : "day",
        daily: period?.official ?? true,
        day: input.date,
        expectedVersion: input.expectedVersion,
        state,
        marks: input.marks,
        categoryOf,
        actorId: context.actor.userId,
      });
      if (saved.opened && period)
        await takenIn(context, {
          registerId: saved.id,
          classId: classRow.id,
          day: input.date,
          periodId: period.id,
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
          periodId: input.periodId || null,
          state,
          marked: input.marks.length,
        },
      });
      const corrected = saved.changes.filter(
        (change) =>
          change.before !== null &&
          change.before.meaning !== change.after?.meaning,
      );
      // England's registers keep why a mark changed once a register is
      // submitted; a reason added to a mark is not a correction.
      if (
        before?.state === "submitted" &&
        corrected.length > 0 &&
        !input.correction
      )
        throw new ORPCError("BAD_REQUEST", {
          message: "attendance.correction_reason",
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
              details: input.correction
                ? { reason: input.correction }
                : undefined,
              change: {
                table: "core.attendance_events",
                before: change.before,
                after: change.after,
              },
            }),
          ),
      );
      const reported = await applyReports(context, roster, input.date);
      await noticeAbsences(
        context,
        classRow,
        input.date,
        saved.changes,
        reported,
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
    const date = input.date || context.today;
    const [rows, held] = await Promise.all([
      dayBoard(context, date),
      schoolDay(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        day: date,
      }),
    ]);
    return { date, today: context.today, schoolDay: held.open, rows };
  });

/**
 * Reminds the teachers of classes whose register for the day is still not
 * taken. A teacher who has not opened the last reminder gets no second one.
 */
export const remind = writeProcedure
  .input(remindSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    let reminded = 0;
    for (const classId of new Set(input.classIds)) {
      const classRow = await classById(context.tx, context, classId);
      if (!classRow) throw new ORPCError("NOT_FOUND");
      const teachers = await teachersOn(
        context.tx,
        context.tenantId,
        classRow.id,
        input.date,
      );
      reminded += await notify(context, teachers, {
        kind: "reminder",
        subject: { type: "class", id: classRow.id },
        params: {
          classId: classRow.id,
          className: classRow.titleEn ?? classRow.code,
          classNameAr: classRow.titleAr ?? classRow.titleEn ?? classRow.code,
          date: input.date,
        },
        collapse: true,
      });
    }
    await audit(context, {
      action: "attendance.remind",
      objectType: "attendance_register",
      objectId: null,
      details: { date: input.date, classes: input.classIds.length, reminded },
    });
    return { reminded };
  });

/** Absences and late arrivals to follow up, unexplained first. */
export const absences = readProcedure
  .input(absencesQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
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
    const periods = await periodsOf(
      context,
      rows.map((row) => row.registerId),
    );
    return {
      from,
      to,
      today: context.today,
      rows: rows.map(({ registerId, ...row }) => ({
        ...row,
        periodNameEn: periods.get(registerId)?.nameEn ?? null,
        periodNameAr: periods.get(registerId)?.nameAr ?? null,
      })),
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

/** Daily attendance by student or by class over a span the school reports on, or any range. */
export const report = readProcedure
  .input(reportQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:manage");
    const [rules, range] = await Promise.all([
      settingsOf(context.tx, context.tenantId, context.schoolId),
      reportRange(context, input),
    ]);
    const rows = await attendanceReport(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      from: range.from,
      to: range.to,
      by: input.by,
      q: input.q,
      dailyClassIds: await dailyClassIds(context, {
        from: range.from,
        to: addDays(range.to, 1),
      }),
    });
    return {
      spans: range.spans.map((row) => ({
        key: row.key,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
      })),
      span: range.span,
      from: range.from,
      to: range.to,
      today: context.today,
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
    const before = await settingsOf(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    try {
      const version = await writeSettings(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        ...input,
      });
      await audit(context, {
        action: "attendance.settings_update",
        objectType: "attendance_settings",
        change: changeOf("core.attendance_settings", before, {
          teacherEditDays: input.teacherEditDays,
          noticeDelayMinutes: input.noticeDelayMinutes,
          chronicPercent: input.chronicPercent,
          checkInTouch: input.checkInTouch,
          checkInQr: input.checkInQr,
          checkInNfc: input.checkInNfc,
          lateAfterMinutes: input.lateAfterMinutes,
          registerClosesMinutes: input.registerClosesMinutes,
        }),
      });
      return { version };
    } catch (error) {
      if (error instanceof AttendanceConflict)
        throw new ORPCError("CONFLICT", { message: error.code });
      throw error;
    }
  });

/**
 * A student's attendance over the span the school reports on: their own, a
 * child's for the family, or any student staff reach.
 */
export const student = readProcedure
  .input(studentAttendanceSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "attendance:read");
    const studentId = input.studentId || context.actor.userId;
    if (
      studentId !== context.actor.userId &&
      !(await reachesStudent(context, "attendance", studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const [rules, range] = await Promise.all([
      settingsOf(context.tx, context.tenantId, context.schoolId),
      reportRange(context, { span: "", from: "", to: "" }),
    ]);
    const span = {
      tenantId: context.tenantId,
      studentId,
      from: range.from,
      to: range.to,
    };
    const [counts, marks, codes] = await Promise.all([
      attendanceCounts(context.tx, span),
      studentMarks(context.tx, { ...span, ...pageWindow(input.page) }),
      attendanceCodes(context.tx, context.tenantId),
    ]);
    const periods = await periodsOf(
      context,
      marks.rows.map((row) => row.registerId),
    );
    const named = range.spans.find((row) => row.key === range.span);
    const summary = summarise(counts);
    return {
      span: {
        titleEn: named?.titleEn ?? null,
        titleAr: named?.titleAr ?? null,
        from: range.from,
        to: range.to,
      },
      summary,
      chronic: isChronic(summary, rules.chronicPercent),
      chronicPercent: rules.chronicPercent,
      marks: paged(
        marks.rows.map(({ registerId, ...row }) => ({
          ...row,
          periodNameEn: periods.get(registerId)?.nameEn ?? null,
          periodNameAr: periods.get(registerId)?.nameAr ?? null,
        })),
        marks.total,
        input.page,
      ),
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
    const on = dayWithin(classRow.runs, context.today);
    if (
      !(await teaches(context, "registers", classRow.id)) &&
      !(await reachesClass(context, "attendance", classRow.id, on))
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
        (await settlementOf(context, classRow.id)) === null &&
        (await teaches(context, "registers", classRow.id)),
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
