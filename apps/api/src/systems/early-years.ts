import { markedYoung } from "@faridalms/database/stores/young-classes";
import { youngClassSchema } from "@faridalms/domain/early-years";
import { ORPCError } from "@orpc/server";

import { readProcedure } from "../core/procedure";
import { reachesClass } from "../core/reach";

/** Whether the school marked the class for young children itself, as its form starts from. */
export const classMark = readProcedure
  .input(youngClassSchema)
  .handler(async ({ input, context }) => {
    if (!(await reachesClass(context, "classes", input.classId)))
      throw new ORPCError("NOT_FOUND");
    return {
      young: (
        await markedYoung(context.tx, context.tenantId, [input.classId])
      ).has(input.classId),
    };
  });
