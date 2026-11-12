import { classesHolding } from "@faridalms/database/stores/class-grades";
import {
  addSchoolDescriptor,
  lockDescriptor,
  placeDescriptor,
  relabelDescriptor,
} from "@faridalms/database/stores/descriptors";
import {
  gradeHistory,
  studentsHolding,
} from "@faridalms/database/stores/student-grades";
import {
  orderGradeLevelsSchema,
  retireGradeLevelSchema,
  saveGradeLevelSchema,
  setStudentGradeSchema,
} from "@faridalms/domain/grade-levels";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";
import { requireStudent } from "../core/reach";
import { changeStudentGrade } from "../grade-levels/contributions";
import { gradesOf, labelOf } from "../grade-levels/levels";

const id = v.pipe(v.string(), v.uuid());

/** Every grade the school has had, in its order, each saying whether it is still in use. */
async function levels(context: UnitContext) {
  const [all, current] = await Promise.all([
    gradesOf(context, null),
    gradesOf(context, context.today),
  ]);
  return all.map((row) => ({
    id: row.id,
    code: row.code,
    meaning: row.meaning,
    labelEn: row.labelEn,
    labelAr: row.labelAr,
    retired: !current.some((each) => each.id === row.id),
  }));
}

/** The school's grades or levels, for the forms and lists that name them. */
export const options = readProcedure.handler(async ({ context }) => ({
  grades: await levels(context),
  today: context.today,
}));

/** A student's grades over time, latest last. */
export const student = readProcedure
  .input(v.object({ studentId: id }))
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:read", "people:manage");
    await requireStudent(context, "people", input.studentId);
    const [rows, grades] = await Promise.all([
      gradeHistory(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        studentId: input.studentId,
      }),
      gradesOf(context, null),
    ]);
    return {
      today: context.today,
      manage: can(context, "people:manage"),
      rows: rows.map((row) => ({
        id: row.id,
        from: row.from,
        until: row.until,
        source: row.source,
        grade: labelOf(grades, row.gradeId),
      })),
    };
  });

/** Puts a student in a grade from a day; a change already set for later stands. */
export const setStudentGrade = writeProcedure
  .input(setStudentGradeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "people:manage");
    await requireStudent(context, "people", input.studentId);
    if (
      !(await gradesOf(context, context.today)).some(
        (row) => row.id === input.gradeId,
      )
    )
      throw new ORPCError("BAD_REQUEST", { message: "grade_level.unknown" });
    return {
      changed: await changeStudentGrade(context, {
        ...input,
        source: "manual",
      }),
    };
  });

/** The school's grades for its settings, with how many classes and students hold each from today. */
export const settings = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  const scope = {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    from: context.today,
  };
  const [rows, classes, students] = await Promise.all([
    levels(context),
    classesHolding(context.tx, scope),
    studentsHolding(context.tx, scope),
  ]);
  return {
    rows: rows.map((row) => ({
      ...row,
      classes: classes.get(row.id) ?? 0,
      students: students.get(row.id) ?? 0,
    })),
  };
});

/** Adds a grade or level of the school's own, last in its order, or renames one. */
export const save = writeProcedure
  .input(saveGradeLevelSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const fields = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      labelEn: input.labelEn,
      labelAr: input.labelAr,
      color: null,
    };
    if (input.id) {
      await lockDescriptor(context.tx, {
        tenantId: context.tenantId,
        descriptorId: input.id,
      });
      const known = (await levels(context)).find((row) => row.id === input.id);
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
        action: "grade_level.update",
        objectType: "descriptor",
        objectId: input.id,
        details: { labelEn: input.labelEn, labelAr: input.labelAr },
      });
      return { id: input.id };
    }
    const all = await levels(context);
    if (all.some((row) => row.code === input.code))
      throw new ORPCError("CONFLICT", { message: "grade_level.code_taken" });
    const created = await addSchoolDescriptor(context.tx, {
      ...fields,
      namespace: "grade_level",
      code: input.code ?? "",
    });
    await placeDescriptor(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      descriptorId: created,
      sortOrder: all.length * 10,
    });
    await audit(context, {
      action: "grade_level.create",
      objectType: "descriptor",
      objectId: created,
      details: { code: input.code, labelEn: input.labelEn },
    });
    return { id: created };
  });

/** Puts the school's grades in the order given, which lists and the next grade follow. */
export const order = writeProcedure
  .input(orderGradeLevelsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const all = await levels(context);
    if (
      input.ids.length !== all.length ||
      all.some((row) => !input.ids.includes(row.id))
    )
      throw new ORPCError("BAD_REQUEST", { message: "grade_level.order" });
    for (const [index, descriptorId] of input.ids.entries())
      await placeDescriptor(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        descriptorId,
        sortOrder: index * 10,
      });
    await audit(context, {
      action: "grade_level.order",
      objectType: "org",
      objectId: context.schoolId,
      details: { ids: input.ids },
    });
    return { ok: true };
  });

/**
 * Stops using a grade from today. A grade a class running today or later
 * teaches, or a student holds today or later, is refused until they are
 * moved; what names it from before keeps its name.
 */
export const retire = writeProcedure
  .input(retireGradeLevelSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const known = (await levels(context)).find((row) => row.id === input.id);
    if (!known || known.retired) throw new ORPCError("NOT_FOUND");
    const scope = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      from: context.today,
    };
    const [classes, students] = await Promise.all([
      classesHolding(context.tx, scope),
      studentsHolding(context.tx, scope),
    ]);
    if ((classes.get(input.id) ?? 0) > 0 || (students.get(input.id) ?? 0) > 0)
      throw new ORPCError("CONFLICT", { message: "grade_level.in_use" });
    await placeDescriptor(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      descriptorId: input.id,
      effectiveDuring: `(,${context.today})`,
    });
    await audit(context, {
      action: "grade_level.retire",
      objectType: "descriptor",
      objectId: input.id,
    });
    return { ok: true };
  });
