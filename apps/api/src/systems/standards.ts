import type { Scope } from "@faridalms/database/stores/students";

import {
  classById,
  rosterOf,
  teachesClass,
} from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import {
  evidenceOfStudents,
  frameworkById,
  frameworkOfCase,
  frameworksOf,
  importStandards,
  insertFramework,
  insertStandard,
  isWithin,
  moveStandard,
  removeFramework as dropFramework,
  removeStandard,
  searchStandards,
  standardById,
  standardsByIds,
  standardsOf,
  updateFramework,
  updateStandard,
} from "@faridalms/database/stores/standards";
import { isVisibleStudent } from "@faridalms/database/stores/students";
import { dayIn, schoolYears } from "@faridalms/database/stores/years";
import {
  caseOutline,
  classProgressSchema,
  describeStandardsSchema,
  importCaseSchema,
  masteryOf,
  moveStandardSchema,
  refSchema,
  saveFrameworkSchema,
  saveStandardSchema,
  searchStandardsSchema,
  studentProgressSchema,
} from "@faridalms/domain/standards";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  can,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

/** Whoever writes lessons or assignments reads the school's standards to tag them. */
function requireReader(context: UnitContext) {
  if (
    !can(context, "learning:author") &&
    !can(context, "assignments:author") &&
    !can(context, "standards:manage")
  )
    throw new ORPCError("FORBIDDEN");
}

async function ownFramework(context: UnitContext, id: string) {
  const framework = await frameworkById(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    id,
  });
  if (!framework) throw new ORPCError("NOT_FOUND");
  return framework;
}

/** A standard of one of the school's frameworks, with its framework. */
async function ownStandard(context: UnitContext, id: string) {
  const standard = await standardById(context.tx, {
    tenantId: context.tenantId,
    id,
  });
  if (!standard) throw new ORPCError("NOT_FOUND");
  const framework = await ownFramework(context, standard.frameworkId);
  return { standard, framework };
}

/** The school's frameworks, with whether the viewer may change them. */
export const frameworks = readProcedure.handler(async ({ context }) => {
  requireReader(context);
  return {
    frameworks: await frameworksOf(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
    }),
    canManage: can(context, "standards:manage"),
  };
});

/** One framework with every standard in it, siblings in order. */
export const framework = readProcedure
  .input(refSchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    const found = await ownFramework(context, input.id);
    return {
      framework: found,
      standards: await standardsOf(context.tx, {
        tenantId: context.tenantId,
        frameworkId: found.id,
      }),
      canManage: can(context, "standards:manage"),
    };
  });

export const saveFramework = writeProcedure
  .input(saveFrameworkSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    if (!input.id) {
      const created = await insertFramework(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        title: input.title,
        description: input.description,
        caseIdentifier: null,
      });
      await audit(context, {
        action: "standards.framework_create",
        objectType: "standard_framework",
        objectId: created.id,
        details: { title: input.title },
      });
      return created;
    }
    const found = await ownFramework(context, input.id);
    const version = await updateFramework(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
      expectedVersion: input.expectedVersion,
      title: input.title,
      description: input.description,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "standards.framework_update",
      objectType: "standard_framework",
      objectId: found.id,
      details: { title: input.title },
    });
    return { id: found.id, version };
  });

/**
 * Takes a framework out of use. Questions tagged with its standards keep
 * their tags, which show nothing once the standards are gone.
 */
export const removeFramework = writeProcedure
  .input(refSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    const found = await ownFramework(context, input.id);
    await dropFramework(context.tx, {
      tenantId: context.tenantId,
      id: found.id,
    });
    await audit(context, {
      action: "standards.framework_remove",
      objectType: "standard_framework",
      objectId: found.id,
      details: { title: found.title },
    });
    return { removed: true };
  });

export const saveStandard = writeProcedure
  .input(saveStandardSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    const found = await ownFramework(context, input.frameworkId);
    if (input.parentId) {
      const parent = await ownStandard(context, input.parentId);
      if (parent.framework.id !== found.id) throw new ORPCError("NOT_FOUND");
    }
    if (!input.id) {
      const created = await insertStandard(context.tx, {
        tenantId: context.tenantId,
        frameworkId: found.id,
        parentId: input.parentId || null,
        code: input.code,
        statement: input.statement,
        itemType: input.itemType,
      });
      await audit(context, {
        action: "standards.create",
        objectType: "standard",
        objectId: created.id,
        details: { frameworkId: found.id, code: input.code },
      });
      return created;
    }
    const own = await ownStandard(context, input.id);
    if (own.framework.id !== found.id) throw new ORPCError("NOT_FOUND");
    const version = await updateStandard(context.tx, {
      tenantId: context.tenantId,
      id: own.standard.id,
      expectedVersion: input.expectedVersion,
      code: input.code,
      statement: input.statement,
      itemType: input.itemType,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "standards.update",
      objectType: "standard",
      objectId: own.standard.id,
      details: { frameworkId: found.id, code: input.code },
    });
    return { id: own.standard.id, version };
  });

/** Moves a standard under another of its framework, or to its top. */
export const move = writeProcedure
  .input(moveStandardSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    const own = await ownStandard(context, input.id);
    if (input.parentId) {
      const parent = await ownStandard(context, input.parentId);
      if (
        parent.framework.id !== own.framework.id ||
        (await isWithin(context.tx, {
          tenantId: context.tenantId,
          id: parent.standard.id,
          ancestor: own.standard.id,
        }))
      )
        throw new ORPCError("BAD_REQUEST", { message: "standards.move" });
    }
    await moveStandard(context.tx, {
      tenantId: context.tenantId,
      frameworkId: own.framework.id,
      id: own.standard.id,
      parentId: input.parentId || null,
      position: input.position,
    });
    return { moved: true };
  });

/** Takes a standard and everything under it out of use. */
export const remove = writeProcedure
  .input(refSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    const own = await ownStandard(context, input.id);
    await removeStandard(context.tx, {
      tenantId: context.tenantId,
      id: own.standard.id,
    });
    await audit(context, {
      action: "standards.remove",
      objectType: "standard",
      objectId: own.standard.id,
      details: { frameworkId: own.framework.id, code: own.standard.code },
    });
    return { removed: true };
  });

/**
 * Imports a CASE package as a framework, or over the framework it made
 * before: items kept by their CASE identifiers, so tags on them hold.
 */
export const importCase = writeProcedure
  .input(importCaseSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "standards:manage");
    const outline = caseOutline(input.casePackage);
    if (!outline.title)
      throw new ORPCError("BAD_REQUEST", { message: "standards.case_title" });
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const target = input.frameworkId
      ? (await ownFramework(context, input.frameworkId)).id
      : ((await frameworkOfCase(context.tx, {
          ...scope,
          caseIdentifier: outline.identifier,
        })) ??
        (
          await insertFramework(context.tx, {
            ...scope,
            title: outline.title,
            description: outline.description,
            caseIdentifier: outline.identifier,
          })
        ).id);
    const imported = await importStandards(context.tx, {
      tenantId: context.tenantId,
      frameworkId: target,
      items: outline.items,
    });
    await audit(context, {
      action: "standards.import",
      objectType: "standard_framework",
      objectId: target,
      details: { caseIdentifier: outline.identifier, items: imported },
    });
    return { id: target, imported };
  });

/** Standards whose code or statement holds the words, for a picker. */
export const search = readProcedure
  .input(searchStandardsSchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    return searchStandards(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      query: input.query,
      frameworkId: input.frameworkId,
      limit: 30,
    });
  });

/** Standards by id, as the tags on a question show them. */
export const describe = readProcedure
  .input(describeStandardsSchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    return standardsByIds(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: input.ids,
    });
  });

function scopeOf(context: UnitContext): Scope {
  return {
    tenantId: context.tenantId,
    schoolId: context.schoolId,
    today: context.today,
    viewerId: context.actor.userId,
    schoolWide: can(context, "classes:manage"),
  };
}

type EvidenceRows = Awaited<ReturnType<typeof evidenceOfStudents>>;

/** Each student's mastery of each standard they have evidence on. */
function masteries(rows: EvidenceRows) {
  const grouped = new Map<string, EvidenceRows>();
  for (const row of rows) {
    const key = `${row.studentId}:${row.standardId}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  return [...grouped.values()].flatMap((evidence) => {
    const [first] = evidence;
    const mastery = masteryOf(
      evidence.map((row) => ({
        occasion: row.occasion,
        fraction: row.fraction,
        at: row.answeredAt,
      })),
    );
    return first && mastery
      ? [
          {
            studentId: first.studentId,
            standardId: first.standardId,
            ...mastery,
          },
        ]
      : [];
  });
}

async function described(context: UnitContext, rows: EvidenceRows) {
  const standards = await standardsByIds(context.tx, {
    tenantId: context.tenantId,
    orgId: context.schoolId,
    ids: [...new Set(rows.map((row) => row.standardId))],
  });
  return standards.toSorted(
    (a, b) =>
      a.frameworkTitle.localeCompare(b.frameworkTitle) ||
      a.code.localeCompare(b.code, undefined, { numeric: true }) ||
      a.statement.localeCompare(b.statement),
  );
}

/**
 * A class's standards, as its own lessons and assignments gave evidence on
 * them, and each current student's mastery of each.
 */
export const classProgress = readProcedure
  .input(classProgressSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const classRow = await classById(context.tx, context, input.classId);
    if (
      !classRow ||
      !(await teachesClass(context.tx, scopeOf(context), classRow.id))
    )
      throw new ORPCError("NOT_FOUND");
    const years = await schoolYears(
      context.tx,
      context.tenantId,
      context.schoolId,
    );
    const year = years.find((row) => row.id === classRow.schoolYearId);
    if (!year) throw new ORPCError("NOT_FOUND");
    const roster = await rosterOf(
      context.tx,
      context.tenantId,
      classRow.id,
      dayIn(year, context.today),
    );
    const [students, evidence] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      evidenceOfStudents(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        studentIds: roster,
        classId: classRow.id,
      }),
    ]);
    return {
      standards: await described(context, evidence),
      students,
      mastery: masteries(evidence),
    };
  });

/** One student's mastery of every standard they have evidence on, from any class. */
export const studentProgress = readProcedure
  .input(studentProgressSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "grades:read");
    const studentId = input.studentId || context.actor.userId;
    if (
      studentId !== context.actor.userId &&
      !(await isVisibleStudent(context.tx, scopeOf(context), studentId))
    )
      throw new ORPCError("NOT_FOUND");
    const evidence = await evidenceOfStudents(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentIds: [studentId],
      classId: null,
    });
    return {
      standards: await described(context, evidence),
      mastery: masteries(evidence),
    };
  });
