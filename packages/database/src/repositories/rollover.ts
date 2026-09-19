import type {
  ApplyRolloverInput,
  RolloverPlan,
  RolloverResult,
  RolloverStudent,
  SaveRolloverInput,
} from "@faridalms/domain/rollover";

import {
  rolloverPlanIssue,
  rolloverYearsIssue,
} from "@faridalms/domain/rollover";
import { addDays } from "@faridalms/domain/school";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

import type { Database, DatabaseTransaction } from "../index";

import { schema as s } from "../index";
import { ACADEMIC_STRUCTURE_LOCK } from "../locks";
import { ManagementError } from "./management";

type Executor = Database | DatabaseTransaction;

async function yearsFor(
  db: Executor,
  query: { sourceYearId: string; targetYearId: string },
) {
  const [source, target] = await Promise.all([
    db.query.schoolYears.findFirst({ where: { id: query.sourceYearId } }),
    db.query.schoolYears.findFirst({ where: { id: query.targetYearId } }),
  ]);
  if (!source || !target || source.id === target.id)
    throw new ManagementError("NOT_FOUND", "academic_year.not_found");
  return { source, target };
}

/** Students placed in a source class on the source year's last day, one placement each. */
async function studentsAtYearEnd(
  db: Executor,
  sourceYearId: string,
  endsOn: string,
) {
  const rows = await db
    .select({
      studentId: s.enrolments.studentId,
      classId: s.enrolments.classId,
      since: s.enrolments.since,
      firstName: s.students.firstName,
      lastName: s.students.lastName,
      reference: s.students.reference,
    })
    .from(s.enrolments)
    .innerJoin(s.classes, eq(s.classes.id, s.enrolments.classId))
    .innerJoin(s.students, eq(s.students.id, s.enrolments.studentId))
    .where(
      and(
        eq(s.classes.schoolYearId, sourceYearId),
        sql`${s.enrolments.since} <= ${endsOn}`,
        or(isNull(s.enrolments.until), gt(s.enrolments.until, endsOn)),
      ),
    );
  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const known = latest.get(row.studentId);
    if (!known || row.since > known.since) latest.set(row.studentId, row);
  }
  return [...latest.values()].toSorted(
    (a, b) =>
      a.lastName.localeCompare(b.lastName) ||
      a.firstName.localeCompare(b.firstName) ||
      a.studentId.localeCompare(b.studentId),
  );
}

function sourceClasses(db: Executor, sourceYearId: string) {
  return db.query.classes.findMany({
    where: { schoolYearId: sourceYearId },
    with: { classSubjects: { columns: { subjectId: true, teacherId: true } } },
    orderBy: { name: "asc" },
  });
}

/**
 * The plan to show: the saved draft brought up to date with who is enrolled
 * now, or a first proposal that carries every class over with its team and
 * promotes every student into the class that follows their own.
 */
export async function rolloverPreview(
  db: Database,
  query: { sourceYearId: string; targetYearId: string },
) {
  const { source, target } = await yearsFor(db, query);
  const [classes, students, saved, subjects] = await Promise.all([
    sourceClasses(db, source.id),
    studentsAtYearEnd(db, source.id, source.endsOn),
    db.query.yearRollovers.findFirst({
      where: { sourceYearId: source.id, targetYearId: target.id },
    }),
    db.query.subjects.findMany({
      columns: { id: true, name: true, nameAr: true },
      orderBy: { name: "asc" },
    }),
  ]);
  let plan: RolloverPlan;
  let reconciled = false;
  if (saved) {
    plan = saved.plan;
    if (saved.status === "draft") {
      const planned = new Map(plan.students.map((row) => [row.studentId, row]));
      const current = new Set(students.map((row) => row.studentId));
      const byClass = new Map(
        plan.classes.map((row) => [row.sourceClassId, row]),
      );
      const next: RolloverStudent[] = [];
      for (const student of students) {
        const kept = planned.get(student.studentId);
        if (kept) next.push(kept);
        else {
          reconciled = true;
          const row = byClass.get(student.classId);
          next.push({
            studentId: student.studentId,
            sourceClassId: student.classId,
            decision: "promote",
            targetKey: row?.include ? row.key : "",
          });
        }
      }
      if (plan.students.some((row) => !current.has(row.studentId)))
        reconciled = true;
      plan = { ...plan, students: next };
    }
  } else {
    const keys = new Map(classes.map((row) => [row.id, crypto.randomUUID()]));
    plan = {
      classes: classes.map((row) => ({
        key: keys.get(row.id) ?? crypto.randomUUID(),
        sourceClassId: row.id,
        include: true,
        name: row.name,
        grade: row.grade,
        stage: row.stage,
        room: row.room ?? "",
        homeroomTeacherId: row.homeroomTeacherId ?? "",
        subjects: row.classSubjects.map((subject) => ({
          subjectId: subject.subjectId,
          teacherId: subject.teacherId ?? "",
        })),
      })),
      students: students.map((row) => ({
        studentId: row.studentId,
        sourceClassId: row.classId,
        decision: "promote",
        targetKey: keys.get(row.classId) ?? "",
      })),
    };
  }
  return {
    source: {
      id: source.id,
      name: source.name,
      startsOn: source.startsOn,
      endsOn: source.endsOn,
      status: source.status,
    },
    target: {
      id: target.id,
      name: target.name,
      startsOn: target.startsOn,
      endsOn: target.endsOn,
      status: target.status,
    },
    status: saved?.status ?? "new",
    revision: saved?.revision ?? 0,
    reconciled,
    plan,
    result: saved?.result ?? null,
    issue: rolloverYearsIssue(source, target),
    lookups: {
      classes: classes.map((row) => ({ id: row.id, name: row.name })),
      students: students.map((row) => ({
        id: row.studentId,
        name: `${row.firstName} ${row.lastName}`,
        reference: row.reference,
      })),
      subjects: subjects.map((row) => ({
        id: row.id,
        name: row.name,
        nameAr: row.nameAr,
      })),
    },
  };
}

export async function saveRolloverPlan(db: Database, input: SaveRolloverInput) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const { source, target } = await yearsFor(tx, input);
    const yearsIssue = rolloverYearsIssue(source, target);
    if (yearsIssue)
      throw new ManagementError(
        yearsIssue === "academic_year.closed" ? "CONFLICT" : "BAD_REQUEST",
        yearsIssue,
      );
    const planIssue = rolloverPlanIssue(input.plan);
    if (planIssue) throw new ManagementError("BAD_REQUEST", planIssue);
    const [existing] = await tx
      .select()
      .from(s.yearRollovers)
      .where(
        and(
          eq(s.yearRollovers.sourceYearId, source.id),
          eq(s.yearRollovers.targetYearId, target.id),
        ),
      )
      .for("update");
    if (existing?.status === "applied")
      throw new ManagementError("CONFLICT", "rollover.applied");
    if ((existing?.revision ?? 0) !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "rollover.revision_conflict");
    if (!existing) {
      const [created] = await tx
        .insert(s.yearRollovers)
        .values({
          sourceYearId: source.id,
          targetYearId: target.id,
          plan: input.plan,
        })
        .returning({ revision: s.yearRollovers.revision });
      return { revision: created?.revision ?? 1 };
    }
    const [updated] = await tx
      .update(s.yearRollovers)
      .set({
        plan: input.plan,
        revision: existing.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(s.yearRollovers.id, existing.id))
      .returning({ revision: s.yearRollovers.revision });
    return { revision: updated?.revision ?? existing.revision + 1 };
  });
}

/**
 * Creates the target classes and placements from a saved plan in one
 * transaction. Source placements end the day after the source year; nothing
 * already recorded moves, and no coursework is copied. A second call after
 * success returns the recorded outcome instead of applying again.
 */
export async function applyRollover(
  db: Database,
  input: ApplyRolloverInput,
  actorId: string,
): Promise<RolloverResult> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(${ACADEMIC_STRUCTURE_LOCK})`,
    );
    const { source, target } = await yearsFor(tx, input);
    const [rollover] = await tx
      .select()
      .from(s.yearRollovers)
      .where(
        and(
          eq(s.yearRollovers.sourceYearId, source.id),
          eq(s.yearRollovers.targetYearId, target.id),
        ),
      )
      .for("update");
    if (!rollover) throw new ManagementError("NOT_FOUND", "rollover.not_saved");
    if (rollover.status === "applied" && rollover.result)
      return rollover.result;
    if (rollover.revision !== input.expectedRevision)
      throw new ManagementError("CONFLICT", "rollover.revision_conflict");
    const yearsIssue = rolloverYearsIssue(source, target);
    if (yearsIssue)
      throw new ManagementError(
        yearsIssue === "academic_year.closed" ? "CONFLICT" : "BAD_REQUEST",
        yearsIssue,
      );
    const { plan } = rollover;
    const planIssue = rolloverPlanIssue(plan);
    if (planIssue) throw new ManagementError("BAD_REQUEST", planIssue);

    const classes = await sourceClasses(tx, source.id);
    const sourceIds = new Set(classes.map((row) => row.id));
    if (plan.classes.some((row) => !sourceIds.has(row.sourceClassId)))
      throw new ManagementError("CONFLICT", "rollover.plan_stale");
    const enrolled = await studentsAtYearEnd(tx, source.id, source.endsOn);
    const planned = new Set(plan.students.map((row) => row.studentId));
    if (
      enrolled.length !== planned.size ||
      enrolled.some((row) => !planned.has(row.studentId))
    )
      throw new ManagementError("CONFLICT", "rollover.plan_stale");

    const included = plan.classes.filter((row) => row.include);
    const teacherIds = [
      ...new Set(
        included.flatMap((row) => [
          row.homeroomTeacherId,
          ...row.subjects.map((subject) => subject.teacherId),
        ]),
      ),
    ].filter(Boolean);
    if (teacherIds.length > 0) {
      const teachers = await tx.query.users.findMany({
        where: { id: { in: teacherIds }, role: "teacher", isActive: true },
        columns: { id: true },
      });
      if (teachers.length !== teacherIds.length)
        throw new ManagementError(
          "BAD_REQUEST",
          "management.teachers_inactive",
        );
    }
    const taken = await tx.query.classes.findMany({
      where: { schoolYearId: target.id },
      columns: { name: true },
    });
    const takenNames = new Set(
      taken.map((row) => row.name.trim().toLocaleLowerCase()),
    );
    if (
      included.some((row) =>
        takenNames.has(row.name.trim().toLocaleLowerCase()),
      )
    )
      throw new ManagementError("CONFLICT", "rollover.name_taken");

    const created: RolloverResult["classes"] = [];
    for (const row of included) {
      const [schoolClass] = await tx
        .insert(s.classes)
        .values({
          schoolYearId: target.id,
          name: row.name.trim(),
          grade: row.grade.trim(),
          stage: row.stage,
          room: row.room.trim() || null,
          homeroomTeacherId: row.homeroomTeacherId || null,
        })
        .returning({ id: s.classes.id, name: s.classes.name });
      if (!schoolClass) throw new Error("rollover.class_insert_failed");
      if (row.subjects.length > 0)
        await tx.insert(s.classSubjects).values(
          row.subjects.map((subject) => ({
            classId: schoolClass.id,
            subjectId: subject.subjectId,
            teacherId: subject.teacherId || null,
          })),
        );
      created.push({
        key: row.key,
        classId: schoolClass.id,
        name: schoolClass.name,
      });
    }
    const classFor = new Map(created.map((row) => [row.key, row.classId]));
    const placements = plan.students.flatMap((student) => {
      const classId = classFor.get(student.targetKey);
      return student.decision !== "withdraw" && classId
        ? [{ studentId: student.studentId, classId, since: target.startsOn }]
        : [];
    });
    if (placements.length > 0) await tx.insert(s.enrolments).values(placements);
    const dayAfter = addDays(source.endsOn, 1);
    if (plan.students.length > 0)
      await tx
        .update(s.enrolments)
        .set({ until: dayAfter, updatedAt: new Date() })
        .where(
          and(
            inArray(
              s.enrolments.studentId,
              plan.students.map((row) => row.studentId),
            ),
            inArray(s.enrolments.classId, [...sourceIds]),
            or(isNull(s.enrolments.until), gt(s.enrolments.until, dayAfter)),
          ),
        );
    const result: RolloverResult = {
      classes: created,
      enrolled: placements.length,
      withdrawn: plan.students.filter((row) => row.decision === "withdraw")
        .length,
    };
    await tx
      .update(s.yearRollovers)
      .set({
        status: "applied",
        result,
        appliedAt: new Date(),
        appliedById: actorId,
        updatedAt: new Date(),
      })
      .where(eq(s.yearRollovers.id, rollover.id));
    await tx.insert(s.schoolYearEvents).values({
      schoolYearId: target.id,
      actorId,
      action: "rolled_over",
      reason: source.name,
    });
    return result;
  });
}
