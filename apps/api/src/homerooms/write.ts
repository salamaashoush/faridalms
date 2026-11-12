import type { ClassRow } from "@faridalms/database/stores/classes";
import type { OpenSpan } from "@faridalms/domain/school";

import {
  classById,
  endEnrollment,
  endStudentEnrollment,
  ensureCourse,
  insertClass,
  retireClass,
  setClassTeachers,
  updateClass,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import {
  addHomeroom,
  followHomeroom,
  homeroomsOfClasses,
  linkClass,
  linkedClasses,
  memberships,
  placeMember,
  unlinkClass,
} from "@faridalms/database/stores/homerooms";
import { dayWithin } from "@faridalms/domain/school";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  joinedClasses,
  moveClass,
  refuseOverRegisters,
} from "../classes/enrolment";

function subjectCode(code: string) {
  return (
    code
      .replace(/[^A-Za-z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6) || "SUBJ"
  );
}

export interface HomeroomInput {
  id?: string;
  expectedVersion?: number;
  code: string;
  titleEn: string | null;
  titleAr: string | null;
  gradeId: string;
  locationId: string;
  homeroomTeacherId: string;
  subjects: { subjectId: string; teacherIds: string[] }[];
}

/** The homeroom class itself, or null for any other class. */
export async function homeroomClass(
  context: UnitContext,
  classId: string,
): Promise<ClassRow | null> {
  const [row, of] = await Promise.all([
    classById(context.tx, context, classId),
    homeroomsOfClasses(context.tx, context.tenantId, [classId]),
  ]);
  return row && of.get(classId)?.own ? row : null;
}

/** Writes a homeroom's subject classes again from its places and gives the joiners their open work. */
export async function follow(
  context: UnitContext,
  homeroomClassId: string,
  from: string,
) {
  await joinedClasses(
    context,
    await followHomeroom(context.tx, {
      tenantId: context.tenantId,
      homeroomClassId,
    }),
    from,
  );
}

/**
 * Creates or changes a homeroom with its subject classes and teachers, all
 * running over the homeroom's days. Teacher changes take effect today (or
 * on the homeroom's first day), so the old teacher's dates stay on record;
 * a subject removed from the homeroom retires its class, and one added
 * joins it from that day. Answers the homeroom and every class it keeps.
 */
export async function writeHomeroom(
  context: UnitContext,
  runs: OpenSpan,
  input: HomeroomInput,
): Promise<{ homeroomId: string; classIds: string[] }> {
  const tx = context.tx;
  const from = dayWithin(runs, context.today);
  const [subjects, positions] = await Promise.all([
    descriptorsFor(tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "subject",
      today: context.today,
      includeRetired: true,
    }),
    descriptorsFor(tx, {
      tenantId: context.tenantId,
      schoolId: context.schoolId,
      namespace: "classroom_position",
      today: context.today,
    }),
  ]);
  const teacherOfRecord =
    positions.find((row) => row.meaning === "teacher_of_record")?.id ?? null;
  let homeroomId: string;
  if (input.id) {
    const existing = await homeroomClass(context, input.id);
    if (!existing) throw new ORPCError("NOT_FOUND");
    const saved = await updateClass(tx, {
      tenantId: context.tenantId,
      id: input.id,
      expectedVersion: input.expectedVersion ?? 0,
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      gradeId: input.gradeId || null,
      locationId: input.locationId || null,
    });
    if (!saved)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    homeroomId = input.id;
    await moveClass(context, homeroomId, existing.runs, runs);
    for (const offering of await linkedClasses(tx, context, homeroomId)) {
      const before = await classById(tx, context, offering.id);
      if (before) await moveClass(context, offering.id, before.runs, runs);
    }
  } else {
    const created = await insertClass(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      runs,
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      courseId: null,
      subjectId: null,
      gradeId: input.gradeId || null,
      locationId: input.locationId || null,
    });
    homeroomId = created.id;
    await addHomeroom(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      classId: homeroomId,
    });
  }
  await setClassTeachers(tx, {
    tenantId: context.tenantId,
    classId: homeroomId,
    orgId: context.schoolId,
    teacherIds: input.homeroomTeacherId ? [input.homeroomTeacherId] : [],
    from,
    endsBefore: runs.to,
    positionId: teacherOfRecord,
  });
  const current = await linkedClasses(tx, context, homeroomId);
  const wanted = new Set(input.subjects.map((row) => row.subjectId));
  for (const offering of current)
    if (!offering.subjectId || !wanted.has(offering.subjectId)) {
      await retireClass(tx, context.tenantId, offering.id, from);
      await unlinkClass(tx, {
        tenantId: context.tenantId,
        classId: offering.id,
      });
    }
  for (const subject of input.subjects) {
    const known = subjects.find((row) => row.id === subject.subjectId);
    if (!known)
      throw new ORPCError("BAD_REQUEST", {
        message: "class.subject_invalid",
      });
    let offeringId = current.find(
      (row) => row.subjectId === subject.subjectId,
    )?.id;
    if (!offeringId) {
      const courseId = await ensureCourse(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        subjectId: known.id,
        gradeId: input.gradeId || null,
        code: `${subjectCode(known.code)}-${input.code}`.slice(0, 40),
        titleEn: known.labelEn,
        titleAr: known.labelAr,
      });
      offeringId = (
        await insertClass(tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          runs,
          code: `${input.code}-${subjectCode(known.code)}`.slice(0, 40),
          titleEn:
            input.titleEn && known.labelEn
              ? `${input.titleEn} ${known.labelEn}`
              : known.labelEn,
          titleAr:
            input.titleAr && known.labelAr
              ? `${input.titleAr} ${known.labelAr}`
              : known.labelAr,
          courseId,
          subjectId: known.id,
          gradeId: input.gradeId || null,
          locationId: null,
        })
      ).id;
      await linkClass(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        homeroomClassId: homeroomId,
        classId: offeringId,
        linkedOn: from,
      });
    }
    await setClassTeachers(tx, {
      tenantId: context.tenantId,
      classId: offeringId,
      orgId: context.schoolId,
      teacherIds: subject.teacherIds,
      from,
      endsBefore: runs.to,
      positionId: teacherOfRecord,
    });
  }
  await follow(context, homeroomId, from);
  return { homeroomId, classIds: await classesOf(context, homeroomId) };
}

/** The classes a member of the homeroom sits in: the homeroom and its subject classes. */
async function classesOf(context: UnitContext, homeroomClassId: string) {
  return [
    homeroomClassId,
    ...(await linkedClasses(context.tx, context, homeroomClassId)).map(
      (row) => row.id,
    ),
  ];
}

/**
 * Puts a student in a homeroom from a date. A current place ends that day,
 * so a move leaves both on record; a place already due to start after the
 * date, while the new one would still run, must be dealt with first. One
 * due after the homeroom ends (next year's, say) stays as it is.
 */
export async function placeInHomeroom(
  context: UnitContext,
  input: {
    studentId: string;
    homeroom: ClassRow;
    from: string;
    source: "manual" | "rollover";
  },
): Promise<{ enrollmentId: string; movedFrom: string | null }> {
  const held = (await memberships(context.tx, context, input.studentId)).filter(
    (row) => row.to === null || row.to > input.from,
  );
  const until = input.homeroom.runs.to;
  if (
    held.some(
      (row) => row.from > input.from && (until === null || row.from < until),
    )
  )
    throw new ORPCError("CONFLICT", {
      message: "enrollment.future_placement",
    });
  const current = held.find((row) => row.from <= input.from);
  if (current?.classId === input.homeroom.id)
    return { enrollmentId: current.enrollmentId, movedFrom: null };
  if (current) {
    await refuseOverRegisters(context, {
      studentId: input.studentId,
      classIds: await classesOf(context, current.classId),
      from: input.from,
    });
    await endEnrollment(context.tx, {
      tenantId: context.tenantId,
      id: current.enrollmentId,
      starts: current.from,
      on: input.from,
    });
    await follow(context, current.classId, input.from);
  }
  const enrollmentId = await placeMember(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    homeroomClassId: input.homeroom.id,
    studentId: input.studentId,
    from: input.from,
    endsBefore: input.homeroom.runs.to,
    source: input.source,
  });
  await joinedClasses(
    context,
    new Map([[input.homeroom.id, [input.studentId]]]),
    input.from,
  );
  await follow(context, input.homeroom.id, input.from);
  return { enrollmentId, movedFrom: current?.classId ?? null };
}

/** Takes a student out of their homeroom from a date; the days before stay. */
export async function leaveHomeroom(
  context: UnitContext,
  input: {
    studentId: string;
    enrollmentId: string;
    expectedVersion: number;
    on: string;
  },
): Promise<string> {
  const seat = (await memberships(context.tx, context, input.studentId)).find(
    (row) => row.enrollmentId === input.enrollmentId,
  );
  if (!seat) throw new ORPCError("NOT_FOUND");
  if (input.on < seat.from || (seat.to !== null && input.on >= seat.to))
    throw new ORPCError("BAD_REQUEST", {
      message: "enrollment.outside_dates",
    });
  await refuseOverRegisters(context, {
    studentId: input.studentId,
    classIds: await classesOf(context, seat.classId),
    from: input.on,
  });
  const ended = await endStudentEnrollment(context.tx, {
    tenantId: context.tenantId,
    id: input.enrollmentId,
    expectedVersion: input.expectedVersion,
    on: input.on,
  });
  if (!ended) throw new ORPCError("CONFLICT", { message: "conflict.version" });
  await follow(context, seat.classId, input.on);
  return seat.classId;
}
