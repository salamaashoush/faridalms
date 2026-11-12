import { changeOf } from "@faridalms/database/audit";
import { teachersOf } from "@faridalms/database/stores/classes";
import {
  homeroomDirectory,
  homeroomsOfClasses,
  linkedClasses,
  memberships,
} from "@faridalms/database/stores/homerooms";
import {
  dayIn,
  holdYear,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  homeroomDirectorySchema,
  leaveHomeroomSchema,
  ofClassSchema,
  placeSchema,
  saveHomeroomSchema,
} from "@faridalms/domain/homerooms";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reachesClass, requireStudent, scopeFor } from "../core/reach";
import { yearOf } from "../core/years";
import {
  homeroomClass,
  leaveHomeroom,
  placeInHomeroom,
  writeHomeroom,
} from "../homerooms/write";

const id = v.pipe(v.string(), v.uuid());

async function openYear(context: UnitContext, yearId: string) {
  const { year } = await yearOf(context, yearId);
  if (!year) throw new ORPCError("NOT_FOUND");
  const lifecycle = await holdYear(context.tx, context.tenantId, year.id);
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
  return year;
}

/** The homerooms of a year, each with its teachers, size and subject classes. */
export const directory = readProcedure
  .input(homeroomDirectorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:read", "classes:manage");
    const { year } = await yearOf(context, input.year);
    if (!year) return { yearId: null, rows: [], manage: false };
    const rows = await homeroomDirectory(
      context.tx,
      scopeFor(context, "classes"),
      {
        yearId: year.id,
        on: dayIn(year, context.today),
        q: input.q,
        gradeIds: input.grade,
        locale: localeOf(context),
      },
    );
    return {
      yearId: year.id,
      rows,
      manage: can(context, "classes:manage") && year.lifecycle !== "closed",
    };
  });

/**
 * A class as its homeroom sees it: a homeroom with its subject classes, or
 * a subject class with the homeroom it is taught to.
 */
export const ofClass = readProcedure
  .input(ofClassSchema)
  .handler(async ({ input, context }) => {
    const on = input.on || context.today;
    if (!(await reachesClass(context, "classes", input.classId, on)))
      throw new ORPCError("NOT_FOUND");
    const of = (
      await homeroomsOfClasses(context.tx, context.tenantId, [input.classId])
    ).get(input.classId);
    if (!of) return { kind: "none" as const };
    if (!of.own)
      return {
        kind: "subject" as const,
        homeroom: {
          id: of.homeroomClassId,
          code: of.code,
          titleEn: of.titleEn,
          titleAr: of.titleAr,
        },
      };
    const subjects = await linkedClasses(context.tx, context, input.classId);
    const teachers = await teachersOf(
      context.tx,
      context.tenantId,
      subjects.map((row) => row.id),
      on,
    );
    return {
      kind: "homeroom" as const,
      subjects: subjects.map((row) => ({
        id: row.id,
        code: row.code,
        titleEn: row.titleEn,
        titleAr: row.titleAr,
        subjectId: row.subjectId,
        teachers: teachers.get(row.id) ?? [],
      })),
    };
  });

/** How many of the working year's homerooms have no teacher today. */
export const unstaffed = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "classes:read", "classes:manage");
  const year = workingYear(
    await schoolYears(context.tx, context.tenantId, context.schoolId),
    context.today,
  );
  if (!year) return { count: 0 };
  const rows = await homeroomDirectory(
    context.tx,
    scopeFor(context, "school"),
    {
      yearId: year.id,
      on: context.today,
      q: "",
      gradeIds: [],
      locale: "en",
    },
  );
  return { count: rows.filter((row) => row.teachers.length === 0).length };
});

export const save = writeProcedure
  .input(saveHomeroomSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage");
    const year = await openYear(context, input.yearId);
    const before = input.id ? await homeroomClass(context, input.id) : null;
    const homeroomId = await writeHomeroom(context, year, input);
    await audit(context, {
      action: input.id ? "class.update" : "class.create",
      objectType: "class",
      objectId: homeroomId,
      details: {
        code: input.code,
        subjects: input.subjects.map((row) => row.subjectId),
        homeroomTeacherId: input.homeroomTeacherId || null,
      },
      change: changeOf("core.classes", before, {
        code: input.code,
        titleEn: input.titleEn || null,
        titleAr: input.titleAr || null,
        gradeId: input.gradeId || null,
        locationId: input.locationId || null,
      }),
    });
    const saved = await homeroomClass(context, homeroomId);
    return { id: homeroomId, version: saved?.version ?? 1 };
  });

/**
 * Puts a student in a homeroom from a date: a current homeroom ends that
 * day, so a move leaves both on record.
 */
export const place = writeProcedure
  .input(placeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "people:manage");
    await requireStudent(context, "classes", input.studentId);
    const homeroom = await homeroomClass(context, input.classId);
    if (!homeroom) throw new ORPCError("NOT_FOUND");
    const year = await openYear(context, homeroom.schoolYearId);
    const from = input.from || dayIn(year, context.today);
    if (from < year.startsOn || from >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", {
        message: "enrollment.outside_year",
      });
    const placed = await placeInHomeroom(context, {
      studentId: input.studentId,
      homeroom,
      year,
      from,
      source: "manual",
    });
    await audit(context, {
      action: placed.movedFrom ? "enrollment.move" : "enrollment.create",
      objectType: "enrollment",
      objectId: placed.enrollmentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { classId: homeroom.id, from },
      change: changeOf(
        "core.enrollments",
        placed.movedFrom === null ? null : { classId: placed.movedFrom },
        { classId: homeroom.id },
      ),
    });
    return { id: placed.enrollmentId, moved: placed.movedFrom !== null };
  });

/** Takes a student out of their homeroom from a date; the days before stay. */
export const leave = writeProcedure
  .input(leaveHomeroomSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "people:manage");
    await requireStudent(context, "classes", input.studentId);
    const seat = (await memberships(context.tx, context, input.studentId)).find(
      (row) => row.enrollmentId === input.enrollmentId,
    );
    if (!seat) throw new ORPCError("NOT_FOUND");
    const year = await openYear(context, seat.schoolYearId);
    const on = input.on || dayIn(year, context.today);
    const classId = await leaveHomeroom(context, { ...input, on });
    await audit(context, {
      action: "enrollment.end",
      objectType: "enrollment",
      objectId: input.enrollmentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { classId, on },
    });
    return { ended: true };
  });

/** A student's places in the school's homerooms over time, with the teachers of the current one. */
export const history = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage", "classes:read");
    await requireStudent(context, "classes", input.studentId);
    const rows = await memberships(context.tx, context, input.studentId);
    const current = rows.find(
      (row) => row.from <= context.today && context.today < row.to,
    );
    const teachers = current
      ? (
          (
            await teachersOf(
              context.tx,
              context.tenantId,
              [current.classId],
              context.today,
            )
          ).get(current.classId) ?? []
        ).filter((teacher) => teacher.role === "teacher")
      : [];
    return { rows, teachers };
  });
