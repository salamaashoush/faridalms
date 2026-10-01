import { classById } from "@faridalms/database/stores/classes";
import { examBoardsOf } from "@faridalms/database/stores/exams";
import {
  classGrading as classGradingOf,
  insertScaleVersion,
  programmeInUse,
  programmesOf,
  regradeTerm as regradeTermOf,
  retireProgramme as retireProgrammeOf,
  retireScale as retireScaleOf,
  saveProgramme as saveProgrammeOf,
  saveScale as saveScaleOf,
  scaleInUse,
  scalesOf,
  setClassGrading,
} from "@faridalms/database/stores/grading";
import {
  classGradingSchema,
  retireProgrammeSchema,
  retireScaleSchema,
  saveBandsSchema,
  saveProgrammeSchema,
  saveScaleSchema,
  SCALE_PRESETS,
} from "@faridalms/domain/grading";
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

const uuid = v.pipe(v.string(), v.uuid());

function refuse(message: string): never {
  throw new ORPCError("BAD_REQUEST", { message });
}

function scopeOf(context: UnitContext) {
  return { tenantId: context.tenantId, orgId: context.schoolId };
}

/** Exams officers keep scales and programmes; office staff place classes in them. */
function requireReader(context: UnitContext) {
  if (!can(context, "exams:manage"))
    requireCapability(context, "classes:manage");
}

/** The school's grade scales and programmes, and the presets a scale may start from. */
export const overview = readProcedure.handler(async ({ context }) => {
  requireReader(context);
  const [scales, programmes] = await Promise.all([
    scalesOf(context.tx, scopeOf(context)),
    programmesOf(context.tx, scopeOf(context)),
  ]);
  return {
    scales,
    programmes,
    presets: SCALE_PRESETS,
    today: context.today,
  };
});

/** Adds a scale, starting from today with the bands given, or renames one. */
export const saveScale = writeProcedure
  .input(saveScaleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    if (!input.id && !input.bands) refuse("grading.bands_needed");
    const saved = await saveScaleOf(context.tx, {
      ...scopeOf(context),
      id: input.id,
      titleEn: input.titleEn,
      titleAr: input.titleAr,
      display: input.display,
    });
    if (!saved) throw new ORPCError("NOT_FOUND");
    if (!input.id && input.bands)
      await insertScaleVersion(context.tx, {
        tenantId: context.tenantId,
        scaleId: saved.id,
        effectiveFrom: context.today,
        bands: input.bands,
        reason: null,
        userId: context.actor.userId,
      });
    await audit(context, {
      action: input.id ? "grading_scale.update" : "grading_scale.create",
      objectType: "grade_scale",
      objectId: saved.id,
      details: {
        after: {
          titleEn: input.titleEn,
          titleAr: input.titleAr,
          display: input.display,
        },
      },
    });
    return saved;
  });

/**
 * New bands for a scale from a date. Grades already given keep the bands
 * they were given under; grades given from now use the new ones.
 */
export const saveBands = writeProcedure
  .input(saveBandsSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const scales = await scalesOf(context.tx, scopeOf(context));
    if (!scales.some((row) => row.id === input.scaleId))
      throw new ORPCError("NOT_FOUND");
    const version = await insertScaleVersion(context.tx, {
      tenantId: context.tenantId,
      scaleId: input.scaleId,
      effectiveFrom: input.effectiveFrom,
      bands: input.bands,
      reason: input.reason,
      userId: context.actor.userId,
    });
    await audit(context, {
      action: "grading_scale.bands",
      objectType: "grade_scale",
      objectId: input.scaleId,
      details: { reason: input.reason, effectiveFrom: input.effectiveFrom },
    });
    return version;
  });

export const retireScale = writeProcedure
  .input(retireScaleSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    if (
      await scaleInUse(context.tx, { tenantId: context.tenantId, id: input.id })
    )
      throw new ORPCError("CONFLICT", { message: "grading.scale_in_use" });
    if (
      !(await retireScaleOf(context.tx, { ...scopeOf(context), id: input.id }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "grading_scale.retire",
      objectType: "grade_scale",
      objectId: input.id,
      details: { reason: input.reason },
    });
    return { ok: true };
  });

export const saveProgramme = writeProcedure
  .input(saveProgrammeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const [scales, boards] = await Promise.all([
      scalesOf(context.tx, scopeOf(context)),
      examBoardsOf(context.tx, scopeOf(context)),
    ]);
    if (input.scaleId && !scales.some((row) => row.id === input.scaleId))
      refuse("grading.scale_unknown");
    if (input.boardId && !boards.some((row) => row.id === input.boardId))
      refuse("exam.board_unknown");
    const saved = await saveProgrammeOf(context.tx, {
      ...scopeOf(context),
      ...input,
    });
    if (!saved) throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: input.id
        ? "grading_programme.update"
        : "grading_programme.create",
      objectType: "programme",
      objectId: saved.id,
      details: {
        after: {
          titleEn: input.titleEn,
          titleAr: input.titleAr,
          scaleId: input.scaleId,
          gradeLevelIds: input.gradeLevelIds,
        },
      },
    });
    return saved;
  });

export const retireProgramme = writeProcedure
  .input(retireProgrammeSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    if (
      await programmeInUse(context.tx, {
        tenantId: context.tenantId,
        id: input.id,
      })
    )
      throw new ORPCError("CONFLICT", { message: "grading.programme_in_use" });
    if (
      !(await retireProgrammeOf(context.tx, {
        ...scopeOf(context),
        id: input.id,
      }))
    )
      throw new ORPCError("NOT_FOUND");
    await audit(context, {
      action: "grading_programme.retire",
      objectType: "programme",
      objectId: input.id,
    });
    return { ok: true };
  });

async function schoolClass(context: UnitContext, classId: string) {
  const row = await classById(context.tx, context, classId);
  if (!row) throw new ORPCError("NOT_FOUND");
  return row;
}

/** The programme and scale a class follows, its own or by default. */
export const classGrading = readProcedure
  .input(v.object({ classId: uuid }))
  .handler(async ({ input, context }) => {
    requireReader(context);
    const row = await schoolClass(context, input.classId);
    const grading = await classGradingOf(context.tx, {
      tenantId: context.tenantId,
      classId: row.id,
      today: context.today,
    });
    if (!grading) throw new ORPCError("NOT_FOUND");
    return grading;
  });

export const setClassGrade = writeProcedure
  .input(classGradingSchema)
  .handler(async ({ input, context }) => {
    requireReader(context);
    const row = await schoolClass(context, input.classId);
    const [scales, programmes] = await Promise.all([
      scalesOf(context.tx, scopeOf(context)),
      programmesOf(context.tx, scopeOf(context)),
    ]);
    if (input.scaleId && !scales.some((item) => item.id === input.scaleId))
      refuse("grading.scale_unknown");
    if (
      input.programmeId &&
      !programmes.some((item) => item.id === input.programmeId)
    )
      refuse("grading.programme_unknown");
    await setClassGrading(context.tx, {
      tenantId: context.tenantId,
      classId: row.id,
      programmeId: input.programmeId,
      scaleId: input.scaleId,
    });
    await audit(context, {
      action: "grading_class.set",
      objectType: "class",
      objectId: row.id,
      details: { programmeId: input.programmeId, scaleId: input.scaleId },
    });
    return { ok: true };
  });

/**
 * Grades a term's scores again on today's bands, when a school decides a
 * scale change should reach grades already given. It says why.
 */
export const regradeTerm = writeProcedure
  .input(
    v.object({
      periodId: uuid,
      reason: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(500)),
    }),
  )
  .handler(async ({ input, context }) => {
    requireCapability(context, "exams:manage");
    const counts = await regradeTermOf(context.tx, {
      ...scopeOf(context),
      periodId: input.periodId,
      today: context.today,
    });
    await audit(context, {
      action: "grading_scale.regrade",
      objectType: "academic_session",
      objectId: input.periodId,
      details: { reason: input.reason, ...counts },
    });
    return counts;
  });
