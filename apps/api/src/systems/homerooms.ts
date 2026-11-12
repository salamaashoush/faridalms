import { changeOf } from "@faridalms/database/audit";
import { teachersOf } from "@faridalms/database/stores/classes";
import {
  homeroomDirectory,
  homeroomsOfClasses,
  linkedClasses,
  memberships,
} from "@faridalms/database/stores/homerooms";
import {
  homeroomDirectoryInputSchema,
  leaveHomeroomSchema,
  ofClassSchema,
  placeSchema,
  saveHomeroomSchema,
} from "@faridalms/domain/homerooms";
import { addDays, dayWithin, spanHolds } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import {
  classViewOf,
  requireChangeable,
  saveClassParts,
  withClassColumns,
} from "../classes/points";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { reachesClass, requireStudent, scopeFor } from "../core/reach";
import {
  homeroomClass,
  leaveHomeroom,
  placeInHomeroom,
  writeHomeroom,
} from "../homerooms/write";

const id = v.pipe(v.string(), v.uuid());

/**
 * The school's homerooms, each with its teachers, size and subject classes:
 * those a module's view names, else those still running or yet to start,
 * or those ended.
 */
export const directory = readProcedure
  .input(homeroomDirectoryInputSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:read", "classes:manage");
    const view = await classViewOf(context, input.views);
    const on = view?.on ?? context.today;
    const rows = await homeroomDirectory(
      context.tx,
      scopeFor(context, "classes"),
      {
        on,
        classIds: view?.classIds ?? null,
        within: view?.within ?? null,
        ended: input.ended,
        q: input.q,
        locale: localeOf(context),
      },
    );
    return {
      on,
      ...(await withClassColumns(context, rows)),
      manage: can(context, "classes:manage") && !view?.settled,
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

/** How many of the homerooms running today have no teacher. */
export const unstaffed = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "classes:read", "classes:manage");
  const view = await classViewOf(context, {});
  const rows = await homeroomDirectory(
    context.tx,
    scopeFor(context, "school"),
    {
      on: view?.on ?? context.today,
      classIds: view?.classIds ?? null,
      ended: false,
      q: "",
      locale: "en",
    },
  );
  return { count: rows.filter((row) => row.teachers.length === 0).length };
});

export const save = writeProcedure
  .input(saveHomeroomSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage");
    const before = input.id ? await homeroomClass(context, input.id) : null;
    if (input.id && !before) throw new ORPCError("NOT_FOUND");
    if (before) await requireChangeable(context, before.id);
    const runs = {
      from: input.startsOn,
      to: input.endsOn ? addDays(input.endsOn, 1) : null,
    };
    const { homeroomId, classIds } = await writeHomeroom(context, runs, input);
    await saveClassParts(context, {
      classIds,
      runs,
      parts: input.parts,
      created: !before,
    });
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
        locationId: input.locationId || null,
        runs,
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
    await requireChangeable(context, homeroom.id);
    const from = input.from || dayWithin(homeroom.runs, context.today);
    if (!spanHolds(homeroom.runs, { from, to: addDays(from, 1) }))
      throw new ORPCError("BAD_REQUEST", {
        message: "enrollment.outside_class",
      });
    const placed = await placeInHomeroom(context, {
      studentId: input.studentId,
      homeroom,
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
    await requireChangeable(context, seat.classId);
    const on = input.on || dayWithin(seat, context.today);
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
      (row) =>
        row.from <= context.today &&
        (row.to === null || context.today < row.to),
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
