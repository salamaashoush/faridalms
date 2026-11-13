import type { ClassRow } from "@faridalms/database/stores/classes";

import { classById } from "@faridalms/database/stores/classes";
import {
  classesShowingRunning,
  classResults,
  classWork,
  gradebookSettingsOf,
  runningShownOf,
  saveRunningDefault,
  setRunningShown,
} from "@faridalms/database/stores/gradebook";
import {
  classCategories,
  classGrading,
} from "@faridalms/database/stores/grading";
import { runningGrade } from "@faridalms/domain/grading";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent, teaches } from "../core/reach";
import { gradeReader } from "../coursework/grades";
import { termGradingOf } from "./points";

const uuid = v.pipe(v.string(), v.uuid());

/** A class the viewer teaches, or has school-wide reach over teaching in, or not found. */
export async function taughtClass(context: UnitContext, classId: string) {
  const classRow = await classById(context.tx, context, classId);
  if (!classRow || !(await teaches(context, "teaching", classRow.id)))
    throw new ORPCError("NOT_FOUND");
  return classRow;
}

/**
 * What a class's grade is worked out over: its published work, narrowed
 * to a term's where a module keeps terms for the class, the categories its
 * programme weighs, and the scale it grades on today.
 */
export async function classRun(
  context: UnitContext,
  classRow: ClassRow,
  periodId: string,
) {
  const work = await classWork(context.tx, context.tenantId, classRow.id);
  const [term, categories, grading] = await Promise.all([
    termGradingOf(context).then(
      (terms) =>
        terms?.book(context, {
          classRow,
          periodId,
          workIds: work.map((row) => row.id),
        }) ?? null,
    ),
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
  const shown = term?.workIds
    ? work.filter((row) => term.workIds?.has(row.id))
    : work;
  return { term, work, shown, categories, grading };
}

/**
 * A learner's running grade in each class that shows it: worked out from
 * the work returned to them, over the current term where a module keeps
 * terms for the class. For the learner, those who follow them and staff
 * who reach them, as their released term grades are.
 */
export const running = readProcedure
  .input(v.object({ studentId: v.optional(uuid) }))
  .handler(async ({ input, context }) => {
    const studentId = input.studentId ?? context.actor.userId;
    requireCapability(context, "grades:read");
    if (studentId !== context.actor.userId)
      await requireStudent(context, "teaching", studentId);
    const classIds = await classesShowingRunning(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentId,
      today: context.today,
    });
    const found = await Promise.all(
      classIds.map(async (classId) => {
        const classRow = await classById(context.tx, context, classId);
        if (!classRow) return [];
        const [run, results] = await Promise.all([
          classRun(context, classRow, ""),
          classResults(context.tx, context.tenantId, classId, studentId),
        ]);
        const resultOf = (assignmentId: string) =>
          results.find((row) => row.assignmentId === assignmentId);
        const period = run.term?.terms.find(
          (row) => row.id === run.term?.periodId,
        );
        return [
          {
            classRow,
            run,
            period: period ?? null,
            resultOf,
            grade: runningGrade(
              run.shown,
              resultOf,
              run.categories,
              "returned",
            ),
          },
        ];
      }),
    );
    const rows = found.flat();
    const grade = await gradeReader(context, [
      ...rows.map((row) => row.run.grading?.versionId ?? null),
      ...rows.flatMap((row) =>
        row.grade.parts.map(
          (part) =>
            row.resultOf(part.assignmentId)?.gradeScaleVersionId ?? null,
        ),
      ),
    ]);
    return {
      classes: rows.map((row) => ({
        classId: row.classRow.id,
        code: row.classRow.code,
        titleEn: row.classRow.titleEn,
        titleAr: row.classRow.titleAr,
        span: row.period
          ? { titleEn: row.period.titleEn, titleAr: row.period.titleAr }
          : null,
        percent: row.grade.percent,
        grade: grade(
          row.run.grading?.versionId ?? null,
          row.grade.percent,
          100,
        ),
        parts: row.grade.parts.map((part) => {
          const work = row.run.shown.find(
            (item) => item.id === part.assignmentId,
          );
          const category = row.run.categories.find(
            (item) => item.id === work?.categoryId,
          );
          return {
            ...part,
            title: work?.title ?? "",
            dueAt: work?.dueAt ?? null,
            categoryTitleEn: category?.titleEn ?? null,
            categoryTitleAr: category?.titleAr ?? null,
            grade: grade(
              row.resultOf(part.assignmentId)?.gradeScaleVersionId ?? null,
              part.score,
              part.points,
            ),
          };
        }),
      })),
    };
  });

/** Whether a class shows its learners their running grade, for whoever keeps its book. */
export const runningShown = readProcedure
  .input(v.object({ classId: uuid }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const classRow = await taughtClass(context, input.classId);
    return runningShownOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classId: classRow.id,
    });
  });

/** Shows a class's learners their running grade, or stops; never releases anything. */
export const showRunning = writeProcedure
  .input(
    v.object({
      classId: uuid,
      shown: v.boolean(),
      expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const classRow = await taughtClass(context, input.classId);
    const before = await runningShownOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classId: classRow.id,
    });
    const version = await setRunningShown(context.tx, {
      tenantId: context.tenantId,
      classId: classRow.id,
      shown: input.shown,
      expectedVersion: input.expectedVersion,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    if (before.shown !== input.shown)
      await audit(context, {
        action: input.shown ? "running_grade.show" : "running_grade.hide",
        objectType: "class",
        objectId: classRow.id,
      });
    return { shown: input.shown, version };
  });

/** Whether new classes show learners their running grade. */
export const runningDefault = readProcedure.handler(({ context }) => {
  requireCapability(context, "grading:manage");
  return gradebookSettingsOf(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
  });
});

/** Sets whether new classes show learners their running grade; classes made before keep theirs. */
export const setRunningDefault = writeProcedure
  .input(
    v.object({
      runningShown: v.boolean(),
      expectedVersion: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "grading:manage");
    const saved = await saveRunningDefault(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      runningShown: input.runningShown,
      expectedVersion: input.expectedVersion,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "gradebook_settings.save",
      objectType: "org",
      objectId: context.schoolId,
      details: { runningShown: input.runningShown, kept: saved.kept },
    });
    return { runningShown: input.runningShown, version: saved.version };
  });
