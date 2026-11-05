import type { SchoolYear } from "@faridalms/database/stores/years";
import type {
  RolloverOutcome,
  RolloverPlan,
  RolloverQuery,
  RolloverStudent,
  NextYearIntention,
} from "@faridalms/domain/rollover";

import {
  enrolStudent,
  homeroomDirectory,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { decidingGuardians } from "@faridalms/database/stores/invites";
import { markActed } from "@faridalms/database/stores/notifications";
import { copyPeriods } from "@faridalms/database/stores/periods";
import {
  markRolloverApplied,
  recordExits,
  rolloverOf,
  saveRolloverDraft,
  setNextYearOutcomes,
  studentsAtYearEnd,
  openReenrolment as openReenrolmentIn,
  openReenrolments,
  recordIntention,
} from "@faridalms/database/stores/rollovers";
import {
  calendarFor,
  endStudentRole,
  place,
} from "@faridalms/database/stores/students";
import { holdYear, schoolYears } from "@faridalms/database/stores/years";
import {
  applyRolloverSchema,
  rolloverPlanIssue,
  rolloverPlanSchema,
  rolloverQuerySchema,
  rolloverYearsIssue,
  saveRolloverSchema,
  firstOutcome,
  openReenrolmentSchema,
  setIntentionSchema,
} from "@faridalms/domain/rollover";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { writeHomeroom } from "../classes/homerooms";
import { notify } from "../core/notify";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { scopeFor } from "../core/reach";
import { yearAfter, yearOf } from "../core/years";

async function yearsOf(context: UnitContext, query: RolloverQuery) {
  const years = await schoolYears(
    context.tx,
    context.tenantId,
    context.schoolId,
  );
  const source = years.find((row) => row.id === query.sourceYearId);
  const target = years.find((row) => row.id === query.targetYearId);
  if (!source || !target || source.id === target.id)
    throw new ORPCError("NOT_FOUND");
  return { source, target };
}

function refuseYears(issue: string | null) {
  if (issue)
    throw new ORPCError(
      issue === "school_year.closed" ? "CONFLICT" : "BAD_REQUEST",
      { message: issue },
    );
}

function refusePlan(plan: RolloverPlan) {
  const issue = rolloverPlanIssue(plan);
  if (issue) throw new ORPCError("BAD_REQUEST", { message: issue });
}

async function sourceHomerooms(
  context: UnitContext,
  year: { id: string; endsBefore: string },
) {
  return homeroomDirectory(context.tx, scopeFor(context, "school"), {
    yearId: year.id,
    on: addDays(year.endsBefore, -1),
    q: "",
    gradeIds: [],
    locale: localeOf(context),
  });
}

/**
 * A first proposal: every homeroom carries over with its code, names, room
 * and teachers into the next grade, and every student is promoted into the
 * class that follows their own.
 */
function propose(
  homerooms: Awaited<ReturnType<typeof sourceHomerooms>>,
  students: Awaited<ReturnType<typeof studentsAtYearEnd>>,
  grades: { id: string }[],
): RolloverPlan {
  const nextGrade = (gradeId: string | null) => {
    const index = grades.findIndex((row) => row.id === gradeId);
    return index < 0
      ? (gradeId ?? "")
      : (grades[index + 1]?.id ?? gradeId ?? "");
  };
  const keys = new Map(homerooms.map((row) => [row.id, crypto.randomUUID()]));
  return {
    classes: homerooms.map((row) => ({
      key: keys.get(row.id) ?? crypto.randomUUID(),
      sourceClassId: row.id,
      include: true,
      code: row.code,
      titleEn: row.titleEn ?? "",
      titleAr: row.titleAr ?? "",
      gradeId: nextGrade(row.gradeId),
      locationId: row.locationId ?? "",
      homeroomTeacherId:
        row.teachers.find((teacher) => teacher.isPrimary)?.userId ?? "",
      subjects: row.subjects.flatMap((subject) =>
        subject.subjectId
          ? [
              {
                subjectId: subject.subjectId,
                teacherId: subject.teacher?.userId ?? "",
              },
            ]
          : [],
      ),
    })),
    students: students.map((row) => defaultStudent(row, keys)),
  };
}

function defaultStudent(
  row: {
    studentId: string;
    classId: string | null;
    outcome: string | null;
    intention: NextYearIntention | null;
  },
  keys: Map<string, string>,
): RolloverStudent {
  const outcome = firstOutcome(row.outcome, row.intention);
  return {
    studentId: row.studentId,
    outcome,
    targetKey:
      outcome === "promote" && row.classId ? (keys.get(row.classId) ?? "") : "",
  };
}

/**
 * The saved draft brought up to date with who is placed at the end of the
 * source year: newcomers join as promoted into the class that follows theirs,
 * and students no longer placed drop out.
 */
function reconcile(
  plan: RolloverPlan,
  students: Awaited<ReturnType<typeof studentsAtYearEnd>>,
) {
  const planned = new Map(plan.students.map((row) => [row.studentId, row]));
  const current = new Set(students.map((row) => row.studentId));
  const keys = new Map(
    plan.classes
      .filter((row) => row.include)
      .map((row) => [row.sourceClassId, row.key]),
  );
  let changed = plan.students.some((row) => !current.has(row.studentId));
  const next = students.map((row) => {
    const kept = planned.get(row.studentId);
    if (kept) return kept;
    changed = true;
    return defaultStudent({ ...row, outcome: null }, keys);
  });
  return { plan: { ...plan, students: next }, changed };
}

function yearView(row: SchoolYear) {
  return {
    id: row.id,
    titleEn: row.titleEn,
    titleAr: row.titleAr,
    startsOn: row.startsOn,
    endsBefore: row.endsBefore,
    lifecycle: row.lifecycle,
    reenrolmentOpenedAt: row.reenrolmentOpenedAt,
  };
}

function readPlan(value: unknown): RolloverPlan {
  const parsed = v.safeParse(rolloverPlanSchema, value);
  if (!parsed.success) throw new Error("stored rollover plan is invalid");
  return parsed.output;
}

export const preview = readProcedure
  .input(rolloverQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    const { source, target } = await yearsOf(context, input);
    const [homerooms, students, saved, grades, targetClasses] =
      await Promise.all([
        sourceHomerooms(context, source),
        studentsAtYearEnd(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          year: source,
        }),
        rolloverOf(context.tx, { tenantId: context.tenantId, ...input }),
        descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "grade_level",
          today: context.today,
        }),
        context.tx.execute<{ code: string }>(sql`
          select code from core.classes
          where tenant_id = ${context.tenantId}::uuid and school_year_id = ${target.id}::uuid
            and status = 'active'`),
      ]);
    let plan: RolloverPlan;
    let reconciled = false;
    if (!saved) plan = propose(homerooms, students, grades);
    else if (saved.state === "applied") plan = readPlan(saved.plan);
    else {
      const result = reconcile(readPlan(saved.plan), students);
      plan = result.plan;
      reconciled = result.changed;
    }
    return {
      source: yearView(source),
      target: yearView(target),
      state: saved?.state ?? "new",
      version: saved?.version ?? 0,
      reconciled,
      plan,
      outcome: (saved?.outcome ?? null) as RolloverOutcome | null,
      issue: rolloverYearsIssue(source, target, context.today),
      takenCodes: targetClasses.map((row) => row.code),
      homerooms: homerooms.map((row) => ({
        id: row.id,
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        gradeId: row.gradeId,
      })),
      students: students.map((row) => ({
        id: row.studentId,
        fullNameEn: row.fullNameEn,
        fullNameAr: row.fullNameAr,
        gradeId: row.gradeId,
        classId: row.classId,
        intention: row.intention,
      })),
    };
  });

/**
 * Saves the draft and each student's outcome on their source placement. The
 * draft is revision-checked, so two people editing it cannot overwrite each
 * other unseen.
 */
export const save = writeProcedure
  .input(saveRolloverSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    await context.tx.execute(
      sql`select app.lock(${`rollover:${input.targetYearId}`})`,
    );
    const { source, target } = await yearsOf(context, input);
    refuseYears(rolloverYearsIssue(source, target, context.today));
    if ((await holdYear(context.tx, context.tenantId, source.id)) === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    refusePlan(input.plan);
    const existing = await rolloverOf(
      context.tx,
      { tenantId: context.tenantId, ...input },
      true,
    );
    if (existing?.state === "applied")
      throw new ORPCError("CONFLICT", { message: "rollover.applied" });
    if ((existing?.version ?? 0) !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const saved = await saveRolloverDraft(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      sourceYearId: source.id,
      targetYearId: target.id,
      expectedVersion: input.expectedVersion,
      plan: input.plan,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    const students = await studentsAtYearEnd(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      year: source,
    });
    const outcomes = new Map(
      input.plan.students.map((row) => [row.studentId, row.outcome]),
    );
    await setNextYearOutcomes(
      context.tx,
      context.tenantId,
      students.flatMap((row) => {
        const outcome = outcomes.get(row.studentId);
        return outcome ? [{ placementId: row.placementId, outcome }] : [];
      }),
    );
    await audit(context, {
      action: "year_rollover.save",
      objectType: "academic_session",
      objectId: target.id,
      details: { sourceYearId: source.id, version: saved.version },
    });
    return saved;
  });

/**
 * Creates the target year's classes and placements from the saved draft in
 * one transaction, and records departures on the source placements. Nothing
 * of the source year moves and no coursework is copied. Applying again,
 * including concurrently, returns the recorded outcome.
 */
export const apply = writeProcedure
  .input(applyRolloverSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    const tx = context.tx;
    await tx.execute(sql`select app.lock(${`rollover:${input.targetYearId}`})`);
    const { source, target } = await yearsOf(context, input);
    const rollover = await rolloverOf(
      tx,
      { tenantId: context.tenantId, ...input },
      true,
    );
    if (!rollover)
      throw new ORPCError("NOT_FOUND", { message: "rollover.not_saved" });
    if (rollover.state === "applied")
      return rollover.outcome as unknown as RolloverOutcome;
    if (rollover.version !== input.expectedVersion)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    refuseYears(rolloverYearsIssue(source, target, context.today));
    for (const year of [source, target])
      if ((await holdYear(tx, context.tenantId, year.id)) === "closed")
        throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    const plan = readPlan(rollover.plan);
    refusePlan(plan);
    const [homerooms, students] = await Promise.all([
      sourceHomerooms(context, source),
      studentsAtYearEnd(tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        year: source,
      }),
    ]);
    const known = new Set(homerooms.map((row) => row.id));
    const planned = new Set(plan.students.map((row) => row.studentId));
    if (
      plan.classes.some((row) => !known.has(row.sourceClassId)) ||
      students.length !== planned.size ||
      students.some((row) => !planned.has(row.studentId))
    )
      throw new ORPCError("CONFLICT", { message: "rollover.plan_stale" });

    const created: RolloverOutcome["classes"] = [];
    for (const row of plan.classes.filter((item) => item.include)) {
      const classId = await writeHomeroom(context, target, {
        code: row.code,
        titleEn: row.titleEn || null,
        titleAr: row.titleAr || null,
        gradeId: row.gradeId,
        locationId: row.locationId,
        homeroomTeacherId: row.homeroomTeacherId,
        subjects: row.subjects.map((subject) => ({
          subjectId: subject.subjectId,
          teacherIds: subject.teacherId ? [subject.teacherId] : [],
        })),
      });
      created.push({ key: row.key, classId, code: row.code });
    }
    const classOf = new Map(created.map((row) => [row.key, row.classId]));
    const gradeOf = new Map(
      plan.classes.map((row) => [row.key, row.gradeId || null]),
    );
    const [entryTypes, exitTypes] = await Promise.all(
      ["school_entry_type", "school_exit_type"].map((namespace) =>
        descriptorsFor(tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace,
          today: context.today,
        }),
      ),
    );
    const continuing =
      entryTypes?.find((row) => row.meaning === "continuing")?.id ?? null;
    const exitOf = (meaning: string) =>
      exitTypes?.find((row) => row.meaning === meaning)?.id ?? null;
    const scope = scopeFor(context, "school");
    const calendarId = await calendarFor(tx, context.tenantId, target.id);
    const byStudent = new Map(students.map((row) => [row.studentId, row]));
    let placed = 0;
    for (const student of plan.students) {
      const classId = classOf.get(student.targetKey);
      const placement = byStudent.get(student.studentId);
      if (!classId || !placement) continue;
      await enrolStudent(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        classRow: {
          id: classId,
          classType: "homeroom",
          schoolYearId: target.id,
        },
        studentId: student.studentId,
        from: target.startsOn,
        endsBefore: target.endsBefore,
        source: "rollover",
      });
      const gradeId = gradeOf.get(student.targetKey) ?? placement.gradeId;
      if (gradeId)
        await place(tx, scope, {
          studentId: student.studentId,
          year: target,
          gradeId,
          calendarId,
          from: target.startsOn,
          entryTypeId: continuing,
          source: "rollover",
        });
      placed += 1;
    }
    await setNextYearOutcomes(
      tx,
      context.tenantId,
      plan.students.flatMap((row) => {
        const placement = byStudent.get(row.studentId);
        return placement
          ? [{ placementId: placement.placementId, outcome: row.outcome }]
          : [];
      }),
    );
    for (const [outcome, meaning] of [
      ["leave", "withdrawn"],
      ["graduate", "graduated"],
    ] as const) {
      const exitType = exitOf(meaning);
      const leaving = plan.students
        .filter((row) => row.outcome === outcome)
        .flatMap((row) => byStudent.get(row.studentId)?.placementId ?? []);
      if (exitType && leaving.length > 0)
        await recordExits(tx, context.tenantId, leaving, exitType);
    }
    // Those who leave or graduate are students of the school, to the app and
    // to their families, until the new year begins without them.
    for (const row of plan.students)
      if (row.outcome === "leave" || row.outcome === "graduate")
        await endStudentRole(tx, scope, {
          studentId: row.studentId,
          until: target.startsOn,
        });
    await copyPeriods(tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      sourceYearId: source.id,
      target,
    });
    const outcome: RolloverOutcome = {
      classes: created,
      placed,
      left: plan.students.filter((row) => row.outcome === "leave").length,
      graduated: plan.students.filter((row) => row.outcome === "graduate")
        .length,
    };
    await markRolloverApplied(tx, {
      tenantId: context.tenantId,
      id: rollover.id,
      userId: context.actor.userId,
      outcome: { ...outcome },
    });
    await audit(context, {
      action: "year_rollover.apply",
      objectType: "academic_session",
      objectId: target.id,
      details: { sourceYearId: source.id, ...outcome, classes: created.length },
    });
    return outcome;
  });

/**
 * Asks the families of every student placed in a year whether each child
 * returns the year after: once a year, a notice to the guardians who
 * decide for the child. Their answers feed the rollover's first outcomes.
 */
export const openReenrolment = writeProcedure
  .input(openReenrolmentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    const { years, year } = await yearOf(context, input.yearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    const next = yearAfter(years, year);
    if (!next)
      throw new ORPCError("CONFLICT", {
        message: "reenrolment.no_next_year",
      });
    const opened = await openReenrolmentIn(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      yearId: year.id,
    });
    if (!opened)
      throw new ORPCError("CONFLICT", { message: "reenrolment.opened" });
    const placed = await studentsAtYearEnd(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      year,
    });
    const deciding = await decidingGuardians(context.tx, {
      tenantId: context.tenantId,
      studentIds: placed.map((row) => row.studentId),
      today: context.today,
    });
    let asked = 0;
    for (const student of placed) {
      const guardians = deciding
        .filter((row) => row.studentId === student.studentId)
        .map((row) => row.guardianId);
      // One notice per child, each naming the child its answer is for.
      asked += await notify(context, guardians, {
        kind: "reenrolment",
        subject: { type: "student_school_year", id: student.placementId },
        needsAction: true,
        params: {
          studentId: student.studentId,
          studentName: student.fullNameEn ?? undefined,
          studentNameAr: student.fullNameAr ?? undefined,
          title: next.titleEn ?? next.titleAr ?? undefined,
          titleAr: next.titleAr ?? next.titleEn ?? undefined,
        },
      });
    }
    await audit(context, {
      action: "reenrolment.open",
      objectType: "academic_session",
      objectId: year.id,
      details: { nextYearId: next.id, asked },
    });
    return { asked };
  });

/**
 * Records whether a student returns next year, while their family is being
 * asked: by a guardian who decides for the child, or by the office for them.
 */
export const setIntention = writeProcedure
  .input(setIntentionSchema)
  .handler(async ({ input, context }) => {
    const office = can(context, "years:manage");
    const deciding = await decidingGuardians(context.tx, {
      tenantId: context.tenantId,
      studentIds: [input.studentId],
      today: context.today,
    });
    if (
      !office &&
      !deciding.some((row) => row.guardianId === context.actor.userId)
    )
      throw new ORPCError("FORBIDDEN");
    const [open] = await openReenrolments(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentIds: [input.studentId],
      today: context.today,
    });
    if (!open)
      throw new ORPCError("CONFLICT", { message: "reenrolment.closed" });
    await recordIntention(context.tx, {
      tenantId: context.tenantId,
      placementId: open.placementId,
      intention: input.intention,
      byUserId: context.actor.userId,
    });
    // One answer stands for the child, so no guardian is still asked.
    for (const { guardianId } of deciding)
      await markActed(context.tx, {
        tenantId: context.tenantId,
        userId: guardianId,
        subjectType: "student_school_year",
        subjectId: open.placementId,
      });
    await audit(context, {
      action: "reenrolment.intention",
      objectType: "student_school_year",
      objectId: open.placementId,
      subjectUserId: input.studentId,
      details: { intention: input.intention, by: office ? "office" : "family" },
    });
    return { intention: input.intention };
  });
