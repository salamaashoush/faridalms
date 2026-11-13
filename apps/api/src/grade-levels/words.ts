import { changeOf } from "@faridalms/database/audit";
import {
  gradeTermOf,
  setGradeTerm,
} from "@faridalms/database/stores/grade-words";
import { setGradeTermSchema } from "@faridalms/domain/grade-levels";
import { ORPCError } from "@orpc/server";

import type { UnitContext } from "../core/context";

import {
  audit,
  readProcedure,
  requireCapability,
  writeProcedure,
} from "../core/procedure";

const scope = (context: UnitContext) => ({
  tenantId: context.tenantId,
  orgId: context.schoolId,
});

/** The school's word for its grades, null until it chooses, for its settings. */
export const term = readProcedure.handler(async ({ context }) => {
  requireCapability(context, "school:manage");
  return gradeTermOf(context.tx, scope(context));
});

/** Sets the school's word for its grades, which every sentence naming them then reads. */
export const setTerm = writeProcedure
  .input(setGradeTermSchema)
  .handler(async ({ input, context }) => {
    requireCapability(context, "school:manage");
    const before = await gradeTermOf(context.tx, scope(context));
    const version = await setGradeTerm(context.tx, {
      ...scope(context),
      term: input.term,
      expectedVersion: input.expectedVersion,
    });
    if (version === null)
      throw new ORPCError("CONFLICT", { message: "conflict.version" });
    await audit(context, {
      action: "grade_level.term",
      objectType: "org",
      objectId: context.schoolId,
      details: { term: input.term, from: before.term },
      change: changeOf(
        "core.grade_level_settings",
        { term: before.term },
        { term: input.term },
      ),
    });
    return { term: input.term, version };
  });
