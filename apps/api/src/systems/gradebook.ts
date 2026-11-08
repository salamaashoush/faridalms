import { classById, rosterOf } from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import {
  classResults,
  classWork,
  periodGradesOf,
  releasePeriodGrades,
  savePeriodGrade,
  studentPeriodGrades,
} from "@faridalms/database/stores/gradebook";
import {
  classCategories,
  classGrading,
} from "@faridalms/database/stores/grading";
import { columnScores, columnsOf } from "@faridalms/database/stores/lti";
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
import { termPercent } from "@faridalms/domain/grading";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { gradeReader } from "../core/grades";
import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent, teaches } from "../core/reach";
import { teachingScope, tellPeriodGrades } from "../core/teaching-notices";
import { resultOf } from "../lti/grades";

async function taughtClass(context: UnitContext, classId: string) {
  const classRow = await classById(context.tx, context, classId);
  if (!classRow || !(await teaches(context, "teaching", classRow.id)))
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
    const points = new Map(work.map((row) => [row.id, row.points]));
    const [categories, grading] = await Promise.all([
      classCategories(context.tx, {
        tenantId: context.tenantId,
        classId: classRow.id,
      }),
      classGrading(context.tx, {
        tenantId: context.tenantId,
        classId: classRow.id,
        today: context.today,
      }),
    ]);
    const grade = await gradeReader(context, [
      ...results.map((row) => row.gradeScaleVersionId),
      ...grades.map((row) => row.gradeScaleVersionId),
      grading?.versionId ?? null,
    ]);
    const termWork = work.filter(
      (row) =>
        !period || !row.gradingPeriodId || row.gradingPeriodId === period.id,
    );
    // Outside tools' columns sit beside the work, read only: a brief's go
    // with its term, the class's own and its modules' in every term. They
    // count towards nothing until a teacher takes a score as a mark.
    const inTerm = new Set(termWork.map((row) => row.id));
    const toolColumns = (
      await columnsOf(context.tx, {
        tenantId: context.tenantId,
        classId: classRow.id,
      })
    ).filter(
      (column) => !column.assignmentId || inTerm.has(column.assignmentId),
    );
    const toolScores = await columnScores(context.tx, {
      tenantId: context.tenantId,
      lineItemIds: toolColumns.map((column) => column.id),
      studentIds: roster,
    });
    // What the term grade would be from the work graded so far, for the
    // teacher to apply or set aside; the term grade itself stays theirs.
    const calculated = students.map((student) => {
      const percent = termPercent(
        termWork.map((item) => {
          const result = results.find(
            (row) =>
              row.assignmentId === item.id && row.studentId === student.id,
          );
          return {
            categoryId: item.categoryId,
            points: item.points,
            score: result?.effectiveScore ?? result?.score ?? null,
            excused: result?.excused ?? false,
          };
        }),
        categories,
      );
      return {
        studentId: student.id,
        percent,
        grade: grade(grading?.versionId ?? null, percent, 100),
      };
    });
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
          categoryId: row.categoryId,
        })),
      categories,
      calculated,
      students,
      results: results.map((row) => ({
        ...row,
        grade: grade(
          row.gradeScaleVersionId,
          row.effectiveScore ?? row.score,
          points.get(row.assignmentId) ?? null,
        ),
      })),
      grades: grades.map((row) => ({
        ...row,
        grade: grade(row.gradeScaleVersionId, row.score, row.maxScore),
      })),
      tools: toolColumns,
      toolScores: toolScores.flatMap((score) => {
        const column = toolColumns.find((item) => item.id === score.lineItemId);
        return column
          ? [
              {
                lineItemId: score.lineItemId,
                studentId: score.studentUserId,
                result: resultOf(score, column),
                gradingProgress: score.gradingProgress,
              },
            ]
          : [];
      }),
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
      const { before } = await savePeriodGrade(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        classRow,
        periodId: input.periodId,
        studentId: grade.studentId,
        score: grade.score,
        maxScore: input.maxScore,
        comment: grade.comment || null,
        userId: context.actor.userId,
        today: context.today,
      });
      const after = {
        score: grade.score,
        maxScore: input.maxScore,
        comment: grade.comment || null,
      };
      if (
        !before ||
        before.score !== after.score ||
        before.maxScore !== after.maxScore ||
        before.comment !== after.comment
      )
        await audit(context, {
          action: "period_grade.save",
          objectType: "class",
          objectId: classRow.id,
          subjectUserId: grade.studentId,
          studentUserId: grade.studentId,
          details: { periodId: input.periodId },
          change: { table: "core.period_grades", before, after },
        });
    }
    return { saved: input.grades.length };
  });

export const releasePeriod = writeProcedure
  .input(releasePeriodSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const { classRow, year } = await taughtClass(context, input.classId);
    if ((await holdYear(context.tx, context.tenantId, year.id)) === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    const period = (await termsOf(context.tx, context.tenantId, year.id)).find(
      (row) => row.id === input.periodId,
    );
    if (!period) throw new ORPCError("NOT_FOUND");
    const students = await releasePeriodGrades(context.tx, {
      tenantId: context.tenantId,
      classId: classRow.id,
      periodId: period.id,
    });
    const learners = await namesOf(context.tx, context.tenantId, students);
    await tellPeriodGrades(teachingScope(context), {
      classId: classRow.id,
      period,
      learners: learners.map((row) => ({
        studentId: row.id,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
      })),
    });
    await audit(context, {
      action: "period_grade.release",
      objectType: "class",
      objectId: classRow.id,
      details: { periodId: input.periodId, released: students.length },
    });
    return { released: students.length };
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
      await requireStudent(context, "teaching", studentId);
    }
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = workingYear(years, context.today);
    if (!year) return { year: null, rows: [] };
    const rows = await studentPeriodGrades(context.tx, {
      tenantId: context.tenantId,
      studentId,
      yearId: year.id,
    });
    const grade = await gradeReader(
      context,
      rows.map((row) => row.gradeScaleVersionId),
    );
    return {
      year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
      rows: rows.map((row) => ({
        ...row,
        grade: grade(row.gradeScaleVersionId, row.score, row.maxScore),
      })),
    };
  });
