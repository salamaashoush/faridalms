import { rosterOf } from "@faridalms/database/stores/classes";
import { classResults } from "@faridalms/database/stores/gradebook";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  classBookSchema,
  isLate,
  releasePeriodSchema,
  savePeriodGradesSchema,
} from "@faridalms/domain/coursework";
import { runningGrade } from "@faridalms/domain/grading";
import { dayWithin } from "@faridalms/domain/school";
import * as v from "valibot";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";
import { gradeReader } from "../coursework/grades";
import { requireTermGrading, termGradingOf } from "../gradebook/points";
import { classRun, taughtClass } from "../gradebook/running";

/**
 * A class's gradebook: its students, its published work with every result,
 * and the running grade the work gives each student. Where terms are kept,
 * the book is a term's: its work, the grade worked out from it, and the
 * term grades. Teachers see draft grades, marked so.
 */
export const classBook = readProcedure
  .input(classBookSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const classRow = await taughtClass(context, input.classId);
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      dayWithin(classRow.runs, context.today),
    );
    const [students, results, run] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      classResults(context.tx, context.tenantId, classRow.id),
      classRun(context, classRow, input.periodId),
    ]);
    const { term, shown, categories, grading } = run;
    const points = new Map(run.work.map((row) => [row.id, row.points]));
    const grade = await gradeReader(context, [
      ...results.map((row) => row.gradeScaleVersionId),
      ...(term?.grades ?? []).map((row) => row.gradeScaleVersionId),
      grading?.versionId ?? null,
    ]);
    // What the work graded so far comes to, over the term where there is
    // one: for the teacher to apply to a term grade or set aside.
    const calculated = students.map((student) => {
      const { percent } = runningGrade(
        shown,
        (assignmentId) =>
          results.find(
            (row) =>
              row.assignmentId === assignmentId && row.studentId === student.id,
          ),
        categories,
        "marked",
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
      term: term
        ? {
            terms: term.terms,
            periodId: term.periodId,
            currentPeriodId: term.currentPeriodId,
            closed: term.closed,
            grades: term.grades.map((row) => ({
              ...row,
              grade: grade(row.gradeScaleVersionId, row.score, row.maxScore),
            })),
          }
        : null,
      assignments: shown.map((row) => ({
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
        // Nothing in, and anything handed in now would be late.
        missing:
          !row.handedIn && !row.excused && isLate(row.dueAt, context.now),
        grade: grade(
          row.gradeScaleVersionId,
          row.effectiveScore ?? row.score,
          points.get(row.assignmentId) ?? null,
        ),
      })),
    };
  });

/** Records the term grades a teacher typed; a changed grade waits to be released again. */
export const savePeriodGrades = writeProcedure
  .input(savePeriodGradesSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const terms = await requireTermGrading(context);
    const classRow = await taughtClass(context, input.classId);
    const saved = await terms.save(context, {
      classRow,
      periodId: input.periodId,
      maxScore: input.maxScore,
      grades: input.grades,
    });
    return { saved };
  });

export const releasePeriod = writeProcedure
  .input(releasePeriodSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const terms = await requireTermGrading(context);
    const classRow = await taughtClass(context, input.classId);
    const released = await terms.release(context, {
      classRow,
      periodId: input.periodId,
    });
    return { released };
  });

/** A student's released term grades, for the student, their family or staff who reach them. */
export const student = readProcedure
  .input(v.object({ studentId: v.optional(v.pipe(v.string(), v.uuid())) }))
  .handler(async ({ input, context }) => {
    const studentId = input.studentId ?? context.actor.userId;
    requireCapability(context, "grades:read");
    if (studentId !== context.actor.userId)
      await requireStudent(context, "teaching", studentId);
    const found = await (
      await termGradingOf(context)
    )?.studentGrades(context, studentId);
    if (!found) return { year: null, rows: [] };
    const grade = await gradeReader(
      context,
      found.rows.map((row) => row.gradeScaleVersionId),
    );
    return {
      year: found.year,
      rows: found.rows.map((row) => ({
        ...row,
        grade: grade(row.gradeScaleVersionId, row.score, row.maxScore),
      })),
    };
  });

/**
 * Grades a term's scores again on today's bands, when a school decides a
 * scale change should reach grades already given. It says why.
 */
export const regradeTerm = writeProcedure
  .input(
    v.object({
      periodId: v.pipe(v.string(), v.uuid()),
      reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "grading:manage");
    const counts = await (
      await requireTermGrading(context)
    ).regrade(context, input);
    await audit(context, {
      action: "grading_scale.regrade",
      objectType: "academic_session",
      objectId: input.periodId,
      details: { reason: input.reason, ...counts },
    });
    return counts;
  });

/**
 * The terms work set in a class may count toward, and the one an
 * assignment counts toward, for the assignment editor.
 */
export const workTerm = readProcedure
  .input(
    v.object({
      classId: v.pipe(v.string(), v.uuid()),
      assignmentId: v.optional(
        v.union([v.literal(""), v.pipe(v.string(), v.uuid())]),
        "",
      ),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "assignments:author");
    const terms = await requireTermGrading(context);
    const classRow = await taughtClass(context, input.classId);
    return terms.workTerm(context, {
      classId: classRow.id,
      assignmentId: input.assignmentId,
    });
  });
