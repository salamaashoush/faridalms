import { changeOf } from "@faridalms/database/audit";
import {
  classById,
  classDetail,
  classDirectory,
  classesTaughtBy,
  classRoster,
  endStudentEnrollment,
  enrollmentHistory,
  enrolStudent,
  insertClass,
  roomsOf,
  setClassTeachers,
  updateClass,
} from "@faridalms/database/stores/classes";
import {
  addSchoolDescriptor,
  descriptorsFor,
  lockDescriptor,
  relabelDescriptor,
} from "@faridalms/database/stores/descriptors";
import { staffDirectory } from "@faridalms/database/stores/staff";
import { ensureStudentRole } from "@faridalms/database/stores/students";
import {
  classDirectoryInputSchema,
  classesMineSchema,
  classRecordSchema,
  enrolStudentSchema,
  saveClassSchema,
  saveSubjectSchema,
  withdrawStudentSchema,
} from "@faridalms/domain/classes";
import { addDays, dayWithin, spanHolds } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import {
  joinedClasses,
  moveClass,
  refuseOverRegisters,
} from "../classes/enrolment";
import { keepsGroups } from "../classes/group-access";
import {
  changeRefusal,
  classGroupsOf,
  classViewOf,
  endingRefusal,
  requireChangeable,
  saveClassParts,
  classFactsOf,
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
import { isStaff, reachesClass, requireStudent, scopeFor } from "../core/reach";
import { mayKeepArea } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

/** The choices the class forms offer. */
export const options = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "classes:read", "classes:manage");
  const load = (namespace: string) =>
    descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace,
      today: context.today,
    });
  const [subjects, rooms, staff] = await Promise.all([
    load("subject"),
    roomsOf(context.tx, context.tenantId, context.schoolId),
    staffDirectory(context.tx, scopeFor(context, "classes"), {
      q: "",
      phone: null,
      roles: [],
      sort: "name",
      dir: "asc",
      page: 1,
      pageSize: 500,
      locale: localeOf(context),
    }),
  ]);
  return {
    subjects,
    rooms,
    today: context.today,
    teachers: staff.rows.map((row) => ({
      id: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
      teaches: row.roles.includes("teacher") || row.roles.includes("aide"),
    })),
  };
});

/**
 * The school's classes, each with its teachers and size: those a module's
 * view names, else those still running or yet to start, or those ended.
 */
export const directory = readProcedure
  .input(classDirectoryInputSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:read", "classes:manage");
    const view = await classViewOf(context, input.views);
    const on = view?.on ?? context.today;
    const rows = await classDirectory(
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

/** The classes the viewer teaches or assists in, of those a module's view names if one does. */
export const mine = readProcedure
  .input(classesMineSchema)
  .handler(async ({ input, context }) => {
    const view = await classViewOf(context, input.views);
    const rows = await classesTaughtBy(context.tx, context, {
      userId: context.actor.userId,
      on: view?.on ?? context.today,
      classIds: view?.classIds ?? null,
    });
    const groups = await classGroupsOf(
      context,
      rows.map((row) => row.id),
    );
    return {
      rows: rows.map((row) => ({ ...row, group: groups.get(row.id) ?? null })),
    };
  });

/**
 * A class as the viewer may see it: its teachers and its students on the
 * date. Families see only their own child.
 */
export const record = readProcedure
  .input(classRecordSchema)
  .handler(async ({ input, context }) => {
    const found = await classById(context.tx, context, input.id);
    if (!found) throw new ORPCError("NOT_FOUND");
    const on = input.on || dayWithin(found.runs, context.today);
    if (!(await reachesClass(context, "classes", input.id, on)))
      throw new ORPCError("NOT_FOUND");
    const detail = await classDetail(context.tx, context, input.id, on);
    if (!detail) throw new ORPCError("NOT_FOUND");
    const roster = await classRoster(
      context.tx,
      scopeFor(context, "classes"),
      detail.id,
      on,
      !isStaff(context),
    );
    const changeable = !(await changeRefusal(context, detail.id));
    return {
      ...detail,
      on,
      today: context.today,
      ...(await classFactsOf(context, detail.id)),
      roster,
      access: {
        manage: can(context, "classes:manage") && changeable,
        enrol:
          (can(context, "classes:manage") || can(context, "people:manage")) &&
          changeable,
        staff: isStaff(context),
        files: await mayKeepArea(context, { type: "class", id: input.id }),
        groups: await keepsGroups(context, input.id),
      },
    };
  });

/** A student's classes over time, for the record's enrolment tab. */
export const history = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage", "classes:read");
    await requireStudent(context, "classes", input.studentId);
    const episodes = await enrollmentHistory(
      context.tx,
      context,
      input.studentId,
    );
    const locked = new Set<string>();
    for (const classId of new Set(episodes.map((row) => row.classId)))
      if (await changeRefusal(context, classId)) locked.add(classId);
    return episodes.map((row) => ({
      ...row,
      changeable: !locked.has(row.classId),
    }));
  });

export const save = writeProcedure
  .input(saveClassSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage");
    const before = input.id
      ? await classById(context.tx, context, input.id)
      : null;
    if (input.id && !before) throw new ORPCError("NOT_FOUND");
    if (before) await requireChangeable(context, before.id);
    if (input.subjectId) {
      const subjects = await descriptorsFor(context.tx, {
        tenantId: context.tenantId,
        schoolId: context.schoolId,
        namespace: "subject",
        today: context.today,
      });
      if (!subjects.some((row) => row.id === input.subjectId))
        throw new ORPCError("BAD_REQUEST", {
          message: "class.subject_invalid",
        });
    }
    const runs = {
      from: input.startsOn,
      to: input.endsOn ? addDays(input.endsOn, 1) : null,
    };
    const fields = {
      tenantId: context.tenantId,
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      subjectId: input.subjectId || null,
      locationId: input.locationId || null,
    };
    let classId: string;
    if (before) {
      const saved = await updateClass(context.tx, {
        ...fields,
        id: before.id,
        expectedVersion: input.expectedVersion ?? 0,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      classId = before.id;
      await saveClassParts(context, {
        classIds: [classId],
        runs,
        parts: input.parts,
        created: false,
      });
      await moveClass(context, classId, before.runs, runs);
    } else {
      classId = (
        await insertClass(context.tx, {
          ...fields,
          orgId: context.schoolId,
          runs,
          courseId: null,
        })
      ).id;
      await saveClassParts(context, {
        classIds: [classId],
        runs,
        parts: input.parts,
        created: true,
      });
    }
    const positions = await descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "classroom_position",
      today: context.today,
    });
    await setClassTeachers(context.tx, {
      tenantId: context.tenantId,
      classId,
      orgId: context.schoolId,
      teacherIds: input.teacherIds,
      from: before ? dayWithin(runs, context.today) : runs.from,
      endsBefore: runs.to,
      positionId:
        positions.find((row) => row.meaning === "teacher_of_record")?.id ??
        null,
    });
    await audit(context, {
      action: input.id ? "class.update" : "class.create",
      objectType: "class",
      objectId: classId,
      details: { code: input.code, teacherIds: input.teacherIds },
      change: changeOf("core.classes", before, {
        code: input.code,
        titleEn: input.titleEn || null,
        titleAr: input.titleAr || null,
        subjectId: input.subjectId || null,
        locationId: input.locationId || null,
        runs,
      }),
    });
    const saved = await classById(context.tx, context, classId);
    return { id: classId, version: saved?.version ?? 1 };
  });

/** Puts a student in a class from a date to the class's end, or on with it. */
export const enrol = writeProcedure
  .input(enrolStudentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "people:manage");
    await requireStudent(context, "classes", input.studentId);
    const target = await classById(context.tx, context, input.classId);
    if (!target) throw new ORPCError("NOT_FOUND");
    await requireChangeable(context, target.id);
    const from = input.from || dayWithin(target.runs, context.today);
    if (!spanHolds(target.runs, { from, to: addDays(from, 1) }))
      throw new ORPCError("BAD_REQUEST", {
        message: "enrollment.outside_class",
      });
    const enrollmentId = await enrolStudent(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classId: target.id,
      studentId: input.studentId,
      from,
      endsBefore: target.runs.to,
    });
    await ensureStudentRole(
      context.tx,
      scopeFor(context, "classes"),
      input.studentId,
      from,
    );
    await joinedClasses(
      context,
      new Map([[target.id, [input.studentId]]]),
      from,
    );
    await audit(context, {
      action: "enrollment.create",
      objectType: "enrollment",
      objectId: enrollmentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { classId: target.id, from },
      change: changeOf("core.enrollments", null, { classId: target.id }),
    });
    return { id: enrollmentId, moved: false };
  });

/** Takes a student out of a class from a date; the enrollment keeps its past days. */
export const withdraw = writeProcedure
  .input(withdrawStudentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "people:manage");
    await requireStudent(context, "classes", input.studentId);
    const episodes = await enrollmentHistory(
      context.tx,
      context,
      input.studentId,
    );
    const episode = episodes.find((row) => row.id === input.enrollmentId);
    if (!episode) throw new ORPCError("NOT_FOUND");
    await requireChangeable(context, episode.classId);
    const refusal = await endingRefusal(context, {
      id: episode.id,
      classId: episode.classId,
      userId: input.studentId,
      source: episode.source,
    });
    if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
    const on = input.on || dayWithin(episode, context.today);
    if (on < episode.from || (episode.to !== null && on >= episode.to))
      throw new ORPCError("BAD_REQUEST", {
        message: "enrollment.outside_dates",
      });
    await refuseOverRegisters(context, {
      studentId: input.studentId,
      classIds: [episode.classId],
      from: on,
    });
    const ended = await endStudentEnrollment(context.tx, {
      tenantId: context.tenantId,
      id: input.enrollmentId,
      expectedVersion: input.expectedVersion,
      on,
    });
    if (!ended)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "enrollment.end",
      objectType: "enrollment",
      objectId: input.enrollmentId,
      subjectUserId: input.studentId,
      studentUserId: input.studentId,
      details: { classId: episode.classId, on },
    });
    return { ended: true };
  });

/** The subjects the school teaches, as it labels them. */
export const subjects = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "classes:read", "classes:manage", "school:manage");
  const rows = await descriptorsFor(context.tx, {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    namespace: "subject",
    today: context.today,
  });
  return {
    rows,
    manage: can(context, "classes:manage") || can(context, "school:manage"),
  };
});

export const saveSubject = writeProcedure
  .input(saveSubjectSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "school:manage");
    const fields = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      labelEn: input.labelEn,
      labelAr: input.labelAr,
      color: input.color || null,
    };
    if (input.id) {
      await lockDescriptor(context.tx, {
        tenantId: context.tenantId,
        descriptorId: input.id,
      });
      const known = (
        await descriptorsFor(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          namespace: "subject",
          today: context.today,
          includeRetired: true,
        })
      ).find((row) => row.id === input.id);
      if (!known) throw new ORPCError("NOT_FOUND");
      if (
        (known.labelEn ?? "") !== input.expected?.labelEn ||
        (known.labelAr ?? "") !== input.expected.labelAr
      )
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      await relabelDescriptor(context.tx, {
        ...fields,
        descriptorId: input.id,
      });
      await audit(context, {
        action: "subject.update",
        objectType: "descriptor",
        objectId: input.id,
        change: changeOf("core.descriptors", known, {
          labelEn: input.labelEn,
          labelAr: input.labelAr,
          color: input.color || null,
        }),
      });
      return { id: input.id };
    }
    const created = await addSchoolDescriptor(context.tx, {
      ...fields,
      namespace: "subject",
      code: input.code,
    });
    await audit(context, {
      action: "subject.create",
      objectType: "descriptor",
      objectId: created,
    });
    return { id: created };
  });
