import type { Scope } from "@faridalms/database/stores/students";

import { classById } from "@faridalms/database/stores/classes";
import {
  namesOf,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/coursework";
import {
  classResults,
  classWork,
  periodGradesOf,
  releasePeriodGrades,
  savePeriodGrade,
  studentPeriodGrades,
} from "@faridalms/database/stores/gradebook";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import {
  dayIn,
  holdYear,
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  classBookSchema,
  releasePeriodSchema,
  savePeriodGradesSchema,
} from "@faridalms/domain/coursework";
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

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "classes:manage"),
  };
}

async function taughtClass(context: UnitContext, classId: string) {
  const classRow = await classById(context.tx, context, classId);
  if (
    !classRow ||
    !(await teachesClass(context.tx, scopeOf(context), classRow.id))
  )
    throw new ORPCError("NOT_FOUND");
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const year = years.find((row) => row.id === classRow.schoolYearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  return { classRow, year };
}

/**
 * A class's gradebook for a term: its students, its published work with
 * every result, and the term grades. Teachers see draft grades, marked so.
 */
export const classBook = readProcedure
  .input(classBookSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const { classRow, year } = await taughtClass(context, input.classId);
    const terms = await termsOf(context.tx, context.tenantId, year.id);
    const period =
      terms.find((row) => row.id === input.periodId) ??
      terms.find(
        (row) =>
          row.startsOn <= context.today && context.today < row.endsBefore,
      ) ??
      terms[0] ??
      null;
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      dayIn(year, context.today),
    );
    const [students, results, work, grades] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      classResults(context.tx, context.tenantId, classRow.id),
      classWork(context.tx, context.tenantId, classRow.id),
      period
        ? periodGradesOf(context.tx, {
            tenantId: context.tenantId,
            classId: classRow.id,
            periodId: period.id,
          })
        : Promise.resolve([]),
    ]);
    return {
      class: {
        id: classRow.id,
        code: classRow.code,
        titleEn: classRow.titleEn,
        titleAr: classRow.titleAr,
      },
      closed: year.lifecycle === "closed",
      terms: terms.map((row) => ({
        id: row.id,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
      })),
      periodId: period?.id ?? null,
      assignments: work
        .filter(
          (row) =>
            !period ||
            !row.gradingPeriodId ||
            row.gradingPeriodId === period.id,
        )
        .map((row) => ({
          id: row.id,
          title: row.title,
          dueAt: row.dueAt,
          points: row.points,
        })),
      students,
      results,
      grades,
    };
  });

/** Records the term grades a teacher typed; a changed grade waits to be released again. */
export const savePeriodGrades = writeProcedure
  .input(savePeriodGradesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const { classRow, year } = await taughtClass(context, input.classId);
    if ((await holdYear(context.tx, context.tenantId, year.id)) === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    const terms = await termsOf(context.tx, context.tenantId, year.id);
    if (!terms.some((row) => row.id === input.periodId))
      throw new ORPCError("NOT_FOUND");
    const roster = new Set(
      await rosterOf(
        context.tx,
        context.tenantId,
        classRow.id,
        dayIn(year, context.today),
      ),
    );
    for (const grade of input.grades) {
      if (!roster.has(grade.studentId))
        throw new ORPCError("BAD_REQUEST", {
          message: "gradebook.not_in_class",
        });
      if (grade.score !== null && grade.score > input.maxScore)
        throw new ORPCError("BAD_REQUEST", {
          message: "gradebook.score_range",
        });
      await savePeriodGrade(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        classRow,
        periodId: input.periodId,
        studentId: grade.studentId,
        score: grade.score,
        maxScore: input.maxScore,
        comment: grade.comment || null,
        userId: context.actor.userId,
      });
    }
    await audit(context, {
      action: "period_grade.save",
      objectType: "class",
      objectId: classRow.id,
      details: { periodId: input.periodId, students: input.grades.length },
    });
    return { saved: input.grades.length };
  });

export const releasePeriod = writeProcedure
  .input(releasePeriodSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const { classRow, year } = await taughtClass(context, input.classId);
    if ((await holdYear(context.tx, context.tenantId, year.id)) === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    const released = await releasePeriodGrades(context.tx, {
      tenantId: context.tenantId,
      classId: classRow.id,
      periodId: input.periodId,
    });
    await audit(context, {
      action: "period_grade.release",
      objectType: "class",
      objectId: classRow.id,
      details: { periodId: input.periodId, released },
    });
    return { released };
  });

/** A student's released term grades, for the student, their family or staff who reach them. */
export const student = readProcedure
  .input(v.object({ studentId: v.optional(v.pipe(v.string(), v.uuid())) }))
  .handler(async ({ input, context }) => {
    const studentId = input.studentId ?? context.actor.userId;
    if (studentId === context.actor.userId)
      requireCapability(context, "grades:read");
    else {
      requireCapability(context, "grades:read");
      if (!(await isVisibleStudent(context.tx, scopeOf(context), studentId)))
        throw new ORPCError("NOT_FOUND");
    }
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = workingYear(years, context.today);
    if (!year) return { year: null, rows: [] };
    return {
      year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
      rows: await studentPeriodGrades(context.tx, {
        tenantId: context.tenantId,
        studentId,
        yearId: year.id,
      }),
    };
  });
