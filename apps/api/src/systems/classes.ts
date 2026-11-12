import type { SchoolYear } from "@faridalms/database/stores/years";

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
import { calendarFor, place } from "@faridalms/database/stores/students";
import {
  dayIn,
  holdYear,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import {
  classDirectorySchema,
  classRecordSchema,
  classYearSchema,
  enrolStudentSchema,
  saveClassSchema,
  saveSubjectSchema,
  withdrawStudentSchema,
} from "@faridalms/domain/classes";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import { joinedClasses, refuseOverRegisters } from "../classes/enrolment";
import { classGroupsOf, endingRefusal } from "../classes/points";
import {
  audit,
  can,
  localeOf,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { isStaff, reachesClass, requireStudent, scopeFor } from "../core/reach";
import { yearOf } from "../core/years";
import { mayKeepArea } from "../files/authorize";

const id = v.pipe(v.string(), v.uuid());

async function requireOpen(context: UnitContext, year: SchoolYear) {
  const lifecycle = await holdYear(context.tx, context.tenantId, year.id);
  if (!lifecycle) throw new ORPCError("NOT_FOUND");
  if (lifecycle === "closed")
    throw new ORPCError("CONFLICT", { message: "school_year.closed" });
}

function yearView(year: SchoolYear) {
  return {
    id: year.id,
    titleEn: year.titleEn,
    titleAr: year.titleAr,
    startsOn: year.startsOn,
    endsBefore: year.endsBefore,
    lifecycle: year.lifecycle,
  };
}

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
  const [grades, subjects, rooms, years, staff] = await Promise.all([
    load("grade_level"),
    load("subject"),
    roomsOf(context.tx, context.tenantId, context.schoolId),
    schoolYears(context.tx, context.tenantId, context.schoolId),
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
    grades,
    subjects,
    rooms,
    years: years.map(yearView),
    workingYearId: workingYear(years, context.today)?.id ?? null,
    teachers: staff.rows.map((row) => ({
      id: row.id,
      fullNameEn: row.fullNameEn,
      fullNameAr: row.fullNameAr,
      teaches: row.roles.includes("teacher") || row.roles.includes("aide"),
    })),
  };
});

/** The classes of a year, each with its teachers and size. */
export const directory = readProcedure
  .input(classDirectorySchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:read", "classes:manage");
    const { year } = await yearOf(context, input.year);
    if (!year) return { year: null, rows: [], manage: false };
    const rows = await classDirectory(
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
      year: yearView(year),
      rows,
      manage: can(context, "classes:manage") && year.lifecycle !== "closed",
    };
  });

/** The classes the viewer teaches or assists in a year. */
export const mine = readProcedure
  .input(classYearSchema)
  .handler(async ({ input, context }) => {
    const { year } = await yearOf(context, input.year);
    if (!year) return { year: null, rows: [] };
    const rows = await classesTaughtBy(context.tx, context, {
      userId: context.actor.userId,
      yearId: year.id,
      on: dayIn(year, context.today),
    });
    const groups = await classGroupsOf(
      context,
      rows.map((row) => row.id),
    );
    return {
      year: yearView(year),
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
    const { year } = await yearOf(context, found.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    const on = input.on || dayIn(year, context.today);
    const scope = scopeFor(context, "classes");
    if (!(await reachesClass(context, "classes", input.id, on)))
      throw new ORPCError("NOT_FOUND");
    const detail = await classDetail(context.tx, context, input.id, on);
    if (!detail) throw new ORPCError("NOT_FOUND");
    const staffViewer = isStaff(context);
    const roster = await classRoster(
      context.tx,
      scope,
      detail.id,
      on,
      !staffViewer,
    );
    return {
      ...detail,
      year: yearView(year),
      on,
      roster,
      access: {
        manage: can(context, "classes:manage") && year.lifecycle !== "closed",
        enrol:
          (can(context, "classes:manage") || can(context, "people:manage")) &&
          year.lifecycle !== "closed",
        staff: staffViewer,
        files: await mayKeepArea(context, { type: "class", id: input.id }),
      },
    };
  });

/** A student's classes over time, for the record's enrolment tab. */
export const history = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage", "classes:read");
    await requireStudent(context, "classes", input.studentId);
    return enrollmentHistory(context.tx, context, input.studentId);
  });

export const save = writeProcedure
  .input(saveClassSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage");
    const { year } = await yearOf(context, input.yearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    await requireOpen(context, year);
    const before = input.id
      ? await classById(context.tx, context, input.id)
      : null;
    if (input.id && before?.schoolYearId !== year.id)
      throw new ORPCError("NOT_FOUND");
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
    const fields = {
      tenantId: context.tenantId,
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      subjectId: input.subjectId || null,
      gradeId: input.gradeId || null,
      locationId: input.locationId || null,
    };
    let classId: string;
    if (input.id) {
      const saved = await updateClass(context.tx, {
        ...fields,
        id: input.id,
        expectedVersion: input.expectedVersion ?? 0,
      });
      if (!saved)
        throw new ORPCError("CONFLICT", { message: "conflict.version" });
      classId = input.id;
    } else
      classId = (
        await insertClass(context.tx, {
          ...fields,
          orgId: context.schoolId,
          schoolYearId: year.id,
          courseId: null,
        })
      ).id;
    const positions = await descriptorsFor(context.tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "classroom_position",
      today: context.today,
    });
    await setClassTeachers(context.tx, {
      tenantId: context.tenantId,
      classRow: { id: classId, schoolYearId: year.id },
      orgId: context.schoolId,
      teacherIds: input.teacherIds,
      from: dayIn(year, context.today),
      endsBefore: year.endsBefore,
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
        gradeId: input.gradeId || null,
        locationId: input.locationId || null,
      }),
    });
    const saved = await classById(context.tx, context, classId);
    return { id: classId, version: saved?.version ?? 1 };
  });

/** Puts a student in a class from a date to the end of its year. */
export const enrol = writeProcedure
  .input(enrolStudentSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "classes:manage", "people:manage");
    await requireStudent(context, "classes", input.studentId);
    const target = await classById(context.tx, context, input.classId);
    if (!target) throw new ORPCError("NOT_FOUND");
    const { year } = await yearOf(context, target.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    await requireOpen(context, year);
    const from = input.from || dayIn(year, context.today);
    if (from < year.startsOn || from >= year.endsBefore)
      throw new ORPCError("BAD_REQUEST", {
        message: "enrollment.outside_year",
      });
    const enrollmentId = await enrolStudent(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classRow: target,
      studentId: input.studentId,
      from,
      endsBefore: year.endsBefore,
    });
    await joinedClasses(context, new Map([[target.id, [input.studentId]]]));
    if (target.gradeId)
      await place(context.tx, scopeFor(context, "classes"), {
        studentId: input.studentId,
        year,
        gradeId: target.gradeId,
        calendarId: await calendarFor(context.tx, context.tenantId, year.id),
        from,
      });
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
    const { year } = await yearOf(context, episode.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    await requireOpen(context, year);
    const refusal = await endingRefusal(context, {
      id: episode.id,
      classId: episode.classId,
      userId: input.studentId,
      source: episode.source,
    });
    if (refusal) throw new ORPCError("CONFLICT", { message: refusal });
    const on = input.on || dayIn(year, context.today);
    if (on < episode.from || on >= episode.to)
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
