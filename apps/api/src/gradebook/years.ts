import type { ClassRow } from "@faridalms/database/stores/classes";

import { rosterOf } from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/persons";
import {
  periodGradesOf,
  regradeTerm,
  releasePeriodGrades,
  savePeriodGrade,
  setTermOfWork,
  studentPeriodGrades,
  termsOfWork,
} from "@faridalms/database/stores/term-grades";
import {
  dayIn,
  holdYear,
  schoolYears,
  termsOf,
  workingYear,
} from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { ModuleContributions } from "../core/extension";

import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import { teachingScope, tellPeriodGrades } from "../coursework/notices";
import { assignmentParts } from "../coursework/points";
import { linkedYear } from "../years/years";
import { termGrading } from "./points";

/** The year and term of a class that still takes grades, or not found. */
async function openTerm(
  context: UnitContext,
  classRow: ClassRow,
  periodId: string,
) {
  const year = await linkedYear(context, classRow.id);
  if (!year) throw new ORPCError("NOT_FOUND");
  if ((await holdYear(context.tx, context.tenantId, year.id)) === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  const period = (await termsOf(context.tx, context.tenantId, year.id)).find(
    (row) => row.id === periodId,
  );
  if (!period) throw new ORPCError("NOT_FOUND");
  return { year, period };
}

const termValue = v.union([v.literal(""), v.pipe(v.string(), v.uuid())]);

/** The terms of each class's year, for the classes in one. */
async function termsOfClasses(
  context: UnitContext,
  classIds: readonly string[],
): Promise<
  Record<
    string,
    { id: string; titleEn: string | null; titleAr: string | null }[]
  >
> {
  const entries = await Promise.all(
    classIds.map(async (classId) => {
      const year = await linkedYear(context, classId);
      const terms = year
        ? await termsOf(context.tx, context.tenantId, year.id)
        : [];
      return [
        classId,
        terms.map((row) => ({
          id: row.id,
          titleEn: row.titleEn,
          titleAr: row.titleAr,
        })),
      ] as const;
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Term grading, where the gradebook and school years are both on: a
 * class's terms are its year's, its term grades and their release, the
 * term each piece of work counts toward, and grading a term again.
 */
export const GRADEBOOK_IN_YEARS: ModuleContributions = {
  module: "gradebook",
  needs: ["school_years"],
  contributions: [
    contribute(termGrading, {
      book: async (context, input) => {
        const year = await linkedYear(context, input.classRow.id);
        if (!year) return null;
        const terms = await termsOf(context.tx, context.tenantId, year.id);
        const current =
          terms.find(
            (row) =>
              row.startsOn <= context.today && context.today < row.endsBefore,
          ) ??
          terms[0] ??
          null;
        const period =
          terms.find((row) => row.id === input.periodId) ?? current;
        const [grades, termOf] = await Promise.all([
          period
            ? periodGradesOf(context.tx, {
                tenantId: context.tenantId,
                classId: input.classRow.id,
                periodId: period.id,
              })
            : Promise.resolve([]),
          termsOfWork(context.tx, {
            tenantId: context.tenantId,
            assignmentIds: input.workIds,
          }),
        ]);
        return {
          terms: terms.map((row) => ({
            id: row.id,
            titleEn: row.titleEn,
            titleAr: row.titleAr,
          })),
          periodId: period?.id ?? null,
          currentPeriodId: current?.id ?? null,
          grades,
          closed: year.lifecycle === "closed",
          // Work set for no term counts in every term.
          workIds: period
            ? new Set(
                input.workIds.filter((id) => {
                  const term = termOf.get(id);
                  return !term || term === period.id;
                }),
              )
            : null,
        };
      },
      save: async (context, input) => {
        const { year } = await openTerm(
          context,
          input.classRow,
          input.periodId,
        );
        const roster = new Set(
          await rosterOf(
            context.tx,
            context.tenantId,
            input.classRow.id,
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
            classId: input.classRow.id,
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
              objectId: input.classRow.id,
              subjectUserId: grade.studentId,
              studentUserId: grade.studentId,
              details: { periodId: input.periodId },
              change: { table: "core.period_grades", before, after },
            });
        }
        return input.grades.length;
      },
      release: async (context, input) => {
        const { period } = await openTerm(
          context,
          input.classRow,
          input.periodId,
        );
        const students = await releasePeriodGrades(context.tx, {
          tenantId: context.tenantId,
          classId: input.classRow.id,
          periodId: period.id,
        });
        const learners = await namesOf(context.tx, context.tenantId, students);
        await tellPeriodGrades(teachingScope(context), {
          classId: input.classRow.id,
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
          objectId: input.classRow.id,
          details: { periodId: input.periodId, released: students.length },
        });
        return students.length;
      },
      studentGrades: async (context, studentId) => {
        const year = workingYear(
          await schoolYears(context.tx, context.tenantId, context.schoolId),
          context.today,
        );
        if (!year) return null;
        return {
          year: { id: year.id, titleEn: year.titleEn, titleAr: year.titleAr },
          rows: await studentPeriodGrades(context.tx, {
            tenantId: context.tenantId,
            studentId,
            yearId: year.id,
          }),
        };
      },
      workTerm: async (context, input) => ({
        terms:
          (await termsOfClasses(context, [input.classId]))[input.classId] ?? [],
        periodId: input.assignmentId
          ? ((
              await termsOfWork(context.tx, {
                tenantId: context.tenantId,
                assignmentIds: [input.assignmentId],
              })
            ).get(input.assignmentId) ?? "")
          : "",
      }),
      regrade: (context, input) =>
        regradeTerm(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          periodId: input.periodId,
          today: context.today,
        }),
    }),
    contribute(assignmentParts, {
      key: "term",
      prepare: async (context, input) => {
        if (input.value === undefined) return null;
        const parsed = v.safeParse(termValue, input.value);
        if (!parsed.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        const offered = (await termsOfClasses(context, [input.classId]))[
          input.classId
        ];
        if (parsed.output && !offered?.some((row) => row.id === parsed.output))
          throw new ORPCError("BAD_REQUEST", {
            message: "coursework.term_unknown",
          });
        return null;
      },
      save: (context, input) =>
        setTermOfWork(context.tx, {
          tenantId: context.tenantId,
          assignmentId: input.assignment.id,
          periodId: v.parse(termValue, input.value) || null,
        }),
    }),
  ],
};
