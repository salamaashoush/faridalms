import type { SchoolYear } from "@faridalms/database/stores/years";

import {
  classById,
  classDetail,
  ensureCourse,
  insertClass,
  retireClass,
  setClassTeachers,
  updateClass,
} from "@faridalms/database/stores/classes";
import { descriptorsFor } from "@faridalms/database/stores/descriptors";
import { dayIn } from "@faridalms/database/stores/years";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

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

/**
 * Creates or changes a homeroom with its subject classes and teachers. Teacher
 * changes take effect today (or on the year's first day), so the old teacher's
 * dates stay on record; a subject removed from the class retires its class.
 * The caller has checked the year is open.
 */
export async function writeHomeroom(
  context: UnitContext,
  year: SchoolYear,
  input: HomeroomInput,
): Promise<string> {
  const tx = context.tx;
  const from = dayIn(year, context.today);
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
    const existing = await classById(tx, context, input.id);
    if (
      !existing ||
      existing.classType !== "homeroom" ||
      existing.schoolYearId !== year.id
    )
      throw new ORPCError("NOT_FOUND");
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
  } else {
    const created = await insertClass(tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      schoolYearId: year.id,
      classType: "homeroom",
      code: input.code,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      courseId: null,
      homeroomClassId: null,
      subjectId: null,
      gradeId: input.gradeId || null,
      locationId: input.locationId || null,
    });
    homeroomId = created.id;
  }
  const homeroom = {
    id: homeroomId,
    classType: "homeroom" as const,
    schoolYearId: year.id,
  };
  await setClassTeachers(tx, {
    tenantId: context.tenantId,
    classRow: homeroom,
    orgId: context.schoolId,
    teacherIds: input.homeroomTeacherId ? [input.homeroomTeacherId] : [],
    from,
    endsBefore: year.endsBefore,
    positionId: teacherOfRecord,
  });
  const current =
    (await classDetail(tx, context, homeroomId, from))?.subjects ?? [];
  const wanted = new Set(input.subjects.map((row) => row.subjectId));
  for (const offering of current)
    if (!offering.subjectId || !wanted.has(offering.subjectId))
      await retireClass(tx, context.tenantId, offering.id, from);
  for (const subject of input.subjects) {
    const known = subjects.find((row) => row.id === subject.subjectId);
    if (!known)
      throw new ORPCError("BAD_REQUEST", {
        message: "class.subject_invalid",
      });
    let offering = current.find((row) => row.subjectId === subject.subjectId);
    if (!offering) {
      const courseId = await ensureCourse(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        subjectId: known.id,
        gradeId: input.gradeId || null,
        code: `${subjectCode(known.code)}-${input.code}`.slice(0, 40),
        titleEn: known.labelEn,
        titleAr: known.labelAr,
      });
      const created = await insertClass(tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        schoolYearId: year.id,
        classType: "scheduled",
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
        homeroomClassId: homeroomId,
        subjectId: known.id,
        gradeId: input.gradeId || null,
        locationId: null,
      });
      offering = {
        ...created,
        schoolYearId: year.id,
        classType: "scheduled",
        code: "",
        titleEn: null,
        titleAr: null,
        courseId,
        homeroomClassId: homeroomId,
        subjectId: known.id,
        gradeId: null,
        locationId: null,
        teachers: [],
      };
    }
    await setClassTeachers(tx, {
      tenantId: context.tenantId,
      classRow: {
        id: offering.id,
        classType: "scheduled",
        schoolYearId: year.id,
      },
      orgId: context.schoolId,
      teacherIds: subject.teacherIds,
      from,
      endsBefore: year.endsBefore,
      positionId: teacherOfRecord,
    });
  }
  return homeroomId;
}
