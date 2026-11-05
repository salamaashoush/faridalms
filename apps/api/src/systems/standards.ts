import type { ContentDocument } from "@faridalms/domain/content";

import { changeOf } from "@faridalms/database/audit";
import { classById, rosterOf } from "@faridalms/database/stores/classes";
import { namesOf } from "@faridalms/database/stores/coursework";
import { contentsOf } from "@faridalms/database/stores/documents";
import {
  classesOfModule,
  lessonById,
  yearModulesOf,
} from "@faridalms/database/stores/learning";
import {
  clearJudgement,
  evidenceOfStudents,
  frameworkById,
  frameworkOfCase,
  frameworksOf,
  importStandards,
  insertFramework,
  insertObservation,
  insertStandard,
  isWithin,
  judgeGoal as recordJudgement,
  judgementsOf,
  moveStandard,
  observationsOf,
  removeFramework as dropFramework,
  removeObservation as dropObservation,
  removeStandard,
  searchStandards,
  sittingsOfStandard,
  standardById,
  standardsByIds,
  standardsOf,
  updateFramework,
  updateStandard,
} from "@faridalms/database/stores/standards";
import {
  dayIn,
  schoolYears,
  workingYear,
} from "@faridalms/database/stores/years";
import { EYFS_GOALS } from "@faridalms/domain/early-goals";
import { IB_CONCEPTS } from "@faridalms/domain/ib-concepts";
import {
  caseOutline,
  classGoalsSchema,
  classProgressSchema,
  curriculumMapSchema,
  describeStandardsSchema,
  importCaseSchema,
  judgeGoalSchema,
  masteryOf,
  moveStandardSchema,
  OBSERVED_FRACTION,
  observeSchema,
  planTargets,
  refSchema,
  saveFrameworkSchema,
  saveStandardSchema,
  searchStandardsSchema,
  sittingsSchema,
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
import {
  reachesStudent,
  requireStudent,
  requireTaught,
  teaches,
} from "../core/reach";

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
        assessed: input.assessed,
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
      assessed: input.assessed,
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
      change: changeOf("core.standards", own.standard, {
        code: input.code,
        statement: input.statement,
        itemType: input.itemType,
      }),
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
            assessed: true,
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

/**
 * Adds the EYFS early learning goals as one of the school's frameworks, or
 * brings the copy it has back to them.
 */
export const addEarlyGoals = writeProcedure.handler(async ({ context }) => {
  requireCapability(context, "standards:manage");
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const target =
    (await frameworkOfCase(context.tx, {
      ...scope,
      caseIdentifier: EYFS_GOALS.identifier,
    })) ??
    (
      await insertFramework(context.tx, {
        ...scope,
        title: EYFS_GOALS.title,
        description: EYFS_GOALS.description,
        caseIdentifier: EYFS_GOALS.identifier,
        assessed: true,
      })
    ).id;
  const imported = await importStandards(context.tx, {
    tenantId: context.tenantId,
    frameworkId: target,
    items: EYFS_GOALS.items,
  });
  await audit(context, {
    action: "standards.import",
    objectType: "standard_framework",
    objectId: target,
    details: { caseIdentifier: EYFS_GOALS.identifier, items: imported },
  });
  return { id: target };
});

/**
 * Adds the IB's planning concepts as frameworks of the school's, each
 * framing units rather than assessed, or brings the copies it has back to
 * them.
 */
export const addIbConcepts = writeProcedure.handler(async ({ context }) => {
  requireCapability(context, "standards:manage");
  const scope = { tenantId: context.tenantId, orgId: context.schoolId };
  const added: string[] = [];
  for (const concepts of IB_CONCEPTS) {
    const target =
      (await frameworkOfCase(context.tx, {
        ...scope,
        caseIdentifier: concepts.identifier,
      })) ??
      (
        await insertFramework(context.tx, {
          ...scope,
          title: concepts.title,
          description: concepts.description,
          caseIdentifier: concepts.identifier,
          assessed: false,
        })
      ).id;
    const imported = await importStandards(context.tx, {
      tenantId: context.tenantId,
      frameworkId: target,
      items: concepts.items,
    });
    await audit(context, {
      action: "standards.import",
      objectType: "standard_framework",
      objectId: target,
      details: { caseIdentifier: concepts.identifier, items: imported },
    });
    added.push(target);
  }
  return { ids: added };
});

/**
 * One framework across the school year's unit plans: each unit with the
 * items of the framework its plan names, so a coordinator sees which key
 * concepts, contexts or standards the year's units take up and which none
 * does. Without a framework chosen, the one the plans name most.
 */
export const curriculumMap = readProcedure
  .input(curriculumMapSchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    const scope = { tenantId: context.tenantId, orgId: context.schoolId };
    const [kept, years] = await Promise.all([
      frameworksOf(context.tx, scope),
      schoolYears(context.tx, context.tenantId, context.schoolId),
    ]);
    const year = workingYear(years, context.today);
    const modules = year
      ? await yearModulesOf(context.tx, {
          tenantId: context.tenantId,
          schoolId: context.schoolId,
          yearId: year.id,
        })
      : [];
    const plans = await contentsOf(
      context.tx,
      context.tenantId,
      "module_plan",
      modules.map((row) => row.id),
    );
    const named = new Map(
      modules.map((row) => {
        const plan = plans.get(row.id);
        return [
          row.id,
          new Set(
            plan
              ? planTargets(plan as unknown as ContentDocument).map(
                  (target) => target.id,
                )
              : [],
          ),
        ];
      }),
    );
    const everyName = [...named.values()].flatMap((ids) => [...ids]);
    const seen = await standardsByIds(context.tx, {
      ...scope,
      ids: [...new Set(everyName)],
    });
    const frameworkOfItem = new Map(
      seen.map((row) => [row.id, row.frameworkId]),
    );
    const uses = new Map<string, number>();
    for (const item of everyName) {
      const owner = frameworkOfItem.get(item);
      if (owner) uses.set(owner, (uses.get(owner) ?? 0) + 1);
    }
    const chosen =
      kept.find((row) => row.id === input.frameworkId) ??
      kept.toSorted((a, b) => (uses.get(b.id) ?? 0) - (uses.get(a.id) ?? 0))[0];
    if (input.frameworkId && chosen?.id !== input.frameworkId)
      throw new ORPCError("NOT_FOUND");
    const items = chosen
      ? await standardsOf(context.tx, {
          tenantId: context.tenantId,
          frameworkId: chosen.id,
        })
      : [];
    return {
      year: year ? { titleEn: year.titleEn, titleAr: year.titleAr } : null,
      frameworks: kept.map((row) => ({
        id: row.id,
        title: row.title,
        assessed: row.assessed,
      })),
      frameworkId: chosen?.id ?? "",
      items: items.map((row) => ({
        id: row.id,
        parentId: row.parentId,
        code: row.code,
        statement: row.statement,
      })),
      units: modules.map((row) => ({
        ...row,
        items: [...(named.get(row.id) ?? [])].filter(
          (item) => frameworkOfItem.get(item) === chosen?.id,
        ),
      })),
    };
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

type EvidenceRows = Awaited<ReturnType<typeof evidenceOfStudents>>;
type Observations = Awaited<ReturnType<typeof observationsOf>>;

/** Observations as evidence: each one sitting, at what its level counts for. */
const withObserved = (
  evidence: EvidenceRows,
  observed: Observations,
): EvidenceRows =>
  [
    ...evidence,
    ...observed.map((row) => ({
      studentId: row.studentId,
      standardId: row.standardId,
      occasion: `observation:${row.id}`,
      fraction: OBSERVED_FRACTION[row.level],
      answeredAt: row.observedAt,
    })),
  ].toSorted((a, b) => a.answeredAt.localeCompare(b.answeredAt));

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

/** A class the viewer teaches, its year, and its students on the day. */
async function taughtClass(context: UnitContext, classId: string) {
  requireCapability(context, "submissions:grade");
  const classRow = await classById(context.tx, context, classId);
  if (!classRow || !(await teaches(context, "teaching", classId)))
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
    classId,
    dayIn(year, context.today),
  );
  return { year, roster };
}

/**
 * A class's standards, as its own lessons and assignments gave evidence on
 * them, and each current student's mastery of each.
 */
export const classProgress = readProcedure
  .input(classProgressSchema)
  .handler(async ({ input, context }) => {
    const { roster } = await taughtClass(context, input.classId);
    const scope = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentIds: roster,
      classId: input.classId,
    };
    const [students, answered, observed] = await Promise.all([
      namesOf(context.tx, context.tenantId, roster),
      evidenceOfStudents(context.tx, { ...scope, released: false }),
      observationsOf(context.tx, scope),
    ]);
    const evidence = withObserved(answered, observed);
    return {
      standards: await described(context, evidence),
      students,
      mastery: masteries(evidence),
    };
  });

/** The student a progress view is about: the viewer, or one they may see. */
async function progressStudent(context: UnitContext, asked: string) {
  requireCapability(context, "grades:read");
  const studentId = asked || context.actor.userId;
  if (
    studentId !== context.actor.userId &&
    !(await reachesStudent(context, "teaching", studentId))
  )
    throw new ORPCError("NOT_FOUND");
  return studentId;
}

/**
 * One student's mastery of every standard they have evidence on, from any
 * class; to the student and their family, handed-in work counts once its
 * grade is returned.
 */
export const studentProgress = readProcedure
  .input(studentProgressSchema)
  .handler(async ({ input, context }) => {
    const studentId = await progressStudent(context, input.studentId);
    const scope = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentIds: [studentId],
    };
    const [answered, observed, judged] = await Promise.all([
      evidenceOfStudents(context.tx, {
        ...scope,
        classId: null,
        released: !can(context, "submissions:grade"),
      }),
      observationsOf(context.tx, { ...scope, classId: null }),
      // Judgements are for the child's teachers to read, not the child or
      // their family.
      can(context, "submissions:grade") ? judgementsOf(context.tx, scope) : [],
    ]);
    const evidence = withObserved(answered, observed);
    const judgedIn = await Promise.all(
      [...new Set(judged.map((row) => row.frameworkId))].map(async (id) => ({
        found: await frameworkById(context.tx, { ...scope, id }),
        goals: await standardsOf(context.tx, { ...scope, frameworkId: id }),
      })),
    );
    return {
      standards: await described(context, evidence),
      mastery: masteries(evidence),
      goalFrameworks: judgedIn.flatMap(({ found, goals }) =>
        found ? [{ id: found.id, title: found.title, goals }] : [],
      ),
      judgements: await withJudges(context, judged),
    };
  });

/**
 * The sittings one student's mastery of a standard was worked out from:
 * each lesson or quiz attempt and graded rubric, its answers or criteria
 * on the standard averaged, and each thing a teacher saw, latest first, as
 * the decaying average weighs them. A student and their family see handed-in
 * work once its grade is returned, as mastery does for them.
 */
export const sittings = readProcedure
  .input(sittingsSchema)
  .handler(async ({ input, context }) => {
    const studentId = await progressStudent(context, input.studentId);
    const scope = {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      studentId,
      standardId: input.standardId,
    };
    const [worked, observed] = await Promise.all([
      sittingsOfStandard(context.tx, {
        ...scope,
        released: !can(context, "submissions:grade"),
      }),
      observationsOf(context.tx, {
        ...scope,
        studentIds: [studentId],
        classId: null,
      }),
    ]);
    return [
      ...worked.map((row) => ({ ...row, observation: null })),
      ...observed.map((row) => ({
        source: "observation" as const,
        workId: row.id,
        title: row.note,
        attempt: 1,
        fraction: OBSERVED_FRACTION[row.level],
        answers: 1,
        at: row.observedAt,
        observation: {
          level: row.level,
          byEn: row.observedByEn,
          byAr: row.observedByAr,
          mine: row.observedByUserId === context.actor.userId,
        },
      })),
    ].toSorted((a, b) => b.at.localeCompare(a.at));
  });

/**
 * A teacher records what they saw a student do against one of the school's
 * standards, outside any question; it counts as one sitting, and the
 * student and their family read it with their skills.
 */
export const observe = writeProcedure
  .input(observeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    await requireStudent(context, "teaching", input.studentId);
    if (input.classId) await requireTaught(context, "teaching", input.classId);
    const [standard] = await standardsByIds(context.tx, {
      tenantId: context.tenantId,
      orgId: context.schoolId,
      ids: [input.standardId],
    });
    if (!standard) throw new ORPCError("NOT_FOUND");
    const id = await insertObservation(context.tx, {
      tenantId: context.tenantId,
      studentId: input.studentId,
      standardId: standard.id,
      classId: input.classId || null,
      level: input.level,
      note: input.note,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "standard.observe",
      objectType: "standard",
      objectId: standard.id,
      studentUserId: input.studentId,
      details: { level: input.level },
    });
    return { id };
  });

/** Takes back an observation: its teacher's own, or any for one who manages classes. */
export const removeObservation = writeProcedure
  .input(refSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "submissions:grade");
    const removed = await dropObservation(context.tx, {
      tenantId: context.tenantId,
      id: input.id,
      observedBy: can(context, "classes:manage") ? null : context.actor.userId,
    });
    if (!removed) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "standard.unobserve",
      objectType: "standard_observation",
      objectId: input.id,
    });
    return { removed };
  });

type Judgements = Awaited<ReturnType<typeof judgementsOf>>;

/** Judgements as a teacher reads them, with who made each. */
async function withJudges(context: UnitContext, judgements: Judgements) {
  const judges = new Map(
    (
      await namesOf(context.tx, context.tenantId, [
        ...new Set(judgements.map((row) => row.judgedByUserId)),
      ])
    ).map((row) => [row.id, row]),
  );
  return judgements.map(({ judgedByUserId, frameworkId: _, ...row }) => ({
    ...row,
    judgedBy: judges.get(judgedByUserId) ?? null,
  }));
}

/**
 * A class's children against the goals of one of the school's frameworks,
 * where their teachers judge each: the one asked for, or else the one the
 * class was last judged against.
 */
export const classGoals = readProcedure
  .input(classGoalsSchema)
  .handler(async ({ input, context }) => {
    const { year, roster } = await taughtClass(context, input.classId);
    const [kept, students, judged] = await Promise.all([
      frameworksOf(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
      }),
      namesOf(context.tx, context.tenantId, roster),
      judgementsOf(context.tx, {
        tenantId: context.tenantId,
        orgId: context.schoolId,
        studentIds: roster,
      }),
    ]);
    const choices = kept.filter((row) => row.standards > 0);
    const wanted = input.frameworkId || judged.at(-1)?.frameworkId;
    const shown =
      choices.find((row) => row.id === wanted) ?? choices[0] ?? null;
    return {
      frameworks: choices.map((row) => ({ id: row.id, title: row.title })),
      frameworkId: shown?.id ?? null,
      goals: shown
        ? await standardsOf(context.tx, {
            tenantId: context.tenantId,
            frameworkId: shown.id,
          })
        : [],
      students,
      judgements: await withJudges(
        context,
        judged.filter((row) => row.frameworkId === shown?.id),
      ),
      canJudge: year.lifecycle !== "closed",
      canAddGoals: can(context, "standards:manage"),
    };
  });

/**
 * A class teacher judges where one of their children stands against a goal,
 * or takes the judgement back; from an answer, the lesson it was set in.
 */
export const judgeGoal = writeProcedure
  .input(judgeGoalSchema)
  .handler(async ({ input, context }) => {
    const { year, roster } = await taughtClass(context, input.classId);
    if (year.lifecycle === "closed")
      throw new ORPCError("CONFLICT", { message: "school_year.closed" });
    if (!roster.includes(input.studentId)) throw new ORPCError("NOT_FOUND");
    await ownStandard(context, input.standardId);
    if (input.from) {
      const lesson = await lessonById(
        context.tx,
        context.tenantId,
        input.from.lessonId,
      );
      const classes = lesson
        ? await classesOfModule(context.tx, context.tenantId, lesson.moduleId)
        : [];
      if (!classes.some((row) => row.id === input.classId))
        throw new ORPCError("NOT_FOUND");
    }
    const key = {
      tenantId: context.tenantId,
      studentId: input.studentId,
      standardId: input.standardId,
    };
    if (input.level)
      await recordJudgement(context.tx, {
        ...key,
        level: input.level,
        note: input.note,
        from: input.from,
        judgedByUserId: context.actor.userId,
      });
    else await clearJudgement(context.tx, key);
    await audit(context, {
      action: input.level ? "standards.judge" : "standards.judgement_clear",
      objectType: "user",
      objectId: input.studentId,
      details: { standardId: input.standardId, level: input.level },
    });
    return {};
  });
