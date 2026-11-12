import type { AttendanceCounts } from "@faridalms/domain/attendance";

import {
  absencesBetween,
  absentUnexplainedOn,
  attendanceCounts,
  attendanceReport,
} from "@faridalms/database/stores/attendance";
import { classesTaughtBy } from "@faridalms/database/stores/classes";
import { ATTENDANCE_MEANINGS, summarise } from "@faridalms/domain/attendance";
import { addDays } from "@faridalms/domain/school";
import { isoWeekday } from "@faridalms/domain/school-days";

import { readProcedure, requireCapability } from "../core/procedure";
import { learnerOfToday, todaySchema } from "../people/today";
import { dayBoard } from "./board";
import { dailyClassIds } from "./daily-registers";

/**
 * Today's attendance for Today: a learner's presence, the viewer's own or
 * one they follow; or, for a teacher, the registers they take today and
 * where each stands.
 */
export const today = readProcedure
  .input(todaySchema)
  .handler(async ({ input, context }) => {
    requireCapability(
      context,
      "attendance:read",
      "attendance:record",
      "children:read",
    );
    const learner = await learnerOfToday(context, input.studentId);
    if (!learner) {
      const [board, classes] = await Promise.all([
        dayBoard(context, context.today),
        classesTaughtBy(context.tx, context, {
          userId: context.actor.userId,
          on: context.today,
        }),
      ]);
      const taught = new Set(classes.map((row) => row.id));
      return {
        today: context.today,
        presence: null,
        registers: board
          .filter((row) => taught.has(row.classId))
          .map((row) => ({
            classId: row.classId,
            classCode: row.classCode,
            classTitleEn: row.classTitleEn,
            classTitleAr: row.classTitleAr,
            periodId: row.periodId,
            state: row.state,
          })),
      };
    }
    const [counts, unexplained] = await Promise.all([
      attendanceCounts(context.tx, {
        tenantId: context.tenantId,
        studentId: learner,
        from: context.today,
        to: context.today,
      }),
      absentUnexplainedOn(context.tx, {
        tenantId: context.tenantId,
        studentId: learner,
        day: context.today,
      }),
    ]);
    const presence =
      counts.absent > 0 || counts.excused > 0
        ? unexplained
          ? ("absent_unexplained" as const)
          : ("absent" as const)
        : counts.late > 0
          ? ("late" as const)
          : counts.present > 0
            ? ("present" as const)
            : ("none" as const);
    return { today: context.today, presence, registers: [] };
  });

/** The attendance rate across registers, or null when none were taken. */
function rateOf(rows: { counts: AttendanceCounts }[]): number | null {
  const counts = Object.fromEntries(
    ATTENDANCE_MEANINGS.map((meaning) => [
      meaning,
      rows.reduce((sum, row) => sum + row.counts[meaning], 0),
    ]),
  ) as AttendanceCounts;
  const summary = summarise(counts);
  return summary.sessions > 0 ? summary.rate : null;
}

/**
 * The office's attendance for Today: registers not taken yet, the rate
 * today and this week, and how many absences no one has explained.
 */
export const office = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "attendance:manage");
  const weekStart = addDays(
    context.today,
    -((isoWeekday(context.today) + 6) % 7),
  );
  const board = await dayBoard(context, context.today);
  const missing = board.filter((row) => row.state === "not_started");
  const [week, unexplained] = await Promise.all([
    attendanceReport(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      from: weekStart,
      to: context.today,
      by: "class",
      q: "",
      dailyClassIds: await dailyClassIds(context, {
        from: weekStart,
        to: addDays(context.today, 1),
      }),
    }),
    absencesBetween(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      from: context.today,
      to: context.today,
      unexplainedOnly: true,
      q: "",
      limit: 500,
    }),
  ]);
  return {
    today: context.today,
    registers: {
      notTaken: missing.length,
      classes: [
        ...new Map(
          missing.map((row) => [
            row.classId,
            {
              classId: row.classId,
              code: row.classCode,
              titleEn: row.classTitleEn,
              titleAr: row.classTitleAr,
            },
          ]),
        ).values(),
      ],
    },
    attendance: { today: rateOf(board), week: rateOf(week) },
    absences: unexplained.length,
  };
});
