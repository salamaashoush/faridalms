import {
  learnersOfYoungClasses,
  markedYoung,
  markYoung,
} from "@faridalms/database/stores/young-classes";
import { youngClassPartSchema } from "@faridalms/domain/early-years";
import { ORPCError } from "@orpc/server";
import * as v from "valibot";

import type { ModuleContributions } from "../core/extension";

import { classFormParts, youngClasses } from "../classes/points";
import { contribute } from "../core/extension";
import { audit } from "../core/procedure";
import { youngStudents } from "../people/points";

/**
 * What the early years tell the rest of the product: which classes are for
 * young children, as the school marks them on the class form, and so which
 * learners are young.
 */
export const EARLY_YEARS: ModuleContributions = {
  module: "early_years",
  contributions: [
    contribute(classFormParts, {
      key: "young",
      save: async (context, input) => {
        const parsed = v.safeParse(youngClassPartSchema, input.value);
        if (!parsed.success)
          throw new ORPCError("BAD_REQUEST", { message: "validation.invalid" });
        const changed = await markYoung(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          classIds: input.classIds,
          young: parsed.output.young,
        });
        for (const classId of changed)
          await audit(context, {
            action: parsed.output.young ? "class.young" : "class.not_young",
            objectType: "class",
            objectId: classId,
          });
      },
    }),
    contribute(youngClasses, {
      youngAmong: (context, classIds) =>
        markedYoung(context.tx, context.tenantId, classIds),
    }),
    contribute(youngStudents, {
      youngAmong: (context, studentIds, on) =>
        learnersOfYoungClasses(context.tx, {
          tenantId: context.tenantId,
          orgId: context.schoolId,
          userIds: studentIds,
          on,
        }),
    }),
  ],
};
