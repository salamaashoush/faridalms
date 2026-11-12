import type { GradesEnded } from "@faridalms/database/stores/student-grades";

import {
  classesOfGrades,
  gradesOfClasses,
  gradesRunning,
  setClassGrade,
  youngClasses,
} from "@faridalms/database/stores/class-grades";
import {
  gradeAudiencesOf,
  ownersOfClassGrades,
  setGradeAudiences,
} from "@faridalms/database/stores/grade-audiences";
import {
  endGrades,
  gradesOn,
  restoreGrades,
  setStudentGrade,
  youngStudents,
} from "@faridalms/database/stores/student-grades";
import {
  classGradePartSchema,
  gradeViewSchema,
  studentGradePartSchema,
} from "@faridalms/domain/grade-levels";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import {
  classColumns,
  classFormParts,
  classJoins,
  classViews,
  youngClasses as youngClassesPoint,
} from "../classes/points";
import { audienceKinds } from "../core/audiences";
import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import {
  leavingParts,
  studentColumns,
  studentFormParts,
  studentPlaces,
  youngStudents as youngStudentsPoint,
} from "../people/points";
import { gradesOf, labelOf } from "./levels";
import { classGradesChanged } from "./points";

function parsed<T extends v.GenericSchema>(
  schema: T,
  value: unknown,
): v.InferOutput<T> {
  const result = v.safeParse(schema, value);
  if (!result.success)
    throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
  return result.output;
}

/** A grade the school still uses, or refused. */
async function knownGrade(context: UnitContext, gradeId: string) {
  if (
    !(await gradesOf(context, context.today)).some((row) => row.id === gradeId)
  )
    throw new ORPCError("BAD_REQUEST", { message: "grade_level.unknown" });
}

const school = (context: { tenantId: string; schoolId: string }) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

/** Sets a student's grade from a day, recording the change. */
export async function changeStudentGrade(
  context: UnitContext,
  input: {
    studentId: string;
    gradeId: string;
    from: string;
    source: "manual" | "class" | "homeroom" | "rollover" | "admission";
    onlyIfNone?: boolean;
  },
) {
  const changed = await setStudentGrade(context.tx, {
    ...school(context),
    ...input,
  });
  if (changed)
    await audit(context, {
      action: "student_grade.change",
      objectType: "student_grade",
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: {
        gradeId: input.gradeId,
        from: input.from,
        source: input.source,
      },
    });
  return changed;
}

/** What grades and levels tell the rest of the product, wherever it asks. */
export const GRADE_LEVELS: ModuleContributions = {
  module: "grade_levels",
  contributions: [
    contribute(classViews, {
      key: "grade",
      filter: true,
      select: async (context, value) => {
        if (value === null) return null;
        const read = parsed(gradeViewSchema, value);
        return {
          classIds: await classesOfGrades(context.tx, {
            ...school(context),
            gradeIds: typeof read === "string" ? [read] : read,
          }),
          on: context.today,
        };
      },
    }),
    contribute(classColumns, {
      key: "grade",
      valuesOf: (context, classIds) =>
        gradesOfClasses(context.tx, context.tenantId, classIds),
      order: async (context) =>
        (await gradesOf(context, null)).map((row) => row.id),
    }),
    contribute(classFormParts, {
      key: "grade",
      save: async (context, input) => {
        const { gradeId } = parsed(classGradePartSchema, input.value);
        const before = await gradesOfClasses(
          context.tx,
          context.tenantId,
          input.classIds,
        );
        if (
          gradeId &&
          input.classIds.some((classId) => before.get(classId) !== gradeId)
        )
          await knownGrade(context, gradeId);
        await setClassGrade(context.tx, {
          ...school(context),
          classIds: input.classIds,
          gradeId: gradeId || null,
        });
        const changed = input.classIds.filter(
          (classId) => (before.get(classId) ?? "") !== gradeId,
        );
        if (changed.length > 0) await classGradesChanged(context, changed);
      },
    }),
    // A learner joining a class of a grade takes that grade only where they
    // hold none that day: a learner may sit in classes of two levels, and an
    // elective of another grade must not move them.
    contribute(classJoins, {
      joined: async (context, joins, from) => {
        const grades = await gradesOfClasses(context.tx, context.tenantId, [
          ...joins.keys(),
        ]);
        for (const [classId, studentIds] of joins) {
          const gradeId = grades.get(classId);
          if (!gradeId) continue;
          for (const studentId of studentIds)
            await changeStudentGrade(context, {
              studentId,
              gradeId,
              from,
              source: "class",
              onlyIfNone: true,
            });
        }
      },
    }),
    contribute(youngClassesPoint, {
      youngAmong: (context, classIds) =>
        youngClasses(context.tx, context.tenantId, classIds),
    }),
    contribute(studentColumns, {
      key: "grade",
      valuesOn: async (context, on) => {
        const [grades, values] = await Promise.all([
          gradesOf(context, null),
          gradesOn(context.tx, { ...school(context), on, studentIds: null }),
        ]);
        return { order: grades.map((row) => row.id), values };
      },
    }),
    contribute(studentFormParts, {
      key: "grade",
      save: async (context, input) => {
        const { gradeId } = parsed(studentGradePartSchema, input.value);
        if (!gradeId) return;
        await knownGrade(context, gradeId);
        await changeStudentGrade(context, {
          studentId: input.studentId,
          gradeId,
          from: context.today,
          source: "manual",
        });
      },
    }),
    contribute(leavingParts, {
      key: "grade",
      leave: (context, input) =>
        endGrades(context.tx, {
          ...school(context),
          studentId: input.studentId,
          leftOn: input.leftOn,
        }),
      cancel: async (context, input) => {
        const ended = v.safeParse(
          v.object({
            endedId: v.nullable(v.string()),
            until: v.nullable(v.string()),
            dropped: v.array(v.string()),
          }),
          input.ended,
        );
        if (ended.success)
          await restoreGrades(context.tx, {
            tenantId: context.tenantId,
            ...(ended.output satisfies GradesEnded),
          });
      },
    }),
    contribute(youngStudentsPoint, {
      youngAmong: (context, studentIds, on) =>
        youngStudents(context.tx, {
          ...school(context),
          userIds: studentIds,
          on,
        }),
    }),
    contribute(studentPlaces, {
      placesOf: async (context, studentIds, on) => {
        const [grades, values] = await Promise.all([
          gradesOf(context, null),
          gradesOn(context.tx, { ...school(context), on, studentIds }),
        ]);
        return new Map(
          [...values].flatMap(([studentId, gradeId]) => {
            const label = labelOf(grades, gradeId);
            return label ? [[studentId, label] as const] : [];
          }),
        );
      },
    }),
    contribute(audienceKinds, {
      scope: "grade",
      choices: async (context) => {
        const [grades, running] = await Promise.all([
          gradesOf(context, context.today),
          gradesRunning(context.tx, { ...school(context), on: context.today }),
        ]);
        return grades
          .filter((row) => running.includes(row.id))
          .map((row) => ({
            id: row.id,
            labelEn: row.labelEn,
            labelAr: row.labelAr,
          }));
      },
      targetsOf: async (context, owner) => {
        const [grades, ids] = await Promise.all([
          gradesOf(context, null),
          gradeAudiencesOf(context.tx, {
            tenantId: context.tenantId,
            kind: owner.kind,
            ownerId: owner.id,
          }),
        ]);
        return ids.flatMap((id) => labelOf(grades, id) ?? []);
      },
      save: async (context, owner, targetIds) => {
        const offered = await gradesOf(context, context.today);
        if (targetIds.some((id) => !offered.some((row) => row.id === id)))
          throw new ORPCError("BAD_REQUEST", {
            message: "announcements.audience_target",
          });
        await setGradeAudiences(context.tx, {
          tenantId: context.tenantId,
          kind: owner.kind,
          ownerId: owner.id,
          gradeIds: targetIds,
        });
      },
      classesOf: async (context, owner) =>
        classesOfGrades(context.tx, {
          ...school(context),
          gradeIds: await gradeAudiencesOf(context.tx, {
            tenantId: context.tenantId,
            kind: owner.kind,
            ownerId: owner.id,
          }),
        }),
      ownersCovering: (context, kind, classIds) =>
        ownersOfClassGrades(context.tx, {
          tenantId: context.tenantId,
          kind,
          classIds,
        }),
    }),
  ],
};
