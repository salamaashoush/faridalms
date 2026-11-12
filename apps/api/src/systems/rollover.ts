import type { YearEndStudent } from "@faridalms/database/stores/rollovers";
import type { SchoolYear } from "@faridalms/database/stores/years";
import type {
  RolloverClass,
  RolloverOutcome,
  RolloverPlan,
  RolloverQuery,
  RolloverStudent,
  NextYearIntention,
} from "@faridalms/domain/rollover";
import type { OpenSpan } from "@faridalms/domain/school";

import {
  endStudentEnrollmentsFrom,
  enrolStudent,
  insertClass,
  rosterOf,
  setClassTeachers,
  teachersOf,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { decidingGuardians } from "@faridalms/database/stores/invites";
import { markActed } from "@faridalms/database/stores/notifications";
import { childrenOf } from "@faridalms/database/stores/persons";
import { place } from "@faridalms/database/stores/placements";
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
  departureOf,
  recordDeparture,
} from "@faridalms/database/stores/students";
import {
  classesOfYear,
  holdYear,
  linkClass,
  schoolYears,
} from "@faridalms/database/stores/years";
import {
  applyRolloverSchema,
  rolloverPlanIssue,
  rolloverPlanSchema,
  rolloverQuerySchema,
  rolloverYearsIssue,
  saveRolloverSchema,
  firstOutcome,
  followsClass,
  openReenrolmentSchema,
  setIntentionSchema,
} from "@faridalms/domain/rollover";
import { addDays } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import { sql } from "drizzle-orm";
import * as v from "valibot";

import type { UnitContext } from "../core/context";
import type { RolloverCarrier, SourceClass } from "../years/carry";

import { joinedClasses } from "../classes/enrolment";
import { notify } from "../core/notify";
import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { scopeFor } from "../core/reach";
import { carriersOf } from "../years/carry";
import { daysOf, yearAfter, yearOf } from "../years/years";

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

type StayingStudent = YearEndStudent & { classId: string | null };

interface Source extends SourceClass {
  /** The carrier's key, or empty for a class carried as itself. */
  carrier: string;
  /** Students in the class on the year's last day. */
  studentIds: string[];
}

/**
 * The year's classes as the rollover carries them: each carrier's, with
 * the classes it carries as their parts, then every other class of the
 * year as itself; and the class each student sits in where a carrier
 * places students one at a time.
 */
async function sourcesOf(
  context: UnitContext,
  year: SchoolYear,
  studentIds: readonly string[],
) {
  const on = addDays(year.endsBefore, -1);
  const classes = await classesOfYear(context.tx, context.tenantId, year.id);
  const carriers = await carriersOf(context);
  const claimed = new Set<string>();
  const sources: Source[] = [];
  const classOf = new Map<string, string>();
  for (const carrier of carriers) {
    for (const row of await carrier.sources(
      context,
      classes.map((item) => item.id),
      on,
    )) {
      if (claimed.has(row.id)) continue;
      for (const id of [row.id, ...row.partIds]) claimed.add(id);
      sources.push({
        ...row,
        carrier: carrier.key,
        studentIds: await rosterOf(context.tx, context.tenantId, row.id, on),
      });
    }
    for (const [studentId, classId] of await carrier.classesOf(
      context,
      studentIds,
      on,
    ))
      if (!classOf.has(studentId)) classOf.set(studentId, classId);
  }
  const own = classes.filter((row) => !claimed.has(row.id));
  const teachers = await teachersOf(
    context.tx,
    context.tenantId,
    own.map((row) => row.id),
    on,
  );
  for (const row of own)
    sources.push({
      id: row.id,
      code: row.code,
      titleEn: row.titleEn,
      titleAr: row.titleAr,
      gradeId: row.gradeId,
      locationId: row.locationId,
      teacherId:
        teachers.get(row.id)?.find((teacher) => teacher.isPrimary)?.userId ??
        null,
      subjects: [],
      carrier: "",
      studentIds: await rosterOf(context.tx, context.tenantId, row.id, on),
    });
  return { sources, classOf, carriers };
}

/**
 * A first proposal: every class goes over with its code, names, room and
 * teachers into the next grade; a student a carrier places is promoted into
 * the class that follows their own, and a class of its own takes its
 * staying students with it.
 */
function propose(
  sources: readonly Source[],
  students: readonly StayingStudent[],
  grades: { id: string }[],
): RolloverPlan {
  const nextGrade = (gradeId: string | null) => {
    const index = grades.findIndex((row) => row.id === gradeId);
    return index < 0
      ? (gradeId ?? "")
      : (grades[index + 1]?.id ?? gradeId ?? "");
  };
  const keys = new Map(sources.map((row) => [row.id, crypto.randomUUID()]));
  return {
    classes: sources.map((row) => ({
      key: keys.get(row.id) ?? crypto.randomUUID(),
      sourceClassId: row.id,
      carrier: row.carrier,
      include: true,
      students: row.carrier === "",
      code: row.code,
      titleEn: row.titleEn ?? "",
      titleAr: row.titleAr ?? "",
      gradeId: nextGrade(row.gradeId),
      locationId: row.locationId ?? "",
      teacherId: row.teacherId ?? "",
      subjects: row.subjects.map((subject) => ({
        subjectId: subject.subjectId,
        teacherId: subject.teacherId ?? "",
      })),
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
function reconcile(plan: RolloverPlan, students: readonly StayingStudent[]) {
  const planned = new Map(plan.students.map((row) => [row.studentId, row]));
  const current = new Set(students.map((row) => row.studentId));
  const keys = new Map(
    plan.classes
      .filter((row) => row.include && row.carrier)
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

/** The codes of the school's classes that run over some of the days, already taken there. */
async function codesTaken(context: UnitContext, days: OpenSpan) {
  const rows = await context.tx.execute<{ code: string }>(sql`
    select code from core.classes
    where tenant_id = ${context.tenantId}::uuid and org_id = ${context.schoolId}::uuid
      and runs && daterange(${days.from}::date, ${days.to}::date) and status = 'active'`);
  return rows.map((row) => row.code);
}

export const preview = readProcedure
  .input(rolloverQuerySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "years:manage");
    const { source, target } = await yearsOf(context, input);
    const placed = await studentsAtYearEnd(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      year: source,
    });
    const [carried, saved, grades, takenCodes] = await Promise.all([
      sourcesOf(
        context,
        source,
        placed.map((row) => row.studentId),
      ),
      rolloverOf(context.tx, { tenantId: context.tenantId, ...input }),
      descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace: "grade_level",
        today: context.today,
      }),
      codesTaken(context, daysOf(target)),
    ]);
    const students = placed.map((row) => ({
      ...row,
      classId: carried.classOf.get(row.studentId) ?? null,
    }));
    let plan: RolloverPlan;
    let reconciled = false;
    if (!saved) plan = propose(carried.sources, students, grades);
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
      takenCodes,
      sources: carried.sources.map((row) => ({
        id: row.id,
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        gradeId: row.gradeId,
        carrier: row.carrier,
        studentIds: row.studentIds,
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

/** Makes a class of its own in the target year from a plan's row. */
async function carryOwn(
  context: UnitContext,
  runs: OpenSpan,
  row: RolloverClass,
): Promise<string> {
  const { id } = await insertClass(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    runs,
    code: row.code,
    titleEn: row.titleEn || null,
    titleAr: row.titleAr || null,
    courseId: null,
    subjectId: null,
    gradeId: row.gradeId || null,
    locationId: row.locationId || null,
  });
  const positions = await descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "classroom_position",
    today: context.today,
  });
  await setClassTeachers(context.tx, {
    tenantId: context.tenantId,
    classId: id,
    orgId: context.schoolId,
    teacherIds: row.teacherId ? [row.teacherId] : [],
    from: runs.from,
    endsBefore: runs.to,
    positionId:
      positions.find((item) => item.meaning === "teacher_of_record")?.id ??
      null,
  });
  return id;
}

const staying = (outcome: RolloverStudent["outcome"]) =>
  outcome === "promote" || outcome === "retain";

/**
 * Creates the target year's classes and placements from the saved draft in
 * one transaction, and records departures for those who leave. Nothing of
 * the source year moves and no coursework is copied. Applying again,
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
    const students = await studentsAtYearEnd(tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      year: source,
    });
    const carried = await sourcesOf(context, source, []);
    const known = new Map(carried.sources.map((row) => [row.id, row]));
    const planned = new Set(plan.students.map((row) => row.studentId));
    if (
      plan.classes.some(
        (row) => known.get(row.sourceClassId)?.carrier !== row.carrier,
      ) ||
      students.length !== planned.size ||
      students.some((row) => !planned.has(row.studentId))
    )
      throw new ORPCError("CONFLICT", { message: "rollover.plan_stale" });
    const runs = daysOf(target);
    const carrierOf = new Map<string, RolloverCarrier>(
      carried.carriers.map((carrier) => [carrier.key, carrier]),
    );
    const created: RolloverOutcome["classes"] = [];
    const outcomeOf = new Map(
      plan.students.map((row) => [row.studentId, row.outcome]),
    );
    const following = new Map<string, string[]>();
    for (const row of plan.classes.filter((item) => item.include)) {
      const carrier = row.carrier ? carrierOf.get(row.carrier) : undefined;
      if (row.carrier && !carrier)
        throw new ORPCError("CONFLICT", { message: "rollover.plan_stale" });
      const made = carrier
        ? await carrier.carry(context, runs, row)
        : await carryOwn(context, runs, row).then((classId) => ({
            classId,
            classIds: [classId],
          }));
      for (const classId of made.classIds)
        await linkClass(tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          classId,
          yearId: target.id,
        });
      created.push({ key: row.key, classId: made.classId, code: row.code });
      if (!carrier && row.students)
        following.set(
          made.classId,
          (known.get(row.sourceClassId)?.studentIds ?? []).filter((studentId) =>
            followsClass(outcomeOf.get(studentId)),
          ),
        );
    }
    const classOf = new Map(created.map((row) => [row.key, row.classId]));
    const rowOf = new Map(plan.classes.map((row) => [row.key, row]));
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
    const byStudent = new Map(students.map((row) => [row.studentId, row]));
    const carriedGrade = new Map(
      plan.classes
        .filter((row) => !row.carrier && row.include && row.students)
        .flatMap((row) =>
          (known.get(row.sourceClassId)?.studentIds ?? []).map(
            (studentId) => [studentId, row.gradeId || null] as const,
          ),
        ),
    );
    let placed = 0;
    for (const student of plan.students) {
      const placement = byStudent.get(student.studentId);
      if (!placement || !staying(student.outcome)) continue;
      const row = rowOf.get(student.targetKey);
      const gradeId =
        (row?.gradeId || null) ??
        (student.outcome === "promote"
          ? carriedGrade.get(student.studentId)
          : null) ??
        placement.gradeId;
      if (gradeId)
        await place(tx, scope, {
          studentId: student.studentId,
          year: target,
          gradeId,
          from: target.startsOn,
          entryTypeId: continuing,
          source: "rollover",
        });
      placed += 1;
    }
    // Placed first, so joining a class does not place them again otherwise.
    for (const student of plan.students) {
      const classId = classOf.get(student.targetKey);
      const row = rowOf.get(student.targetKey);
      const carrier = row?.carrier ? carrierOf.get(row.carrier) : undefined;
      if (classId && carrier && staying(student.outcome))
        await carrier.join(context, {
          classId,
          studentId: student.studentId,
          from: runs.from,
          until: runs.to,
        });
    }
    for (const [classId, studentIds] of following)
      for (const studentId of studentIds)
        await enrolStudent(tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          classId,
          studentId,
          from: runs.from,
          endsBefore: runs.to,
          source: "rollover",
        });
    await joinedClasses(context, following, runs.from);
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
    // Those who leave or graduate leave on the source year's last day and
    // read their record, as their families do, until the new year begins.
    for (const row of plan.students) {
      if (row.outcome !== "leave" && row.outcome !== "graduate") continue;
      const placement = byStudent.get(row.studentId);
      if (!placement || (await departureOf(tx, scope, row.studentId))) continue;
      const leftOn = source.endsBefore;
      const ended = await endStudentEnrollmentsFrom(tx, scope, {
        studentId: row.studentId,
        on: leftOn,
      });
      await recordDeparture(tx, scope, {
        studentId: row.studentId,
        leftOn,
        accessEndsOn: target.startsOn > leftOn ? target.startsOn : leftOn,
        ended: {
          enrollments: ended.ended,
          dropped: ended.dropped,
          parts: {
            year: {
              placementId: placement.placementId,
              until: leftOn,
              dropped: [],
            },
          },
        },
      });
    }
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

/**
 * What the school asks a guardian of each child's next year, for the
 * children they decide for, while the question stands.
 */
export const asking = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "children:read");
  const studentIds = (
    await childrenOf(context.tx, scopeFor(context, "own"), context.actor.userId)
  )
    .filter((link) => link.visible)
    .map((link) => link.studentId);
  const [open, deciding, years] = await Promise.all([
    openReenrolments(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      studentIds,
      today: context.today,
    }),
    decidingGuardians(context.tx, {
      tenantId: context.tenantId,
      studentIds,
      today: context.today,
    }),
    schoolYears(context.tx, context.tenantId, context.schoolId),
  ]);
  return open.flatMap((row) => {
    const year = years.find((item) => item.id === row.yearId);
    const next = year ? yearAfter(years, year) : null;
    const decides = deciding.some(
      (item) =>
        item.studentId === row.studentId &&
        item.guardianId === context.actor.userId,
    );
    return next && decides
      ? [
          {
            studentId: row.studentId,
            intention: row.intention,
            titleEn: next.titleEn,
            titleAr: next.titleAr,
          },
        ]
      : [];
  });
});
